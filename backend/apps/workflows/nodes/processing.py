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


def evi_node(inputs: dict, config: dict) -> dict:
    raster_in = inputs.get("raster_in")
    if not raster_in:
        raise ValueError("evi requires 'raster_in' input")

    nir_band = int(config.get("nir_band", 5))
    red_band = int(config.get("red_band", 4))
    blue_band = int(config.get("blue_band", 2))

    with rasterio.open(raster_in["path"]) as src:
        nir = src.read(nir_band, masked=True).astype(np.float32)
        red = src.read(red_band, masked=True).astype(np.float32)
        blue = src.read(blue_band, masked=True).astype(np.float32)
        profile = src.profile.copy()

    denom = nir + 6 * red - 7.5 * blue + 1
    evi = np.where(denom == 0, _NODATA, 2.5 * (nir - red) / denom).astype(np.float32)

    combined_mask = np.ma.getmaskarray(nir) | np.ma.getmaskarray(red) | np.ma.getmaskarray(blue)
    evi[combined_mask] = _NODATA

    path = _write_raster(evi, profile, "_evi.tif")
    return {"type": "raster", "path": path, "metadata": {}}


def savi_node(inputs: dict, config: dict) -> dict:
    raster_in = inputs.get("raster_in")
    if not raster_in:
        raise ValueError("savi requires 'raster_in' input")

    nir_band = int(config.get("nir_band", 5))
    red_band = int(config.get("red_band", 4))
    L = float(config.get("L", 0.5))

    with rasterio.open(raster_in["path"]) as src:
        nir = src.read(nir_band, masked=True).astype(np.float32)
        red = src.read(red_band, masked=True).astype(np.float32)
        profile = src.profile.copy()

    denom = nir + red + L
    savi = np.where(denom == 0, _NODATA, ((nir - red) * (1 + L)) / denom).astype(np.float32)

    combined_mask = np.ma.getmaskarray(nir) | np.ma.getmaskarray(red)
    savi[combined_mask] = _NODATA

    path = _write_raster(savi, profile, "_savi.tif")
    return {"type": "raster", "path": path, "metadata": {}}


def ndmi_node(inputs: dict, config: dict) -> dict:
    raster_in = inputs.get("raster_in")
    if not raster_in:
        raise ValueError("ndmi requires 'raster_in' input")

    nir_band = int(config.get("nir_band", 5))
    swir_band = int(config.get("swir_band", 6))

    with rasterio.open(raster_in["path"]) as src:
        nir = src.read(nir_band, masked=True).astype(np.float32)
        swir = src.read(swir_band, masked=True).astype(np.float32)
        profile = src.profile.copy()

    denom = nir + swir
    ndmi = np.where(denom == 0, _NODATA, (nir - swir) / denom).astype(np.float32)

    combined_mask = np.ma.getmaskarray(nir) | np.ma.getmaskarray(swir)
    ndmi[combined_mask] = _NODATA

    path = _write_raster(ndmi, profile, "_ndmi.tif")
    return {"type": "raster", "path": path, "metadata": {}}


def ndwi_node(inputs: dict, config: dict) -> dict:
    raster_in = inputs.get("raster_in")
    if not raster_in:
        raise ValueError("ndwi requires 'raster_in' input")

    green_band = int(config.get("green_band", 3))
    nir_band = int(config.get("nir_band", 5))

    with rasterio.open(raster_in["path"]) as src:
        green = src.read(green_band, masked=True).astype(np.float32)
        nir = src.read(nir_band, masked=True).astype(np.float32)
        profile = src.profile.copy()

    denom = green + nir
    ndwi = np.where(denom == 0, _NODATA, (green - nir) / denom).astype(np.float32)

    combined_mask = np.ma.getmaskarray(green) | np.ma.getmaskarray(nir)
    ndwi[combined_mask] = _NODATA

    path = _write_raster(ndwi, profile, "_ndwi.tif")
    return {"type": "raster", "path": path, "metadata": {}}


def mndwi_node(inputs: dict, config: dict) -> dict:
    raster_in = inputs.get("raster_in")
    if not raster_in:
        raise ValueError("mndwi requires 'raster_in' input")

    green_band = int(config.get("green_band", 3))
    swir_band = int(config.get("swir_band", 6))

    with rasterio.open(raster_in["path"]) as src:
        green = src.read(green_band, masked=True).astype(np.float32)
        swir = src.read(swir_band, masked=True).astype(np.float32)
        profile = src.profile.copy()

    denom = green + swir
    mndwi = np.where(denom == 0, _NODATA, (green - swir) / denom).astype(np.float32)

    combined_mask = np.ma.getmaskarray(green) | np.ma.getmaskarray(swir)
    mndwi[combined_mask] = _NODATA

    path = _write_raster(mndwi, profile, "_mndwi.tif")
    return {"type": "raster", "path": path, "metadata": {}}


def nbr_node(inputs: dict, config: dict) -> dict:
    raster_in = inputs.get("raster_in")
    if not raster_in:
        raise ValueError("nbr requires 'raster_in' input")

    nir_band = int(config.get("nir_band", 5))
    swir2_band = int(config.get("swir2_band", 7))

    with rasterio.open(raster_in["path"]) as src:
        nir = src.read(nir_band, masked=True).astype(np.float32)
        swir2 = src.read(swir2_band, masked=True).astype(np.float32)
        profile = src.profile.copy()

    denom = nir + swir2
    nbr = np.where(denom == 0, _NODATA, (nir - swir2) / denom).astype(np.float32)

    combined_mask = np.ma.getmaskarray(nir) | np.ma.getmaskarray(swir2)
    nbr[combined_mask] = _NODATA

    path = _write_raster(nbr, profile, "_nbr.tif")
    return {"type": "raster", "path": path, "metadata": {}}


def bsi_node(inputs: dict, config: dict) -> dict:
    raster_in = inputs.get("raster_in")
    if not raster_in:
        raise ValueError("bsi requires 'raster_in' input")

    swir = int(config.get("swir_band", 6))
    red = int(config.get("red_band", 4))
    nir = int(config.get("nir_band", 5))
    blue = int(config.get("blue_band", 2))

    with rasterio.open(raster_in["path"]) as src:
        swir_b = src.read(swir, masked=True).astype(np.float32)
        red_b = src.read(red, masked=True).astype(np.float32)
        nir_b = src.read(nir, masked=True).astype(np.float32)
        blue_b = src.read(blue, masked=True).astype(np.float32)
        profile = src.profile.copy()

    num = (swir_b + red_b) - (nir_b + blue_b)
    denom = (swir_b + red_b) + (nir_b + blue_b)

    bsi = np.where(denom == 0, _NODATA, num / denom).astype(np.float32)

    combined_mask = (
        np.ma.getmaskarray(swir_b)
        | np.ma.getmaskarray(red_b)
        | np.ma.getmaskarray(nir_b)
        | np.ma.getmaskarray(blue_b)
    )
    bsi[combined_mask] = _NODATA

    path = _write_raster(bsi, profile, "_bsi.tif")
    return {"type": "raster", "path": path, "metadata": {}}


def ndsi_node(inputs: dict, config: dict) -> dict:
    raster_in = inputs.get("raster_in")
    if not raster_in:
        raise ValueError("ndsi requires 'raster_in' input")

    green_band = int(config.get("green_band", 3))
    swir_band = int(config.get("swir_band", 6))

    with rasterio.open(raster_in["path"]) as src:
        green = src.read(green_band, masked=True).astype(np.float32)
        swir = src.read(swir_band, masked=True).astype(np.float32)
        profile = src.profile.copy()

    denom = green + swir
    ndsi = np.where(denom == 0, _NODATA, (green - swir) / denom).astype(np.float32)

    combined_mask = np.ma.getmaskarray(green) | np.ma.getmaskarray(swir)
    ndsi[combined_mask] = _NODATA

    path = _write_raster(ndsi, profile, "_ndsi.tif")
    return {"type": "raster", "path": path, "metadata": {}}


def _read_bands(src, bands):
    return [src.read(b, masked=True).astype(np.float32) for b in bands]


def gndvi_node(inputs: dict, config: dict) -> dict:
    raster_in = inputs.get("raster_in")
    nir_band = int(config.get("nir_band", 5))
    green_band = int(config.get("green_band", 3))

    with rasterio.open(raster_in["path"]) as src:
        nir, green = _read_bands(src, [nir_band, green_band])
        profile = src.profile.copy()

    denom = nir + green
    out = np.where(denom == 0, _NODATA, (nir - green) / denom)
    out[np.ma.getmaskarray(nir) | np.ma.getmaskarray(green)] = _NODATA

    path = _write_raster(out.astype(np.float32), profile, "_gndvi.tif")
    return {"type": "raster", "path": path, "metadata": {}}


def rdvi_node(inputs: dict, config: dict) -> dict:
    raster_in = inputs.get("raster_in")
    nir_band = int(config.get("nir_band", 5))
    red_band = int(config.get("red_band", 4))

    with rasterio.open(raster_in["path"]) as src:
        nir, red = _read_bands(src, [nir_band, red_band])
        profile = src.profile.copy()

    denom = np.sqrt(nir + red)
    out = np.where(denom == 0, _NODATA, (nir - red) / denom)
    out[np.ma.getmaskarray(nir) | np.ma.getmaskarray(red)] = _NODATA

    path = _write_raster(out.astype(np.float32), profile, "_rdvi.tif")
    return {"type": "raster", "path": path, "metadata": {}}


def tvi_node(inputs: dict, config: dict) -> dict:
    raster_in = inputs.get("raster_in")

    with rasterio.open(raster_in["path"]) as src:
        nir, red = _read_bands(src, [5, 4])
        profile = src.profile.copy()

    ndvi = (nir - red) / (nir + red)
    out = np.sqrt(ndvi + 0.5)

    out[np.ma.getmaskarray(nir) | np.ma.getmaskarray(red)] = _NODATA
    path = _write_raster(out.astype(np.float32), profile, "_tvi.tif")
    return {"type": "raster", "path": path, "metadata": {}}


def dvi_node(inputs: dict, config: dict) -> dict:
    raster_in = inputs.get("raster_in")

    with rasterio.open(raster_in["path"]) as src:
        nir, red = _read_bands(src, [5, 4])
        profile = src.profile.copy()

    out = nir - red
    out[np.ma.getmaskarray(nir) | np.ma.getmaskarray(red)] = _NODATA

    path = _write_raster(out.astype(np.float32), profile, "_dvi.tif")
    return {"type": "raster", "path": path, "metadata": {}}


def rvi_node(inputs: dict, config: dict) -> dict:
    raster_in = inputs.get("raster_in")

    with rasterio.open(raster_in["path"]) as src:
        nir, red = _read_bands(src, [5, 4])
        profile = src.profile.copy()

    out = np.where(red == 0, _NODATA, nir / red)
    out[np.ma.getmaskarray(nir) | np.ma.getmaskarray(red)] = _NODATA

    path = _write_raster(out.astype(np.float32), profile, "_rvi.tif")
    return {"type": "raster", "path": path, "metadata": {}}


def cigreen_node(inputs: dict, config: dict) -> dict:
    raster_in = inputs.get("raster_in")

    with rasterio.open(raster_in["path"]) as src:
        nir, green = _read_bands(src, [5, 3])
        profile = src.profile.copy()

    out = np.where(green == 0, _NODATA, (nir / green) - 1)
    out[np.ma.getmaskarray(nir) | np.ma.getmaskarray(green)] = _NODATA

    path = _write_raster(out.astype(np.float32), profile, "_cigreen.tif")
    return {"type": "raster", "path": path, "metadata": {}}


def cired_node(inputs: dict, config: dict) -> dict:
    raster_in = inputs.get("raster_in")

    with rasterio.open(raster_in["path"]) as src:
        nir, red = _read_bands(src, [5, 4])
        profile = src.profile.copy()

    out = np.where(red == 0, _NODATA, (nir / red) - 1)
    out[np.ma.getmaskarray(nir) | np.ma.getmaskarray(red)] = _NODATA

    path = _write_raster(out.astype(np.float32), profile, "_cired.tif")
    return {"type": "raster", "path": path, "metadata": {}}


def ndre_node(inputs: dict, config: dict) -> dict:
    raster_in = inputs.get("raster_in")

    with rasterio.open(raster_in["path"]) as src:
        nir, swir = _read_bands(src, [5, 6])
        profile = src.profile.copy()

    denom = nir + swir
    out = np.where(denom == 0, _NODATA, (nir - swir) / denom)

    out[np.ma.getmaskarray(nir) | np.ma.getmaskarray(swir)] = _NODATA
    path = _write_raster(out.astype(np.float32), profile, "_ndre.tif")
    return {"type": "raster", "path": path, "metadata": {}}


def osavi_node(inputs: dict, config: dict) -> dict:
    raster_in = inputs.get("raster_in")

    with rasterio.open(raster_in["path"]) as src:
        nir, red = _read_bands(src, [5, 4])
        profile = src.profile.copy()

    denom = nir + red + 0.16
    out = np.where(denom == 0, _NODATA, (nir - red) / denom)

    out[np.ma.getmaskarray(nir) | np.ma.getmaskarray(red)] = _NODATA
    path = _write_raster(out.astype(np.float32), profile, "_osavi.tif")
    return {"type": "raster", "path": path, "metadata": {}}


def tsavi_node(inputs: dict, config: dict) -> dict:
    raster_in = inputs.get("raster_in")
    a = float(config.get("a", 1))
    b = float(config.get("b", 0))

    with rasterio.open(raster_in["path"]) as src:
        nir, red = _read_bands(src, [5, 4])
        profile = src.profile.copy()

    denom = red + a * nir - a * b
    out = np.where(denom == 0, _NODATA, a * (nir - a * red - b) / denom)

    out[np.ma.getmaskarray(nir) | np.ma.getmaskarray(red)] = _NODATA
    path = _write_raster(out.astype(np.float32), profile, "_tsavi.tif")
    return {"type": "raster", "path": path, "metadata": {}}


def vari_node(inputs: dict, config: dict) -> dict:
    raster_in = inputs.get("raster_in")

    with rasterio.open(raster_in["path"]) as src:
        green, red, blue = _read_bands(src, [3, 4, 2])
        profile = src.profile.copy()

    denom = green + red - blue
    out = np.where(denom == 0, _NODATA, (green - red) / denom)

    out[np.ma.getmaskarray(green) | np.ma.getmaskarray(red) | np.ma.getmaskarray(blue)] = _NODATA
    path = _write_raster(out.astype(np.float32), profile, "_vari.tif")
    return {"type": "raster", "path": path, "metadata": {}}


def avi_node(inputs: dict, config: dict) -> dict:
    raster_in = inputs.get("raster_in")

    with rasterio.open(raster_in["path"]) as src:
        nir, red = _read_bands(src, [5, 4])
        profile = src.profile.copy()

    out = np.cbrt(nir * (1 - red) * (nir - red))
    out[np.ma.getmaskarray(nir) | np.ma.getmaskarray(red)] = _NODATA

    path = _write_raster(out.astype(np.float32), profile, "_avi.tif")
    return {"type": "raster", "path": path, "metadata": {}}


def arvi_node(inputs: dict, config: dict) -> dict:
    raster_in = inputs.get("raster_in")

    with rasterio.open(raster_in["path"]) as src:
        nir, red, blue = _read_bands(src, [5, 4, 2])
        profile = src.profile.copy()

    rb = 2 * red - blue
    denom = nir + rb
    out = np.where(denom == 0, _NODATA, (nir - rb) / denom)

    out[np.ma.getmaskarray(nir) | np.ma.getmaskarray(red) | np.ma.getmaskarray(blue)] = _NODATA
    path = _write_raster(out.astype(np.float32), profile, "_arvi.tif")
    return {"type": "raster", "path": path, "metadata": {}}


def ndti_node(inputs: dict, config: dict) -> dict:
    raster_in = inputs.get("raster_in")
    with rasterio.open(raster_in["path"]) as src:
        red, green = _read_bands(src, [4, 3])
        profile = src.profile.copy()

    denom = red + green
    out = np.where(denom == 0, _NODATA, (red - green) / denom)
    out[np.ma.getmaskarray(red) | np.ma.getmaskarray(green)] = _NODATA

    path = _write_raster(out.astype(np.float32), profile, "_ndti.tif")
    return {"type": "raster", "path": path, "metadata": {}}


def wri_node(inputs: dict, config: dict) -> dict:
    raster_in = inputs.get("raster_in")
    with rasterio.open(raster_in["path"]) as src:
        g, b, nir, red = _read_bands(src, [3, 2, 5, 4])
        profile = src.profile.copy()

    denom = nir + red
    out = np.where(denom == 0, _NODATA, (g + b) / denom)

    out[np.ma.getmaskarray(g) | np.ma.getmaskarray(b) |
        np.ma.getmaskarray(nir) | np.ma.getmaskarray(red)] = _NODATA

    path = _write_raster(out.astype(np.float32), profile, "_wri.tif")
    return {"type": "raster", "path": path, "metadata": {}}


def ui_node(inputs: dict, config: dict) -> dict:
    raster_in = inputs.get("raster_in")
    with rasterio.open(raster_in["path"]) as src:
        swir2, nir = _read_bands(src, [7, 5])
        profile = src.profile.copy()

    denom = swir2 + nir
    out = np.where(denom == 0, _NODATA, (swir2 - nir) / denom)

    out[np.ma.getmaskarray(swir2) | np.ma.getmaskarray(nir)] = _NODATA
    path = _write_raster(out.astype(np.float32), profile, "_ui.tif")
    return {"type": "raster", "path": path, "metadata": {}}


def nbr2_node(inputs: dict, config: dict) -> dict:
    raster_in = inputs.get("raster_in")
    with rasterio.open(raster_in["path"]) as src:
        swir1, swir2 = _read_bands(src, [6, 7])
        profile = src.profile.copy()

    denom = swir1 + swir2
    out = np.where(denom == 0, _NODATA, (swir1 - swir2) / denom)

    out[np.ma.getmaskarray(swir1) | np.ma.getmaskarray(swir2)] = _NODATA
    path = _write_raster(out.astype(np.float32), profile, "_nbr2.tif")
    return {"type": "raster", "path": path, "metadata": {}}


def bai_node(inputs: dict, config: dict) -> dict:
    raster_in = inputs.get("raster_in")
    with rasterio.open(raster_in["path"]) as src:
        red, nir = _read_bands(src, [4, 5])
        profile = src.profile.copy()

    out = 1 / ((0.1 - red) ** 2 + (0.06 - nir) ** 2)
    out[np.ma.getmaskarray(red) | np.ma.getmaskarray(nir)] = _NODATA

    path = _write_raster(out.astype(np.float32), profile, "_bai.tif")
    return {"type": "raster", "path": path, "metadata": {}}


def csi_node(inputs: dict, config: dict) -> dict:
    raster_in = inputs.get("raster_in")
    with rasterio.open(raster_in["path"]) as src:
        swir1, swir2 = _read_bands(src, [6, 7])
        profile = src.profile.copy()

    out = np.where(swir2 == 0, _NODATA, swir1 / swir2)
    out[np.ma.getmaskarray(swir1) | np.ma.getmaskarray(swir2)] = _NODATA

    path = _write_raster(out.astype(np.float32), profile, "_csi.tif")
    return {"type": "raster", "path": path, "metadata": {}}


def s3_node(inputs: dict, config: dict) -> dict:
    raster_in = inputs.get("raster_in")
    with rasterio.open(raster_in["path"]) as src:
        g, nir, swir = _read_bands(src, [3, 5, 6])
        profile = src.profile.copy()

    denom = (g + nir) * (nir + swir)
    out = np.where(denom == 0, _NODATA, (g * (nir - swir)) / denom)

    out[np.ma.getmaskarray(g) | np.ma.getmaskarray(nir) | np.ma.getmaskarray(swir)] = _NODATA
    path = _write_raster(out.astype(np.float32), profile, "_s3.tif")
    return {"type": "raster", "path": path, "metadata": {}}


def hot_node(inputs: dict, config: dict) -> dict:
    raster_in = inputs.get("raster_in")
    with rasterio.open(raster_in["path"]) as src:
        blue, red = _read_bands(src, [2, 4])
        profile = src.profile.copy()

    out = blue - 0.5 * red - 0.08
    out[np.ma.getmaskarray(blue) | np.ma.getmaskarray(red)] = _NODATA

    path = _write_raster(out.astype(np.float32), profile, "_hot.tif")
    return {"type": "raster", "path": path, "metadata": {}}


def shadow_index_node(inputs: dict, config: dict) -> dict:
    raster_in = inputs.get("raster_in")
    with rasterio.open(raster_in["path"]) as src:
        b, g, r = _read_bands(src, [2, 3, 4])
        profile = src.profile.copy()

    out = (1 - b) * (1 - g) * (1 - r)
    out[np.ma.getmaskarray(b) | np.ma.getmaskarray(g) | np.ma.getmaskarray(r)] = _NODATA

    path = _write_raster(out.astype(np.float32), profile, "_shadow.tif")
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
