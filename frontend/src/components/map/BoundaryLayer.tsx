import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useMap } from "react-leaflet";
import type { PathOptions } from "leaflet";
import L from "leaflet";
import { fetchStates, fetchDistricts } from "../../api/boundaries";
import { useStore } from "../../store";

const DISTRICT_ZOOM_THRESHOLD = 6;

const STATE_STROKE = "#8B5CF6";
const DISTRICT_STROKE = "#7C3AED";

function stateStyle(): PathOptions {
  return {
    fill: true,
    fillOpacity: 0.05,
    color: STATE_STROKE,
    weight: 1.5,
    opacity: 0.9,
  };
}

function districtStyle(): PathOptions {
  return {
    fill: false,
    color: DISTRICT_STROKE,
    weight: 0.8,
    opacity: 0.7,
  };
}

export default function BoundaryLayer() {
  const map = useMap();
  const setZoomStore = useStore((s) => s.setZoom);
  const boundariesVisible = useStore((s) => s.boundariesVisible);

  const stateLayerRef = useRef<L.GeoJSON | null>(null);
  const districtLayerRef = useRef<L.GeoJSON | null>(null);
  const districtFetchedRef = useRef(false);
  const boundariesVisibleRef = useRef(boundariesVisible);
  const [loadingStates, setLoadingStates] = useState(false);

  useEffect(() => { boundariesVisibleRef.current = boundariesVisible; }, [boundariesVisible]);

  // Fetch and render state boundaries once on mount
  useEffect(() => {
    setLoadingStates(true);
    fetchStates()
      .then((data) => {
        const layer = L.geoJSON(data, {
          style: stateStyle,
          onEachFeature(feature, l) {
            const path = l as L.Path;
            const props = feature.properties as { name: string };

            path.on({
              mouseover() {
                path.setStyle({ weight: 2.5 });
                path.bringToFront();
              },
              mouseout() {
                path.setStyle(stateStyle());
              },
            });

            path.bindTooltip(props.name, {
              sticky: true,
              className: "leaflet-tooltip-dark",
              direction: "auto",
            });
          },
        });

        stateLayerRef.current = layer;
        if (boundariesVisibleRef.current) layer.addTo(map);
      })
      .catch(console.error)
      .finally(() => setLoadingStates(false));

    return () => {
      stateLayerRef.current?.remove();
      stateLayerRef.current = null;
      districtLayerRef.current?.remove();
      districtLayerRef.current = null;
      districtFetchedRef.current = false;
    };
  }, [map]);

  // Auto-load districts at zoom >= threshold
  useEffect(() => {
    function handleZoom() {
      const zoom = map.getZoom();
      setZoomStore(zoom);

      if (!boundariesVisibleRef.current) return;

      if (zoom >= DISTRICT_ZOOM_THRESHOLD) {
        if (districtFetchedRef.current) {
          districtLayerRef.current?.addTo(map);
        } else {
          districtFetchedRef.current = true;
          fetchDistricts().then((data) => {
            const dl = L.geoJSON(data, {
              style: districtStyle,
              onEachFeature(feature, l) {
                const props = feature.properties as { district?: string; name?: string };
                (l as L.Path).bindTooltip(props.district ?? props.name ?? "", {
                  sticky: true,
                  className: "leaflet-tooltip-dark",
                  direction: "auto",
                });
              },
            });
            districtLayerRef.current = dl;
            if (boundariesVisibleRef.current && map.getZoom() >= DISTRICT_ZOOM_THRESHOLD) {
              dl.addTo(map);
            }
          }).catch(console.error);
        }
      } else {
        districtLayerRef.current?.remove();
      }
    }

    map.on("zoomend", handleZoom);
    return () => { map.off("zoomend", handleZoom); };
  }, [map, setZoomStore]);

  // Show/hide all boundary layers on toggle
  useEffect(() => {
    if (!stateLayerRef.current) return;
    if (boundariesVisible) {
      stateLayerRef.current.addTo(map);
      if (map.getZoom() >= DISTRICT_ZOOM_THRESHOLD) {
        districtLayerRef.current?.addTo(map);
      }
    } else {
      stateLayerRef.current.remove();
      districtLayerRef.current?.remove();
    }
  }, [boundariesVisible, map]);

  return loadingStates
    ? createPortal(
        <div
          style={{
            position: "absolute",
            bottom: "64px",
            left: "16px",
            zIndex: 1000,
            display: "flex",
            alignItems: "center",
            gap: "8px",
            background: "rgba(21, 29, 43, 0.92)",
            border: "1px solid #3A4D62",
            borderRadius: "8px",
            padding: "7px 12px",
            backdropFilter: "blur(4px)",
            pointerEvents: "none",
          }}
        >
          <svg width="14" height="14" viewBox="0 0 14 14" style={{ animation: "spin 1s linear infinite", flexShrink: 0 }}>
            <style>{`@keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }`}</style>
            <circle cx="7" cy="7" r="5.5" fill="none" stroke="#3A4D62" strokeWidth="2" />
            <path d="M7 1.5 A5.5 5.5 0 0 1 12.5 7" fill="none" stroke="#A78BFA" strokeWidth="2" strokeLinecap="round" />
          </svg>
          <span style={{ fontSize: "11px", color: "#A78BFA", fontWeight: 500 }}>
            Loading boundaries…
          </span>
        </div>,
        map.getContainer()
      )
    : null;
}
