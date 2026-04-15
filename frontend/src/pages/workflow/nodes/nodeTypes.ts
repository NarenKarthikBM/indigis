import RasterInputNode from "./RasterInputNode";
import VectorInputNode from "./VectorInputNode";
import DifferenceNode from "./DifferenceNode";
import NDVINode from "./NDVINode";
import ReclassifyNode from "./ReclassifyNode";
import ClipNode from "./ClipNode";
import ZonalStatsNode from "./ZonalStatsNode";
import PreviewOutputNode from "./PreviewOutputNode";
import D8FlowAccumulationNode from "./D8FlowAccumulationNode";
import GenericNode from "./GenericNode";

const GENERIC_NODE_TYPES = [
  // Spectral indices
  "evi", "savi", "ndmi", "ndwi", "mndwi", "nbr", "bsi", "ndsi",
  "gndvi", "rdvi", "tvi", "dvi", "rvi",
  "cigreen", "cired", "ndre",
  "osavi", "tsavi",
  "vari", "avi", "arvi",
  "ndbi", "utfvi", "uhi",
  "ndti", "wri", "ui", "nbr2", "bai", "csi", "s3",
  "hot", "shadow_index",
  // Arithmetic operators
  "add", "subtract", "multiply", "divide", "power", "min", "max",
  // Unary math
  "abs", "sqrt", "log10", "ln",
  // Trig
  "sin", "cos", "tan", "asin", "acos", "atan",
  // Logical / relational
  "lt", "gt", "le", "ge", "eq", "ne", "and", "or", "if",
  // Raster calculator
  "raster_calculator",
  // AHP weighted overlay
  "ahp",
] as const;

const genericEntries = Object.fromEntries(
  GENERIC_NODE_TYPES.map((t) => [t, GenericNode])
);

export const nodeTypes = {
  raster_input: RasterInputNode,
  vector_input: VectorInputNode,
  difference: DifferenceNode,
  ndvi: NDVINode,
  reclassify: ReclassifyNode,
  clip: ClipNode,
  zonal_stats: ZonalStatsNode,
  d8_flow_accumulation: D8FlowAccumulationNode,
  preview_output: PreviewOutputNode,
  ...genericEntries,
};
