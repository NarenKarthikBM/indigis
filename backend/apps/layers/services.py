import math
import os
import re
from datetime import date, datetime

import numpy as np
import rasterio
from rasterio.warp import transform_bounds
from rio_cogeo.cogeo import cog_translate
from rio_cogeo.profiles import cog_profiles


# Tag names to check for a single acquisition date (checked in order)
_DATE_TAG_KEYS = [
    "ACQUISITIONDATETIME",
    "TIFFTAG_DATETIME",
    "DATE_ACQUIRED",
    "SENSING_DATE",
    "DATETIME",
    "acquisition_date",
    "date",
    "datetime",
    "start_datetime",
    "end_datetime",
]

# Regex patterns that can match common date formats
_DATE_PATTERNS = [
    # TIFFTAG_DATETIME: "2021:06:15 10:30:00"
    (re.compile(r"^(\d{4}):(\d{2}):(\d{2})"), lambda m: date(int(m.group(1)), int(m.group(2)), int(m.group(3)))),
    # ISO 8601 date or datetime: "2021-06-15" or "2021-06-15T10:30:00Z"
    (re.compile(r"^(\d{4})-(\d{2})-(\d{2})"), lambda m: date(int(m.group(1)), int(m.group(2)), int(m.group(3)))),
]


def _parse_date(value: str) -> date | None:
    """Try to parse a date from a string using known formats. Returns None on failure."""
    if not value:
        return None
    for pattern, extractor in _DATE_PATTERNS:
        m = pattern.match(value.strip())
        if m:
            try:
                return extractor(m)
            except (ValueError, TypeError):
                continue
    return None


def _extract_dates_from_tiff(path: str) -> tuple[date | None, date | None]:
    """
    Attempt to read date_start / date_end from TIFF metadata.

    Sources tried (in order):
      1. GDAL IMAGERY metadata domain  (ACQUISITIONDATETIME)
      2. Default metadata tags          (TIFFTAG_DATETIME, DATE_ACQUIRED, …)
      3. start_datetime / end_datetime  (STAC-style COGs)
    """
    with rasterio.open(path) as src:
        # Collect all tags from relevant domains
        default_tags = src.tags() or {}
        imagery_tags = src.tags(ns="IMAGERY") or {}

        all_tags = {**default_tags, **imagery_tags}
        print(f"Extracting dates from TIFF metadata tags: {all_tags}")

        date_start: date | None = None
        date_end: date | None = None

        # Check for an explicit date range first
        start_raw = (
            all_tags.get("start_datetime")
            or all_tags.get("START_DATE")
            or all_tags.get("DATE_START")
        )
        end_raw = (
            all_tags.get("end_datetime")
            or all_tags.get("END_DATE")
            or all_tags.get("DATE_END")
        )

        if start_raw:
            date_start = _parse_date(start_raw)
        if end_raw:
            date_end = _parse_date(end_raw)

        # If no explicit range, look for a single acquisition date
        if date_start is None:
            for key in _DATE_TAG_KEYS:
                raw = all_tags.get(key)
                if raw:
                    parsed = _parse_date(raw)
                    if parsed:
                        date_start = parsed
                        break

    return date_start, date_end


def extract_raster_metadata(path: str) -> dict:
    with rasterio.open(path) as src:
        crs = src.crs
        bounds = src.bounds
        count = src.count
        dtype = src.dtypes[0]
        res = src.res

        # Transform bounds to WGS84
        if crs and not crs.is_geographic:
            wgs84_bounds = transform_bounds(crs, "EPSG:4326", *bounds)
            spatial_resolution_m = abs(res[0])
        else:
            wgs84_bounds = (bounds.left, bounds.bottom, bounds.right, bounds.top)
            center_lat = (wgs84_bounds[1] + wgs84_bounds[3]) / 2
            spatial_resolution_m = abs(res[0]) * 111320 * math.cos(math.radians(center_lat))

        native_crs = crs.to_string() if crs else ""

        # Compute min/max across all bands using a downsampled read to avoid
        # loading multi-GB files entirely into memory.
        overview_shape = (
            src.count,
            max(1, src.height // 16),
            max(1, src.width // 16),
        )
        data = src.read(out_shape=overview_shape, masked=True)
        valid = data.compressed()
        if valid.size > 0:
            min_value = round(float(np.min(valid)), 6)
            max_value = round(float(np.max(valid)), 6)
        else:
            min_value = None
            max_value = None

    date_start, date_end = _extract_dates_from_tiff(path)

    return {
        "native_crs": native_crs,
        "bbox": {
            "minx": wgs84_bounds[0],
            "miny": wgs84_bounds[1],
            "maxx": wgs84_bounds[2],
            "maxy": wgs84_bounds[3],
        },
        "band_count": count,
        "pixel_dtype": dtype,
        "spatial_resolution_m": round(spatial_resolution_m, 4),
        "min_value": min_value,
        "max_value": max_value,
        "date_start": date_start,
        "date_end": date_end,
    }


def convert_to_cog(src_path: str, dst_path: str) -> None:
    profile = cog_profiles.get("deflate")
    cog_translate(src_path, dst_path, profile, in_memory=False, quiet=True)


def inspect_netcdf(path: str) -> list[dict]:
    """Return a list of non-coordinate variables from a NetCDF file."""
    import xarray as xr

    ds = xr.open_dataset(path)
    results = []
    for name, da in ds.data_vars.items():
        results.append(
            {
                "name": str(name),
                "long_name": da.attrs.get("long_name", ""),
                "units": da.attrs.get("units", ""),
                "dimensions": list(da.dims),
                "shape": list(da.shape),
            }
        )
    ds.close()
    return results


def extract_nc_variable_to_tiffs(nc_path: str, variable: str, out_dir: str) -> list[dict]:
    """
    Extract a single variable from a NetCDF file and write one TIFF per time step.

    Returns a list of dicts: [{path, period_label, time}, ...]
    """
    import xarray as xr
    import rioxarray  # noqa: F401 — registers .rio accessor

    ds = xr.open_dataset(nc_path)
    os.makedirs(out_dir, exist_ok=True)

    da = ds[variable]

    da.rio.set_spatial_dims(x_dim='lon', y_dim='lat', inplace=True)

    # Set CRS to EPSG:4326 if not already set
    try:
        da = da.rio.write_crs("EPSG:4326")
    except Exception:
        pass

    results = []
    if "time" in da.dims:
        if "level" in da.dims:
            da = da.isel(level=0)  # select first level if present, to simplify
        for t in da.time:
            label = str(t.dt.strftime("%Y%m%d").values)
            tif_path = os.path.join(out_dir, f"{variable}_{label}.tif")
            da.sel(time=t).rio.to_raster(tif_path)
            results.append({"path": tif_path, "period_label": label, "time": t.values})
    else:
        tif_path = os.path.join(out_dir, f"{variable}.tif")
        da.rio.to_raster(tif_path)
        results.append({"path": tif_path, "period_label": "", "time": None})

    ds.close()
    return results


def create_raster_asset_and_queue_stats(**kwargs):
    """Create a RasterAsset and enqueue zonal stats computation."""
    from .models import RasterAsset
    from apps.stats.tasks import compute_raster_zonal_stats

    asset = RasterAsset.objects.create(**kwargs)
    compute_raster_zonal_stats.delay(asset.pk)
    return asset


def _update_task_stage(task_id, stage: str, progress: int) -> None:
    """Update task stage and progress atomically without loading the full object."""
    from .models import UploadTask

    UploadTask.objects.filter(pk=task_id).update(stage=stage, progress=progress)
