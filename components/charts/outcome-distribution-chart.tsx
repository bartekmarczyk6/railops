import type { OutcomeCount } from "../../app/dashboard-data.ts";

export type OutcomeDistributionChartProps = {
  data: readonly OutcomeCount[];
};

const WIDTH = 360;
const HEIGHT = 180;
const PAD_LEFT = 40;
const PAD_RIGHT = 12;
const PAD_TOP = 16;
const PAD_BOTTOM = 32;

const LABELS: Record<string, string> = {
  refund: "Refund",
  denied: "Denied",
  draft: "Draft",
};

export function OutcomeDistributionChart({ data }: OutcomeDistributionChartProps) {
  if (data.length === 0) return null;
  const innerW = WIDTH - PAD_LEFT - PAD_RIGHT;
  const innerH = HEIGHT - PAD_TOP - PAD_BOTTOM;
  const maxCount = Math.max(1, ...data.map((d) => d.count));
  const yFor = (n: number) => PAD_TOP + (1 - n / maxCount) * innerH;
  const barWidth = innerW / data.length;
  const yTicks = buildYTicks(maxCount);

  return (
    <figure
      data-testid="outcome-distribution-chart"
      className="flex flex-col gap-2"
      aria-label="Outcome distribution"
    >
      <figcaption className="text-sm font-bold text-[color:var(--text)]">
        Outcome distribution
      </figcaption>
      <svg
        viewBox={`0 0 ${WIDTH} ${HEIGHT}`}
        width="100%"
        height={HEIGHT}
        role="img"
        aria-label={`Bar chart of reviewer outcome distribution across ${data.length} outcomes`}
      >
        {yTicks.map((t) => (
          <g key={t}>
            <line
              x1={PAD_LEFT}
              x2={WIDTH - PAD_RIGHT}
              y1={yFor(t)}
              y2={yFor(t)}
              stroke="var(--border)"
              strokeWidth={1}
            />
            <text
              x={PAD_LEFT - 6}
              y={yFor(t) + 4}
              textAnchor="end"
              fontSize={10}
              fill="var(--text-muted)"
            >
              {t}
            </text>
          </g>
        ))}
        {data.map((d, i) => {
          const x = PAD_LEFT + i * barWidth + 4;
          const w = Math.max(2, barWidth - 8);
          const h = innerH - (yFor(d.count) - PAD_TOP);
          const y = yFor(d.count);
          return (
            <g key={d.outcome}>
              <rect x={x} y={y} width={w} height={h} fill="var(--primary)" />
              <text
                x={x + w / 2}
                y={HEIGHT - PAD_BOTTOM + 14}
                textAnchor="middle"
                fontSize={10}
                fill="var(--text-muted)"
              >
                {LABELS[d.outcome] ?? d.outcome}
              </text>
              <text
                x={x + w / 2}
                y={y - 4}
                textAnchor="middle"
                fontSize={10}
                fill="var(--text)"
              >
                {d.count}
              </text>
            </g>
          );
        })}
      </svg>
      <table className="sr-only">
        <caption>Outcome distribution</caption>
        <thead>
          <tr>
            <th scope="col">Outcome</th>
            <th scope="col">Count</th>
          </tr>
        </thead>
        <tbody>
          {data.map((d) => (
            <tr key={d.outcome}>
              <th scope="row">{d.outcome} ({LABELS[d.outcome] ?? d.outcome})</th>
              <td>{d.count}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </figure>
  );
}

function buildYTicks(max: number): number[] {
  if (max <= 4) return [0, 1, 2, 3, 4].filter((n) => n <= max);
  const step = Math.max(1, Math.ceil(max / 4));
  const ticks: number[] = [];
  for (let v = 0; v <= max; v += step) ticks.push(v);
  if (ticks[ticks.length - 1] !== max) ticks.push(max);
  return ticks;
}
