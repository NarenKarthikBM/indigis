import RasterInputNode from "./RasterInputNode";
import VectorInputNode from "./VectorInputNode";
import DifferenceNode from "./DifferenceNode";
import NDVINode from "./NDVINode";
import ReclassifyNode from "./ReclassifyNode";
import ClipNode from "./ClipNode";
import ZonalStatsNode from "./ZonalStatsNode";
import PreviewOutputNode from "./PreviewOutputNode";

export const nodeTypes = {
  raster_input: RasterInputNode,
  vector_input: VectorInputNode,
  difference: DifferenceNode,
  ndvi: NDVINode,
  reclassify: ReclassifyNode,
  clip: ClipNode,
  zonal_stats: ZonalStatsNode,
  preview_output: PreviewOutputNode,
};
