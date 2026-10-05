"use server";

import { createAdminClient } from "@/lib/supabase/admin";
import { getAvailableSlots as calculateAvailableSlots } from "@/lib/slots";
import { normalizePhone } from "@/lib/phone";

const SLOT_INTERVAL_MINUTES = 15;

type AdminClient = ReturnType<typeof createAdminClient>;

async function getCandidateBarberIds(
  admin: AdminClient,
  barberId: string
): Promise<string[]> {
  if (barberId !== "any") return [barberId];
  const { data } = await admin.from("barbers").select("id").eq("active", true);
  return (data ?? []).map((b) => b.id);
}

async function computeBarberSlots(
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

export async function getAvailableSlots(input: {
  serviceId: string;
  barberId: string;
  date: string;
}): Promise<{ time: string }[]> {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(input.date)) return [];

  const admin = createAdminClient();

  const { data: service } = await admin
    .from("services")
    .select("duration_minutes")
    .eq("id", input.serviceId)
    .eq("active", true)
    .maybeSingle();

  if (!service) return [];

  const barberIds = await getCandidateBarberIds(admin, input.barberId);
  const slotSets = await Promise.all(
    barberIds.map((id) => computeBarberSlots(admin, id, input.date, service.duration_minutes))
  );

  const uniqueTimes = new Set<string>();
  for (const slots of slotSets) {
    for (const slot of slots) uniqueTimes.add(slot.toISOString());
  }

  return Array.from(uniqueTimes)
    .sort()
    .map((time) => ({ time }));
}

export type CreateAppointmentResult =
  | { success: true; summary: { serviceName: string; barberName: string; startsAt: string } }
  | { success: false; error: string };

export async function createAppointment(input: {
  serviceId: string;
  barberId: string;
  startsAtIso: string;
  name: string;
  phone: string;
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

  const normalizedPhone = normalizePhone(input.phone);

  const { data: existingClient } = await admin
    .from("clients")
    .select("id, name")
    .eq("phone", normalizedPhone)
    .maybeSingle();

  let clientId: string;
  if (existingClient) {
    clientId = existingClient.id;
    if (existingClient.name !== input.name) {
      await admin.from("clients").update({ name: input.name }).eq("id", clientId);
    }
  } else {
    const { data: newClient, error: clientError } = await admin
      .from("clients")
      .insert({ name: input.name, phone: normalizedPhone })
      .select("id")
      .single();

    if (clientError || !newClient) {
      return { success: false, error: "Não foi possível salvar seus dados. Tente novamente." };
    }
    clientId = newClient.id;
  }

  const { error: appointmentError } = await admin.from("appointments").insert({
    client_id: clientId,
    barber_id: chosenBarberId,
    service_id: input.serviceId,
    starts_at: startsAt.toISOString(),
    ends_at: endsAt.toISOString(),
    status: "agendado",
    origin: "online",
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
