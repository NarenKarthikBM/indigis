interface HistogramProps {
  bins: number[];
  counts: number[];
  color?: string;
}

export default function Histogram({ bins, counts, color = "#8B5CF6" }: HistogramProps) {
  if (!bins.length || !counts.length) return null;

  const width = 272;
  const height = 72;
  const padLeft = 4;
  const padRight = 4;
  const padTop = 4;
  const padBottom = 18;
  const chartW = width - padLeft - padRight;
  const chartH = height - padTop - padBottom;

  const maxCount = Math.max(...counts, 1);
  const barCount = counts.length;
  const barW = chartW / barCount;
  const gap = barW > 4 ? 1 : 0;

  const minVal = bins[0];
  const maxVal = bins[bins.length - 1];

  function fmt(v: number) {
    if (Math.abs(v) >= 1000 || (Math.abs(v) < 0.01 && v !== 0)) return v.toExponential(1);
    return parseFloat(v.toPrecision(3)).toString();
  }

  return (
    <svg
      width={width}
      height={height}
      style={{ display: "block", overflow: "visible" }}
    >
      {counts.map((c, i) => {
        const barH = (c / maxCount) * chartH;
        const x = padLeft + i * barW + gap / 2;
        const y = padTop + chartH - barH;
        return (
          <rect
            key={i}
            x={x}
            y={y}
            width={barW - gap}
            height={barH}
            fill={color}
            opacity={0.85}
          />
        );
      })}
      {/* x-axis line */}
      <line
        x1={padLeft}
        y1={padTop + chartH}
        x2={padLeft + chartW}
        y2={padTop + chartH}
        stroke="#3A4D62"
        strokeWidth={1}
      />
      {/* min label */}
      <text
        x={padLeft}
        y={height - 4}
        fill="#6B7E90"
        fontSize={9}
        textAnchor="start"
      >
        {fmt(minVal)}
      </text>
      {/* max label */}
      <text
        x={padLeft + chartW}
        y={height - 4}
        fill="#6B7E90"
        fontSize={9}
        textAnchor="end"
      >
        {fmt(maxVal)}
      </text>
    </svg>
  );
}
