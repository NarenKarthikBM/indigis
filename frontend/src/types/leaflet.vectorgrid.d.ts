import * as L from "leaflet";

declare module "leaflet" {
  namespace vectorGrid {
    interface ProtobufOptions extends L.GridLayerOptions {
      vectorTileLayerStyles?: Record<string, L.PathOptions | L.PathOptions[] | ((properties: unknown, zoom: number) => L.PathOptions)>;
      interactive?: boolean;
      getFeatureId?: (feature: { properties: Record<string, unknown> }) => string | number;
      rendererFactory?: unknown;
      maxNativeZoom?: number;
      subdomains?: string;
    }

    function protobuf(url: string, options?: ProtobufOptions): L.GridLayer;
  }
}
