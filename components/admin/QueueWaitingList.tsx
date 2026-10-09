import { removeFromQueue } from "@/app/admin/fila/actions";
import type { QueueBoard as QueueBoardData } from "@/lib/queue-server";

export function QueueWaitingList({ waiting }: { waiting: QueueBoardData["waiting"] }) {
  if (waiting.length === 0) {
    return <p className="mt-4 text-sm text-paper-dim">Nenhum cliente esperando.</p>;
  }

  return (
    // The row's fixed-width columns don't wrap on narrow screens; scroll
    // locally inside this box instead of pushing the whole admin page wide.
    <div className="mt-4 overflow-x-auto">
      <ul className="min-w-[560px] divide-y divide-ink-line border-t border-ink-line">
        {waiting.map((item, index) => (
          <li key={item.entryId} className="flex items-center gap-x-4 gap-y-1 py-3 text-sm">
            <span className="w-8 shrink-0 text-paper-dim">{index + 1}º</span>
            <span className="flex-1 text-paper">{item.clientName}</span>
            <span className="w-32 shrink-0 text-paper-dim">{item.serviceName}</span>
            <span className="w-28 shrink-0 text-paper-dim">
              {item.preferredBarberName ?? "Qualquer"}
            </span>
            <span className="w-20 shrink-0 text-gold">
              {item.estimatedWaitMinutes !== null ? `~${item.estimatedWaitMinutes} min` : "—"}
            </span>
            <form action={removeFromQueue.bind(null, item.entryId)}>
              <button
                type="submit"
                className="text-xs text-danger transition-colors hover:text-danger"
              >
                Remover
              </button>
            </form>
          </li>
        ))}
      </ul>
    </div>
  );
}
