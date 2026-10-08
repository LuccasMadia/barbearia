import { createAdminClient, type AdminClient } from "@/lib/supabase/admin";
import { getAvailableSlots as calculateAvailableSlots } from "@/lib/slots";
import { upsertClientByPhone } from "@/lib/clients-server";

export const SLOT_INTERVAL_MINUTES = 15;

export async function getCandidateBarberIds(
  admin: AdminClient,
  barberId: string
): Promise<string[]> {
  if (barberId !== "any") return [barberId];
  const { data } = await admin.from("barbers").select("id").eq("active", true);
  return (data ?? []).map((b) => b.id);
}

export async function computeBarberSlots(
  admin: AdminClient,
  barberId: string,
  date: string,
  durationMinutes: number
): Promise<Date[]> {
  const dayStart = new Date(`${date}T00:00:00`);
  const dayEnd = new Date(`${date}T23:59:59.999`);

  const [{ data: rules }, { data: timeOff }, { data: appointments }] = await Promise.all([
    admin
      .from("barber_schedules")
      .select("weekday, start_time, end_time")
      .eq("barber_id", barberId)
      .eq("weekday", dayStart.getDay()),
    admin
      .from("barber_time_off")
      .select("start_at, end_at")
      .eq("barber_id", barberId)
      .lte("start_at", dayEnd.toISOString())
      .gte("end_at", dayStart.toISOString()),
    admin
      .from("appointments")
      .select("starts_at, ends_at")
      .eq("barber_id", barberId)
      .eq("status", "agendado")
      .gte("starts_at", dayStart.toISOString())
      .lte("starts_at", dayEnd.toISOString()),
  ]);

  return calculateAvailableSlots({
    date: dayStart,
    serviceDurationMinutes: durationMinutes,
    scheduleRules: (rules ?? []).map((r) => ({
      weekday: r.weekday,
      startTime: r.start_time,
      endTime: r.end_time,
    })),
    timeOff: (timeOff ?? []).map((t) => ({
      startAt: new Date(t.start_at),
      endAt: new Date(t.end_at),
    })),
    bookedAppointments: (appointments ?? []).map((a) => ({
      startAt: new Date(a.starts_at),
      endAt: new Date(a.ends_at),
    })),
    slotIntervalMinutes: SLOT_INTERVAL_MINUTES,
  });
}

export type CreateAppointmentResult =
  | { success: true; summary: { serviceName: string; barberName: string; startsAt: string } }
  | { success: false; error: string };

export async function resolveAndCreateAppointment(input: {
  serviceId: string;
  barberId: string;
  startsAtIso: string;
  name: string;
  phone: string;
  origin: "online" | "avulso";
}): Promise<CreateAppointmentResult> {
  const admin = createAdminClient();

  const { data: service } = await admin
    .from("services")
    .select("name, duration_minutes")
    .eq("id", input.serviceId)
    .eq("active", true)
    .maybeSingle();

  if (!service) {
    return { success: false, error: "Serviço inválido." };
  }

  const startsAt = new Date(input.startsAtIso);
  const endsAt = new Date(startsAt.getTime() + service.duration_minutes * 60_000);
  const date = input.startsAtIso.slice(0, 10);

  const candidateBarberIds = await getCandidateBarberIds(admin, input.barberId);

  let chosenBarberId: string | null = null;
  for (const barberId of candidateBarberIds) {
    const slots = await computeBarberSlots(admin, barberId, date, service.duration_minutes);
    if (slots.some((slot) => slot.toISOString() === startsAt.toISOString())) {
      chosenBarberId = barberId;
      break;
    }
  }

  if (!chosenBarberId) {
    return {
      success: false,
      error: "Esse horário não está mais disponível. Escolha outro horário.",
    };
  }

  let clientId: string;
  try {
    clientId = await upsertClientByPhone(admin, { name: input.name, phone: input.phone });
  } catch {
    return { success: false, error: "Não foi possível salvar seus dados. Tente novamente." };
  }

  const { error: appointmentError } = await admin.from("appointments").insert({
    client_id: clientId,
    barber_id: chosenBarberId,
    service_id: input.serviceId,
    starts_at: startsAt.toISOString(),
    ends_at: endsAt.toISOString(),
    status: "agendado",
    origin: input.origin,
  });

  if (appointmentError) {
    if (appointmentError.code === "23P01") {
      return {
        success: false,
        error: "Esse horário acabou de ser reservado por outra pessoa. Escolha outro horário.",
      };
    }
    return { success: false, error: "Não foi possível criar o agendamento. Tente novamente." };
  }

  const { data: barber } = await admin
    .from("barbers")
    .select("name")
    .eq("id", chosenBarberId)
    .single();

  return {
    success: true,
    summary: {
      serviceName: service.name,
      barberName: barber?.name ?? "Equipe",
      startsAt: startsAt.toISOString(),
    },
  };
}
