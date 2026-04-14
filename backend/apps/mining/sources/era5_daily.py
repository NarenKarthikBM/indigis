"""
ERA5DailySource — downloads daily-statistics climate data from ECMWF CDS,
processes NetCDF downloads into per-day / per-month / per-year COGs, and
registers each as a RasterAsset on its appropriate Layer.

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

import logging
import os
import shutil
import tempfile
import uuid
from datetime import date

import numpy as np

logger = logging.getLogger(__name__)

# ---------------------------------------------------------------------------
# Layer-slug / aggregation mapping per variable / CDS statistic
# ---------------------------------------------------------------------------

STAT_CONFIGS = {
    "2m_temperature": [
        {
            "cds_stat":    "daily_mean",
            "daily_layer": "era5-t2m-daily-mean",
            "monthly_agg": "mean", "monthly_layer": "era5-t2m-monthly-mean",
            "yearly_agg":  "mean", "yearly_layer":  "era5-t2m-yearly-mean",
        },
        {
            "cds_stat":    "daily_minimum",
            "daily_layer": "era5-t2m-daily-min",
            "monthly_agg": None,   "monthly_layer": None,
            "yearly_agg":  "min",  "yearly_layer":  "era5-t2m-yearly-min",
        },
        {
            "cds_stat":    "daily_maximum",
            "daily_layer": "era5-t2m-daily-max",
            "monthly_agg": "max",  "monthly_layer": "era5-t2m-monthly-max",
            "yearly_agg":  "max",  "yearly_layer":  "era5-t2m-yearly-max",
        },
    ],
    "total_precipitation": [
        {
            "cds_stat":    "daily_sum",
            "daily_layer": "era5-precip-daily-sum",
            "monthly_agg": "sum",  "monthly_layer": "era5-precip-monthly-sum",
            "yearly_agg":  "sum",  "yearly_layer":  "era5-precip-yearly-sum",
        },
    ],
}

# Short names used in NC files for each CDS variable
_NC_VAR_MAP = {
    "2m_temperature":    "t2m",
    "total_precipitation": "tp",
}

# Short tag for directory paths
_VAR_SHORT = {
    "2m_temperature":    "t2m",
    "total_precipitation": "precip",
}

_NODATA = -9999.0


class ERA5DailySource:
    """Mining source for ECMWF ERA5 daily-statistics via CDS API."""

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
        """Orchestrate: compute missing years → create jobs → process → register assets."""
        from django.utils import timezone

        from apps.mining.models import DataSource, MiningJob

        try:
            ds = DataSource.objects.get(slug=self.datasource_slug)
        except DataSource.DoesNotExist:
            print("DataSource '%s' not found — skipping.", self.datasource_slug)
            return

        if not ds.is_active:
            print("DataSource '%s' is inactive — skipping.", self.datasource_slug)
            return

        self._ds = ds
        self.config = ds.config or {}

        variable = self.config.get("variable")
        if variable not in STAT_CONFIGS:
            print(
                "DataSource '%s' has unknown variable '%s'. Expected one of: %s",
                self.datasource_slug,
                variable,
                list(STAT_CONFIGS),
            )
            return

        years = self.get_periods_to_fetch()
        if not years:
            print("No new years to fetch for '%s'.", self.datasource_slug)
            return

        for year in years:
            period_start = date(year, 1, 1)
            period_end = date(year, 12, 31)

            job = MiningJob.objects.create(
                source=ds,
                layer=None,  # ERA5 jobs produce multiple layers — linked per-asset via _register_asset
                status=MiningJob.STATUS_RUNNING,
                period_start=period_start,
                period_end=period_end,
                started_at=timezone.now(),
            )
            print("ERA5 job %s started: %s year=%d", job.id, self.datasource_slug, year)

            try:
                self._process_year(year, job)
                job.status = MiningJob.STATUS_DONE
                job.completed_at = timezone.now()
                job.save()

                ds.last_fetched_at = timezone.now()
                ds.save(update_fields=["last_fetched_at"])

                print("ERA5 job %s done (year=%d)", job.id, year)

            except Exception as exc:
                job.status = MiningJob.STATUS_FAILED
                job.error_message = str(exc)
                job.completed_at = timezone.now()
                job.save()
                print("ERA5 job %s failed (year=%d): %s", job.id, year, exc, exc_info=True)

    # ------------------------------------------------------------------
    # Per-year processing
    # ------------------------------------------------------------------

    def _process_year(self, year: int, job) -> None:
        variable = self.config.get("variable")
        nc_var = _NC_VAR_MAP.get(variable, variable)
        convert_k_to_c = (variable == "2m_temperature")

        tmp_root = tempfile.mkdtemp(prefix=f"era5_{variable}_{year}_")
        try:
            for sc in STAT_CONFIGS[variable]:
                cds_stat = sc["cds_stat"]
                print("ERA5: downloading %s / %s / %d", variable, cds_stat, year)

                # 1. Download NC for the full year
                nc_path = os.path.join(tmp_root, f"{variable}_{cds_stat}_{year}.grb")
                self._download_nc(variable, cds_stat, year, nc_path)

                # 2. Extract per-day raw TIFFs
                raw_dir = os.path.join(tmp_root, f"raw_{cds_stat}")
                os.makedirs(raw_dir, exist_ok=True)
                daily_map = self._extract_daily_tiffs(nc_path, nc_var, raw_dir)

                # 3. Kelvin → Celsius conversion if needed
                if convert_k_to_c:
                    for tif_path in daily_map.values():
                        self._apply_kelvin_to_celsius(tif_path)

                # 4. Convert each daily raw TIFF to COG and register
                daily_cog_map: dict[str, str] = {}
                for date_label, raw_tif in sorted(daily_map.items()):
                    cog_path = self._cog_output_path(variable, sc["daily_layer"], date_label)
                    os.makedirs(os.path.dirname(cog_path), exist_ok=True)
                    self._to_cog(raw_tif, cog_path)

                    day = date(int(date_label[:4]), int(date_label[4:6]), int(date_label[6:8]))
                    self._register_asset(
                        layer_slug=sc["daily_layer"],
                        cog_path=cog_path,
                        period_label=date_label,
                        period_start=day,
                        period_end=day,
                        job=job,
                    )
                    daily_cog_map[date_label] = cog_path

                # 5. Monthly aggregation (if configured)
                if sc["monthly_agg"] and sc["monthly_layer"]:
                    monthly_groups: dict[str, list[str]] = {}
                    for date_label, cog_path in daily_cog_map.items():
                        month_key = date_label[:6]  # YYYYMM
                        monthly_groups.setdefault(month_key, []).append(cog_path)

                    for month_key, cog_paths in sorted(monthly_groups.items()):
                        period_label = f"{month_key[:4]}-{month_key[4:]}"  # YYYY-MM
                        monthly_cog = self._cog_output_path(
                            variable, sc["monthly_layer"], period_label
                        )
                        os.makedirs(os.path.dirname(monthly_cog), exist_ok=True)
                        self._aggregate_tiffs(cog_paths, sc["monthly_agg"], monthly_cog)

                        yr = int(month_key[:4])
                        mo = int(month_key[4:])
                        import calendar
                        last_day = calendar.monthrange(yr, mo)[1]
                        self._register_asset(
                            layer_slug=sc["monthly_layer"],
                            cog_path=monthly_cog,
                            period_label=period_label,
                            period_start=date(yr, mo, 1),
                            period_end=date(yr, mo, last_day),
                            job=job,
                        )

                # 6. Yearly aggregation
                all_year_cogs = list(daily_cog_map.values())
                yearly_cog = self._cog_output_path(variable, sc["yearly_layer"], str(year))
                os.makedirs(os.path.dirname(yearly_cog), exist_ok=True)
                self._aggregate_tiffs(all_year_cogs, sc["yearly_agg"], yearly_cog)
                self._register_asset(
                    layer_slug=sc["yearly_layer"],
                    cog_path=yearly_cog,
                    period_label=str(year),
                    period_start=date(year, 1, 1),
                    period_end=date(year, 12, 31),
                    job=job,
                )

                # 7. Cleanup NC and raw TIFFs
                if os.path.exists(nc_path):
                    os.remove(nc_path)
                shutil.rmtree(raw_dir, ignore_errors=True)
        finally:
            shutil.rmtree(tmp_root, ignore_errors=True)

    # ------------------------------------------------------------------
    # Helpers
    # ------------------------------------------------------------------

    def _download_nc(self, variable: str, cds_stat: str, year: int, out_path: str) -> None:
        import cdsapi

        url = os.environ.get("CDS_API_URL")
        key = os.environ.get("CDS_API_KEY")
        client_kwargs: dict = {}
        if url and key:
            client_kwargs = {"url": url, "key": key}

        c = cdsapi.Client(**client_kwargs)

        all_months = [f"{m:02d}" for m in range(1, 13)]
        all_days = [f"{d:02d}" for d in range(1, 32)]
        bbox = self.config.get("bbox", [37.5, 68.0, 8.0, 97.5])  # N, W, S, E

        try:
            c.retrieve(
                "derived-era5-single-levels-daily-statistics",
                {
                    "product_type": "reanalysis",
                    "variable": variable,
                    "year": str(year),
                    "month": all_months,
                    "day": all_days,
                    "daily_statistic": cds_stat,
                    "time_zone": "utc+00:00",
                    "frequency": "6_hourly",
                    "area": bbox,
                },
                out_path,
            )
        except Exception as exc:
            print(f"CDS API download failed: {exc}")

    def _extract_daily_tiffs(self, nc_path: str, nc_var: str, out_dir: str) -> dict[str, str]:
        """Extract per-day raw TIFFs from NC file. Returns {YYYYMMDD: path}."""
        import xarray as xr
        import rioxarray  # noqa: F401

        ds = xr.open_dataset(nc_path, engine="cfgrib")
        da = ds[nc_var]

        # ERA5 uses latitude/longitude; rename for rioxarray
        rename_map = {}
        if "latitude" in da.dims:
            rename_map["latitude"] = "lat"
        if "longitude" in da.dims:
            rename_map["longitude"] = "lon"
        if rename_map:
            da = da.rename(rename_map)

        da = da.rio.set_spatial_dims(x_dim="lon", y_dim="lat", inplace=True)
        da = da.rio.write_crs("EPSG:4326")

        result: dict[str, str] = {}
        for t in da.time:
            label = str(t.dt.strftime("%Y%m%d").values)
            tif_path = os.path.join(out_dir, f"{nc_var}_{label}_raw.tif")
            da.sel(time=t).rio.to_raster(tif_path)
            result[label] = tif_path

        ds.close()
        return result

    def _apply_kelvin_to_celsius(self, tif_path: str) -> None:
        """Subtract 273.15 from all valid pixels in-place (Kelvin → °C)."""
        import rasterio

        tmp_path = tif_path + ".k.tmp"
        os.rename(tif_path, tmp_path)
        try:
            with rasterio.open(tmp_path) as src:
                data = src.read(1).astype(np.float32)
                src_nodata = src.nodata
                profile = src.profile.copy()

            valid = data != (src_nodata if src_nodata is not None else _NODATA)
            data[valid] -= 273.15
            profile.update(dtype="float32", nodata=_NODATA)

            with rasterio.open(tif_path, "w", **profile) as dst:
                dst.write(data, 1)
        finally:
            if os.path.exists(tmp_path):
                os.remove(tmp_path)

    def _aggregate_tiffs(
        self,
        paths: list[str],
        operation: str,
        output_path: str,
    ) -> str:
        """Stack TIFFs, apply operation (mean/min/max/sum), write COG."""
        import rasterio
        from apps.layers.services import convert_to_cog

        arrays: list[np.ndarray] = []
        profile = None
        for p in paths:
            with rasterio.open(p) as src:
                data = src.read(1).astype(np.float32)
                nd = src.nodata if src.nodata is not None else _NODATA
                data[data == nd] = np.nan
                arrays.append(data)
                if profile is None:
                    profile = src.profile.copy()

        stack = np.stack(arrays, axis=0)
        if operation == "mean":
            result = np.nanmean(stack, axis=0)
        elif operation == "min":
            result = np.nanmin(stack, axis=0)
        elif operation == "max":
            result = np.nanmax(stack, axis=0)
        elif operation == "sum":
            result = np.nansum(stack, axis=0)
        else:
            raise ValueError(f"Unknown aggregation operation: {operation!r}")

        result[np.isnan(result)] = _NODATA
        profile.update(dtype="float32", nodata=_NODATA, driver="GTiff")

        tmp_path = output_path + ".raw.tmp"
        with rasterio.open(tmp_path, "w", **profile) as dst:
            dst.write(result.astype(np.float32), 1)

        convert_to_cog(tmp_path, output_path)
        os.remove(tmp_path)
        return output_path

    def _to_cog(self, src_path: str, dst_path: str) -> None:
        from apps.layers.services import convert_to_cog
        convert_to_cog(src_path, dst_path)

    def _register_asset(
        self,
        layer_slug: str,
        cog_path: str,
        period_label: str,
        period_start: date,
        period_end: date,
        job,
    ) -> None:
        from apps.layers.models import Layer
        from apps.layers.services import create_raster_asset_and_queue_stats

        try:
            layer = Layer.objects.get(slug=layer_slug)
        except Layer.DoesNotExist:
            print(
                "_register_asset: Layer '%s' not found — skipping asset registration. "
                "Run setup_era5_sources to create Layer records.",
                layer_slug,
            )
            return

        cog_url = cog_path.replace("/cogs/", "/data/cogs/", 1)
        create_raster_asset_and_queue_stats(
            layer=layer,
            cog_url=cog_url,
            period_label=period_label,
            data_period_start=period_start,
            data_period_end=period_end,
            source="bot",
            mining_job=job,
        )

    @staticmethod
    def _cog_output_path(variable: str, layer_slug: str, period_label: str) -> str:
        var_short = _VAR_SHORT.get(variable, variable)
        uid8 = uuid.uuid4().hex[:8]
        return f"/cogs/mining/era5-{var_short}/{layer_slug}/{period_label}_{uid8}.tif"
