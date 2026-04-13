import RasterInputNode from "./RasterInputNode";
import VectorInputNode from "./VectorInputNode";
import DifferenceNode from "./DifferenceNode";
import NDVINode from "./NDVINode";
import ReclassifyNode from "./ReclassifyNode";
import ClipNode from "./ClipNode";
import ZonalStatsNode from "./ZonalStatsNode";
import PreviewOutputNode from "./PreviewOutputNode";
import GenericNode from "./GenericNode";

const GENERIC_NODE_TYPES = [
  "evi", "savi", "ndmi", "ndwi", "mndwi", "nbr", "bsi", "ndsi",
  "gndvi", "rdvi", "tvi", "dvi", "rvi",
  "cigreen", "cired", "ndre",
  "osavi", "tsavi",
  "vari", "avi", "arvi",
  "ndti", "wri", "ui", "nbr2", "bai", "csi", "s3",
  "hot", "shadow_index",
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
  preview_output: PreviewOutputNode,
  ...genericEntries,
};
