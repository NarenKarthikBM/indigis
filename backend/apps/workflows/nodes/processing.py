import json
import tempfile

import numpy as np
import rasterio
from rasterio.mask import mask as rasterio_mask
from rasterio.warp import reproject, Resampling


_NODATA = -9999.0


def _write_raster(arr: np.ndarray, profile: dict, suffix: str) -> str:
    """Write a 2-D float32 array to a temporary GeoTIFF and return its path."""
    profile = profile.copy()
    profile.update(dtype="float32", count=1, nodata=_NODATA, compress="deflate")
    tmp_path = tempfile.mktemp(suffix=suffix, prefix="wf_")
    with rasterio.open(tmp_path, "w", **profile) as dst:
        dst.write(arr.astype(np.float32), 1)
    return tmp_path


def difference_node(inputs: dict, config: dict) -> dict:
    raster_a = inputs.get("raster_a")
    raster_b = inputs.get("raster_b")
    if not raster_a or not raster_b:
        raise ValueError("difference requires 'raster_a' and 'raster_b' inputs")

    with rasterio.open(raster_a["path"]) as src_a:
        data_a = src_a.read(1, masked=True).astype(np.float32)
        profile = src_a.profile.copy()
        height, width = src_a.height, src_a.width
        crs_a = src_a.crs
        transform_a = src_a.transform

    with rasterio.open(raster_b["path"]) as src_b:
        if src_b.crs == crs_a and src_b.width == width and src_b.height == height:
            data_b = src_b.read(1, masked=True).astype(np.float32)
        else:
            # Reproject B onto A's grid
            data_b_arr = np.zeros((height, width), dtype=np.float32)
            reproject(
                source=rasterio.band(src_b, 1),
                destination=data_b_arr,
                src_transform=src_b.transform,
                src_crs=src_b.crs,
                dst_transform=transform_a,
                dst_crs=crs_a,
                resampling=Resampling.bilinear,
            )
            data_b = np.ma.masked_equal(data_b_arr, 0)

    diff = data_a - data_b
    result = np.ma.filled(diff, _NODATA).astype(np.float32)

    path = _write_raster(result, profile, "_diff.tif")
    return {"type": "raster", "path": path, "metadata": {}}


def ndvi_node(inputs: dict, config: dict) -> dict:
    raster_in = inputs.get("raster_in")
    if not raster_in:
        raise ValueError("ndvi requires 'raster_in' input")

    nir_band = int(config.get("nir_band", 4))
    red_band = int(config.get("red_band", 3))

    with rasterio.open(raster_in["path"]) as src:
        if src.count < max(nir_band, red_band):
            raise ValueError(
                f"Raster has {src.count} bands; NDVI needs bands {red_band} (Red) and {nir_band} (NIR)"
            )
        nir = src.read(nir_band, masked=True).astype(np.float32)
        red = src.read(red_band, masked=True).astype(np.float32)
        profile = src.profile.copy()

    denom = nir + red
    ndvi = np.where(denom == 0, _NODATA, (nir - red) / denom).astype(np.float32)
    # Propagate mask
    combined_mask = np.ma.getmaskarray(nir) | np.ma.getmaskarray(red)
    ndvi[combined_mask] = _NODATA

    path = _write_raster(ndvi, profile, "_ndvi.tif")
    return {"type": "raster", "path": path, "metadata": {}}


def reclassify_node(inputs: dict, config: dict) -> dict:
    raster_in = inputs.get("raster_in")
    if not raster_in:
        raise ValueError("reclassify requires 'raster_in' input")

    rules = config.get("rules", [])
    if not rules:
        raise ValueError("reclassify requires at least one rule in config['rules']")

    with rasterio.open(raster_in["path"]) as src:
        data = src.read(1, masked=True).astype(np.float32)
        profile = src.profile.copy()
        nodata_src = src.nodata

    result = np.ma.filled(data, _NODATA).astype(np.float32)
    mask = result == _NODATA
    if nodata_src is not None:
        mask |= result == float(nodata_src)

    reclassed = np.full_like(result, _NODATA)
    for rule in rules:
        try:
            lo = float(rule["min"])
            hi = float(rule["max"])
            new_val = float(rule["new_value"])
        except (KeyError, TypeError, ValueError):
            continue
        in_range = (result >= lo) & (result <= hi) & ~mask
        reclassed[in_range] = new_val

    path = _write_raster(reclassed, profile, "_reclass.tif")
    return {"type": "raster", "path": path, "metadata": {}}


def clip_node(inputs: dict, config: dict) -> dict:
    raster_in = inputs.get("raster_in")
    vector_in = inputs.get("vector_in")
    if not raster_in or not vector_in:
        raise ValueError("clip requires 'raster_in' and 'vector_in' inputs")

    geojson = vector_in["metadata"].get("geojson")
    if not geojson:
        with open(vector_in["path"]) as f:
            geojson = json.load(f)

    shapes = [feat["geometry"] for feat in geojson.get("features", [])]
    if not shapes:
        raise ValueError("vector_in has no features to clip with")

    with rasterio.open(raster_in["path"]) as src:
        try:
            out_image, out_transform = rasterio_mask(src, shapes, crop=True)
        except Exception as exc:
            raise ValueError(f"Clip failed: {exc}") from exc
        out_meta = src.meta.copy()

    out_meta.update(
        driver="GTiff",
        height=out_image.shape[1],
        width=out_image.shape[2],
        transform=out_transform,
        compress="deflate",
        nodata=_NODATA,
    )
    tmp_path = tempfile.mktemp(suffix="_clip.tif", prefix="wf_")
    with rasterio.open(tmp_path, "w", **out_meta) as dst:
        dst.write(out_image.astype(np.float32))

    return {"type": "raster", "path": tmp_path, "metadata": {}}


def zonal_stats_node(inputs: dict, config: dict) -> dict:
    raster_in = inputs.get("raster_in")
    vector_in = inputs.get("vector_in")
    if not raster_in or not vector_in:
        raise ValueError("zonal_stats requires 'raster_in' and 'vector_in' inputs")

    try:
        from rasterstats import zonal_stats
    except ImportError:
        raise ImportError("rasterstats is required for zonal_stats node. Install it with: pip install rasterstats")

    stats_keys = config.get("stats", ["mean", "min", "max", "count"])
    if isinstance(stats_keys, str):
        stats_keys = [stats_keys]

    geojson = vector_in["metadata"].get("geojson")
    if not geojson:
        with open(vector_in["path"]) as f:
            geojson = json.load(f)

    features = geojson.get("features", [])
    if not features:
        raise ValueError("vector_in has no features for zonal statistics")

    stats_results = zonal_stats(
        features,
        raster_in["path"],
        stats=stats_keys,
        geojson_out=True,
        nodata=_NODATA,
    )

    result_geojson = {
        "type": "FeatureCollection",
        "features": stats_results,
    }

    tmp = tempfile.NamedTemporaryFile(
        suffix="_zstats.geojson", delete=False, mode="w", prefix="wf_"
    )
    json.dump(result_geojson, tmp)
    tmp.close()

    return {
        "type": "vector",
        "path": tmp.name,
        "metadata": {"geojson": result_geojson},
    }
