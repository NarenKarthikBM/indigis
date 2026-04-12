import type { ActiveRegion } from "../types/boundary.types";

export interface BasemapLayer {
  name: string;
  url: string;
  attribution: string;
  subdomains: string | null;
}

export interface MapState {
  center: [number, number];
  zoom: number;
  activeRegion: ActiveRegion | null;
  basemap: BasemapLayer;
  flyToBoundsTarget: [[number, number], [number, number]] | null;
  setCenter: (center: [number, number]) => void;
  setZoom: (zoom: number) => void;
  setActiveRegion: (region: ActiveRegion | null) => void;
  setBasemap: (basemap: BasemapLayer) => void;
  flyToBounds: (bounds: [[number, number], [number, number]]) => void;
  clearFlyToBounds: () => void;
}

export const BASEMAPS: BasemapLayer[] = [
  {
    name: "CartoDB Light",
    url: "https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png",
    attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors &copy; <a href="https://carto.com/attributions">CARTO</a>',
    subdomains: "abcd"
  },
  {
    name: "CartoDB Dark",
    url: "https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png",
    attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors &copy; <a href="https://carto.com/attributions">CARTO</a>',
    subdomains: "abcd"
  },
  {
    name: "OpenStreetMap",
    url: "https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png",
    attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
    subdomains: "abc"
  },
  {
    name: "Esri World Imagery",
    url: "https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}",
    attribution: '&copy; Esri',
    subdomains: null
  }
];


export const createMapSlice = (set: (fn: (state: MapState) => Partial<MapState>) => void): MapState => ({
  center: [20.5937, 78.9629],
  zoom: 5,
  activeRegion: null,
  basemap: BASEMAPS[2],
  flyToBoundsTarget: null,
  setCenter: (center) => set(() => ({ center })),
  setZoom: (zoom) => set(() => ({ zoom })),
  setActiveRegion: (activeRegion) => set(() => ({ activeRegion })),
  setBasemap: (basemap) => set(() => ({ basemap })),
  flyToBounds: (bounds) => set(() => ({ flyToBoundsTarget: bounds })),
  clearFlyToBounds: () => set(() => ({ flyToBoundsTarget: null })),
});
