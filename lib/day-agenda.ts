export type AgendaStatus = "agendado" | "concluido" | "cancelado" | "faltou";
export type AgendaOrigin = "online" | "avulso" | "fila";

export type AgendaAppointment = {
  id: string;
  startsAt: Date;
  endsAt: Date;
  clientName: string;
  serviceName: string;
  serviceId: string;
  status: AgendaStatus;
  origin: AgendaOrigin;
};

export type AgendaSlot =
  | { type: "appointment"; time: Date; appointment: AgendaAppointment }
  | { type: "free"; time: Date };

export type WorkWindow = { start: Date; end: Date };

export function buildDayTimeline(params: {
  workWindows: WorkWindow[];
  appointments: AgendaAppointment[];
  slotIntervalMinutes?: number;
}): AgendaSlot[] {
  const { workWindows, appointments, slotIntervalMinutes = 15 } = params;
  const intervalMs = slotIntervalMinutes * 60_000;

  const appointmentSlots: AgendaSlot[] = appointments.map((appointment) => ({
    type: "appointment",
    time: appointment.startsAt,
    appointment,
  }));

  const freeSlots: AgendaSlot[] = [];
  for (const window of workWindows) {
    for (
      let tick = new Date(window.start);
      tick.getTime() < window.end.getTime();
      tick = new Date(tick.getTime() + intervalMs)
    ) {
      const covered = appointments.some(
        (a) => a.startsAt.getTime() <= tick.getTime() && a.endsAt.getTime() > tick.getTime()
      );
      if (!covered) freeSlots.push({ type: "free", time: new Date(tick) });
    }
  }

  return [...appointmentSlots, ...freeSlots].sort(
    (a, b) => a.time.getTime() - b.time.getTime()
  );
}
