import { useEffect } from "react";
import { useMap, useMapEvents } from "react-leaflet";
import { useStore } from "../../store";

export default function MapController() {
  const map = useMap();
  const { center, zoom, setCenter, setZoom, flyToBoundsTarget, clearFlyToBounds } = useStore((s) => ({
    center: s.center,
    zoom: s.zoom,
    setCenter: s.setCenter,
    setZoom: s.setZoom,
    flyToBoundsTarget: s.flyToBoundsTarget,
    clearFlyToBounds: s.clearFlyToBounds,
  }));

  useMapEvents({
    moveend() {
      const c = map.getCenter();
      setCenter([c.lat, c.lng]);
    },
    zoomend() {
      setZoom(map.getZoom());
    },
  });

  useEffect(() => {
    if (flyToBoundsTarget) {
      map.flyToBounds(flyToBoundsTarget, { padding: [40, 40], maxZoom: 16 });
      clearFlyToBounds();
    }
  }, [flyToBoundsTarget]);

  return null;
}
