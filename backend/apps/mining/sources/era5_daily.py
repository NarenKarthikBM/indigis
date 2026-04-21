"""
ERA5DailySource - downloads daily-statistics climate data from ECMWF CDS,
processes each year's NetCDF into yearly and monthly COGs via CDO,
and registers each as a RasterAsset on its appropriate Layer.

NetCDF-native pipeline (CDO-based, no daily COGs):
----------------------------------------------------
1. Download full-year NC from CDS API
2. Archive NC to /data/era5_nc/<variable>/ for downstream ETCCDI computation
3. CDO yearly aggregation (yearmean/yearmax/yearmin/yearsum) → COG → RasterAsset + zonal stats
4. CDO monthly aggregation (monmean/monmax/monsum) → 12 COGs → RasterAssets (no zonal stats)
5. Clean up temp files; archived NCs are retained for ETCCDI computation

Supported variables
-------------------
2m_temperature      → daily_mean, daily_minimum, daily_maximum
total_precipitation → daily_sum

DataSource.config schema
------------------------
{
    "variable":   "2m_temperature",
    "bbox":       [37.5, 68.0, 8.0, 97.5],  # N, W, S, E
    "start_year": 2020
}
"""

import calendar
import logging
import os
import shutil
import subprocess
import tempfile
import uuid
from datetime import date

import numpy as np

logger = logging.getLogger(__name__)

# ---------------------------------------------------------------------------
# Layer-slug / CDO-operation mapping per variable / CDS statistic
# ---------------------------------------------------------------------------
# No daily_layer entries: daily COGs are not produced by this pipeline.
# monthly_agg values are CDO operator names (monmean, monmax, monsum).
# yearly_agg values are CDO operator names (yearmean, yearmax, yearmin, yearsum).

STAT_CONFIGS = {
    "2m_temperature": [
        {
            "cds_stat":    "daily_mean",
            "monthly_agg": "monmean", "monthly_layer": "era5-t2m-monthly-mean",
            "yearly_agg":  "yearmean", "yearly_layer": "era5-t2m-yearly-mean",
        },
        {
            "cds_stat":    "daily_minimum",
            "monthly_agg": "monmin",   "monthly_layer": "era5-t2m-monthly-min",
            "yearly_agg":  "yearmin",  "yearly_layer":  "era5-t2m-yearly-min",
        },
        {
            "cds_stat":    "daily_maximum",
            "monthly_agg": "monmax",   "monthly_layer": "era5-t2m-monthly-max",
            "yearly_agg":  "yearmax",  "yearly_layer":  "era5-t2m-yearly-max",
        },
    ],
    "total_precipitation": [
        {
            "cds_stat":    "daily_sum",
            "monthly_agg": "monsum",   "monthly_layer": "era5-precip-monthly-sum",
            "yearly_agg":  "yearsum",  "yearly_layer":  "era5-precip-yearly-sum",
        },
    ],
}

# Short tag for directory paths
_VAR_SHORT = {
    "2m_temperature":      "t2m",
    "total_precipitation": "precip",
}

_NODATA = -9999.0

# Where archived ERA5 NC files are stored (consumed by the ETCCDI pipeline)
ERA5_NC_ARCHIVE = os.environ.get("ERA5_NC_DIR", "/data/era5_nc")


class ERA5DailySource:
    """
    Mining source for ECMWF ERA5 daily-statistics via CDS API.

    Uses a NetCDF-native pipeline: CDO performs temporal aggregation directly
    on the downloaded NetCDF, producing yearly and monthly COGs without ever
    creating per-day GeoTIFFs. Source NCs are archived at ERA5_NC_ARCHIVE for
    downstream ETCCDI index computation.
    """

    def __init__(self, datasource_slug: str) -> None:
        self.datasource_slug = datasource_slug
        self._ds = None   # DataSource ORM object, lazy-loaded in run()
        self.config: dict = {}

    # ------------------------------------------------------------------
    # Public interface
    # ------------------------------------------------------------------

    def get_periods_to_fetch(self) -> list[int]:
        """Return list of years that still need processing."""
        from apps.mining.models import MiningJob

        current_year = date.today().year
        start_year = self.config.get("start_year", 2020)

        processed_years = set(
            MiningJob.objects.filter(
                source__slug=self.datasource_slug,
                status__in=[MiningJob.STATUS_DONE, MiningJob.STATUS_FAILED],
            )
            .exclude(period_start__isnull=True)
            .values_list("period_start__year", flat=True)
        )

        return [y for y in range(start_year, current_year) if y not in processed_years]

    def run(self) -> None:
        """Download all NC files then process: the normal end-to-end entry point."""
        ds, variable, years = self._setup() or (None, None, None)
        if ds is None:
            return
        jobs = self._create_jobs(years, ds)
        self._download_all(variable, years)
        self._process_all(variable, years, jobs, ds)

    def run_processing(self, years: list[int] | None = None) -> None:
        """
        Process already-downloaded NC files without triggering any CDS downloads.

        Use this when downloads are running (or have run) in a separate terminal:

            ERA5DailySource("era5-2m-temperature").run_processing()

        Pass explicit years to reprocess specific years regardless of existing
        job history (useful after fixing layer/config issues):

            ERA5DailySource("era5-2m-temperature").run_processing(years=[1990, 1991])

        Years with missing NC files will be marked as failed and processing
        continues with the remaining years.
        """
        ds, variable, pending = self._setup() or (None, None, None)
        if ds is None:
            return
        target_years = years if years is not None else pending
        if not target_years:
            logger.info("ERA5 run_processing: no years to process.")
            return
        jobs = self._create_jobs(target_years, ds)
        self._process_all(variable, target_years, jobs, ds)

    # ------------------------------------------------------------------
    # Shared setup helpers
    # ------------------------------------------------------------------

    def _setup(self):
        """
        Load and validate the DataSource.  Sets self.config.
        Returns (ds, variable, years) on success, None to abort.
        """
        from apps.mining.models import DataSource

        try:
            ds = DataSource.objects.get(slug=self.datasource_slug)
            logger.info("ERA5: DataSource '%s' (id=%d)", ds.slug, ds.id)
        except DataSource.DoesNotExist:
            logger.warning("DataSource '%s' not found - skipping.", self.datasource_slug)
            return None

        if not ds.is_active:
            logger.info("DataSource '%s' is inactive - skipping.", self.datasource_slug)
            return None

        self._ds   = ds
        self.config = ds.config or {}

        variable = self.config.get("variable")
        if variable not in STAT_CONFIGS:
            logger.error(
                "DataSource '%s' has unknown variable '%s'. Expected one of: %s",
                self.datasource_slug, variable, list(STAT_CONFIGS),
            )
            return None

        years = self.get_periods_to_fetch()
        if not years:
            logger.info("No new years to fetch for '%s'.", self.datasource_slug)
            return None

        return ds, variable, years

    def _create_jobs(self, years: list[int], ds) -> dict:
        """Create a MiningJob record for each year and return {year: job}."""
        from django.utils import timezone
        from apps.mining.models import MiningJob

        jobs: dict[int, MiningJob] = {}
        for year in years:
            job = MiningJob.objects.create(
                source=ds,
                layer=None,
                status=MiningJob.STATUS_RUNNING,
                period_start=date(year, 1, 1),
                period_end=date(year, 12, 31),
                started_at=timezone.now(),
            )
            jobs[year] = job
            logger.info("ERA5 job %s created: year=%d", job.id, year)
        return jobs

    # ------------------------------------------------------------------
    # Download phase
    # ------------------------------------------------------------------

    def _download_all(self, variable: str, years: list[int]) -> None:
        """
        Download NC files sequentially, 2 months per CDS request.

        For each (year, cds_stat): downloads 6 two-month chunks, merges them
        into a single yearly NC via CDO mergetime, then removes the chunk files.
        Cached chunk or yearly NCs are skipped automatically.
        """
        archive_dir = os.path.join(ERA5_NC_ARCHIVE, variable)
        os.makedirs(archive_dir, exist_ok=True)

        for year in years:
            for sc in STAT_CONFIGS[variable]:
                cds_stat  = sc["cds_stat"]
                yearly_nc = os.path.join(archive_dir, f"{variable}_{cds_stat}_{year}.nc")

                if os.path.exists(yearly_nc):
                    logger.info("ERA5: cached yearly NC found, skipping: %s", yearly_nc)
                    continue

                # Download 2 months at a time → 6 chunk files
                chunk_ncs = []
                for start_m in range(1, 13, 2):
                    end_m    = start_m + 1
                    chunk_nc = os.path.join(
                        archive_dir,
                        f"{variable}_{cds_stat}_{year}_{start_m:02d}-{end_m:02d}.nc",
                    )
                    chunk_ncs.append(chunk_nc)
                    if os.path.exists(chunk_nc):
                        logger.info("ERA5: cached chunk NC, skipping: %s", chunk_nc)
                        continue
                    logger.info(
                        "ERA5: downloading %s / %s / %d months %02d-%02d → %s",
                        variable, cds_stat, year, start_m, end_m, chunk_nc,
                    )
                    self._download_nc_months(variable, cds_stat, year, [start_m, end_m], chunk_nc)
                    logger.info("ERA5: download complete → %s", chunk_nc)

                # Merge 6 chunks → yearly NC, then clean up
                logger.info("ERA5: merging chunk NCs → %s", yearly_nc)
                self._cdo_run("mergetime", *chunk_ncs, yearly_nc)
                logger.info("ERA5: merge complete → %s", yearly_nc)
                for chunk_nc in chunk_ncs:
                    if os.path.exists(chunk_nc):
                        os.remove(chunk_nc)

    # ------------------------------------------------------------------
    # Process phase
    # ------------------------------------------------------------------

    def _process_all(self, variable: str, years: list[int], jobs: dict, ds) -> None:
        """
        CDO aggregation → COG → asset registration for each year, sequentially.
        Runs entirely in the calling thread - no ORM threading concerns.
        """
        from django.utils import timezone
        from apps.mining.models import MiningJob

        logger.info("ERA5 processing: %d year(s).", len(years))
        for year in years:
            job = jobs[year]
            try:
                self._process_year(year, job)
                job.status       = MiningJob.STATUS_DONE
                job.completed_at = timezone.now()
                job.save()
                ds.last_fetched_at = timezone.now()
                ds.save(update_fields=["last_fetched_at"])
                logger.info("ERA5 job %s done (year=%d)", job.id, year)
            except Exception as exc:
                job.status        = MiningJob.STATUS_FAILED
                job.error_message = str(exc)
                job.completed_at  = timezone.now()
                job.save()
                logger.exception("ERA5 job %s failed (year=%d): %s", job.id, year, exc)

    # ------------------------------------------------------------------
    # Per-year processing
    # ------------------------------------------------------------------

    def _process_year(self, year: int, job) -> None:
        """
        Process stat configs sequentially (CDO is CPU-heavy; running multiple
        simultaneously overwhelms the worker).  Monthly COGs within each stat
        are produced in parallel (3 workers) for a meaningful speedup.
        NCs are never deleted - kept at ERA5_NC_ARCHIVE for ETCCDI computation.
        """
        variable    = self.config.get("variable")
        archive_dir = os.path.join(ERA5_NC_ARCHIVE, variable)
        os.makedirs(archive_dir, exist_ok=True)

        tmp_root = tempfile.mkdtemp(prefix=f"era5_{variable}_{year}_")
        try:
            for sc in STAT_CONFIGS[variable]:
                self._process_stat(sc, variable, year, job, archive_dir, tmp_root)
        finally:
            shutil.rmtree(tmp_root, ignore_errors=True)

    def _process_stat(
        self,
        sc: dict,
        variable: str,
        year: int,
        job,
        archive_dir: str,
        tmp_root: str,
    ) -> None:
        """
        Process a single CDS stat config for one year:
          1. Download NC to permanent archive (skip if already present)
          2. K→C conversion via CDO (temperature only)
          3. Yearly CDO aggregation → COG → RasterAsset (with zonal stats)
          4. Monthly CDO aggregation → 12 COGs in parallel → RasterAssets (no stats)
        Each stat uses an isolated subdirectory of tmp_root.
        """
        cds_stat      = sc["cds_stat"]
        yearly_agg    = sc["yearly_agg"]
        yearly_layer  = sc["yearly_layer"]
        # monthly_agg   = sc["monthly_agg"]
        # monthly_layer = sc["monthly_layer"]
        is_temp       = (variable == "2m_temperature")

        # Isolated tmp dir for CDO intermediates (avoids cross-stat filename collisions)
        stat_tmp = os.path.join(tmp_root, cds_stat)
        os.makedirs(stat_tmp, exist_ok=True)

        # NC file was downloaded in _download_phase; it must exist at this point.
        archive_nc = os.path.join(archive_dir, f"{variable}_{cds_stat}_{year}.nc")

        # 2. K → C conversion for temperature (CDO reads archive, writes to stat_tmp)
        if is_temp:
            celsius_nc = os.path.join(stat_tmp, f"celsius_{year}.nc")
            self._cdo_run("subc,273.15", archive_nc, celsius_nc)
            work_nc = celsius_nc
        else:
            work_nc = archive_nc

        # 3. Yearly aggregation → COG → register with zonal stats
        if yearly_agg and yearly_layer:
            yearly_nc  = os.path.join(stat_tmp, f"yearly_{year}.nc")
            yearly_cog = self._cog_output_path(variable, yearly_layer, str(year))
            os.makedirs(os.path.dirname(yearly_cog), exist_ok=True)
            self._cdo_run(yearly_agg, work_nc, yearly_nc)
            self._nc_to_cog(yearly_nc, yearly_cog, _VAR_SHORT.get(variable))
            min_val, max_val = self._compute_min_max(yearly_cog)
            self._register_asset(
                layer_slug=yearly_layer,
                cog_path=yearly_cog,
                period_label=str(year),
                period_start=date(year, 1, 1),
                period_end=date(year, 12, 31),
                job=job,
                min_value=min_val,
                max_value=max_val,
                queue_stats=True,
            )

        # # 4. Monthly aggregation → 12 COGs in parallel → register without zonal stats
        # if monthly_agg and monthly_layer:
        #     monthly_nc   = os.path.join(stat_tmp, f"monthly_{year}.nc")
        #     month_prefix = os.path.join(stat_tmp, f"mon_{year}_")
        #     self._cdo_run(monthly_agg, work_nc, monthly_nc)
        #     self._cdo_run("splitmon", monthly_nc, month_prefix)

        #     month_files = [
        #         (m, f"{month_prefix}{m:02d}.nc")
        #         for m in range(1, 13)
        #         if os.path.exists(f"{month_prefix}{m:02d}.nc")
        #     ]

        #     for m, mon_nc in month_files:
        #         period_label = f"{year}-{m:02d}"
        #         monthly_cog  = self._cog_output_path(variable, monthly_layer, period_label)
        #         os.makedirs(os.path.dirname(monthly_cog), exist_ok=True)
        #         self._nc_to_cog(mon_nc, monthly_cog, _VAR_SHORT.get(variable))
        #         min_val, max_val = self._compute_min_max(monthly_cog)
        #         last_day = calendar.monthrange(year, m)[1]
        #         self._register_asset(
        #             layer_slug=monthly_layer,
        #             cog_path=monthly_cog,
        #             period_label=period_label,
        #             period_start=date(year, m, 1),
        #             period_end=date(year, m, last_day),
        #             job=job,
        #             min_value=min_val,
        #             max_value=max_val,
        #             queue_stats=False,
        #         )

    # ------------------------------------------------------------------
    # CDO helpers
    # ------------------------------------------------------------------

    @staticmethod
    def _cdo_run(*args: str) -> None:
        """Run a CDO command, raising RuntimeError on non-zero exit."""
        cmd = ["cdo"] + list(args)
        logger.debug("CDO: %s", " ".join(cmd))
        result = subprocess.run(cmd, capture_output=True, text=True)
        if result.returncode != 0:
            raise RuntimeError(f"CDO failed ({' '.join(cmd)}): {result.stderr.strip()}")

    @staticmethod
    def _nc_to_cog(nc_path: str, cog_path: str, variable: str) -> None:
        """
        Convert a single-time-step NetCDF to a COG.

        Opens with xarray (handles any variable name), collapses the time
        dimension if present, renames ERA5 lat/lon dims, and writes via
        rioxarray + rio-cogeo.
        """
        import xarray as xr
        import rioxarray  # noqa: F401 - registers .rio accessor
        from apps.layers.services import convert_to_cog

        # Load dataset, process, and close before writing - prevents HDF5 handle leaks
        with xr.open_dataset(nc_path) as ds:
            da = ds[variable]

            # CDO aggregated output has a single time step; drop it
            if "valid_time" in da.dims:
                da = da.isel(valid_time=0)
            if "time" in da.dims:
                da = da.isel(time=0)

            # ERA5 uses 'latitude'/'longitude'; rioxarray expects 'lat'/'lon'
            rename_map = {}
            if "latitude" in da.dims:
                rename_map["latitude"] = "lat"
            if "longitude" in da.dims:
                rename_map["longitude"] = "lon"
            if rename_map:
                da = da.rename(rename_map)

            da = da.rio.set_spatial_dims(x_dim="lon", y_dim="lat", inplace=True)
            da = da.rio.write_crs("EPSG:4326")

            # Replace NetCDF fill value with NaN before casting to float32
            fill_val = da.attrs.get("_FillValue") or da.attrs.get("missing_value")
            if fill_val is not None:
                da = da.where(da != fill_val)

            da = da.astype(np.float32).load()  # load into memory before ds closes

        tmp_tif = cog_path + ".raw.tmp.tif"
        try:
            da.rio.to_raster(tmp_tif, nodata=_NODATA)
            convert_to_cog(tmp_tif, cog_path)
        finally:
            if os.path.exists(tmp_tif):
                os.remove(tmp_tif)

    # ------------------------------------------------------------------
    # CDS download
    # ------------------------------------------------------------------

    def _download_nc_months(
        self, variable: str, cds_stat: str, year: int, months: list[int], out_path: str
    ) -> None:
        """Download one or more months of ERA5 daily statistics from CDS in a single request."""
        import cdsapi

        url = os.environ.get("CDS_API_URL")
        key = os.environ.get("CDS_API_KEY")
        client_kwargs: dict = {}
        if url and key:
            client_kwargs = {"url": url, "key": key}

        c = cdsapi.Client(**client_kwargs)

        all_days = [f"{d:02d}" for d in range(1, 32)]
        bbox = self.config.get("bbox", [37.5, 68.0, 8.0, 97.5])  # N, W, S, E

        c.retrieve(
            "derived-era5-single-levels-daily-statistics",
            {
                "product_type":    "reanalysis",
                "variable":        variable,
                "year":            str(year),
                "month":           [f"{m:02d}" for m in months],
                "day":             all_days,
                "daily_statistic": cds_stat,
                "time_zone":       "utc+00:00",
                "frequency":       "6_hourly",
                "area":            bbox,
                "format":          "netcdf",
            },
            out_path,
        )

    # ------------------------------------------------------------------
    # Asset registration
    # ------------------------------------------------------------------

    def _register_asset(
        self,
        layer_slug: str,
        cog_path: str,
        period_label: str,
        period_start: date,
        period_end: date,
        job,
        min_value: float | None = None,
        max_value: float | None = None,
        queue_stats: bool = True,
    ) -> None:
        from apps.layers.models import Layer, RasterAsset
        from apps.layers.services import create_raster_asset_and_queue_stats

        try:
            layer = Layer.objects.get(slug=layer_slug)
        except Layer.DoesNotExist:
            logger.warning(
                "_register_asset: Layer '%s' not found - skipping. "
                "Run setup_era5_sources to create Layer records.",
                layer_slug,
            )
            return

        # TiTiler fetches COGs via the /data/cogs/ HTTP path (not /cogs/)
        cog_url = cog_path.replace("/cogs/", "/data/cogs/", 1)

        if queue_stats:
            create_raster_asset_and_queue_stats(
                layer=layer,
                cog_url=cog_url,
                period_label=period_label,
                data_period_start=period_start,
                data_period_end=period_end,
                source="bot",
                mining_job=job,
                min_value=min_value,
                max_value=max_value,
            )
        else:
            RasterAsset.objects.create(
                layer=layer,
                cog_url=cog_url,
                period_label=period_label,
                data_period_start=period_start,
                data_period_end=period_end,
                source="bot",
                mining_job=job,
                min_value=min_value,
                max_value=max_value,
            )

    # ------------------------------------------------------------------
    # Shared utilities
    # ------------------------------------------------------------------

    @staticmethod
    def _compute_min_max(cog_path: str) -> tuple[float | None, float | None]:
        """Return (min, max) of valid pixels using a downsampled read."""
        import rasterio

        try:
            with rasterio.open(cog_path) as src:
                shape = (src.count, max(1, src.height // 16), max(1, src.width // 16))
                data  = src.read(out_shape=shape, masked=True)
                valid = data.compressed()
                if valid.size == 0:
                    return None, None
                return round(float(np.min(valid)), 6), round(float(np.max(valid)), 6)
        except Exception as exc:
            logger.warning("_compute_min_max failed for %s: %s", cog_path, exc)
            return None, None

    @staticmethod
    def _cog_output_path(variable: str, layer_slug: str, period_label: str) -> str:
        var_short = _VAR_SHORT.get(variable, variable)
        uid8 = uuid.uuid4().hex[:8]
        return f"/cogs/mining/era5-{var_short}/{layer_slug}/{period_label}_{uid8}.tif"
