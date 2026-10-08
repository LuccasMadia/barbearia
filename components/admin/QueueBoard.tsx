import { callNextForBarber, finishService } from "@/app/admin/fila/actions";
import type { QueueBoard as QueueBoardData } from "@/lib/queue-server";

function formatTime(date: Date) {
  return date.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });
}

export function QueueBoard({ board }: { board: QueueBoardData }) {
  return (
    <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
      {board.barbers.map((barber) => (
        <section key={barber.barberId} className="rounded-sm border border-ink-line p-4">
          <h2 className="text-xs uppercase tracking-[0.2em] text-paper-dim">
            {barber.barberName}
          </h2>

          {barber.current ? (
            <div className="mt-4">
              <p className="text-paper">{barber.current.clientName}</p>
              <p className="text-xs text-paper-dim">
                {barber.current.serviceName} · desde {formatTime(barber.current.startedAt)}
              </p>
              <form action={finishService.bind(null, barber.current.entryId)} className="mt-3">
                <button
                  type="submit"
                  className="rounded-sm border border-ink-line px-2 py-1 text-xs text-paper transition-colors hover:border-gold hover:text-gold"
                >
                  Finalizar atendimento
                </button>
              </form>
            </div>
          ) : (
            <form action={callNextForBarber.bind(null, barber.barberId)} className="mt-4">
              <button
                type="submit"
                className="block w-full rounded-sm border border-dashed border-ink-line px-3 py-2 text-left text-sm text-paper-dim transition-colors hover:border-gold hover:text-gold"
              >
                Chamar próximo
              </button>
            </form>
          )}
        </section>
      ))}
    </div>
  );
}
