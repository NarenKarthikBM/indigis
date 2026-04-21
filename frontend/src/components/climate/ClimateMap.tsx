import { useEffect, useRef } from "react";
import { MapContainer, TileLayer, GeoJSON, useMap } from "react-leaflet";
import type { Map as LeafletMap, Layer as LeafletLayer } from "leaflet";
import { interpolateRdYlBu, interpolateYlOrRd, interpolateBlues } from "d3-scale-chromatic";
import { useStore } from "../../store";
import type { ChoroplethFeatureProperties } from "../../types/climate.types";

import "leaflet/dist/leaflet.css";

const COLORMAPS: Record<string, (t: number) => string> = {
  RdYlBu_r: (t) => interpolateRdYlBu(1 - t),
  YlOrRd: interpolateYlOrRd,
  Blues: interpolateBlues,
  default: interpolateYlOrRd,
};

function getColor(
  value: number | null,
  min: number,
  max: number,
  colormap: string
): string {
  if (value === null || value === undefined) return "#e5e7eb";
  const t = max === min ? 0.5 : (value - min) / (max - min);
  const clampedT = Math.max(0, Math.min(1, t));
  const fn = COLORMAPS[colormap] ?? COLORMAPS.default;
  return fn(clampedT);
}

function MapBounds({ data }: { data: unknown }) {
  const map = useMap();
  useEffect(() => {
    if (data) {
      map.setView([22.5, 82.0], 5);
    }
  }, [data]);
  return null;
}

export default function ClimateMap() {
  const choroData = useStore((s) => s.choroData);
  const choroLoading = useStore((s) => s.choroLoading);
  const fetchChoropleth = useStore((s) => s.fetchChoropleth);
  const fetchDistrictProfile = useStore((s) => s.fetchDistrictProfile);
  const selectedIndex = useStore((s) => s.selectedIndex);
  const selectedMetric = useStore((s) => s.selectedMetric);
  const selectedLevel = useStore((s) => s.selectedLevel);
  const selectedYear = useStore((s) => s.selectedYear);
  const geoJsonRef = useRef<LeafletMap | null>(null);

  useEffect(() => {
    fetchChoropleth();
  }, [selectedIndex, selectedMetric, selectedLevel, selectedYear]);

  // Compute value range for color scale
  const values = choroData?.features
    .map((f) => f.properties.value)
    .filter((v): v is number => v !== null) ?? [];
  const minVal = values.length ? Math.min(...values) : 0;
  const maxVal = values.length ? Math.max(...values) : 1;

  const colormap =
    selectedMetric === "trend_slope" || selectedMetric.startsWith("corr_")
      ? "RdYlBu_r"
      : "YlOrRd";

  const onEachFeature = (feature: GeoJSON.Feature, layer: LeafletLayer) => {
    const props = feature.properties as ChoroplethFeatureProperties;
    layer.bindTooltip(
      `<b>${props.name}</b>${props.state ? ` - ${props.state}` : ""}<br/>` +
        `Value: ${props.value !== null ? props.value.toFixed(3) : "-"}`
    );
    layer.on("click", () => {
      fetchDistrictProfile(props.code);
    });
  };

  return (
    <div className="relative w-full h-full">
      {choroLoading && (
        <div className="absolute inset-0 bg-white/50 z-[800] flex items-center justify-center">
          <span className="text-gray-500 text-sm animate-pulse">Loading...</span>
        </div>
      )}

      <MapContainer
        center={[22.5, 82.0]}
        zoom={5}
        style={{ width: "100%", height: "100%" }}
        zoomControl
      >
        <TileLayer
          url="https://{s}.basemaps.cartocdn.com/light_nolabels/{z}/{x}/{y}{r}.png"
          attribution="© OpenStreetMap © CARTO"
        />

        {choroData && choroData.features.length > 0 && (
          <GeoJSON
            key={`${selectedIndex}-${selectedMetric}-${selectedLevel}`}
            data={choroData as unknown as GeoJSON.FeatureCollection}
            style={(feature) => {
              const v = (feature?.properties as ChoroplethFeatureProperties)?.value ?? null;
              return {
                fillColor: getColor(v, minVal, maxVal, colormap),
                weight: 0.5,
                color: "#999",
                fillOpacity: 0.75,
              };
            }}
            onEachFeature={onEachFeature}
          />
        )}

        <MapBounds data={choroData} />
      </MapContainer>

    </div>
  );
}
