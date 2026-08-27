"use client";

import { motion, useReducedMotion } from "motion/react";
import { SVGProps } from "react";
import { Bar, BarChart, XAxis } from "recharts";

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

const COLLAPSED_WIDTH = 6;

interface OutcomeBarProps extends SVGProps<SVGSVGElement> {
  index?: number;
  value?: number;
}

function OutcomeBar(props: OutcomeBarProps) {
  const reduce = useReducedMotion();
  const { fill, x, y, width, height, value } = props;
  const xPos = Number(x ?? 0);
  const barWidth = Number(width ?? 0);
  const textX = xPos + barWidth / 2;

  if (reduce) {
    return (
      <g>
        <rect x={xPos} y={y} width={barWidth} height={height} fill={fill} rx="3" />
        <text
          x={textX}
          y={Number(y) - 6}
          textAnchor="middle"
          fontSize={12}
          fill="var(--color-count)"
        >
          {value}
        </text>
      </g>
    );
  }

  return (
    <g>
      <motion.rect
        style={{ willChange: "transform, width" }}
        y={y}
        initial={{ width: COLLAPSED_WIDTH, x: xPos + (barWidth - COLLAPSED_WIDTH) / 2 }}
        animate={{ width: barWidth, x: xPos }}
        transition={{ duration: 0.6, type: "spring" }}
        height={height}
        fill={fill}
        rx="3"
      />
      <motion.text
        style={{ willChange: "opacity" }}
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ duration: 0.2, delay: 0.45 }}
        x={textX}
        y={Number(y) - 6}
        textAnchor="middle"
        fontSize={12}
        fill="var(--color-count)"
      >
        {value}
      </motion.text>
    </g>
  );
}

const chartConfig = {
  count: {
    label: "Cases",
    color: "var(--primary)",
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
          />
          <ChartTooltip
            cursor={false}
            content={<ChartTooltipContent indicator="dot" />}
          />
          <Bar
            dataKey="count"
            fill="var(--color-count)"
            shape={<OutcomeBar />}
          />
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
              <th scope="row">
                {d.outcome} ({LABELS[d.outcome] ?? d.outcome})
              </th>
              <td>{d.count}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </figure>
  );
}
