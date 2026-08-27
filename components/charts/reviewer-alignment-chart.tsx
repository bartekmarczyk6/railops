"use client";

import { CartesianGrid, Line, LineChart, XAxis, YAxis } from "recharts";

import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
  type ChartConfig,
} from "../ui/chart.tsx";
import type { AlignmentPoint } from "../../app/dashboard-data.ts";

export type ReviewerAlignmentChartProps = {
  data: readonly AlignmentPoint[];
};

const chartConfig = {
  alignment: {
    label: "Alignment",
    color: "var(--primary)",
  },
} satisfies ChartConfig;

export function ReviewerAlignmentChart({ data }: ReviewerAlignmentChartProps) {
  if (data.length === 0) return null;

  return (
    <figure
      data-testid="reviewer-alignment-chart"
      aria-label="Reviewer alignment over case sequence"
      className="flex flex-col gap-2"
    >
      <ChartContainer config={chartConfig} className="aspect-auto h-45 w-full">
        <LineChart
          accessibilityLayer
          data={[...data]}
          margin={{ top: 12, right: 12, bottom: 0, left: 0 }}
        >
          <CartesianGrid vertical={false} strokeDasharray="3 3" />
          <XAxis
            dataKey="caseSeq"
            type="number"
            domain={["dataMin", "dataMax"]}
            allowDecimals={false}
            tickLine={false}
            axisLine={false}
            tickMargin={8}
          />
          <YAxis
            domain={[0, 1]}
            ticks={[0, 0.5, 1]}
            tickLine={false}
            axisLine={false}
            width={32}
            tickFormatter={(value: number) => value.toFixed(1)}
          />
          <ChartTooltip
            cursor={false}
            content={
              <ChartTooltipContent
                indicator="dot"
                labelFormatter={(value) => `Case ${value}`}
                formatter={(value) => (
                  <span className="text-foreground font-semibold tabular-nums">
                    {Number(value).toFixed(2)}
                  </span>
                )}
              />
            }
          />
          <Line
            dataKey="alignment"
            type="linear"
            stroke="var(--color-alignment)"
            strokeWidth={2}
            dot={{ r: 3, fill: "var(--color-alignment)", strokeWidth: 0 }}
            activeDot={{ r: 4 }}
          />
        </LineChart>
      </ChartContainer>
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
