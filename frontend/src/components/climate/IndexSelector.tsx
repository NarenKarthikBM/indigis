import { useStore } from "../../store";
import type { ETCCDIIndexName } from "../../types/climate.types";

const TIER1_TEMP: ETCCDIIndexName[] = ["TXx", "TNn", "TNx", "TXn"];
const TIER2_TEMP: ETCCDIIndexName[] = ["TX90p", "TN10p", "WSDI", "CSDI"];
const TIER1_PRECIP: ETCCDIIndexName[] = ["SDII", "RX1day", "RX5day", "R10mm", "R20mm", "CWD", "CDD"];
const TIER2_PRECIP: ETCCDIIndexName[] = ["R95p", "R99p"];

const FULL_NAMES: Record<ETCCDIIndexName, string> = {
  TXx:    "Max of Daily Max Temp",
  TNn:    "Min of Daily Min Temp",
  TNx:    "Max of Daily Min Temp",
  TXn:    "Min of Daily Max Temp",
  TX90p:  "Warm Days (% > 90th pct)",
  TN10p:  "Cool Nights (% < 10th pct)",
  WSDI:   "Warm Spell Duration Index",
  CSDI:   "Cold Spell Duration Index",
  SDII:   "Simple Daily Intensity Index",
  RX1day: "Max 1-Day Precipitation",
  RX5day: "Max 5-Day Precipitation",
  R10mm:  "Heavy Precipitation Days (≥10mm)",
  R20mm:  "Very Heavy Precipitation Days (≥20mm)",
  CWD:    "Consecutive Wet Days",
  CDD:    "Consecutive Dry Days",
  R95p:   "Very Wet Days (> 95th pct)",
  R99p:   "Extremely Wet Days (> 99th pct)",
};

export const CATEGORY: Record<ETCCDIIndexName, "warm" | "cold" | "wet" | "dry"> = {
  TXx:    "warm",
  TNn:    "cold",
  TNx:    "warm",
  TXn:    "cold",
  TX90p:  "warm",
  TN10p:  "cold",
  WSDI:   "warm",
  CSDI:   "cold",
  SDII:   "wet",
  RX1day: "wet",
  RX5day: "wet",
  R10mm:  "wet",
  R20mm:  "wet",
  CWD:    "wet",
  CDD:    "dry",
  R95p:   "wet",
  R99p:   "wet",
};

export default function IndexSelector() {
  const selectedIndex = useStore((s) => s.selectedIndex);
  const setSelectedIndex = useStore((s) => s.setSelectedIndex);
  const availableIndices = useStore((s) => s.availableIndices);

  const isAvailable = (name: ETCCDIIndexName) =>
    availableIndices.find((i) => i.name === name)?.available_years.length ?? 0 > 0;

  const dotColor = (name: ETCCDIIndexName) => {
    const cat = CATEGORY[name];
    if (cat === "warm") return "bg-orange-400";
    if (cat === "cold") return "bg-sky-400";
    if (cat === "wet")  return "bg-blue-400";
    return "bg-amber-400"; // dry
  };

  const renderPill = (name: ETCCDIIndexName) => {
    const active = selectedIndex === name;
    const available = isAvailable(name);

    return (
      <button
        key={name}
        title={FULL_NAMES[name]}
        onClick={() => available && setSelectedIndex(name)}
        className={[
          "w-full px-2.5 py-2 rounded-lg border transition-all text-left",
          active
            ? "bg-blue-600 border-blue-700 shadow-sm ring-1 ring-blue-800"
            : available
            ? "bg-slate-800 border-slate-700 hover:border-blue-500 hover:bg-slate-750"
            : "bg-slate-900 border-slate-800 cursor-not-allowed opacity-40",
        ].join(" ")}
      >
        <div className="flex items-center gap-1.5 mb-0.5">
          <span
            className={["w-1.5 h-1.5 rounded-full shrink-0", dotColor(name)].join(" ")}
          />
          <span
            className={[
              "font-mono text-xs font-bold",
              active ? "text-white" : available ? "text-slate-200" : "text-slate-600",
            ].join(" ")}
          >
            {name}
          </span>
        </div>
        {/* <p
          className={[
            "text-[10px] leading-snug pl-3",
            active ? "text-blue-200" : available ? "text-slate-500" : "text-slate-700",
          ].join(" ")}
        >
          {FULL_NAMES[name]}
        </p> */}
      </button>
    );
  };

  return (
    <div className="space-y-3">
      <div>
        <p className="text-[9px] text-slate-600 uppercase tracking-widest mb-1.5">Temperature · Core</p>
        <div className="grid grid-cols-2 gap-1">{TIER1_TEMP.map(renderPill)}</div>
      </div>
      <div>
        <p className="text-[9px] text-slate-600 uppercase tracking-widest mb-1.5">Temperature · Baseline</p>
        <div className="grid grid-cols-2 gap-1">{TIER2_TEMP.map(renderPill)}</div>
      </div>
      <div>
        <p className="text-[9px] text-slate-600 uppercase tracking-widest mb-1.5">Precipitation · Core</p>
        <div className="grid grid-cols-2 gap-1">{TIER1_PRECIP.map(renderPill)}</div>
      </div>
      <div>
        <p className="text-[9px] text-slate-600 uppercase tracking-widest mb-1.5">Precipitation · Baseline</p>
        <div className="grid grid-cols-2 gap-1">{TIER2_PRECIP.map(renderPill)}</div>
      </div>
    </div>
  );
}
