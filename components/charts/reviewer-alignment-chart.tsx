import type { AlignmentPoint } from "../../app/dashboard-data.ts";

export type ReviewerAlignmentChartProps = {
  data: readonly AlignmentPoint[];
};

const WIDTH = 360;
const HEIGHT = 180;
const PAD_LEFT = 40;
const PAD_RIGHT = 12;
const PAD_TOP = 16;
const PAD_BOTTOM = 28;

export function ReviewerAlignmentChart({ data }: ReviewerAlignmentChartProps) {
  if (data.length === 0) return null;
  const innerW = WIDTH - PAD_LEFT - PAD_RIGHT;
  const innerH = HEIGHT - PAD_TOP - PAD_BOTTOM;
  const maxSeq = Math.max(1, data[data.length - 1]?.caseSeq ?? 1);
  const xFor = (seq: number) => PAD_LEFT + ((seq - 1) / Math.max(1, maxSeq - 1)) * innerW;
  const yFor = (a: number) => PAD_TOP + (1 - a) * innerH;
  const points = data
    .map((p) => `${xFor(p.caseSeq).toFixed(1)},${yFor(p.alignment).toFixed(1)}`)
    .join(" ");
  const xTicks = buildTicks(1, maxSeq, 5);
  const yTicks = [0, 0.25, 0.5, 0.75, 1];

  return (
    <figure
      data-testid="reviewer-alignment-chart"
      className="flex flex-col gap-2"
      aria-label="Reviewer alignment over case sequence"
    >
      <figcaption className="text-sm font-bold text-[color:var(--text)]">
        Reviewer alignment over case sequence
      </figcaption>
      <svg
        viewBox={`0 0 ${WIDTH} ${HEIGHT}`}
        width="100%"
        height={HEIGHT}
        role="img"
        aria-label={`Line chart of reviewer alignment across ${data.length} reviewed cases`}
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
              {t.toFixed(2)}
            </text>
          </g>
        ))}
        {xTicks.map((t) => (
          <g key={`x-${t}`}>
            <line
              x1={xFor(t)}
              x2={xFor(t)}
              y1={PAD_TOP}
              y2={HEIGHT - PAD_BOTTOM}
              stroke="var(--border)"
              strokeWidth={1}
            />
            <text
              x={xFor(t)}
              y={HEIGHT - PAD_BOTTOM + 14}
              textAnchor="middle"
              fontSize={10}
              fill="var(--text-muted)"
            >
              {t}
            </text>
          </g>
        ))}
        <polyline
          points={points}
          fill="none"
          stroke="var(--primary)"
          strokeWidth={2}
        />
        {data.map((p) => (
          <circle
            key={p.caseSeq}
            cx={xFor(p.caseSeq)}
            cy={yFor(p.alignment)}
            r={3}
            fill="var(--primary)"
          />
        ))}
      </svg>
      <table className="sr-only">
        <caption>Reviewer alignment over case sequence</caption>
        <thead>
          <tr>
            <th scope="col">Case</th>
            <th scope="col">Alignment</th>
          </tr>
        </thead>
        <tbody>
          {data.map((p) => (
            <tr key={p.caseSeq}>
              <th scope="row">{p.caseSeq}</th>
              <td>{p.alignment.toFixed(2)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </figure>
  );
}

function buildTicks(min: number, max: number, target: number): number[] {
  if (max <= min) return [min];
  const range = max - min;
  const step = Math.max(1, Math.round(range / Math.max(1, target - 1)));
  const ticks: number[] = [];
  for (let v = min; v <= max; v += step) ticks.push(v);
  if (ticks[ticks.length - 1] !== max) ticks.push(max);
  return ticks;
}
