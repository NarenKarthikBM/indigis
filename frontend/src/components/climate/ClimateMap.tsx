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

const METRIC_LABELS: Record<string, string> = {
  trend_slope:   "Trend (per decade)",
  latest_value:  "Annual Value",
  corr_soi:      "SOI Correlation · Annual",
  corr_soi_djf:  "SOI Correlation · DJF",
  corr_soi_mam:  "SOI Correlation · MAM",
  corr_soi_jja:  "SOI Correlation · JJA",
  corr_soi_son:  "SOI Correlation · SON",
  corr_iod:      "IOD Correlation · Annual",
  corr_iod_djf:  "IOD Correlation · DJF",
  corr_iod_mam:  "IOD Correlation · MAM",
  corr_iod_jja:  "IOD Correlation · JJA",
  corr_iod_son:  "IOD Correlation · SON",
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
  const selectedDistrictCode = useStore((s) => s.selectedDistrictCode);
  const availableIndices = useStore((s) => s.availableIndices);
  const geoJsonRef = useRef<LeafletMap | null>(null);

  useEffect(() => {
    fetchChoropleth();
  }, [selectedIndex, selectedMetric, selectedLevel, selectedYear]);

  const values = choroData?.features
    .map((f) => f.properties.value)
    .filter((v): v is number => v !== null) ?? [];
  const minVal = values.length ? Math.min(...values) : 0;
  const maxVal = values.length ? Math.max(...values) : 1;

  const colormap =
    selectedMetric === "trend_slope" || selectedMetric.startsWith("corr_")
      ? "RdYlBu_r"
      : "YlOrRd";

  const activeIndexMeta = availableIndices.find((i) => i.name === selectedIndex);
  const units = activeIndexMeta?.units ?? "";
  const metricLabel = METRIC_LABELS[selectedMetric] ?? selectedMetric;

  const onEachFeature = (feature: GeoJSON.Feature, layer: LeafletLayer) => {
    const props = feature.properties as ChoroplethFeatureProperties;
    const valueStr = props.value !== null ? props.value.toFixed(3) : "-";
    const unitsHtml = units
      ? ` <span style="font-size:10px;font-weight:400;color:#94a3b8">${units}</span>`
      : "";

    layer.bindTooltip(
      `<div style="min-width:140px;max-width:200px;font-family:system-ui,sans-serif">
        <div style="font-weight:600;font-size:12px;color:#1e293b;margin-bottom:1px">${props.name}</div>
        ${props.state ? `<div style="font-size:11px;color:#94a3b8;margin-bottom:4px">${props.state}</div>` : ""}
        <hr style="border:none;border-top:1px solid #f1f5f9;margin:4px 0"/>
        <div style="font-size:10px;color:#64748b;margin-bottom:2px">${metricLabel}</div>
        <div style="font-family:monospace;font-size:13px;font-weight:700;color:#1e293b">
          ${valueStr}${unitsHtml}
        </div>
      </div>`,
      { sticky: true, opacity: 0.97 }
    );
    layer.on("click", () => {
      fetchDistrictProfile(props.code);
    });
  };

  return (
    <div className="relative w-full h-full">
      {/* Spinner loading overlay */}
      {choroLoading && (
        <div className="absolute inset-0 bg-slate-950/70 backdrop-blur-[1px] z-[800] flex flex-col items-center justify-center gap-3">
          <div className="w-8 h-8 rounded-full border-2 border-slate-700 border-t-blue-400 animate-spin" />
          <p className="text-xs text-slate-400">
            Loading {selectedIndex} · {selectedLevel === "district" ? "Districts" : "States"}…
          </p>
        </div>
      )}

      <MapContainer
        center={[22.5, 82.0]}
        zoom={5}
        style={{ width: "100%", height: "100%" }}
        zoomControl
      >
        <TileLayer
          url="https://{s}.basemaps.cartocdn.com/dark_nolabels/{z}/{x}/{y}{r}.png"
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
                weight: 0.4,
                color: "#1e293b",
                fillOpacity: 0.82,
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
