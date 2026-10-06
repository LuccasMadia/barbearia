"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import {
  resolveAndCreateAppointment,
  type CreateAppointmentResult,
} from "@/lib/appointments-server";

async function requireAdmin(): Promise<void> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error("Unauthorized");
}

export async function updateAppointmentStatus(
  appointmentId: string,
  status: "concluido" | "faltou" | "cancelado"
): Promise<void> {
  await requireAdmin();
  const supabase = await createClient();
  await supabase
    .from("appointments")
    .update({ status })
    .eq("id", appointmentId)
    .eq("status", "agendado");
  revalidatePath("/admin/agenda");
}

export type { CreateAppointmentResult };

export async function createWalkInAppointment(input: {
  serviceId: string;
  barberId: string;
  startsAtIso: string;
  name: string;
  phone: string;
}): Promise<CreateAppointmentResult> {
  await requireAdmin();
  const result = await resolveAndCreateAppointment({ ...input, origin: "avulso" });
  if (result.success) revalidatePath("/admin/agenda");
  return result;
}
