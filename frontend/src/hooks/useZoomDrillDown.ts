import { useEffect, useState } from "react";
import { useMapEvents } from "react-leaflet";
import { fetchDistricts } from "../api/boundaries";

const DISTRICT_ZOOM_THRESHOLD = 7;

export function useZoomDrillDown(activeStateCode: string | null) {
  const [districtData, setDistrictData] = useState<GeoJSON.FeatureCollection | null>(null);
  const [currentZoom, setCurrentZoom] = useState(5);

  const map = useMapEvents({
    zoomend() {
      setCurrentZoom(map.getZoom());
    },
  });

  useEffect(() => {
    if (currentZoom >= DISTRICT_ZOOM_THRESHOLD && activeStateCode) {
      fetchDistricts(activeStateCode)
        .then(setDistrictData)
        .catch(console.error);
    } else if (currentZoom < DISTRICT_ZOOM_THRESHOLD) {
      setDistrictData(null);
    }
  }, [currentZoom, activeStateCode]);

  return { districtData, currentZoom, showDistricts: currentZoom >= DISTRICT_ZOOM_THRESHOLD };
}
