"use client";

import { RadialBarChart, RadialBar, ResponsiveContainer } from "recharts";
import { cn } from "@/lib/cn";

interface TokenGaugeProps {
  used: number;
  budget: number;
  className?: string;
}

export function TokenGauge({ used, budget, className }: TokenGaugeProps) {
  const pct = budget > 0 ? Math.min((used / budget) * 100, 100) : 0;
  const remaining = Math.max(0, budget - used);

  const color =
    pct < 60
      ? "#3b82f6"
      : pct < 85
      ? "#f59e0b"
      : "#ef4444";

  const data = [{ value: pct, fill: color }];

  return (
    <div
      className={cn(
        "glass rounded-2xl p-5 flex flex-col items-center justify-center",
        className,
      )}
    >
      <p className="text-xs text-slate-500 uppercase tracking-wider mb-3">Token Budget</p>

      <div className="relative w-36 h-36">
        <ResponsiveContainer width="100%" height="100%">
          <RadialBarChart
            innerRadius="70%"
            outerRadius="100%"
            startAngle={225}
            endAngle={-45}
            data={data}
            barSize={10}
          >
            <RadialBar
              background={{ fill: "rgba(255,255,255,0.05)" }}
              dataKey="value"
              cornerRadius={5}
            />
          </RadialBarChart>
        </ResponsiveContainer>

        {/* Center label */}
        <div className="absolute inset-0 flex flex-col items-center justify-center">
          <span
            className="text-2xl font-bold tabular-nums"
            style={{ color }}
          >
            {pct.toFixed(0)}%
          </span>
          <span className="text-xs text-slate-500">used</span>
        </div>
      </div>

      <div className="mt-3 space-y-1 w-full text-center">
        <div className="flex justify-between text-xs text-slate-500">
          <span>Used</span>
          <span className="text-slate-300 tabular-nums">{used.toLocaleString()}</span>
        </div>
        <div className="flex justify-between text-xs text-slate-500">
          <span>Remaining</span>
          <span className="text-slate-300 tabular-nums">{remaining.toLocaleString()}</span>
        </div>
        <div className="flex justify-between text-xs text-slate-500">
          <span>Budget</span>
          <span className="text-slate-300 tabular-nums">{budget.toLocaleString()}</span>
        </div>
      </div>
    </div>
  );
}
