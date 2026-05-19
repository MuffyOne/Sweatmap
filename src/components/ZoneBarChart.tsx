import type { ComponentProps } from "react";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  CartesianGrid,
  Cell,
} from "recharts";
import { TOOLTIP_STYLE } from "../lib/utils";

interface ZoneBarEntry {
  color: string;
}

interface Props {
  data: ZoneBarEntry[];
  dataKey: string;
  labelKey?: string;
  height?: number;
  yAxisWidth?: number;
  rightMargin?: number;
  leftMargin?: number;
  xAxisAllowDecimals?: boolean;
  tickFormatter?: (v: unknown) => string;
  tooltipFormatter?: ComponentProps<typeof Tooltip>["formatter"];
  tooltipLabelFormatter?: ComponentProps<typeof Tooltip>["labelFormatter"];
}

export function ZoneBarChart({
  data,
  dataKey,
  labelKey = "label",
  height,
  yAxisWidth = 40,
  rightMargin = 64,
  leftMargin = 8,
  xAxisAllowDecimals,
  tickFormatter,
  tooltipFormatter,
  tooltipLabelFormatter,
}: Props) {
  const barHeight = height ?? data.length * 46 + 20;
  return (
    <ResponsiveContainer width="100%" height={barHeight}>
      <BarChart
        data={data}
        layout="vertical"
        margin={{ top: 4, right: rightMargin, left: leftMargin, bottom: 4 }}
      >
        <CartesianGrid strokeDasharray="3 3" stroke="var(--grid-stroke)" horizontal={false} />
        <XAxis
          type="number"
          tickFormatter={tickFormatter}
          tick={{ fill: "var(--tick-color)", fontSize: 11 }}
          axisLine={false}
          tickLine={false}
          allowDecimals={xAxisAllowDecimals}
        />
        <YAxis
          type="category"
          dataKey={labelKey}
          tick={{ fill: "var(--tick-color)", fontSize: 12 }}
          width={yAxisWidth}
          axisLine={false}
          tickLine={false}
        />
        <Tooltip
          cursor={{ fill: "var(--surface-elevated)" }}
          contentStyle={TOOLTIP_STYLE}
          labelStyle={{ color: "var(--text-primary)" }}
          itemStyle={{ color: "var(--text-primary)" }}
          formatter={tooltipFormatter}
          labelFormatter={tooltipLabelFormatter}
        />
        <Bar dataKey={dataKey} radius={[0, 6, 6, 0]} maxBarSize={28} isAnimationActive={false}>
          {data.map((entry) => (
            <Cell key={String((entry as unknown as Record<string, unknown>)[labelKey])} fill={entry.color} />
          ))}
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  );
}
