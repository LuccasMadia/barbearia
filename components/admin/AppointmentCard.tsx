import { updateAppointmentStatus } from "@/app/admin/agenda/actions";
import type { AgendaAppointment } from "@/lib/day-agenda";

const STATUS_LABEL: Record<AgendaAppointment["status"], string> = {
  agendado: "Agendado",
  concluido: "Concluído",
  faltou: "Faltou",
  cancelado: "Cancelado",
};

function formatTime(date: Date): string {
  return date.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });
}

export function AppointmentCard({ appointment }: { appointment: AgendaAppointment }) {
  return (
    <div className="rounded-sm border border-ink-line bg-ink-raised px-3 py-2.5 text-sm">
      <div className="flex items-center justify-between">
        <span className="text-paper">{formatTime(appointment.startsAt)}</span>
        {appointment.origin === "avulso" && (
          <span className="text-xs uppercase tracking-[0.1em] text-paper-dim">
            Avulso
          </span>
        )}
      </div>
      <p className="mt-1 text-paper">{appointment.clientName}</p>
      <p className="text-xs text-paper-dim">{appointment.serviceName}</p>

      {appointment.status === "agendado" ? (
        <div className="mt-2.5 flex gap-2">
          <form action={updateAppointmentStatus.bind(null, appointment.id, "concluido")}>
            <button
              type="submit"
              className="rounded-sm border border-ink-line px-2 py-1 text-xs text-paper transition-colors hover:border-gold hover:text-gold"
            >
              ✓ Concluído
            </button>
          </form>
          <form action={updateAppointmentStatus.bind(null, appointment.id, "faltou")}>
            <button
              type="submit"
              className="rounded-sm border border-ink-line px-2 py-1 text-xs text-paper transition-colors hover:border-ink-line-strong"
            >
              ✗ Faltou
            </button>
          </form>
          <form action={updateAppointmentStatus.bind(null, appointment.id, "cancelado")}>
            <button
              type="submit"
              className="rounded-sm border border-ink-line px-2 py-1 text-xs text-danger transition-colors hover:border-danger"
            >
              ✕ Cancelar
            </button>
          </form>
        </div>
      ) : (
        <p className="mt-2.5 text-xs text-paper-dim">{STATUS_LABEL[appointment.status]}</p>
      )}
    </div>
  );
}
