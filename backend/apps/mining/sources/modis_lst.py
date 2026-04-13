"""
MODIS Terra Daily Land Surface Temperature source (MOD11A1 v061, 1 km).

Uses the NASA ``earthaccess`` library to authenticate with NASA Earthdata
Login and download HDF4 granules from LP DAAC.  Each granule covers one
MODIS sinusoidal tile; multiple tiles are warped to WGS-84, clipped to
the configured bbox, mosaicked, and written as a float32 COG with LST
values in degrees Celsius.

Product details
---------------
* Short name : MOD11A1 (Terra, daily)
* Resolution : ~1 km
* Band used  : LST_Day_1km  (scale = 0.02 K, fill = 0, valid 7500–65535)
* Output     : float32 COG, LST in °C, nodata = -9999.0

Authentication
--------------
earthaccess reads credentials from the environment at run time:

    EARTHDATA_USERNAME=<your_username>
    EARTHDATA_PASSWORD=<your_password>

Add these to your .env / Docker env.  A ``~/.netrc`` entry also works
(earthaccess ``strategy="netrc"``).

DataSource config (optional):
    {
        "bbox":       [77.0, 23.0, 77.5, 23.5],  # west south east north
        "start_date": "2024-01-01"                 # first day to fetch
    }

One MiningJob is created per calendar day.  The source re-runs from the
last missing day onward, so restarting after a gap back-fills automatically.
Days where no granule exists (cloud gaps, satellite manoeuvres) are still
marked "failed" so they are skipped on the next run.
"""

import logging
import os
import tempfile
import uuid
from datetime import date, timedelta

import numpy as np
import rasterio
import rasterio.merge
from rasterio.warp import Resampling, calculate_default_transform, reproject
from rio_cogeo.cogeo import cog_translate
from rio_cogeo.profiles import cog_profiles

from .base import BaseMiningSource

logger = logging.getLogger(__name__)

SHORT_NAME = "MOD11A1"
VERSION = "061"
SUBDATASET_BAND = "LST_Day_1km"
SCALE_FACTOR = 0.02       # raw → Kelvin
KELVIN_OFFSET = 273.15    # Kelvin → Celsius
FILL_VALUE_RAW = 0        # fill / no-data in raw uint16
VALID_MIN_RAW = 7500      # values below this are fill/cloud
NODATA_OUT = -9999.0      # float32 nodata in output COG
DEFAULT_BBOX = (68.0, 8.0, 97.5, 37.5)  # India


class MODISLSTSource(BaseMiningSource):
    """
    Fetches MODIS Terra daily daytime LST (MOD11A1 v061) via earthaccess,
    mosaics tiles to the configured bbox, and writes a float32 COG (°C).

    Instantiate with the DataSource slug:
        MODISLSTSource("modis-lst-daily").run()
    """

    def __init__(self, datasource_slug: str):
        self.source_slug = datasource_slug

    # ------------------------------------------------------------------
    # Period logic — one (day, day) pair per missing calendar day
    # ------------------------------------------------------------------

    def get_periods_to_fetch(self) -> list[tuple[date, date]]:
        from apps.mining.models import DataSource, MiningJob

        today = date.today()
        # MOD11A1 is typically available with ~1 day latency; fetch up to yesterday
        last_available = today - timedelta(days=1)

        # Determine start date from config (default: 30 days before today)
        default_start = today - timedelta(days=30)
        try:
            cfg = DataSource.objects.get(slug=self.source_slug).config
            start_str = cfg.get("start_date")
            start_date = date.fromisoformat(start_str) if start_str else default_start
        except DataSource.DoesNotExist:
            start_date = default_start

        # Days already done (or explicitly failed — skip re-fetching failed days
        # unless you delete the job; this is intentional to avoid infinite retries
        # on tiles with no data coverage)
        done_days: set[date] = set(
            MiningJob.objects.filter(source__slug=self.source_slug, status__in=("done", "failed"))
            .exclude(period_start=None)
            .values_list("period_start", flat=True)
        )

        periods: list[tuple[date, date]] = []
        current = start_date
        while current <= last_available:
            if current not in done_days:
                periods.append((current, current))
            current += timedelta(days=1)

        return periods

    # ------------------------------------------------------------------
    # Fetch — download HDF4 granules, warp, mosaic, COG
    # ------------------------------------------------------------------

    def fetch(self, period_start: date, period_end: date) -> str:
        import warnings
        import earthaccess

        bbox = self._bbox()
        west, south, east, north = bbox
        date_str = period_start.isoformat()

        logger.info("MODISLSTSource: authenticating with NASA Earthdata")
        # Suppress earthaccess FutureWarning about .size() → .size (fixed in earthaccess v1.0)
        with warnings.catch_warnings():
            warnings.filterwarnings("ignore", category=FutureWarning, module="earthaccess")
            earthaccess.login(strategy="environment")

        logger.info("MODISLSTSource: searching %s v%s for %s bbox=%s", SHORT_NAME, VERSION, date_str, bbox)
        with warnings.catch_warnings():
            warnings.filterwarnings("ignore", category=FutureWarning, module="earthaccess")
            results = earthaccess.search_data(
                short_name=SHORT_NAME,
                version=VERSION,
                temporal=(date_str, date_str),
                bounding_box=(west, south, east, north),
            )

        if not results:
            raise RuntimeError(
                f"No {SHORT_NAME} granules found for {date_str} in bbox {bbox}. "
                "Check Earthdata Login credentials and bbox coverage."
            )

        logger.info("MODISLSTSource: %d granule(s) found — downloading", len(results))

        with tempfile.TemporaryDirectory(prefix="modis_lst_") as tmp_dir:
            with warnings.catch_warnings():
                warnings.filterwarnings("ignore", category=FutureWarning, module="earthaccess")
                downloaded = earthaccess.download(results, local_path=tmp_dir, threads=4)

            if not downloaded:
                raise RuntimeError(f"earthaccess.download returned no files for {date_str}")

            logger.info("MODISLSTSource: %d file(s) downloaded → processing", len(downloaded))

            # Warp each tile to WGS-84 and write to a temp GeoTIFF
            tile_paths: list[str] = []
            for hdf_path in downloaded:
                try:
                    tile_path = self._process_tile(hdf_path, bbox)
                    if tile_path:
                        tile_paths.append(tile_path)
                except Exception as exc:
                    logger.warning("MODISLSTSource: skipping %s — %s", os.path.basename(hdf_path), exc)

            if not tile_paths:
                raise RuntimeError(f"No valid LST tiles extracted for {date_str}")

            dir_path = "/cogs/mining/modis-lst-daily"
            os.makedirs(dir_path, exist_ok=True)
            uid = str(uuid.uuid4())[:8]
            raw_path = os.path.join(dir_path, f"raw_{date_str}_{uid}.tif")
            cog_path = os.path.join(dir_path, f"{date_str}_{uid}.tif")

            try:
                logger.info(
                    "MODISLSTSource: mosaicking %d tile(s) → %s", len(tile_paths), raw_path
                )
                self._mosaic_tiles(tile_paths, raw_path, bbox)
            finally:
                for tp in tile_paths:
                    if os.path.exists(tp):
                        os.remove(tp)

        logger.info("MODISLSTSource: converting to COG → %s", cog_path)
        self._to_cog(raw_path, cog_path)
        os.remove(raw_path)

        # Guard: reject entirely-nodata output (cloud contamination, no LST retrieved).
        # Raise so the job is marked "failed" and permanently skipped by
        # get_periods_to_fetch(), avoiding storage of useless empty COGs.
        with rasterio.open(cog_path) as r:
            sample = r.read(1, out_shape=(min(r.height, 64), min(r.width, 64)))
            if np.all(sample == NODATA_OUT):
                os.remove(cog_path)
                raise RuntimeError(
                    f"No valid LST pixels in bbox {bbox} for {date_str} "
                    "(cloud contamination or missing data — day will be skipped on re-run)"
                )

        logger.info("MODISLSTSource: COG ready %s (%d bytes)", cog_path, os.path.getsize(cog_path))

        return cog_path

    # ------------------------------------------------------------------
    # Helpers
    # ------------------------------------------------------------------

    def _bbox(self) -> tuple:
        from apps.mining.models import DataSource

        try:
            cfg = DataSource.objects.get(slug=self.source_slug).config
            return tuple(cfg.get("bbox", list(DEFAULT_BBOX)))
        except DataSource.DoesNotExist:
            return DEFAULT_BBOX

    def _find_subdataset(self, hdf_path: str) -> str | None:
        """Return the full subdataset URI for LST_Day_1km, or None if absent.

        Opening the HDF4 container (not a subdataset) always triggers
        NotGeoreferencedWarning because the container has no geotransform —
        only the subdatasets inside do.  Suppress it here; it is expected.
        """
        import warnings

        with warnings.catch_warnings():
            warnings.filterwarnings("ignore", category=rasterio.errors.NotGeoreferencedWarning)
            with rasterio.open(hdf_path) as src:
                for sd in src.subdatasets or []:
                    if SUBDATASET_BAND in sd:
                        return sd
        return None

    def _process_tile(self, hdf_path: str, bbox: tuple) -> str | None:
        """
        Read LST_Day_1km from one HDF4 granule, apply scale/mask,
        reproject to WGS-84, and write to a temporary GeoTIFF.
        Returns the path of the temp file, or None if the tile has
        no valid data within the bbox.
        """
        subdataset = self._find_subdataset(hdf_path)
        if subdataset is None:
            logger.warning("MODISLSTSource: '%s' not found in %s", SUBDATASET_BAND, hdf_path)
            return None

        with rasterio.open(subdataset) as src:
            raw = src.read(1).astype(np.float32)
            src_crs = src.crs
            src_transform = src.transform
            src_width = src.width
            src_height = src.height

        # Mask fill values and out-of-range pixels
        invalid = (raw == FILL_VALUE_RAW) | (raw < VALID_MIN_RAW)
        lst_celsius = np.where(invalid, np.nan, raw * SCALE_FACTOR - KELVIN_OFFSET)

        # Reproject to WGS-84 (EPSG:4326)
        dst_crs = "EPSG:4326"
        dst_transform, dst_width, dst_height = calculate_default_transform(
            src_crs, dst_crs, src_width, src_height,
            left=src_transform.c,
            bottom=src_transform.f + src_transform.e * src_height,
            right=src_transform.c + src_transform.a * src_width,
            top=src_transform.f,
        )

        dst_arr = np.full((dst_height, dst_width), np.nan, dtype=np.float32)
        reproject(
            source=lst_celsius,
            destination=dst_arr,
            src_transform=src_transform,
            src_crs=src_crs,
            dst_transform=dst_transform,
            dst_crs=dst_crs,
            resampling=Resampling.bilinear,
            src_nodata=np.nan,
            dst_nodata=np.nan,
        )

        # Replace NaN → NODATA_OUT for rasterio write
        dst_arr = np.where(np.isnan(dst_arr), NODATA_OUT, dst_arr)

        # Skip tile if entirely nodata
        if np.all(dst_arr == NODATA_OUT):
            logger.debug(
                "MODISLSTSource: tile %s is entirely nodata — skipping", os.path.basename(hdf_path)
            )
            return None

        tile_path = tempfile.mktemp(suffix="_modis_tile.tif")
        profile = {
            "driver": "GTiff",
            "dtype": "float32",
            "count": 1,
            "crs": dst_crs,
            "transform": dst_transform,
            "width": dst_width,
            "height": dst_height,
            "nodata": NODATA_OUT,
            "compress": "deflate",
        }
        with rasterio.open(tile_path, "w", **profile) as dst:
            dst.write(dst_arr, 1)

        return tile_path

    def _mosaic_tiles(self, tile_paths: list[str], output_path: str, bbox: tuple) -> None:
        """Merge all warped tile GeoTIFFs, clip to bbox, write merged GeoTIFF."""
        west, south, east, north = bbox
        datasets = [rasterio.open(tp) for tp in tile_paths]
        try:
            merged, transform = rasterio.merge.merge(
                datasets,
                bounds=(west, south, east, north),
                nodata=NODATA_OUT,
            )
            profile = datasets[0].profile.copy()
        finally:
            for ds in datasets:
                ds.close()

        profile.update(
            {
                "height": merged.shape[1],
                "width": merged.shape[2],
                "transform": transform,
                "compress": "deflate",
            }
        )
        with rasterio.open(output_path, "w", **profile) as dst:
            dst.write(merged)

    def _to_cog(self, src_path: str, dst_path: str) -> None:
        profile = cog_profiles.get("deflate")
        profile.update({"blockxsize": 512, "blockysize": 512})
        cog_translate(src_path, dst_path, profile, in_memory=False, quiet=True)
