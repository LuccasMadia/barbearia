import Link from "next/link";

function shiftDate(date: string, days: number): string {
  const d = new Date(`${date}T00:00:00`);
  d.setDate(d.getDate() + days);
  return d.toISOString().slice(0, 10);
}

export function DayNav({ date }: { date: string }) {
  const label = new Date(`${date}T00:00:00`).toLocaleDateString("pt-BR", {
    weekday: "long",
    day: "2-digit",
    month: "long",
  });

  return (
    <div className="flex items-center justify-between border-y border-ink-line py-3">
      <Link
        href={`/admin/agenda?date=${shiftDate(date, -1)}`}
        className="text-sm text-paper-dim transition-colors hover:text-paper"
      >
        ← Anterior
      </Link>
      <span className="font-display text-paper capitalize">{label}</span>
      <Link
        href={`/admin/agenda?date=${shiftDate(date, 1)}`}
        className="text-sm text-paper-dim transition-colors hover:text-paper"
      >
        Próximo →
      </Link>
    </div>
  );
}
