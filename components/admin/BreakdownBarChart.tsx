import { formatPriceBRL } from "@/lib/format";
import type { BreakdownRow } from "@/lib/admin-data";

export function BreakdownBarChart({ rows }: { rows: BreakdownRow[] }) {
  const maxRevenue = Math.max(...rows.map((r) => r.revenueCents), 1);

  return (
    <ul className="space-y-4">
      {rows.map((row) => {
        const widthPercent = Math.max((row.revenueCents / maxRevenue) * 100, 4);
        return (
          <li key={row.name}>
            <div className="flex items-baseline justify-between gap-4 text-sm">
              <span className="text-paper">{row.name}</span>
              <span className="shrink-0 tabular-nums text-paper-dim">
                {row.count}× · {formatPriceBRL(row.revenueCents)}
              </span>
            </div>
            <div
              className="mt-2 h-2 rounded-sm bg-gold"
              style={{ width: `${widthPercent}%` }}
            />
          </li>
        );
      })}
    </ul>
  );
}
