import Link from "next/link";

const WEEKDAY_LABELS = ["D", "S", "T", "Q", "Q", "S", "S"];
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

  const cells: Array<{ day: number; key: string } | null> = [];
  for (let i = 0; i < firstWeekday; i++) cells.push(null);
  for (let day = 1; day <= daysInMonth; day++) {
    cells.push({ day, key: toDateKey(year, monthIndex, day) });
  }

  return (
    <div>
      <div className="flex items-center justify-between">
        <Link
          href={`/admin/agenda?month=${shiftMonth(month, -1)}`}
          aria-label="Mês anterior"
          className="rounded-sm p-1.5 text-paper-dim transition-colors hover:text-gold"
        >
          ‹
        </Link>
        <span className="text-sm text-paper">
          {MONTH_LABELS[monthIndex]} {year}
        </span>
        <Link
          href={`/admin/agenda?month=${shiftMonth(month, 1)}`}
          aria-label="Próximo mês"
          className="rounded-sm p-1.5 text-paper-dim transition-colors hover:text-gold"
        >
          ›
        </Link>
      </div>

      <div className="mt-4 grid grid-cols-7 gap-y-1 text-center">
        {WEEKDAY_LABELS.map((label, i) => (
          <span key={i} className="pb-2 text-[11px] uppercase tracking-wide text-paper-dim">
            {label}
          </span>
        ))}

        {cells.map((cell, i) =>
          cell === null ? (
            <span key={`blank-${i}`} />
          ) : (
            <Link
              key={cell.key}
              href={`/admin/agenda/${cell.key}`}
              className={`mx-auto flex h-14 w-14 flex-col items-center justify-center gap-0.5 rounded-sm transition-colors hover:bg-ink-line ${
                cell.key === todayKey ? "border border-gold" : ""
              }`}
            >
              <span className="text-sm text-paper">{cell.day}</span>
              {(summary[cell.key] ?? 0) > 0 && (
                <span className="text-xs text-gold">{summary[cell.key]}</span>
              )}
            </Link>
          )
        )}
      </div>
    </div>
  );
}
