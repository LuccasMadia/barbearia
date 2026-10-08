"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";

async function requireAdmin() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error("Unauthorized");
  return supabase;
}

function revalidateAll(): void {
  revalidatePath("/admin/configuracoes");
  revalidatePath("/");
  revalidatePath("/agendar");
  revalidatePath("/fila");
  revalidatePath("/fila/tv");
}

export type ActionResult = { success: true } | { success: false; error: string };

export async function updateSiteIdentity(input: {
  name: string;
  about: string;
}): Promise<ActionResult> {
  const supabase = await requireAdmin();
  const { data: siteConfig } = await supabase
    .from("site_config")
    .select("id")
    .limit(1)
    .maybeSingle();

  if (!siteConfig) return { success: false, error: "Configuração não encontrada." };

  const { error } = await supabase
    .from("site_config")
    .update({ name: input.name, about: input.about || null })
    .eq("id", siteConfig.id);

  if (error) return { success: false, error: "Não foi possível salvar." };
  revalidateAll();
  return { success: true };
}

export async function createBarber(name: string): Promise<ActionResult> {
  const supabase = await requireAdmin();
  const { error } = await supabase.from("barbers").insert({ name });
  if (error) return { success: false, error: "Não foi possível criar o barbeiro." };
  revalidateAll();
  return { success: true };
}

export async function updateBarberName(barberId: string, name: string): Promise<ActionResult> {
  const supabase = await requireAdmin();
  const { error } = await supabase.from("barbers").update({ name }).eq("id", barberId);
  if (error) return { success: false, error: "Não foi possível atualizar o barbeiro." };
  revalidateAll();
  return { success: true };
}

export async function setBarberActive(barberId: string, active: boolean): Promise<void> {
  const supabase = await requireAdmin();
  await supabase.from("barbers").update({ active }).eq("id", barberId);
  revalidateAll();
}

export async function createService(input: {
  name: string;
  durationMinutes: number;
  priceCents: number;
}): Promise<ActionResult> {
  const supabase = await requireAdmin();
  const { error } = await supabase.from("services").insert({
    name: input.name,
    duration_minutes: input.durationMinutes,
    price_cents: input.priceCents,
  });
  if (error) return { success: false, error: "Não foi possível criar o serviço." };
  revalidateAll();
  return { success: true };
}

export async function updateService(
  serviceId: string,
  input: { name: string; durationMinutes: number; priceCents: number }
): Promise<ActionResult> {
  const supabase = await requireAdmin();
  const { error } = await supabase
    .from("services")
    .update({
      name: input.name,
      duration_minutes: input.durationMinutes,
      price_cents: input.priceCents,
    })
    .eq("id", serviceId);
  if (error) return { success: false, error: "Não foi possível atualizar o serviço." };
  revalidateAll();
  return { success: true };
}

export async function setServiceActive(serviceId: string, active: boolean): Promise<void> {
  const supabase = await requireAdmin();
  await supabase.from("services").update({ active }).eq("id", serviceId);
  revalidateAll();
}

export type BarberScheduleDay = {
  weekday: number;
  closed: boolean;
  start: string;
  end: string;
  hasBreak: boolean;
  breakStart: string;
  breakEnd: string;
};

export async function saveBarberSchedule(
  barberId: string,
  days: BarberScheduleDay[]
): Promise<ActionResult> {
  const supabase = await requireAdmin();

  for (const day of days) {
    const { error: deleteError } = await supabase
      .from("barber_schedules")
      .delete()
      .eq("barber_id", barberId)
      .eq("weekday", day.weekday);
    if (deleteError) return { success: false, error: "Não foi possível salvar o horário." };

    if (day.closed) continue;

    const rows = day.hasBreak
      ? [
          { barber_id: barberId, weekday: day.weekday, start_time: day.start, end_time: day.breakStart },
          { barber_id: barberId, weekday: day.weekday, start_time: day.breakEnd, end_time: day.end },
        ]
      : [{ barber_id: barberId, weekday: day.weekday, start_time: day.start, end_time: day.end }];

    const { error: insertError } = await supabase.from("barber_schedules").insert(rows);
    if (insertError) return { success: false, error: "Não foi possível salvar o horário." };
  }

  revalidateAll();
  return { success: true };
}
