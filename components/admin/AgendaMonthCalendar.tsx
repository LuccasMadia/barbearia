import Link from "next/link";

const WEEKDAY_LABELS = ["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sáb"];
const MONTH_LABELS = [
  "Janeiro",
  "Fevereiro",
  "Março",
  "Abril",
  "Maio",
  "Junho",
  "Julho",
  "Agosto",
  "Setembro",
  "Outubro",
  "Novembro",
  "Dezembro",
];

function toDateKey(year: number, monthIndex: number, day: number): string {
  const mm = String(monthIndex + 1).padStart(2, "0");
  const dd = String(day).padStart(2, "0");
  return `${year}-${mm}-${dd}`;
}

function shiftMonth(month: string, offset: number): string {
  const [year, monthNumber] = month.split("-").map(Number);
  const d = new Date(year, monthNumber - 1 + offset, 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

export function AgendaMonthCalendar({
  month,
  summary,
}: {
  month: string;
  summary: Record<string, number>;
}) {
  const [year, monthNumber] = month.split("-").map(Number);
  const monthIndex = monthNumber - 1;
  const firstWeekday = new Date(year, monthIndex, 1).getDay();
  const daysInMonth = new Date(year, monthIndex + 1, 0).getDate();

  const today = new Date();
  const todayKey = toDateKey(today.getFullYear(), today.getMonth(), today.getDate());

  const totalCells = Math.ceil((firstWeekday + daysInMonth) / 7) * 7;
  const cells: Array<{ day: number; key: string } | null> = [];
  for (let i = 0; i < firstWeekday; i++) cells.push(null);
  for (let day = 1; day <= daysInMonth; day++) {
    cells.push({ day, key: toDateKey(year, monthIndex, day) });
  }
  while (cells.length < totalCells) cells.push(null);

  return (
    <div>
      <div className="flex items-center justify-between">
        <span className="font-display text-2xl text-gold">
          {MONTH_LABELS[monthIndex]} {year}
        </span>
        <div className="flex items-center gap-1">
          <Link
            href={`/admin/agenda?month=${shiftMonth(month, -1)}`}
            aria-label="Mês anterior"
            className="rounded-sm p-1.5 text-paper-dim transition-colors hover:text-gold"
          >
            ‹
          </Link>
          <Link
            href={`/admin/agenda?month=${shiftMonth(month, 1)}`}
            aria-label="Próximo mês"
            className="rounded-sm p-1.5 text-paper-dim transition-colors hover:text-gold"
          >
            ›
          </Link>
        </div>
      </div>

      <div className="mt-4 grid grid-cols-7 border-l border-t border-ink-line">
        {WEEKDAY_LABELS.map((label) => (
          <div
            key={label}
            className="border-b border-r border-ink-line bg-ink-raised py-2 text-center text-xs font-semibold uppercase tracking-wide text-gold"
          >
            {label}
          </div>
        ))}

        {cells.map((cell, i) =>
          cell === null ? (
            <div key={`blank-${i}`} className="border-b border-r border-ink-line" />
          ) : (
            <Link
              key={cell.key}
              href={`/admin/agenda/${cell.key}`}
              className={`flex min-h-20 flex-col gap-1 border-b border-r border-ink-line p-2 transition-colors hover:bg-ink-line ${
                cell.key === todayKey ? "bg-ink-raised" : ""
              }`}
            >
              <span
                className={`text-sm ${cell.key === todayKey ? "font-semibold text-gold" : "text-paper"}`}
              >
                {cell.day}
              </span>
              {(summary[cell.key] ?? 0) > 0 && (
                <span className="text-xs text-gold">
                  {summary[cell.key]} agend.
                </span>
              )}
            </Link>
          )
        )}
      </div>
    </div>
  );
}
