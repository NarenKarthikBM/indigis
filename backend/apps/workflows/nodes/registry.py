from .input_nodes import raster_input_node, vector_input_node
from .processing import (
    difference_node,
    ndvi_node,
    reclassify_node,
    clip_node,
    zonal_stats_node,
)
from .output_nodes import preview_output_node

NODE_REGISTRY = {
    "raster_input": raster_input_node,
    "vector_input": vector_input_node,
    "difference": difference_node,
    "ndvi": ndvi_node,
    "reclassify": reclassify_node,
    "clip": clip_node,
    "zonal_stats": zonal_stats_node,
    "preview_output": preview_output_node,
}
