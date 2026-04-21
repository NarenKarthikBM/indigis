import { useStore } from "../../store";
import type { ETCCDIIndexName } from "../../types/climate.types";

const TIER1: ETCCDIIndexName[] = ["TXx", "TNn", "TNx", "TXn"];
const TIER2: ETCCDIIndexName[] = ["TX90p", "TN10p", "WSDI", "CSDI"];

const LABELS: Record<ETCCDIIndexName, string> = {
  TXx: "TXx",
  TNn: "TNn",
  TNx: "TNx",
  TXn: "TXn",
  // SU25: "SU25",
  // TR20: "TR20",
  TX90p: "TX90p",
  TN10p: "TN10p",
  WSDI: "WSDI",
  CSDI: "CSDI",
};

const DESCRIPTIONS: Partial<Record<ETCCDIIndexName, string>> = {
  TXx: "Max Tmax",
  TNn: "Min Tmin",
  TNx: "Max Tmin",
  TXn: "Min Tmax",
  // SU25: "Summer Days",
  // TR20: "Tropical Nights",
  TX90p: "Warm Days %",
  TN10p: "Cool Nights %",
  WSDI: "Warm Spell",
  CSDI: "Cold Spell",
};

export default function IndexSelector() {
  const selectedIndex = useStore((s) => s.selectedIndex);
  const setSelectedIndex = useStore((s) => s.setSelectedIndex);
  const availableIndices = useStore((s) => s.availableIndices);

  const isAvailable = (name: ETCCDIIndexName) =>
    availableIndices.find((i) => i.name === name)?.available_years.length ?? 0 > 0;

  const renderPill = (name: ETCCDIIndexName) => {
    const active = selectedIndex === name;
    const available = isAvailable(name);
    return (
      <button
        key={name}
        title={DESCRIPTIONS[name]}
        onClick={() => available && setSelectedIndex(name)}
        className={[
          "w-full px-2 py-1.5 rounded-lg text-xs border transition-all",
          active
            ? "font-semibold bg-blue-600 text-white border-blue-600 shadow-sm ring-1 ring-blue-300"
            : available
            ? "font-medium bg-white text-slate-700 border-slate-200 hover:border-blue-300 hover:bg-blue-50"
            : "font-medium bg-slate-50 text-slate-300 border-slate-100 cursor-not-allowed",
        ].join(" ")}
      >
        {LABELS[name]}
      </button>
    );
  };

  return (
    <div className="space-y-3">
      <div>
        <p className="text-[9px] text-slate-400 uppercase tracking-widest mb-1.5">Core</p>
        <div className="grid grid-cols-2 gap-1">{TIER1.map(renderPill)}</div>
      </div>
      <div>
        <p className="text-[9px] text-slate-400 uppercase tracking-widest mb-1.5">
          Baseline-dependent
        </p>
        <div className="grid grid-cols-2 gap-1">{TIER2.map(renderPill)}</div>
      </div>
    </div>
  );
}
