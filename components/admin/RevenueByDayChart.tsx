import { formatPriceBRL } from "@/lib/format";
import type { DaySummary } from "@/lib/admin-data";

const CHART_HEIGHT = 176;
const LABEL_SPACE = 20;
const VALUE_LABEL_SPACE = 22;

function formatDayLabel(dateKey: string, showWeekday: boolean): string {
  const date = new Date(`${dateKey}T00:00:00`);
  if (showWeekday) {
    return date
      .toLocaleDateString("pt-BR", { weekday: "short" })
      .replace(".", "")
      .toUpperCase();
  }
  return String(date.getDate());
}

function formatDayTitle(dateKey: string): string {
  const date = new Date(`${dateKey}T00:00:00`);
  return date.toLocaleDateString("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    weekday: "short",
  });
}

export function RevenueByDayChart({ days }: { days: DaySummary[] }) {
  if (days.length === 0) {
    return <p className="text-sm text-paper-dim">Sem dados neste período.</p>;
  }

  const maxRevenue = Math.max(...days.map((d) => d.revenueCents), 1);
  const showValueLabels = days.length <= 7;
  const maxBarHeight = CHART_HEIGHT - LABEL_SPACE - (showValueLabels ? VALUE_LABEL_SPACE : 0);

  return (
    <div className="flex items-end gap-1" style={{ height: CHART_HEIGHT }}>
      {days.map((day) => {
        const barHeight =
          day.revenueCents > 0
            ? Math.max((day.revenueCents / maxRevenue) * maxBarHeight, 3)
            : 2;
        return (
          <div
            key={day.date}
            title={`${formatDayTitle(day.date)} — ${formatPriceBRL(day.revenueCents)}`}
            className="flex min-w-0 flex-1 flex-col items-center justify-end"
          >
            {showValueLabels && (
              <span
                className="mb-1 text-[11px] tabular-nums text-gold"
                style={{ visibility: day.revenueCents > 0 ? "visible" : "hidden" }}
              >
                {formatPriceBRL(day.revenueCents)}
              </span>
            )}
            <div
              className={`w-full max-w-6 rounded-t-sm ${
                day.revenueCents > 0 ? "bg-gold" : "bg-ink-line-strong"
              }`}
              style={{ height: barHeight }}
            />
            <span className="mt-1.5 text-[10px] text-paper-dim">
              {formatDayLabel(day.date, showValueLabels)}
            </span>
          </div>
        );
      })}
    </div>
  );
}
