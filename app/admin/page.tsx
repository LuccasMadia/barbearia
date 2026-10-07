import { getPeriodSummary, getUpcomingAppointments } from "@/lib/admin-data";
import type { Period } from "@/lib/period";
import { formatPriceBRL } from "@/lib/format";
import { PeriodFilter } from "@/components/admin/PeriodFilter";
import { RevenueByDayChart } from "@/components/admin/RevenueByDayChart";
import { BreakdownBarChart } from "@/components/admin/BreakdownBarChart";

function formatDateTime(iso: string) {
  return new Date(iso).toLocaleString("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    weekday: "short",
    hour: "2-digit",
    minute: "2-digit",
  });
}

const PERIOD_LABELS: Record<Period, string> = {
  today: "Hoje",
  week: "Esta semana",
  month: "Este mês",
};

function parsePeriod(value: string | undefined): Period {
  return value === "today" || value === "week" ? value : "month";
}

export default async function AdminDashboardPage({
  searchParams,
}: {
  searchParams: Promise<{ period?: string }>;
}) {
  const params = await searchParams;
  const period = parsePeriod(params.period);

  const [summary, upcoming] = await Promise.all([
    getPeriodSummary(period),
    getUpcomingAppointments(10),
  ]);

  return (
    <div className="mx-auto max-w-5xl space-y-16">
      <div>
        <h1 className="font-display text-2xl text-paper">Dashboard</h1>
        <p className="mt-1 text-sm text-paper-dim">
          Resumo do período selecionado e próximos agendamentos.
        </p>
      </div>

      <section>
        <div className="flex flex-wrap items-center justify-between gap-4">
          <h2 className="text-xs uppercase tracking-[0.2em] text-paper-dim">
            {PERIOD_LABELS[period]}
          </h2>
          <PeriodFilter active={period} />
        </div>

        <dl className="mt-4 flex flex-wrap items-baseline gap-x-12 gap-y-6 border-t border-ink-line pt-6">
          <div>
            <dt className="text-sm text-paper-dim">Faturamento</dt>
            <dd className="mt-1 font-display text-4xl tabular-nums text-gold">
              {formatPriceBRL(summary.revenueCents)}
            </dd>
          </div>
          <div>
            <dt className="text-sm text-paper-dim">Atendimentos concluídos</dt>
            <dd className="mt-1 font-display text-xl tabular-nums text-paper-dim">
              {summary.completedCount}
            </dd>
          </div>
          <div>
            <dt className="text-sm text-paper-dim">Total de agendamentos</dt>
            <dd className="mt-1 font-display text-xl tabular-nums text-paper-dim">
              {summary.appointmentCount}
            </dd>
          </div>
        </dl>

        <div className="mt-8">
          <RevenueByDayChart days={summary.byDay} />
        </div>
      </section>

      <div className="grid gap-16 sm:grid-cols-2">
        <section>
          <h2 className="text-xs uppercase tracking-[0.2em] text-paper-dim">
            Por serviço
          </h2>
          {summary.byService.length === 0 ? (
            <p className="mt-4 text-sm text-paper-dim">
              Nenhum atendimento concluído neste período ainda.
            </p>
          ) : (
            <div className="mt-4">
              <BreakdownBarChart rows={summary.byService} />
            </div>
          )}
        </section>

        <section>
          <h2 className="text-xs uppercase tracking-[0.2em] text-paper-dim">
            Por barbeiro
          </h2>
          {summary.byBarber.length === 0 ? (
            <p className="mt-4 text-sm text-paper-dim">
              Nenhum atendimento concluído neste período ainda.
            </p>
          ) : (
            <div className="mt-4">
              <BreakdownBarChart rows={summary.byBarber} />
            </div>
          )}
        </section>
      </div>

      <section>
        <h2 className="text-xs uppercase tracking-[0.2em] text-paper-dim">
          Próximos agendamentos
        </h2>
        {upcoming.length === 0 ? (
          <p className="mt-4 text-sm text-paper-dim">
            Nenhum agendamento futuro no momento.
          </p>
        ) : (
          <ul className="mt-4 divide-y divide-ink-line border-t border-ink-line">
            {upcoming.map((appt) => (
              <li
                key={appt.id}
                className="flex flex-wrap items-center gap-x-6 gap-y-1 py-3 text-sm"
              >
                <span className="w-40 shrink-0 tabular-nums text-paper">
                  {formatDateTime(appt.startsAt)}
                </span>
                <span className="flex-1 text-paper">{appt.clientName}</span>
                <span className="w-32 shrink-0 text-paper-dim">
                  {appt.serviceName}
                </span>
                <span className="w-28 shrink-0 text-paper-dim">
                  {appt.barberName}
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
