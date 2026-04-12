import { useState, useEffect, useRef, useCallback } from "react";
import { useStore } from "../../store";
import { searchRegions } from "../../api/boundaries";

interface SearchResult {
  id: number;
  name: string;
  code: string;
  type: "state" | "district";
  state_name?: string;
  area_km2?: number | null;
}

function debounce<T extends (...args: Parameters<T>) => void>(fn: T, delay: number) {
  let timer: ReturnType<typeof setTimeout>;
  return (...args: Parameters<T>) => {
    clearTimeout(timer);
    timer = setTimeout(() => fn(...args), delay);
  };
}

export default function SearchBox() {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<SearchResult[]>([]);
  const [open, setOpen] = useState(false);
  const setActiveRegion = useStore((s) => s.setActiveRegion);
  const inputRef = useRef<HTMLInputElement>(null);

  const doSearch = useCallback(
    debounce(async (q: string) => {
      if (q.length < 2) {
        setResults([]);
        return;
      }
      try {
        const data = await searchRegions(q);
        const combined: SearchResult[] = [
          ...(data.states as SearchResult[]).map((s: SearchResult) => ({ ...s, type: "state" as const })),
          ...(data.districts as SearchResult[]).map((d: SearchResult) => ({ ...d, type: "district" as const })),
        ];
        setResults(combined);
        setOpen(combined.length > 0);
      } catch (err) {
        console.error(err);
      }
    }, 300),
    []
  );

  useEffect(() => {
    doSearch(query);
  }, [query, doSearch]);

  function handleSelect(result: SearchResult) {
    setActiveRegion({
      type: result.type,
      name: result.name,
      code: result.code,
      area_km2: result.area_km2 ?? null,
      state_name: result.state_name,
      latlng: { lat: 0, lng: 0 },
    });
    setQuery(result.name);
    setOpen(false);
  }

  return (
    <div style={{ position: "relative" }}>
      <input
        ref={inputRef}
        type="text"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        onFocus={() => results.length > 0 && setOpen(true)}
        onBlur={() => setTimeout(() => setOpen(false), 150)}
        placeholder="Search states, districts..."
        style={{
          width: "100%",
          background: "#1A2535",
          border: "1px solid #3A4D62",
          borderRadius: "6px",
          color: "#E8EDF2",
          padding: "6px 10px",
          fontSize: "13px",
          outline: "none",
        }}
      />
      {open && results.length > 0 && (
        <div
          style={{
            position: "absolute",
            top: "100%",
            left: 0,
            right: 0,
            background: "#151D2B",
            border: "1px solid #3A4D62",
            borderRadius: "6px",
            marginTop: "4px",
            zIndex: 9999,
            maxHeight: "240px",
            overflowY: "auto",
          }}
        >
          {results.map((r) => (
            <button
              key={`${r.type}-${r.id}`}
              onClick={() => handleSelect(r)}
              style={{
                width: "100%",
                display: "flex",
                alignItems: "center",
                gap: "8px",
                padding: "8px 12px",
                background: "none",
                border: "none",
                color: "#E8EDF2",
                cursor: "pointer",
                textAlign: "left",
                fontSize: "13px",
              }}
              onMouseEnter={(e) =>
                ((e.currentTarget as HTMLButtonElement).style.background = "#1A2535")
              }
              onMouseLeave={(e) =>
                ((e.currentTarget as HTMLButtonElement).style.background = "none")
              }
            >
              <span
                style={{
                  fontSize: "10px",
                  padding: "2px 5px",
                  borderRadius: "3px",
                  background: r.type === "state" ? "#8B5CF6" : "#1D2B3E",
                  color: "#E8EDF2",
                  flexShrink: 0,
                  textTransform: "uppercase",
                  letterSpacing: "0.05em",
                }}
              >
                {r.type}
              </span>
              <span>{r.name}</span>
              {r.state_name && (
                <span style={{ color: "#5A6A7A", fontSize: "11px", marginLeft: "auto" }}>
                  {r.state_name}
                </span>
              )}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
