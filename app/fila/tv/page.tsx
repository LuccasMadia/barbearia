import { createAdminClient } from "@/lib/supabase/admin";
import { getQueueBoard } from "@/lib/queue-server";
import { AutoRefresh } from "@/components/AutoRefresh";

export const dynamic = "force-dynamic";

export default async function FilaTvPage() {
  const board = await getQueueBoard(createAdminClient());

  return (
    <div className="min-h-screen bg-ink p-12 text-paper">
      <AutoRefresh intervalMs={4000} />
      <h1 className="font-display text-4xl text-gold">Fila de atendimento</h1>

      <div className="mt-10 grid gap-8 sm:grid-cols-2 lg:grid-cols-3">
        {board.barbers.map((barber) => (
          <section key={barber.barberId} className="rounded-sm border border-ink-line p-6">
            <h2 className="text-sm uppercase tracking-[0.2em] text-paper-dim">
              {barber.barberName}
            </h2>
            {barber.current ? (
              <div className="mt-4">
                <p className="font-display text-2xl text-paper">
                  {barber.current.clientName}
                </p>
                <p className="text-paper-dim">{barber.current.serviceName}</p>
              </div>
            ) : (
              <p className="mt-4 text-paper-dim">Disponível</p>
            )}
          </section>
        ))}
      </div>

      <div className="mt-12">
        <h2 className="text-sm uppercase tracking-[0.2em] text-paper-dim">Próximos na fila</h2>
        {board.waiting.length === 0 ? (
          <p className="mt-4 text-paper-dim">Nenhum cliente esperando.</p>
        ) : (
          <ul className="mt-4 divide-y divide-ink-line border-t border-ink-line">
            {board.waiting.map((item, index) => (
              <li
                key={item.entryId}
                className="flex items-center gap-x-6 gap-y-1 py-4 text-lg"
              >
                <span className="w-10 shrink-0 text-paper-dim">{index + 1}º</span>
                <span className="flex-1 text-paper">{item.clientName}</span>
                <span className="text-paper-dim">{item.serviceName}</span>
                <span className="w-24 shrink-0 text-right text-gold">
                  {item.estimatedWaitMinutes !== null
                    ? `~${item.estimatedWaitMinutes} min`
                    : "—"}
                </span>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
