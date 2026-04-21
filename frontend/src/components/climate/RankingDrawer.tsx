import { useEffect, useState } from "react";
import { useStore } from "../../store";

export default function RankingDrawer() {
  const [open, setOpen] = useState(false);
  const rankings = useStore((s) => s.rankings);
  const rankingsLoading = useStore((s) => s.rankingsLoading);
  const fetchRankings = useStore((s) => s.fetchRankings);
  const fetchDistrictProfile = useStore((s) => s.fetchDistrictProfile);
  const selectedIndex = useStore((s) => s.selectedIndex);
  const selectedMetric = useStore((s) => s.selectedMetric);

  useEffect(() => {
    if (open) {
      fetchRankings();
    }
  }, [open, selectedIndex, selectedMetric]);

  const metricLabel: Record<string, string> = {
    trend_slope: "Trend (per decade)",
    rp10: "RP10",
    rp25: "RP25",
    rp50: "RP50",
    rp100: "RP100",
    latest_value: "Latest Value",
  };

  return (
    <div
      className={[
        "absolute bottom-0 left-0 right-0 bg-white border-t border-gray-200 z-[900]",
        "transition-all duration-300",
        open ? "h-64" : "h-10",
      ].join(" ")}
    >
      {/* Toggle handle */}
      <button
        onClick={() => setOpen((v) => !v)}
        className="w-full h-10 flex items-center justify-center gap-2 text-xs font-medium text-gray-600 hover:bg-gray-50 border-b border-gray-100"
      >
        <span>{open ? "▼" : "▲"}</span>
        <span>
          Rankings - {selectedIndex} / {metricLabel[selectedMetric] ?? selectedMetric}
        </span>
        {rankingsLoading && <span className="animate-spin">⟳</span>}
      </button>

      {open && (
        <div className="overflow-auto h-52">
          {rankings.length === 0 && !rankingsLoading && (
            <div className="flex items-center justify-center h-full text-gray-400 text-sm">
              No ranking data available
            </div>
          )}
          {rankings.length > 0 && (
            <table className="w-full text-xs border-collapse">
              <thead>
                <tr className="bg-gray-50 text-gray-500 uppercase text-xs">
                  <th className="text-left px-3 py-1.5 w-8">#</th>
                  <th className="text-left px-3 py-1.5">District</th>
                  <th className="text-left px-3 py-1.5">State</th>
                  <th className="text-right px-3 py-1.5">
                    {metricLabel[selectedMetric] ?? selectedMetric}
                  </th>
                </tr>
              </thead>
              <tbody>
                {rankings.map((row) => (
                  <tr
                    key={row.district_code}
                    className="border-t border-gray-100 hover:bg-blue-50 cursor-pointer"
                    onClick={() => fetchDistrictProfile(row.district_code)}
                  >
                    <td className="px-3 py-1.5 text-gray-400">{row.rank}</td>
                    <td className="px-3 py-1.5 font-medium text-gray-800">
                      {row.district_name}
                    </td>
                    <td className="px-3 py-1.5 text-gray-500">{row.state_name}</td>
                    <td className="px-3 py-1.5 text-right font-mono text-gray-800">
                      {row.value !== null ? row.value.toFixed(3) : "-"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      )}
    </div>
  );
}
