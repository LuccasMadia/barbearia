import { createClient } from "@/lib/supabase/server";
import type { Tables } from "@/lib/database.types";

const DEFAULT_SITE_CONFIG: Tables<"site_config"> = {
  id: "default",
  name: "Minha Barbearia",
  logo_url: null,
  primary_color: "#111111",
  address: null,
  phone: null,
  whatsapp: null,
  instagram: null,
  opening_hours: null,
  about: null,
  created_at: new Date(0).toISOString(),
  updated_at: new Date(0).toISOString(),
};

export async function getSiteConfig(): Promise<Tables<"site_config">> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("site_config")
    .select("*")
    .limit(1)
    .maybeSingle();

  return data ?? DEFAULT_SITE_CONFIG;
}

export async function getActiveServices(): Promise<Tables<"services">[]> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("services")
    .select("*")
    .eq("active", true)
    .order("name");

  return data ?? [];
}
