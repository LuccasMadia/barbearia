import { getMonthAgendaSummary } from "@/lib/admin-data";
import { AgendaMonthCalendar } from "@/components/admin/AgendaMonthCalendar";

function currentMonth(): string {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
}

export default async function AgendaPage({
  searchParams,
}: {
  searchParams: Promise<{ month?: string }>;
}) {
  const params = await searchParams;
  const month =
    params.month && /^\d{4}-\d{2}$/.test(params.month) ? params.month : currentMonth();

  const summary = await getMonthAgendaSummary(month);

  return (
    <div className="mx-auto max-w-3xl space-y-8">
      <div>
        <h1 className="font-display text-2xl text-paper">Agenda</h1>
        <p className="mt-1 text-sm text-paper-dim">Escolha um dia para ver os agendamentos.</p>
      </div>

      <AgendaMonthCalendar month={month} summary={summary} />
    </div>
  );
}
