import type { NodePaletteItem } from "../../../types/workflow.types";

export const NODE_CATALOG: NodePaletteItem[] = [
  {
    type: "raster_input",
    label: "Raster Input",
    category: "input",
    description: "Load a raster layer by slug",
    inputs: [],
    outputs: [{ handle: "raster_out", dataType: "raster" }],
  },
  {
    type: "vector_input",
    label: "Vector Input",
    category: "input",
    description: "Load a vector layer by slug",
    inputs: [],
    outputs: [{ handle: "vector_out", dataType: "vector" }],
  },
  {
    type: "difference",
    label: "Difference",
    category: "processing",
    description: "Subtract raster B from raster A",
    inputs: [
      { handle: "raster_a", dataType: "raster", label: "A" },
      { handle: "raster_b", dataType: "raster", label: "B" },
    ],
    outputs: [{ handle: "raster_out", dataType: "raster" }],
  },
  {
    type: "ndvi",
    label: "NDVI",
    category: "processing",
    description: "Compute (NIR-Red)/(NIR+Red)",
    inputs: [{ handle: "raster_in", dataType: "raster" }],
    outputs: [{ handle: "raster_out", dataType: "raster" }],
  },
  {
    type: "reclassify",
    label: "Reclassify",
    category: "processing",
    description: "Reclassify raster values by range rules",
    inputs: [{ handle: "raster_in", dataType: "raster" }],
    outputs: [{ handle: "raster_out", dataType: "raster" }],
  },
  {
    type: "clip",
    label: "Clip",
    category: "processing",
    description: "Clip raster to vector mask",
    inputs: [
      { handle: "raster_in", dataType: "raster" },
      { handle: "vector_in", dataType: "vector" },
    ],
    outputs: [{ handle: "raster_out", dataType: "raster" }],
  },
  {
    type: "zonal_stats",
    label: "Zonal Stats",
    category: "processing",
    description: "Compute per-feature raster statistics",
    inputs: [
      { handle: "raster_in", dataType: "raster" },
      { handle: "vector_in", dataType: "vector" },
    ],
    outputs: [{ handle: "vector_out", dataType: "vector" }],
  },
  {
    type: "preview_output",
    label: "Preview Output",
    category: "output",
    description: "Preview result on map",
    inputs: [{ handle: "input", dataType: "any" }],
    outputs: [],
  },
];

export const CATALOG_MAP = Object.fromEntries(
  NODE_CATALOG.map((item) => [item.type, item])
) as Record<string, NodePaletteItem>;
