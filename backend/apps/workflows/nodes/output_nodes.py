import os
import uuid

import numpy as np
import rasterio

from django.conf import settings
from apps.layers.services import convert_to_cog, extract_raster_metadata
from apps.layers.views import build_titiler_url


def preview_output_node(inputs: dict, config: dict) -> dict:
    data_input = inputs.get("input")
    if not data_input:
        raise ValueError("preview_output requires an 'input' connection")

    if data_input["type"] == "raster":
        return _handle_raster_output(data_input)
    elif data_input["type"] == "vector":
        return _handle_vector_output(data_input)
    else:
        raise ValueError(f"preview_output: unsupported input type '{data_input['type']}'")


def _handle_raster_output(data_input: dict) -> dict:
    src_path = data_input["path"]

    # Build output path in workflow_results subdirectory
    result_id = uuid.uuid4().hex
    cog_dir = os.path.join(getattr(settings, "COG_STORAGE_PATH", "/cogs"), "workflow_results")
    os.makedirs(cog_dir, exist_ok=True)
    cog_path = os.path.join(cog_dir, f"{result_id}.tif")

    # Convert to COG
    convert_to_cog(src_path, cog_path)

    # Extract metadata for response
    try:
        meta = extract_raster_metadata(cog_path)
    except Exception:
        meta = data_input.get("metadata", {})

    # Build TiTiler URL using the /data/cogs path (TiTiler container perspective)
    titiler_cog_url = f"/data/cogs/workflow_results/{result_id}.tif"

    # Determine rescale from metadata
    min_val = meta.get("min_value")
    max_val = meta.get("max_value")
    rescale = f"{min_val},{max_val}" if min_val is not None and max_val is not None else None

    tile_url = build_titiler_url(
        cog_url=titiler_cog_url,
        colormap="rdylgn",
        rescale=rescale,
        band_count=1,
    )

    bbox = meta.get("bbox") or data_input.get("metadata", {}).get("bbox")

    return {
        "type": "raster",
        "path": cog_path,
        "result_type": "raster",
        "tile_url": tile_url,
        "bbox": bbox,
        "min_value": min_val,
        "max_value": max_val,
    }


def _handle_vector_output(data_input: dict) -> dict:
    import json

    geojson = data_input.get("metadata", {}).get("geojson")
    if not geojson and data_input.get("path"):
        with open(data_input["path"]) as f:
            geojson = json.load(f)

    # Compute bbox from features
    bbox = None
    if geojson:
        bbox = _compute_geojson_bbox(geojson)

    return {
        "type": "vector",
        "path": data_input.get("path", ""),
        "result_type": "vector",
        "geojson": geojson,
        "bbox": bbox,
    }


def _compute_geojson_bbox(geojson: dict) -> list | None:
    """Return [minx, miny, maxx, maxy] from a FeatureCollection."""
    all_coords = []
    for feat in geojson.get("features", []):
        geom = feat.get("geometry", {})
        _collect_coords(geom, all_coords)

    if not all_coords:
        return None

    xs = [c[0] for c in all_coords]
    ys = [c[1] for c in all_coords]
    return [min(xs), min(ys), max(xs), max(ys)]


def _collect_coords(geom: dict, out: list):
    gtype = geom.get("type", "")
    coords = geom.get("coordinates", [])
    if gtype == "Point":
        out.append(coords)
    elif gtype in ("MultiPoint", "LineString"):
        out.extend(coords)
    elif gtype in ("MultiLineString", "Polygon"):
        for ring in coords:
            out.extend(ring)
    elif gtype == "MultiPolygon":
        for poly in coords:
            for ring in poly:
                out.extend(ring)
    elif gtype == "GeometryCollection":
        for g in geom.get("geometries", []):
            _collect_coords(g, out)
