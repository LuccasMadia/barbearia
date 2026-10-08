"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import {
  callNextForBarber as callNextForBarberServer,
  finishService as finishServiceServer,
  removeFromQueue as removeFromQueueServer,
  setQueueOpen as setQueueOpenServer,
} from "@/lib/queue-server";

async function requireAdmin(): Promise<void> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error("Unauthorized");
}

export async function callNextForBarber(barberId: string): Promise<void> {
  await requireAdmin();
  await callNextForBarberServer(createAdminClient(), barberId);
  revalidatePath("/admin/fila");
}

export async function finishService(entryId: string): Promise<void> {
  await requireAdmin();
  await finishServiceServer(createAdminClient(), entryId);
  revalidatePath("/admin/fila");
  revalidatePath("/admin");
}

export async function removeFromQueue(entryId: string): Promise<void> {
  await requireAdmin();
  await removeFromQueueServer(createAdminClient(), entryId);
  revalidatePath("/admin/fila");
}

export async function toggleQueueOpen(open: boolean): Promise<void> {
  await requireAdmin();
  await setQueueOpenServer(createAdminClient(), open);
  revalidatePath("/admin/fila");
  revalidatePath("/fila");
}
