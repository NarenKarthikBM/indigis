import { useEffect, useRef } from "react";
import { MapContainer, TileLayer, GeoJSON, useMap } from "react-leaflet";
import type { Layer as LeafletLayer } from "leaflet";
import { interpolateRdYlBu, interpolateYlOrRd, interpolateBlues } from "d3-scale-chromatic";
import { useStore } from "../../store";
import type { BoundaryFeatureProperties, ValuesMap } from "../../types/climate.types";
import { CATEGORY } from "./IndexSelector";

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
  const boundaryData = useStore((s) => s.boundaryData);
  const activeValues = useStore((s) => s.activeValues);
  const choroLoading = useStore((s) => s.choroLoading);
  const fetchChoropleth = useStore((s) => s.fetchChoropleth);
  const fetchDistrictProfile = useStore((s) => s.fetchDistrictProfile);
  const selectedIndex = useStore((s) => s.selectedIndex);
  const selectedMetric = useStore((s) => s.selectedMetric);
  const selectedLevel = useStore((s) => s.selectedLevel);
  const selectedYear = useStore((s) => s.selectedYear);
  const availableIndices = useStore((s) => s.availableIndices);

  // Refs so Leaflet event handlers (set up once at mount) always read fresh values
  const activeValuesRef = useRef<ValuesMap | null>(null);
  const metricLabelRef = useRef<string>("");
  const unitsRef = useRef<string>("");

  useEffect(() => {
    fetchChoropleth();
  }, [selectedIndex, selectedMetric, selectedLevel, selectedYear]);

  const indexCategory = CATEGORY[selectedIndex];
  const colormap =
    selectedMetric === "trend_slope" || selectedMetric.startsWith("corr_")
      ? "RdYlBu_r"
      : (indexCategory === "wet" || indexCategory === "dry")
      ? "Blues"
      : "YlOrRd";

  const activeIndexMeta = availableIndices.find((i) => i.name === selectedIndex);
  const units = activeIndexMeta?.units ?? "";
  const metricLabel = METRIC_LABELS[selectedMetric] ?? selectedMetric;

  // Keep refs in sync with latest render values
  useEffect(() => { activeValuesRef.current = activeValues; }, [activeValues]);
  useEffect(() => {
    metricLabelRef.current = metricLabel;
    unitsRef.current = units;
  }, [metricLabel, units]);

  // Compute min/max from activeValues for initial style function
  const vals = activeValues ? Object.values(activeValues).filter((v): v is number => v !== null) : [];
  const minVal = vals.length ? Math.min(...vals) : 0;
  const maxVal = vals.length ? Math.max(...vals) : 1;

  // onEachFeature is only called at mount (react-leaflet limitation).
  // Tooltip content is updated lazily on mouseover via refs — no stale closures.
  const onEachFeature = (feature: GeoJSON.Feature, layer: LeafletLayer) => {
    const props = feature.properties as BoundaryFeatureProperties;

    layer.bindTooltip("", { sticky: true, opacity: 0.97 });

    (layer as any).on("mouseover", () => {
      const value = activeValuesRef.current?.[props.code] ?? null;
      const label = metricLabelRef.current;
      const unit = unitsRef.current;
      const valueStr = value !== null ? value.toFixed(3) : "—";
      const unitsHtml = unit
        ? ` <span style="font-size:10px;font-weight:400;color:#94a3b8">${unit}</span>`
        : "";
      layer.setTooltipContent(
        `<div style="min-width:140px;max-width:200px;font-family:system-ui,sans-serif">
          <div style="font-weight:600;font-size:12px;color:#1e293b;margin-bottom:1px">${props.name}</div>
          ${props.state ? `<div style="font-size:11px;color:#94a3b8;margin-bottom:4px">${props.state}</div>` : ""}
          <hr style="border:none;border-top:1px solid #f1f5f9;margin:4px 0"/>
          <div style="font-size:10px;color:#64748b;margin-bottom:2px">${label}</div>
          <div style="font-family:monospace;font-size:13px;font-weight:700;color:#1e293b">
            ${valueStr}${unitsHtml}
          </div>
        </div>`
      );
    });

    (layer as any).on("click", () => {
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

        {boundaryData && boundaryData.features.length > 0 && (
          <GeoJSON
            key={selectedLevel}
            data={boundaryData as unknown as GeoJSON.FeatureCollection}
            style={(feature) => {
              const code = (feature?.properties as BoundaryFeatureProperties)?.code;
              const v = code != null ? (activeValues?.[code] ?? null) : null;
              return {
                fillColor: getColor(v, minVal, maxVal, colormap),
                weight: 1.2,
                color: getColor(v, minVal, maxVal, colormap),
                opacity: 1,
                fillOpacity: 0.82,
              };
            }}
            onEachFeature={onEachFeature}
          />
        )}

        <MapBounds data={boundaryData} />
      </MapContainer>

    </div>
  );
}
