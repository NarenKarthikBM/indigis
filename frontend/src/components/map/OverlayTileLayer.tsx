import { TileLayer } from "react-leaflet";
import { useStore } from "../../store";
import VectorTileLayer from "./VectorTileLayer";

export default function OverlayTileLayer() {
  const layerConfigs = useStore((s) => s.layerConfigs);
  const availableLayers = useStore((s) => s.availableLayers);
  const layerOrder = useStore((s) => s.layerOrder);

  return (
    <>
      {layerOrder.map((slug) => {
        const config = layerConfigs[slug];
        if (!config?.visible) return null;

        const layer = availableLayers.find((l) => l.slug === slug);
        if (!layer) return null;

        if (layer.layer_type === "vector" && layer.vector_layer) {
          return (
            <VectorTileLayer
              key={slug}
              slug={slug}
              opacity={config.opacity}
              vectorLayerInfo={layer.vector_layer}
            />
          );
        }

        if (layer.layer_type === "raster") {
          if (config.multiBandMode && config.bandConfigs) {
            const visibleBands = config.bandConfigs.filter((bc) => bc.visible && bc.tileUrl);
            if (visibleBands.length === 0) return null;
            return visibleBands.map((bc) => (
              <TileLayer
                key={`${slug}-band-${bc.bandIndex}`}
                url={bc.tileUrl!}
                opacity={bc.opacity}
                attribution={layer.data_source || ""}
              />
            ));
          }

          if (config.tileUrl) {
            return (
              <TileLayer
                key={slug}
                url={config.tileUrl}
                opacity={config.opacity}
                attribution={layer.data_source || ""}
              />
            );
          }
        }

        return null;
      })}
    </>
  );
}
