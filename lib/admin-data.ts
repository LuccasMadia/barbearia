import { createClient } from "@/lib/supabase/server";

type BreakdownRow = { name: string; count: number; revenueCents: number };

export type MonthSummary = {
  revenueCents: number;
  appointmentCount: number;
  completedCount: number;
  byService: BreakdownRow[];
  byBarber: BreakdownRow[];
};

export type UpcomingAppointment = {
  id: string;
  startsAt: string;
  clientName: string;
  barberName: string;
  serviceName: string;
  origin: string;
};

function startOfMonth(date: Date) {
  return new Date(date.getFullYear(), date.getMonth(), 1);
}

export async function getMonthSummary(): Promise<MonthSummary> {
  const supabase = await createClient();
  const now = new Date();
  const monthStart = startOfMonth(now);

  const [{ data: appointments }, { data: services }, { data: barbers }] =
    await Promise.all([
      supabase
        .from("appointments")
        .select("status, service_id, barber_id")
        .gte("starts_at", monthStart.toISOString()),
      supabase.from("services").select("id, name, price_cents"),
      supabase.from("barbers").select("id, name"),
    ]);

  const serviceById = new Map((services ?? []).map((s) => [s.id, s]));
  const barberById = new Map((barbers ?? []).map((b) => [b.id, b]));

  const byServiceMap = new Map<string, BreakdownRow>();
  const byBarberMap = new Map<string, BreakdownRow>();
  let revenueCents = 0;
  let completedCount = 0;

  for (const appt of appointments ?? []) {
    if (appt.status !== "concluido") continue;
    completedCount += 1;

    const service = serviceById.get(appt.service_id);
    const barber = barberById.get(appt.barber_id);
    const priceCents = service?.price_cents ?? 0;
    revenueCents += priceCents;

    if (service) {
      const row = byServiceMap.get(service.id) ?? {
        name: service.name,
        count: 0,
        revenueCents: 0,
      };
      row.count += 1;
      row.revenueCents += priceCents;
      byServiceMap.set(service.id, row);
    }

    if (barber) {
      const row = byBarberMap.get(barber.id) ?? {
        name: barber.name,
        count: 0,
        revenueCents: 0,
      };
      row.count += 1;
      row.revenueCents += priceCents;
      byBarberMap.set(barber.id, row);
    }
  }

  return {
    revenueCents,
    appointmentCount: (appointments ?? []).length,
    completedCount,
    byService: Array.from(byServiceMap.values()).sort(
      (a, b) => b.revenueCents - a.revenueCents
    ),
    byBarber: Array.from(byBarberMap.values()).sort(
      (a, b) => b.revenueCents - a.revenueCents
    ),
  };
}

export async function getUpcomingAppointments(
  limit = 10
): Promise<UpcomingAppointment[]> {
  const supabase = await createClient();

  const { data: appointments } = await supabase
    .from("appointments")
    .select("id, starts_at, origin, client_id, barber_id, service_id")
    .eq("status", "agendado")
    .gte("starts_at", new Date().toISOString())
    .order("starts_at", { ascending: true })
    .limit(limit);

  if (!appointments || appointments.length === 0) return [];

  const clientIds = [...new Set(appointments.map((a) => a.client_id))];
  const barberIds = [...new Set(appointments.map((a) => a.barber_id))];
  const serviceIds = [...new Set(appointments.map((a) => a.service_id))];

  const [{ data: clients }, { data: barbers }, { data: services }] =
    await Promise.all([
      supabase.from("clients").select("id, name").in("id", clientIds),
      supabase.from("barbers").select("id, name").in("id", barberIds),
      supabase.from("services").select("id, name").in("id", serviceIds),
    ]);

  const clientById = new Map((clients ?? []).map((c) => [c.id, c.name]));
  const barberById = new Map((barbers ?? []).map((b) => [b.id, b.name]));
  const serviceById = new Map((services ?? []).map((s) => [s.id, s.name]));

  return appointments.map((a) => ({
    id: a.id,
    startsAt: a.starts_at,
    clientName: clientById.get(a.client_id) ?? "—",
    barberName: barberById.get(a.barber_id) ?? "—",
    serviceName: serviceById.get(a.service_id) ?? "—",
    origin: a.origin,
  }));
}
