import { createAdminClient } from "@/lib/supabase/admin";
import { getQueueBoard } from "@/lib/queue-server";
import { toggleQueueOpen } from "@/app/admin/fila/actions";
import { QueueBoard } from "@/components/admin/QueueBoard";
import { QueueWaitingList } from "@/components/admin/QueueWaitingList";
import { AutoRefresh } from "@/components/AutoRefresh";

export default async function AdminFilaPage() {
  const board = await getQueueBoard(createAdminClient());

  return (
    <div className="mx-auto max-w-6xl space-y-8">
      <AutoRefresh intervalMs={4000} />
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="font-display text-2xl text-paper">Fila</h1>
          <p className="mt-1 text-sm text-paper-dim">Atendimento por ordem de chegada.</p>
        </div>
        <form action={toggleQueueOpen.bind(null, !board.queueOpenManual)}>
          <button
            type="submit"
            className={`rounded-sm border px-3 py-2 text-sm transition-colors ${
              board.queueOpenManual
                ? "border-gold text-gold"
                : "border-ink-line text-paper-dim hover:text-paper"
            }`}
          >
            {board.queueOpenManual ? "Fila aberta" : "Fila fechada"} · clique para{" "}
            {board.queueOpenManual ? "fechar" : "abrir"}
          </button>
        </form>
      </div>

      {board.queueOpenManual && !board.queueOpen && (
        <p className="text-sm text-danger">
          Fechada automaticamente — fora do horário de atendimento.
        </p>
      )}

      <QueueBoard board={board} />

      <section>
        <h2 className="text-xs uppercase tracking-[0.2em] text-paper-dim">Aguardando</h2>
        <QueueWaitingList waiting={board.waiting} />
      </section>
    </div>
  );
}
