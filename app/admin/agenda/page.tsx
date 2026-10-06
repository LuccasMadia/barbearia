import { getDayAgenda } from "@/lib/admin-data";
import { getActiveServices } from "@/lib/site-data";
import { AgendaBoard } from "@/components/admin/AgendaBoard";
import { DayNav } from "./DayNav";

function todayIsoDate(): string {
  return new Date().toISOString().slice(0, 10);
}

export default async function AgendaPage({
  searchParams,
}: {
  searchParams: Promise<{ date?: string }>;
}) {
  const params = await searchParams;
  const date =
    params.date && /^\d{4}-\d{2}-\d{2}$/.test(params.date) ? params.date : todayIsoDate();

  const [agenda, services] = await Promise.all([getDayAgenda(date), getActiveServices()]);

  return (
    <div className="mx-auto max-w-6xl space-y-8">
      <div>
        <h1 className="font-display text-2xl text-paper">Agenda</h1>
        <p className="mt-1 text-sm text-paper-dim">Agendamentos do dia, por barbeiro.</p>
      </div>

      <DayNav date={date} />

      <AgendaBoard barbers={agenda.barbers} services={services} />
    </div>
  );
}
