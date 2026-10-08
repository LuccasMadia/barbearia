"use server";

import { createAdminClient } from "@/lib/supabase/admin";
import { getClientByPhone } from "@/lib/clients-server";
import {
  computeBarberSlots,
  getCandidateBarberIds,
  resolveAndCreateAppointment,
  type CreateAppointmentResult,
} from "@/lib/appointments-server";

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

export type { CreateAppointmentResult };

export async function createAppointment(input: {
  serviceId: string;
  barberId: string;
  startsAtIso: string;
  name: string;
  phone: string;
}): Promise<CreateAppointmentResult> {
  return resolveAndCreateAppointment({ ...input, origin: "online" });
}

export async function lookupClientByPhone(phone: string): Promise<{ name: string } | null> {
  return getClientByPhone(createAdminClient(), phone);
}
