// Node catalog is now fetched from the backend via /workflows/node-catalog/
// and stored in the Zustand store (nodeCatalog / catalogMap).
// This file is kept for legacy import compatibility — prefer reading from the store.

export type { NodePaletteItem } from "../../../types/workflow.types";
