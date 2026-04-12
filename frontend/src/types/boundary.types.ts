export interface StateProperties {
  id: number;
  name: string;
  code: string;
  area_km2: number | null;
}

export interface DistrictProperties {
  id: number;
  name: string;
  code: string;
  state_name: string;
  state_code: string;
  area_km2: number | null;
}

export interface ActiveRegion {
  type: "state" | "district";
  name: string;
  code: string;
  area_km2: number | null;
  state_name?: string;
  latlng: { lat: number; lng: number };
}
