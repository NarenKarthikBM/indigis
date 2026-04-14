"""
ASTER Digital Elevation Model source (AST14DEM v004, 30 m).

Uses the NASA ``earthaccess`` library to authenticate with NASA Earthdata
Login and download HDF-EOS2 granules from LP DAAC (LPCLOUD provider).
Each granule covers one ASTER scene; for each calendar month the granules
with the lowest cloud-cover percentage are selected, warped to WGS-84,
clipped to the configured bbox, mosaicked, and written as a float32 COG
with elevation values in metres.

Product details
---------------
* Short name : AST14DEM (Terra/ASTER)
* Version    : 004
* Collection : C3306855744-LPCLOUD
* Provider   : LPCLOUD
* Resolution : 30 m × 30 m
* Coverage   : [-180, -83, 180, 83]
* Band used  : DEM (elevation in metres)
* Output     : float32 COG, elevation in metres, nodata = -9999.0
* DOI        : https://doi.org/10.5067/ASTER/AST14DEM.004

Authentication
--------------
earthaccess reads credentials from the environment at run time:

    EARTHDATA_USERNAME=<your_username>
    EARTHDATA_PASSWORD=<your_password>

Add these to your .env / Docker env.  A ``~/.netrc`` entry also works
(earthaccess ``strategy="netrc"``).

DataSource config (optional):
    {
        "bbox":       [77.0, 23.0, 97.5, 37.5],  # west south east north
        "start_date": "2024-01-01"                 # first month to fetch
    }

One MiningJob is created per calendar month from January 2024 onward.
For each month, all available granules are searched; those with the lowest
cloud-cover percentage are preferred so that the resulting mosaic uses the
cleanest ASTER imagery available for that period.
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

SHORT_NAME = "AST14DEM"
VERSION = "004"
# Keywords matched against HDF-EOS2 subdataset names to locate the DEM band.
DEM_BAND_KEYWORDS = ("DEM",)
NODATA_OUT = -9999.0                     # float32 nodata in output COG
DEFAULT_BBOX = (68.0, 8.0, 97.5, 37.5)  # India
DEFAULT_START = date(2024, 1, 1)
# Maximum granules to download per month (sorted by ascending cloud cover).
# Raise to improve spatial coverage at the cost of longer download times.
MAX_GRANULES = 50


class AsterDEMSource(BaseMiningSource):
    """
    Fetches ASTER DEM (AST14DEM v004) via earthaccess, mosaics the best
    scenes (lowest cloud cover) within each calendar month to the configured
    bbox, and writes a float32 COG (metres).

    Instantiate with the DataSource slug:
        AsterDEMSource("aster-dem").run()
    """

    def __init__(self, datasource_slug: str):
        self.source_slug = datasource_slug

    # ------------------------------------------------------------------
    # Period logic — one (month_start, month_end) pair per missing month
    # ------------------------------------------------------------------

    def get_periods_to_fetch(self) -> list[tuple[date, date]]:
        from apps.mining.models import DataSource, MiningJob

        try:
            cfg = DataSource.objects.get(slug=self.source_slug).config
            start_str = cfg.get("start_date")
            if start_str:
                sd = date.fromisoformat(start_str)
                start_month = date(sd.year, sd.month, 1)
            else:
                start_month = date(DEFAULT_START.year, DEFAULT_START.month, 1)
        except DataSource.DoesNotExist:
            start_month = date(DEFAULT_START.year, DEFAULT_START.month, 1)

        # Only fetch months that have fully completed (up to end of last month).
        today = date.today()
        last_complete_month = date(today.year, today.month, 1) - timedelta(days=1)
        last_month_start = date(last_complete_month.year, last_complete_month.month, 1)

        done_months: set[date] = set(
            MiningJob.objects.filter(
                source__slug=self.source_slug,
                status__in=("done", "failed"),
            )
            .exclude(period_start=None)
            .values_list("period_start", flat=True)
        )

        periods: list[tuple[date, date]] = []
        current = start_month
        while current <= last_month_start:
            if current not in done_months:
                periods.append((current, _month_end(current)))
            current = _next_month(current)

        return periods

    # ------------------------------------------------------------------
    # Fetch — select best granules, download, warp, mosaic, COG
    # ------------------------------------------------------------------

    def fetch(self, period_start: date, period_end: date) -> str:
        import warnings
        import earthaccess

        bbox = self._bbox()
        west, south, east, north = bbox
        month_label = period_start.strftime("%Y-%m")

        logger.info("AsterDEMSource: authenticating with NASA Earthdata")
        with warnings.catch_warnings():
            warnings.filterwarnings("ignore", category=FutureWarning, module="earthaccess")
            earthaccess.login(strategy="environment")

        logger.info(
            "AsterDEMSource: searching %s v%s for %s bbox=%s",
            SHORT_NAME, VERSION, month_label, bbox,
        )
        with warnings.catch_warnings():
            warnings.filterwarnings("ignore", category=FutureWarning, module="earthaccess")
            results = earthaccess.search_data(
                short_name=SHORT_NAME,
                version=VERSION,
                temporal=(period_start.isoformat(), period_end.isoformat()),
                bounding_box=(west, south, east, north),
            )

        if not results:
            raise RuntimeError(
                f"No {SHORT_NAME} granules found for {month_label} in bbox {bbox}. "
                "Check Earthdata Login credentials and bbox coverage."
            )

        logger.info(
            "AsterDEMSource: %d granule(s) found — selecting up to %d with lowest cloud cover",
            len(results), MAX_GRANULES,
        )
        selected = _select_best_granules(results, MAX_GRANULES)
        logger.info("AsterDEMSource: downloading %d granule(s)", len(selected))

        with tempfile.TemporaryDirectory(prefix="aster_dem_") as tmp_dir:
            with warnings.catch_warnings():
                warnings.filterwarnings("ignore", category=FutureWarning, module="earthaccess")
                downloaded = earthaccess.download(selected, local_path=tmp_dir, threads=4)

            if not downloaded:
                raise RuntimeError(
                    f"earthaccess.download returned no files for {month_label}"
                )

            logger.info(
                "AsterDEMSource: %d file(s) downloaded → processing", len(downloaded)
            )

            tile_paths: list[str] = []
            for hdf_path in downloaded:
                try:
                    tile_path = self._process_tile(str(hdf_path), bbox)
                    if tile_path:
                        tile_paths.append(tile_path)
                except Exception as exc:
                    logger.warning(
                        "AsterDEMSource: skipping %s — %s",
                        os.path.basename(str(hdf_path)), exc,
                    )

            if not tile_paths:
                raise RuntimeError(f"No valid DEM tiles extracted for {month_label}")

            dir_path = "/cogs/mining/aster-dem"
            os.makedirs(dir_path, exist_ok=True)
            uid = str(uuid.uuid4())[:8]
            raw_path = os.path.join(dir_path, f"raw_{month_label}_{uid}.tif")
            cog_path = os.path.join(dir_path, f"{month_label}_{uid}.tif")

            try:
                logger.info(
                    "AsterDEMSource: mosaicking %d tile(s) → %s", len(tile_paths), raw_path
                )
                self._mosaic_tiles(tile_paths, raw_path, bbox)
            finally:
                for tp in tile_paths:
                    if os.path.exists(tp):
                        os.remove(tp)

        logger.info("AsterDEMSource: converting to COG → %s", cog_path)
        self._to_cog(raw_path, cog_path)
        os.remove(raw_path)

        with rasterio.open(cog_path) as r:
            sample = r.read(1, out_shape=(min(r.height, 64), min(r.width, 64)))
            if np.all(sample == NODATA_OUT):
                os.remove(cog_path)
                raise RuntimeError(
                    f"No valid DEM pixels in bbox {bbox} for {month_label} "
                    "(cloud contamination or missing data — month will be skipped on re-run)"
                )

        logger.info(
            "AsterDEMSource: COG ready %s (%d bytes)", cog_path, os.path.getsize(cog_path)
        )
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
        """Return the full subdataset URI for the DEM band, or None if absent.

        Opening the HDF-EOS2 container itself triggers NotGeoreferencedWarning
        because only the inner subdatasets carry a geotransform; suppress it.
        """
        import warnings

        with warnings.catch_warnings():
            warnings.filterwarnings(
                "ignore", category=rasterio.errors.NotGeoreferencedWarning
            )
            with rasterio.open(hdf_path) as src:
                for sd in src.subdatasets or []:
                    if any(kw in sd for kw in DEM_BAND_KEYWORDS):
                        return sd
        return None

    def _process_tile(self, hdf_path: str, bbox: tuple) -> str | None:
        """
        Read the DEM band from one HDF-EOS2 granule, reproject to WGS-84,
        clip to bbox, and write a temporary GeoTIFF.
        Returns the path, or None if the tile is entirely nodata.
        """
        import warnings

        subdataset = self._find_subdataset(hdf_path)
        open_path = subdataset if subdataset is not None else hdf_path

        with warnings.catch_warnings():
            warnings.filterwarnings(
                "ignore", category=rasterio.errors.NotGeoreferencedWarning
            )
            with rasterio.open(open_path) as src:
                raw = src.read(1).astype(np.float32)
                src_crs = src.crs
                src_transform = src.transform
                src_width = src.width
                src_height = src.height
                src_nodata = src.nodata

        # ASTER DEM uses 0 as the fill value for ocean / no-data areas.
        if src_nodata is not None:
            invalid = raw == float(src_nodata)
        else:
            invalid = raw == 0.0

        dem = np.where(invalid, np.nan, raw)

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
            source=dem,
            destination=dst_arr,
            src_transform=src_transform,
            src_crs=src_crs,
            dst_transform=dst_transform,
            dst_crs=dst_crs,
            resampling=Resampling.bilinear,
            src_nodata=np.nan,
            dst_nodata=np.nan,
        )

        dst_arr = np.where(np.isnan(dst_arr), NODATA_OUT, dst_arr)

        if np.all(dst_arr == NODATA_OUT):
            logger.debug(
                "AsterDEMSource: tile %s is entirely nodata — skipping",
                os.path.basename(hdf_path),
            )
            return None

        tile_path = tempfile.mktemp(suffix="_aster_tile.tif")
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
        """Merge warped tile GeoTIFFs, clip to bbox, write merged GeoTIFF."""
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


# ------------------------------------------------------------------
# Module-level helpers
# ------------------------------------------------------------------

def _cloud_cover(granule) -> float:
    """Extract cloud cover percentage (0–100) from earthaccess granule metadata.

    Falls back to 100.0 (worst) when the CMR record does not carry a
    CloudCover attribute, so those granules sort to the end of the list.
    """
    try:
        cc = granule.get("umm", {}).get("CloudCover")
        if cc is not None:
            return float(cc)
    except Exception:
        pass
    return 100.0


def _select_best_granules(results, max_count: int):
    """Return up to *max_count* granules sorted by ascending cloud cover."""
    return sorted(results, key=_cloud_cover)[:max_count]


def _month_end(d: date) -> date:
    """Return the last calendar day of the month containing *d*."""
    if d.month == 12:
        return date(d.year + 1, 1, 1) - timedelta(days=1)
    return date(d.year, d.month + 1, 1) - timedelta(days=1)


def _next_month(d: date) -> date:
    """Return the first day of the month after *d*."""
    if d.month == 12:
        return date(d.year + 1, 1, 1)
    return date(d.year, d.month + 1, 1)
