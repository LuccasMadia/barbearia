import type { AdminClient } from "@/lib/supabase/admin";
import { normalizePhone } from "@/lib/phone";

export async function getClientByPhone(
  admin: AdminClient,
  phone: string
): Promise<{ name: string } | null> {
  const { data } = await admin
    .from("clients")
    .select("name")
    .eq("phone", normalizePhone(phone))
    .maybeSingle();

  return data ? { name: data.name } : null;
}

export async function upsertClientByPhone(
  admin: AdminClient,
  input: { name: string; phone: string }
): Promise<string> {
  const normalizedPhone = normalizePhone(input.phone);

  const { data: existingClient } = await admin
    .from("clients")
    .select("id, name")
    .eq("phone", normalizedPhone)
    .maybeSingle();

  if (existingClient) {
    if (existingClient.name !== input.name) {
      await admin.from("clients").update({ name: input.name }).eq("id", existingClient.id);
    }
    return existingClient.id;
  }

  const { data: newClient, error } = await admin
    .from("clients")
    .insert({ name: input.name, phone: normalizedPhone })
    .select("id")
    .single();

  if (error || !newClient) {
    throw new Error("Não foi possível salvar os dados do cliente.");
  }

  return newClient.id;
}
