import { getQueueStatusByPhone, leaveQueue } from "@/app/fila/actions";
import { AutoRefresh } from "@/components/AutoRefresh";

export default async function FilaStatusPage({
  searchParams,
}: {
  searchParams: Promise<{ phone?: string }>;
}) {
  const { phone } = await searchParams;

  if (!phone) {
    return (
      <div className="mx-auto max-w-sm px-6 py-24 text-center">
        <h1 className="font-display text-2xl text-paper">Acompanhar fila</h1>
        <form method="get" className="mt-8 space-y-3">
          <input
            type="tel"
            name="phone"
            placeholder="Telefone"
            required
            className="w-full rounded-sm border border-ink-line bg-transparent px-3 py-2.5 text-sm text-paper placeholder:text-paper-dim focus:border-gold"
          />
          <button
            type="submit"
            className="w-full rounded-sm bg-gold py-3 text-sm font-semibold text-gold-ink transition-colors hover:bg-gold-bright"
          >
            Consultar
          </button>
        </form>
      </div>
    );
  }

  const status = await getQueueStatusByPhone(phone);

  return (
    <div className="mx-auto max-w-sm px-6 py-24 text-center">
      <AutoRefresh intervalMs={4000} />
      <h1 className="font-display text-2xl text-paper">Acompanhar fila</h1>

      {status.state === "none" && (
        <p className="mt-6 text-paper-dim">
          Nenhuma entrada ativa na fila para esse telefone.
        </p>
      )}

      {status.state === "waiting" && (
        <div className="mt-6 space-y-2">
          <p className="text-paper">{status.serviceName}</p>
          <p className="text-paper-dim">{status.position} pessoa(s) na frente</p>
          {status.estimatedWaitMinutes !== null && (
            <p className="font-display text-3xl text-gold">
              ~{status.estimatedWaitMinutes} min
            </p>
          )}
          <form action={leaveQueue.bind(null, status.entryId)} className="pt-4">
            <button
              type="submit"
              className="text-sm text-danger transition-colors hover:text-danger"
            >
              Saí da fila
            </button>
          </form>
        </div>
      )}

      {status.state === "in_service" && (
        <div className="mt-6 space-y-2">
          <p className="text-paper">{status.serviceName}</p>
          <p className="text-gold">
            Você está sendo atendido{status.barberName ? ` por ${status.barberName}` : ""}.
          </p>
        </div>
      )}
    </div>
  );
}
