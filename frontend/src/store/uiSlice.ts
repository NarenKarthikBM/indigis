export type NavSection = "core-overlays" | "community-overlays" | "active-layers" | "about";

export interface UIState {
  sidebarOpen: boolean;
  activeNavSection: NavSection | null;
  settingsPanelLayer: string | null;
  infoModalLayer: string | null;
  boundariesVisible: boolean;
  setSidebarOpen: (open: boolean) => void;
  setActiveNavSection: (section: NavSection | null) => void;
  openSettings: (slug: string) => void;
  closeSettings: () => void;
  openInfoModal: (slug: string) => void;
  closeInfoModal: () => void;
  toggleBoundaries: () => void;
}

export const createUISlice = (set: (fn: (state: UIState) => Partial<UIState>) => void): UIState => ({
  sidebarOpen: true,
  activeNavSection: "core-overlays",
  settingsPanelLayer: null,
  infoModalLayer: null,
  boundariesVisible: true,
  setSidebarOpen: (sidebarOpen) => set(() => ({ sidebarOpen })),
  setActiveNavSection: (section) =>
    set(() => ({
      activeNavSection: section,
      sidebarOpen: section !== null,
    })),
  openSettings: (slug) => set(() => ({ settingsPanelLayer: slug })),
  closeSettings: () => set(() => ({ settingsPanelLayer: null })),
  openInfoModal: (slug) => set(() => ({ infoModalLayer: slug })),
  closeInfoModal: () => set(() => ({ infoModalLayer: null })),
  toggleBoundaries: () => set((s) => ({ boundariesVisible: !s.boundariesVisible })),
});
