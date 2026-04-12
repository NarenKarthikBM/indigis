import {
  DndContext,
  closestCenter,
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core";
import {
  SortableContext,
  verticalListSortingStrategy,
  useSortable,
  arrayMove,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { useStore } from "../../store";
import type { Layer } from "../../types/layer.types";

const LAYER_ICONS: Record<string, string> = {
  dtm: "⛰",
  lulc: "🗺",
  "water-bodies": "💧",
  ndvi: "🌿",
  railways: "🚂",
  roadways: "🛣",
};

interface SortableRowProps {
  layer: Layer;
}

function SortableRow({ layer }: SortableRowProps) {
  const { openSettings, openInfoModal, flyToBounds } = useStore((s) => ({
    openSettings: s.openSettings,
    openInfoModal: s.openInfoModal,
    flyToBounds: s.flyToBounds,
  }));

  const { attributes, listeners, setNodeRef, transform, transition, isDragging } =
    useSortable({ id: layer.slug });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  };

  return (
    <div
      ref={setNodeRef}
      style={{
        ...style,
        display: "flex",
        alignItems: "center",
        gap: "8px",
        padding: "8px 14px",
        background: isDragging ? "rgba(139, 92, 246, 0.2)" : "rgba(139, 92, 246, 0.08)",
        borderBottom: "1px solid #1e2d40",
        userSelect: "none",
      }}
    >
      {/* Drag handle */}
      <button
        {...attributes}
        {...listeners}
        style={{
          background: "none",
          border: "none",
          color: "#3A4D62",
          cursor: "grab",
          padding: "2px",
          display: "flex",
          alignItems: "center",
          flexShrink: 0,
          touchAction: "none",
        }}
        title="Drag to reorder"
      >
        <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor">
          <circle cx="9" cy="5" r="1.5" />
          <circle cx="15" cy="5" r="1.5" />
          <circle cx="9" cy="12" r="1.5" />
          <circle cx="15" cy="12" r="1.5" />
          <circle cx="9" cy="19" r="1.5" />
          <circle cx="15" cy="19" r="1.5" />
        </svg>
      </button>

      {/* Layer icon */}
      <span style={{ fontSize: "14px", width: "20px", textAlign: "center", flexShrink: 0 }}>
        {LAYER_ICONS[layer.slug] || "◼"}
      </span>

      {/* Name */}
      <span
        style={{
          flex: 1,
          fontSize: "12px",
          color: "#E8EDF2",
          overflow: "hidden",
          textOverflow: "ellipsis",
          whiteSpace: "nowrap",
        }}
      >
        {layer.label}
      </span>

      {/* Settings */}
      <button
        onClick={() => openSettings(layer.slug)}
        style={{
          background: "none",
          border: "none",
          color: "#5A6A7A",
          cursor: "pointer",
          padding: "2px",
          display: "flex",
          alignItems: "center",
        }}
        title="Settings"
      >
        <svg width="13" height="13" viewBox="0 0 24 24" fill="currentColor">
          <path d="M12 15.5A3.5 3.5 0 018.5 12 3.5 3.5 0 0112 8.5a3.5 3.5 0 013.5 3.5 3.5 3.5 0 01-3.5 3.5m7.43-2.92c.04-.33.07-.67.07-1s-.03-.66-.07-1l2.11-1.63c.19-.15.24-.42.12-.64l-2-3.46c-.12-.22-.39-.3-.61-.22l-2.49 1c-.52-.4-1.08-.73-1.69-.98l-.38-2.65A.488.488 0 0014 2h-4c-.25 0-.46.18-.49.42l-.38 2.65c-.61.25-1.17.59-1.69.98l-2.49-1c-.23-.09-.49 0-.61.22l-2 3.46c-.13.22-.07.49.12.64L4.57 11c-.04.34-.07.67-.07 1s.03.67.07 1l-2.11 1.66c-.19.15-.25.42-.12.64l2 3.46c.12.22.39.3.61.22l2.49-1.01c.52.4 1.08.73 1.69.98l.38 2.65c.03.24.24.42.49.42h4c.25 0 .46-.18.49-.42l.38-2.65c.61-.25 1.17-.58 1.69-.98l2.49 1.01c.22.08.49 0 .61-.22l2-3.46c.12-.22.07-.49-.12-.64l-2.11-1.66z" />
        </svg>
      </button>

      {/* Info */}
      <button
        onClick={() => openInfoModal(layer.slug)}
        style={{
          background: "none",
          border: "none",
          color: "#5A6A7A",
          cursor: "pointer",
          padding: "2px",
          display: "flex",
          alignItems: "center",
        }}
        title="Info"
      >
        <svg width="13" height="13" viewBox="0 0 24 24" fill="currentColor">
          <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm1 15h-2v-6h2v6zm0-8h-2V7h2v2z" />
        </svg>
      </button>

      {/* Fly to */}
      {layer.bbox && (
        <button
          onClick={() => {
            const { minx, miny, maxx, maxy } = layer.bbox!;
            flyToBounds([[miny, minx], [maxy, maxx]]);
          }}
          style={{
            background: "none",
            border: "none",
            color: "#5A6A7A",
            cursor: "pointer",
            padding: "2px",
            display: "flex",
            alignItems: "center",
          }}
          title="Zoom to layer"
        >
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <circle cx="12" cy="12" r="10" />
            <line x1="12" y1="2" x2="12" y2="6" />
            <line x1="12" y1="18" x2="12" y2="22" />
            <line x1="2" y1="12" x2="6" y2="12" />
            <line x1="18" y1="12" x2="22" y2="12" />
          </svg>
        </button>
      )}
    </div>
  );
}

export default function ActiveLayersPanel() {
  const { availableLayers, layerConfigs, layerOrder, reorderLayers } = useStore((s) => ({
    availableLayers: s.availableLayers,
    layerConfigs: s.layerConfigs,
    layerOrder: s.layerOrder,
    reorderLayers: s.reorderLayers,
  }));

  const activeLayers = layerOrder
    .filter((slug) => layerConfigs[slug]?.visible)
    .map((slug) => availableLayers.find((l) => l.slug === slug))
    .filter((l): l is Layer => l !== undefined);

  const sensors = useSensors(useSensor(PointerSensor));

  function handleDragEnd(event: DragEndEvent) {
    const { active, over } = event;
    if (!over || active.id === over.id) return;

    const oldIndex = layerOrder.indexOf(active.id as string);
    const newIndex = layerOrder.indexOf(over.id as string);
    if (oldIndex === -1 || newIndex === -1) return;

    reorderLayers(arrayMove(layerOrder, oldIndex, newIndex));
  }

  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        height: "100%",
        background: "#1a2535",
      }}
    >
      {/* Header */}
      <div
        style={{
          padding: "12px 14px 10px",
          borderBottom: "1px solid #253244",
        }}
      >
        <div
          style={{
            fontSize: "12px",
            color: "#8B5CF6",
            letterSpacing: "0.1em",
            textTransform: "uppercase",
            fontWeight: 600,
          }}
        >
          Active Layers
        </div>
      </div>

      {/* Sortable list */}
      <div style={{ flex: 1, overflowY: "auto" }}>
        {activeLayers.length === 0 ? (
          <div
            style={{
              padding: "24px 14px",
              color: "#5A6A7A",
              fontSize: "12px",
              textAlign: "center",
            }}
          >
            No active layers
          </div>
        ) : (
          <DndContext
            sensors={sensors}
            collisionDetection={closestCenter}
            onDragEnd={handleDragEnd}
          >
            <SortableContext
              items={activeLayers.map((l) => l.slug)}
              strategy={verticalListSortingStrategy}
            >
              {activeLayers.map((layer) => (
                <SortableRow key={layer.slug} layer={layer} />
              ))}
            </SortableContext>
          </DndContext>
        )}
      </div>
    </div>
  );
}
