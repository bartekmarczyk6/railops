"use client";

import { SVGProps } from "react";
import { Bar, BarChart, Cell, XAxis } from "recharts";

import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
  type ChartConfig,
} from "../ui/chart.tsx";
import type { OutcomeCount } from "../../app/dashboard-data.ts";

export type OutcomeDistributionChartProps = {
  data: readonly OutcomeCount[];
};

const LABELS: Record<string, string> = {
  refund: "Refund",
  denied: "Denied",
  draft: "Draft",
};

const COLORS: Record<string, string> = {
  refund: "var(--green)",
  denied: "var(--red)",
  draft: "var(--ink-2)",
};

interface OutcomeBarProps extends SVGProps<SVGSVGElement> {
  index?: number;
  value?: number;
}

function OutcomeBar(props: OutcomeBarProps) {
  const { fill, x, y, width, height, value } = props;
  const xPos = Number(x ?? 0);
  const barWidth = Number(width ?? 0);
  const textX = xPos + barWidth / 2;

  return (
    <g>
      <rect x={xPos} y={y} width={barWidth} height={height} fill={fill} rx="3" />
      <text
        x={textX}
        y={Number(y) - 6}
        textAnchor="middle"
        fontSize={12}
        fill="var(--ink-2)"
      >
        {value}
      </text>
    </g>
  );
}

const chartConfig = {
  count: {
    label: "Cases",
    color: "var(--accent)",
  },
} satisfies ChartConfig;

export function OutcomeDistributionChart({ data }: OutcomeDistributionChartProps) {
  if (data.length === 0) return null;

  const chartData = data.map((d) => ({
    outcome: LABELS[d.outcome] ?? d.outcome,
    count: d.count,
  }));

  return (
    <figure
      data-testid="outcome-distribution-chart"
      aria-label="Outcome distribution"
      className="flex flex-col gap-2"
    >
      <ChartContainer config={chartConfig} className="aspect-auto h-45 w-full">
        <BarChart
          accessibilityLayer
          data={chartData}
          margin={{ top: 24, right: 12, bottom: 0, left: 12 }}
        >
          <XAxis
            dataKey="outcome"
            tickLine={false}
            axisLine={false}
            tickMargin={10}
            tick={{ fill: "var(--ink-2)", fontSize: 12 }}
          />
          <ChartTooltip
            cursor={false}
            content={<ChartTooltipContent indicator="dot" />}
          />
          <Bar dataKey="count" shape={<OutcomeBar />}>
            {data.map((d) => (
              <Cell key={d.outcome} fill={COLORS[d.outcome] ?? "var(--accent)"} />
            ))}
          </Bar>
        </BarChart>
      </ChartContainer>
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
              <th scope="row">{LABELS[d.outcome] ?? d.outcome}</th>
              <td>{d.count}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </figure>
  );
}
