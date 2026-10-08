import type { AdminClient } from "@/lib/supabase/admin";
import { upsertClientByPhone } from "@/lib/clients-server";
import { normalizePhone } from "@/lib/phone";
import { estimateWaitMinutes, type QueueBarberState, type QueueWaitEntry } from "@/lib/queue-wait";
import { isAnyBarberOnShiftNow, isQueueEffectivelyOpen, type ScheduleWindow } from "@/lib/business-hours";

type WaitingRow = QueueWaitEntry & {
  createdAt: Date;
  clientId: string;
  serviceId: string;
};

export type QueueBoardBarberColumn = {
  barberId: string;
  barberName: string;
  current: {
    entryId: string;
    clientName: string;
    serviceName: string;
    startedAt: Date;
  } | null;
};

export type QueueBoardWaitingItem = {
  entryId: string;
  clientName: string;
  serviceName: string;
  preferredBarberName: string | null;
  estimatedWaitMinutes: number | null;
};

export type QueueBoard = {
  /** Manual toggle plus at least one active barber on shift right now. */
  queueOpen: boolean;
  /** Raw value of the manual toggle, regardless of schedule. */
  queueOpenManual: boolean;
  barbers: QueueBoardBarberColumn[];
  waiting: QueueBoardWaitingItem[];
};

export async function getQueueBoard(admin: AdminClient): Promise<QueueBoard> {
  const now = new Date();

  const [
    { data: siteConfig },
    { data: barbers },
    { data: inService },
    { data: waitingRows },
    { data: services },
    { data: clients },
    { data: scheduleRows },
  ] = await Promise.all([
    admin.from("site_config").select("queue_open").limit(1).maybeSingle(),
    admin.from("barbers").select("id, name").eq("active", true).order("name"),
    admin
      .from("queue_entries")
      .select("id, barber_id, client_id, service_id, started_at")
      .eq("status", "em_atendimento"),
    admin
      .from("queue_entries")
      .select("id, barber_id, client_id, service_id, created_at")
      .eq("status", "aguardando")
      .order("created_at", { ascending: true }),
    admin.from("services").select("id, name, duration_minutes"),
    admin.from("clients").select("id, name"),
    admin.from("barber_schedules").select("barber_id, weekday, start_time, end_time"),
  ]);

  const serviceById = new Map((services ?? []).map((s) => [s.id, s]));
  const clientNameById = new Map((clients ?? []).map((c) => [c.id, c.name]));
  const barberNameById = new Map((barbers ?? []).map((b) => [b.id, b.name]));
  const inServiceByBarber = new Map(
    (inService ?? []).map((row) => [row.barber_id as string, row])
  );

  const activeBarberIds = new Set((barbers ?? []).map((b) => b.id));
  const scheduleWindows: ScheduleWindow[] = (scheduleRows ?? [])
    .filter((row) => activeBarberIds.has(row.barber_id))
    .map((row) => ({ weekday: row.weekday, startTime: row.start_time, endTime: row.end_time }));
  const queueOpenManual = siteConfig?.queue_open ?? false;
  const queueOpen = queueOpenManual && isAnyBarberOnShiftNow(scheduleWindows, now.getDay(), now);

  const barberStates: QueueBarberState[] = (barbers ?? []).map((b) => {
    const current = inServiceByBarber.get(b.id);
    if (!current || !current.started_at) return { barberId: b.id, freeAt: now };

    const duration = serviceById.get(current.service_id)?.duration_minutes ?? 0;
    const freeAt = new Date(new Date(current.started_at).getTime() + duration * 60_000);
    return { barberId: b.id, freeAt: freeAt > now ? freeAt : now };
  });

  const waitingRowsMapped: WaitingRow[] = (waitingRows ?? []).map((row) => ({
    entryId: row.id,
    barberId: row.barber_id,
    durationMinutes: serviceById.get(row.service_id)?.duration_minutes ?? 0,
    createdAt: new Date(row.created_at),
    clientId: row.client_id,
    serviceId: row.service_id,
  }));

  const waiting: QueueBoardWaitingItem[] = waitingRowsMapped.map((entry, index) => ({
    entryId: entry.entryId,
    clientName: clientNameById.get(entry.clientId) ?? "—",
    serviceName: serviceById.get(entry.serviceId)?.name ?? "—",
    preferredBarberName: entry.barberId ? barberNameById.get(entry.barberId) ?? null : null,
    estimatedWaitMinutes: estimateWaitMinutes({
      now,
      barbers: barberStates,
      waitingAhead: waitingRowsMapped.slice(0, index),
      target: entry,
    }),
  }));

  return {
    queueOpen,
    queueOpenManual,
    barbers: (barbers ?? []).map((b) => {
      const current = inServiceByBarber.get(b.id);
      return {
        barberId: b.id,
        barberName: b.name,
        current:
          current && current.started_at
            ? {
                entryId: current.id,
                clientName: clientNameById.get(current.client_id) ?? "—",
                serviceName: serviceById.get(current.service_id)?.name ?? "—",
                startedAt: new Date(current.started_at),
              }
            : null,
      };
    }),
    waiting,
  };
}

export type QueueStatus =
  | { state: "none" }
  | {
      state: "waiting";
      entryId: string;
      serviceName: string;
      position: number;
      estimatedWaitMinutes: number | null;
    }
  | {
      state: "in_service";
      entryId: string;
      serviceName: string;
      barberName: string | null;
    };

export async function getQueueStatusByPhone(
  admin: AdminClient,
  phone: string
): Promise<QueueStatus> {
  const normalizedPhone = normalizePhone(phone);

  const { data: client } = await admin
    .from("clients")
    .select("id")
    .eq("phone", normalizedPhone)
    .maybeSingle();

  if (!client) return { state: "none" };

  const { data: entry } = await admin
    .from("queue_entries")
    .select("id, status, service_id, barber_id")
    .eq("client_id", client.id)
    .in("status", ["aguardando", "em_atendimento"])
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (!entry) return { state: "none" };

  const { data: service } = await admin
    .from("services")
    .select("name")
    .eq("id", entry.service_id)
    .maybeSingle();

  if (entry.status === "em_atendimento") {
    const barberResult = entry.barber_id
      ? await admin.from("barbers").select("name").eq("id", entry.barber_id).maybeSingle()
      : { data: null };

    return {
      state: "in_service",
      entryId: entry.id,
      serviceName: service?.name ?? "—",
      barberName: barberResult.data?.name ?? null,
    };
  }

  const board = await getQueueBoard(admin);
  const index = board.waiting.findIndex((w) => w.entryId === entry.id);

  return {
    state: "waiting",
    entryId: entry.id,
    serviceName: service?.name ?? "—",
    position: index === -1 ? 0 : index,
    estimatedWaitMinutes: index === -1 ? null : board.waiting[index].estimatedWaitMinutes,
  };
}

export type JoinQueueResult =
  | { success: true; entryId: string }
  | { success: false; error: string };

export async function joinQueue(
  admin: AdminClient,
  input: { serviceId: string; barberId: string; name: string; phone: string }
): Promise<JoinQueueResult> {
  const effectivelyOpen = await isQueueEffectivelyOpen(admin);
  if (!effectivelyOpen) {
    return { success: false, error: "A fila está fechada no momento." };
  }

  const { data: service } = await admin
    .from("services")
    .select("id")
    .eq("id", input.serviceId)
    .eq("active", true)
    .maybeSingle();

  if (!service) {
    return { success: false, error: "Serviço inválido." };
  }

  let clientId: string;
  try {
    clientId = await upsertClientByPhone(admin, { name: input.name, phone: input.phone });
  } catch {
    return { success: false, error: "Não foi possível salvar seus dados. Tente novamente." };
  }

  const { data: entry, error } = await admin
    .from("queue_entries")
    .insert({
      client_id: clientId,
      service_id: input.serviceId,
      barber_id: input.barberId === "any" ? null : input.barberId,
      status: "aguardando",
    })
    .select("id")
    .single();

  if (error || !entry) {
    return { success: false, error: "Não foi possível entrar na fila. Tente novamente." };
  }

  return { success: true, entryId: entry.id };
}

export async function leaveQueue(admin: AdminClient, entryId: string): Promise<void> {
  await admin
    .from("queue_entries")
    .update({ status: "cancelado" })
    .eq("id", entryId)
    .eq("status", "aguardando");
}

export async function callNextForBarber(
  admin: AdminClient,
  barberId: string
): Promise<{ success: true } | { success: false; error: string }> {
  const { data: candidates } = await admin
    .from("queue_entries")
    .select("id")
    .eq("status", "aguardando")
    .or(`barber_id.is.null,barber_id.eq.${barberId}`)
    .order("created_at", { ascending: true })
    .limit(1);

  const next = candidates?.[0];
  if (!next) {
    return { success: false, error: "Nenhum cliente aguardando para este barbeiro." };
  }

  await admin
    .from("queue_entries")
    .update({
      status: "em_atendimento",
      started_at: new Date().toISOString(),
      barber_id: barberId,
    })
    .eq("id", next.id)
    .eq("status", "aguardando");

  return { success: true };
}

export async function finishService(admin: AdminClient, entryId: string): Promise<void> {
  const { data: entry } = await admin
    .from("queue_entries")
    .select("client_id, barber_id, service_id, started_at")
    .eq("id", entryId)
    .eq("status", "em_atendimento")
    .maybeSingle();

  if (!entry || !entry.barber_id || !entry.started_at) return;

  const startedAt = new Date(entry.started_at);
  const now = new Date();
  const finishedAt = now > startedAt ? now : new Date(startedAt.getTime() + 1000);

  const { data: claimed } = await admin
    .from("queue_entries")
    .update({ status: "concluido", finished_at: finishedAt.toISOString() })
    .eq("id", entryId)
    .eq("status", "em_atendimento")
    .select("id");

  if (!claimed || claimed.length === 0) return;

  const { error: appointmentError } = await admin.from("appointments").insert({
    client_id: entry.client_id,
    barber_id: entry.barber_id,
    service_id: entry.service_id,
    starts_at: startedAt.toISOString(),
    ends_at: finishedAt.toISOString(),
    status: "concluido",
    origin: "fila",
  });

  if (appointmentError) {
    await admin
      .from("queue_entries")
      .update({ status: "em_atendimento", finished_at: null })
      .eq("id", entryId);
  }
}

export async function removeFromQueue(admin: AdminClient, entryId: string): Promise<void> {
  await admin
    .from("queue_entries")
    .update({ status: "cancelado" })
    .eq("id", entryId)
    .eq("status", "aguardando");
}

export async function setQueueOpen(admin: AdminClient, open: boolean): Promise<void> {
  const { data: siteConfig } = await admin
    .from("site_config")
    .select("id")
    .limit(1)
    .maybeSingle();

  if (!siteConfig) return;

  await admin.from("site_config").update({ queue_open: open }).eq("id", siteConfig.id);
}
