import json
import os
import tempfile

from apps.layers.models import Layer, VectorLayer, VectorFeature


def _cog_url_to_backend_path(cog_url: str) -> str:
    """
    Convert a TiTiler-relative cog_url (/data/cogs/...) to the
    path accessible inside the backend container (/cogs/...).
    """
    if cog_url.startswith("/data/cogs/"):
        return "/cogs/" + cog_url[len("/data/cogs/"):]
    return cog_url


def raster_input_node(inputs: dict, config: dict) -> dict:
    layer_slug = config.get("layer_slug", "").strip()
    if not layer_slug:
        raise ValueError("raster_input requires 'layer_slug' in config")

    try:
        layer = Layer.objects.get(slug=layer_slug, layer_type="raster", is_active=True)
    except Layer.DoesNotExist:
        raise ValueError(f"Raster layer '{layer_slug}' not found")

    asset = layer.raster_assets.order_by("-created_at").first()
    if not asset:
        raise ValueError(f"No raster asset found for layer '{layer_slug}'")

    path = _cog_url_to_backend_path(asset.cog_url)
    if not os.path.exists(path):
        raise ValueError(f"COG file not found at path: {path}")

    return {
        "type": "raster",
        "path": path,
        "metadata": {
            "bbox": layer.bbox,
            "band_count": layer.band_count or 1,
            "colormap": layer.default_colormap.get("name", "viridis"),
            "min_value": layer.min_value,
            "max_value": layer.max_value,
            "selected_bands": config.get("selected_bands"),
        },
    }


def vector_input_node(inputs: dict, config: dict) -> dict:
    layer_slug = config.get("layer_slug", "").strip()
    if not layer_slug:
        raise ValueError("vector_input requires 'layer_slug' in config")

    try:
        vector_layer = VectorLayer.objects.select_related("layer").get(
            layer__slug=layer_slug
        )
    except VectorLayer.DoesNotExist:
        raise ValueError(f"Vector layer '{layer_slug}' not found")

    features = VectorFeature.objects.filter(layer=vector_layer)
    geojson = {
        "type": "FeatureCollection",
        "features": [
            {
                "type": "Feature",
                "geometry": json.loads(f.geometry.json),
                "properties": f.properties,
            }
            for f in features
        ],
    }

    tmp = tempfile.NamedTemporaryFile(
        suffix=".geojson", delete=False, mode="w", prefix="wf_vec_"
    )
    json.dump(geojson, tmp)
    tmp.close()

    return {
        "type": "vector",
        "path": tmp.name,
        "metadata": {
            "geojson": geojson,
        },
    }
