import { useEffect, useRef } from "react";
import { useMap } from "react-leaflet";
import L from "leaflet";
import "leaflet.vectorgrid";
import type { VectorLayerInfo } from "../../types/layer.types";

interface Props {
  slug: string;
  opacity: number;
  vectorLayerInfo: VectorLayerInfo;
}

const DEFAULT_STYLES: Record<string, L.PathOptions> = {
  LineString: { color: "#FBBF24", weight: 1.5, opacity: 0.9 },
  MultiLineString: { color: "#FBBF24", weight: 1.5, opacity: 0.9 },
  Polygon: { color: "#8B5CF6", weight: 1, fillColor: "#A78BFA", fillOpacity: 0.2 },
  MultiPolygon: { color: "#8B5CF6", weight: 1, fillColor: "#A78BFA", fillOpacity: 0.2 },
  Point: { radius: 4, color: "#F87171", fillColor: "#F87171", fillOpacity: 0.8 },
  MultiPoint: { radius: 4, color: "#F87171", fillColor: "#F87171", fillOpacity: 0.8 },
};

export default function VectorTileLayer({ slug, opacity, vectorLayerInfo }: Props) {
  const map = useMap();
  const layerRef = useRef<L.GridLayer | null>(null);

  useEffect(() => {
    const tileUrl = `/api/v1/vectors/${slug}/tiles/{z}/{x}/{y}.pbf`;

    const userStyle = vectorLayerInfo.default_style as L.PathOptions;
    const baseStyle = Object.keys(userStyle).length > 0
      ? userStyle
      : DEFAULT_STYLES[vectorLayerInfo.geometry_type] || DEFAULT_STYLES.LineString;

    const style = { ...baseStyle, opacity };

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const vg = (L as any).vectorGrid.protobuf(tileUrl, {
      vectorTileLayerStyles: {
        [slug]: style,
      },
      minZoom: vectorLayerInfo.min_zoom,
      maxZoom: vectorLayerInfo.max_zoom,
      interactive: false,
    });

    vg.addTo(map);
    layerRef.current = vg;

    return () => {
      if (layerRef.current) {
        map.removeLayer(layerRef.current);
        layerRef.current = null;
      }
    };
  }, [map, slug, opacity, vectorLayerInfo]);

  return null;
}
