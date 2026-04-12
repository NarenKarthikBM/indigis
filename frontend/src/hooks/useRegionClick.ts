import { useCallback } from "react";
import { useStore } from "../store";
import type { ActiveRegion } from "../types/boundary.types";
import type { LeafletMouseEvent } from "leaflet";

export function useRegionClick() {
  const setActiveRegion = useStore((s) => s.setActiveRegion);

  const handleStateClick = useCallback(
    (e: LeafletMouseEvent, props: { name: string; code: string; area_km2: number | null }) => {
      setActiveRegion({
        type: "state",
        name: props.name,
        code: props.code,
        area_km2: props.area_km2,
        latlng: e.latlng,
      });
    },
    [setActiveRegion]
  );

  const handleDistrictClick = useCallback(
    (
      e: LeafletMouseEvent,
      props: {
        name: string;
        code: string;
        area_km2: number | null;
        state_name: string;
      }
    ) => {
      setActiveRegion({
        type: "district",
        name: props.name,
        code: props.code,
        area_km2: props.area_km2,
        state_name: props.state_name,
        latlng: e.latlng,
      });
    },
    [setActiveRegion]
  );

  return { handleStateClick, handleDistrictClick };
}
