import { createClient } from "@/lib/supabase/server";
import {
  buildDayTimeline,
  type AgendaAppointment,
  type AgendaSlot,
  type AgendaStatus,
  type AgendaOrigin,
} from "@/lib/day-agenda";
import { timeStringToDate } from "@/lib/slots";
import { periodRange, enumerateDays, type Period } from "@/lib/period";

export type BreakdownRow = { name: string; count: number; revenueCents: number };

export type UpcomingAppointment = {
  id: string;
  startsAt: string;
  clientName: string;
  barberName: string;
  serviceName: string;
  origin: string;
};

export type DaySummary = { date: string; revenueCents: number };

export type PeriodSummary = {
  revenueCents: number;
  appointmentCount: number;
  completedCount: number;
  byService: BreakdownRow[];
  byBarber: BreakdownRow[];
  byDay: DaySummary[];
};

export async function getPeriodSummary(period: Period): Promise<PeriodSummary> {
  const supabase = await createClient();
  const { start, end } = periodRange(period, new Date());

  const [{ data: appointments }, { data: services }, { data: barbers }] =
    await Promise.all([
      supabase
        .from("appointments")
        .select("status, service_id, barber_id, starts_at")
        .gte("starts_at", start.toISOString())
        .lt("starts_at", end.toISOString()),
      supabase.from("services").select("id, name, price_cents"),
      supabase.from("barbers").select("id, name"),
    ]);

  const serviceById = new Map((services ?? []).map((s) => [s.id, s]));
  const barberById = new Map((barbers ?? []).map((b) => [b.id, b]));

  const byServiceMap = new Map<string, BreakdownRow>();
  const byBarberMap = new Map<string, BreakdownRow>();
  const byDayMap = new Map<string, number>(
    enumerateDays({ start, end }).map((d) => [toDateKey(d), 0])
  );
  let revenueCents = 0;
  let completedCount = 0;

  for (const appt of appointments ?? []) {
    if (appt.status !== "concluido") continue;
    completedCount += 1;

    const service = serviceById.get(appt.service_id);
    const barber = barberById.get(appt.barber_id);
    const priceCents = service?.price_cents ?? 0;
    revenueCents += priceCents;

    const dayKey = toDateKey(new Date(appt.starts_at));
    byDayMap.set(dayKey, (byDayMap.get(dayKey) ?? 0) + priceCents);

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
    byDay: Array.from(byDayMap.entries())
      .sort((a, b) => a[0].localeCompare(b[0]))
      .map(([date, dayRevenueCents]) => ({ date, revenueCents: dayRevenueCents })),
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

export type BarberDayColumn = {
  barberId: string;
  barberName: string;
  hasScheduleToday: boolean;
  slots: AgendaSlot[];
};

export type DayAgenda = {
  date: string;
  barbers: BarberDayColumn[];
};

export async function getDayAgenda(date: string): Promise<DayAgenda> {
  const supabase = await createClient();
  const dayStart = new Date(`${date}T00:00:00`);
  const dayEnd = new Date(`${date}T23:59:59.999`);
  const weekday = dayStart.getDay();

  const [{ data: barbers }, { data: schedules }, { data: appointments }, { data: services }, { data: clients }] =
    await Promise.all([
      supabase.from("barbers").select("id, name").eq("active", true).order("name"),
      supabase
        .from("barber_schedules")
        .select("barber_id, start_time, end_time")
        .eq("weekday", weekday),
      supabase
        .from("appointments")
        .select("id, barber_id, service_id, client_id, starts_at, ends_at, status, origin")
        .gte("starts_at", dayStart.toISOString())
        .lte("starts_at", dayEnd.toISOString()),
      supabase.from("services").select("id, name"),
      supabase.from("clients").select("id, name"),
    ]);

  const serviceByIdForAgenda = new Map((services ?? []).map((s) => [s.id, s.name]));
  const clientById = new Map((clients ?? []).map((c) => [c.id, c.name]));

  const windowsByBarber = new Map<string, { start: Date; end: Date }[]>();
  for (const rule of schedules ?? []) {
    const list = windowsByBarber.get(rule.barber_id) ?? [];
    list.push({
      start: timeStringToDate(dayStart, rule.start_time),
      end: timeStringToDate(dayStart, rule.end_time),
    });
    windowsByBarber.set(rule.barber_id, list);
  }

  const appointmentsByBarber = new Map<string, AgendaAppointment[]>();
  for (const appt of appointments ?? []) {
    const list = appointmentsByBarber.get(appt.barber_id) ?? [];
    list.push({
      id: appt.id,
      startsAt: new Date(appt.starts_at),
      endsAt: new Date(appt.ends_at),
      clientName: clientById.get(appt.client_id) ?? "—",
      serviceName: serviceByIdForAgenda.get(appt.service_id) ?? "—",
      serviceId: appt.service_id,
      status: appt.status as AgendaStatus,
      origin: appt.origin as AgendaOrigin,
    });
    appointmentsByBarber.set(appt.barber_id, list);
  }

  return {
    date,
    barbers: (barbers ?? []).map((barber) => {
      const windows = windowsByBarber.get(barber.id) ?? [];
      return {
        barberId: barber.id,
        barberName: barber.name,
        hasScheduleToday: windows.length > 0,
        slots: buildDayTimeline({
          workWindows: windows,
          appointments: appointmentsByBarber.get(barber.id) ?? [],
        }),
      };
    }),
  };
}

function toDateKey(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

export async function getMonthAgendaSummary(month: string): Promise<Record<string, number>> {
  const [year, monthNumber] = month.split("-").map(Number);
  const monthStart = new Date(year, monthNumber - 1, 1);
  const monthEnd = new Date(year, monthNumber, 1);

  const supabase = await createClient();
  const { data: appointments } = await supabase
    .from("appointments")
    .select("starts_at")
    .gte("starts_at", monthStart.toISOString())
    .lt("starts_at", monthEnd.toISOString());

  const summary: Record<string, number> = {};
  for (const appt of appointments ?? []) {
    const key = toDateKey(new Date(appt.starts_at));
    summary[key] = (summary[key] ?? 0) + 1;
  }
  return summary;
}
