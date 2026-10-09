import { createAdminClient } from "@/lib/supabase/admin";
import { getQueueBoard } from "@/lib/queue-server";
import { getSiteConfig } from "@/lib/site-data";
import { AutoRefresh } from "@/components/AutoRefresh";
import { ScissorsMark } from "@/components/site/ScissorsMark";

export const dynamic = "force-dynamic";

function formatNow(date: Date) {
  const time = date.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });
  const day = date
    .toLocaleDateString("pt-BR", { weekday: "long", day: "numeric", month: "long" })
    .replace(/^\w/, (c) => c.toUpperCase());
  return { time, day };
}

export default async function FilaTvPage() {
  const [board, siteConfig] = await Promise.all([
    getQueueBoard(createAdminClient()),
    getSiteConfig(),
  ]);
  const { time, day } = formatNow(new Date());

  return (
    <div className="flex min-h-screen flex-col bg-ink text-paper">
      <AutoRefresh intervalMs={4000} />

      <header className="flex items-center justify-between border-b border-ink-line px-16 py-10">
        <div className="flex items-center gap-4">
          <ScissorsMark className="h-10 w-10 text-gold" />
          <span className="font-display text-3xl text-paper">{siteConfig.name}</span>
        </div>
        <div className="text-right">
          <p className="font-display text-4xl tabular-nums text-paper">{time}</p>
          <p className="mt-1 text-sm capitalize text-paper-dim">{day}</p>
        </div>
      </header>

      {!board.queueOpen ? (
        <div className="flex flex-1 flex-col items-center justify-center px-16 text-center">
          <h1 className="font-display text-5xl text-paper">Fila fechada no momento</h1>
          <p className="mt-4 text-xl text-paper-dim">
            Fale com a recepção para mais informações.
          </p>
        </div>
      ) : (
        <main className="flex-1 px-16 py-14">
          <section>
            <h2 className="text-sm font-medium uppercase tracking-[0.2em] text-paper-dim">
              Em atendimento
            </h2>
            <div className="mt-6 grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
              {board.barbers.map((barber) => (
                <div
                  key={barber.barberId}
                  className={
                    barber.current
                      ? "rounded-sm bg-ink-raised px-8 py-7"
                      : "rounded-sm border border-ink-line px-8 py-7"
                  }
                >
                  <div className="flex items-center gap-2">
                    <p className="text-sm uppercase tracking-[0.15em] text-paper-dim">
                      {barber.barberName}
                    </p>
                    {barber.current && (
                      <span className="relative flex h-2 w-2">
                        <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-gold opacity-75" />
                        <span className="relative inline-flex h-2 w-2 rounded-full bg-gold" />
                      </span>
                    )}
                  </div>
                  {barber.current ? (
                    <div className="mt-4">
                      <p className="font-display text-3xl leading-tight text-paper">
                        {barber.current.clientName}
                      </p>
                      <p className="mt-1.5 text-base text-gold">
                        {barber.current.serviceName}
                      </p>
                    </div>
                  ) : (
                    <p className="mt-4 font-display text-2xl text-paper-dim">Disponível</p>
                  )}
                </div>
              ))}
            </div>
          </section>

          <section className="mt-16">
            <h2 className="text-sm font-medium uppercase tracking-[0.2em] text-paper-dim">
              Próximos na fila
            </h2>
            {board.waiting.length === 0 ? (
              <p className="mt-6 text-xl text-paper-dim">
                Nenhum cliente esperando — a fila está livre.
              </p>
            ) : (
              <ul className="mt-6 divide-y divide-ink-line border-t border-ink-line">
                {board.waiting.map((item, index) => (
                  <li
                    key={item.entryId}
                    className="flex items-center gap-x-8 gap-y-1 py-5"
                  >
                    <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full border border-ink-line-strong font-display text-lg text-gold">
                      {index + 1}
                    </span>
                    <span className="flex-1 font-display text-2xl text-paper">
                      {item.clientName}
                    </span>
                    <span className="text-lg text-paper-dim">{item.serviceName}</span>
                    <span className="w-32 shrink-0 text-right text-lg text-gold">
                      {item.estimatedWaitMinutes !== null
                        ? `~${item.estimatedWaitMinutes} min`
                        : "—"}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </section>
        </main>
      )}
    </div>
  );
}
