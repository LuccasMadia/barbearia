import { getMonthSummary, getUpcomingAppointments } from "@/lib/admin-data";
import { formatPriceBRL } from "@/lib/format";

function formatDateTime(iso: string) {
  return new Date(iso).toLocaleString("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    weekday: "short",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export default async function AdminDashboardPage() {
  const [summary, upcoming] = await Promise.all([
    getMonthSummary(),
    getUpcomingAppointments(10),
  ]);

  return (
    <div className="mx-auto max-w-5xl space-y-16">
      <div>
        <h1 className="font-display text-2xl text-paper">Dashboard</h1>
        <p className="mt-1 text-sm text-paper-dim">
          Resumo do mês atual e próximos agendamentos.
        </p>
      </div>

      <section>
        <h2 className="text-xs uppercase tracking-[0.2em] text-paper-dim">
          Este mês
        </h2>
        <dl className="mt-4 grid gap-x-10 gap-y-4 border-t border-ink-line pt-4 sm:grid-cols-3">
          <div>
            <dt className="text-sm text-paper-dim">Faturamento</dt>
            <dd className="mt-1 font-display text-2xl text-gold">
              {formatPriceBRL(summary.revenueCents)}
            </dd>
          </div>
          <div>
            <dt className="text-sm text-paper-dim">Atendimentos concluídos</dt>
            <dd className="mt-1 font-display text-2xl text-paper">
              {summary.completedCount}
            </dd>
          </div>
          <div>
            <dt className="text-sm text-paper-dim">Total de agendamentos</dt>
            <dd className="mt-1 font-display text-2xl text-paper">
              {summary.appointmentCount}
            </dd>
          </div>
        </dl>
      </section>

      <div className="grid gap-16 sm:grid-cols-2">
        <section>
          <h2 className="text-xs uppercase tracking-[0.2em] text-paper-dim">
            Por serviço
          </h2>
          {summary.byService.length === 0 ? (
            <p className="mt-4 text-sm text-paper-dim">
              Nenhum atendimento concluído neste mês ainda.
            </p>
          ) : (
            <ul className="mt-4 divide-y divide-ink-line border-t border-ink-line">
              {summary.byService.map((row) => (
                <li
                  key={row.name}
                  className="flex items-center justify-between py-3 text-sm"
                >
                  <span className="text-paper">{row.name}</span>
                  <span className="text-paper-dim">{row.count}×</span>
                  <span className="text-gold">
                    {formatPriceBRL(row.revenueCents)}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </section>

        <section>
          <h2 className="text-xs uppercase tracking-[0.2em] text-paper-dim">
            Por barbeiro
          </h2>
          {summary.byBarber.length === 0 ? (
            <p className="mt-4 text-sm text-paper-dim">
              Nenhum atendimento concluído neste mês ainda.
            </p>
          ) : (
            <ul className="mt-4 divide-y divide-ink-line border-t border-ink-line">
              {summary.byBarber.map((row) => (
                <li
                  key={row.name}
                  className="flex items-center justify-between py-3 text-sm"
                >
                  <span className="text-paper">{row.name}</span>
                  <span className="text-paper-dim">{row.count}×</span>
                  <span className="text-gold">
                    {formatPriceBRL(row.revenueCents)}
                  </span>
                </li>
              ))}
            </ul>
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
                className="flex flex-wrap items-center justify-between gap-x-6 gap-y-1 py-3 text-sm"
              >
                <span className="w-40 shrink-0 text-paper">
                  {formatDateTime(appt.startsAt)}
                </span>
                <span className="flex-1 text-paper">{appt.clientName}</span>
                <span className="text-paper-dim">{appt.serviceName}</span>
                <span className="text-paper-dim">{appt.barberName}</span>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
