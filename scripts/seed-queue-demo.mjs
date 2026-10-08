// Seeds the "fila de atendimento" with fictitious clients for live testing.
// Run against your own dev/demo Supabase project only:
//   node scripts/seed-queue-demo.mjs
import { createClient } from "@supabase/supabase-js";
import { readFileSync } from "fs";
import { fileURLToPath } from "url";
import path from "path";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

function loadEnv(filePath) {
  const content = readFileSync(filePath, "utf8");
  const env = {};
  for (const line of content.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const idx = trimmed.indexOf("=");
    if (idx === -1) continue;
    env[trimmed.slice(0, idx).trim()] = trimmed.slice(idx + 1).trim();
  }
  return env;
}

const env = loadEnv(path.join(__dirname, "..", ".env.local"));
const supabase = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
});

const fakeClients = [
  { name: "Ana Souza", phone: "11955500001" },
  { name: "Bruno Lima", phone: "11955500002" },
  { name: "Carla Mendes", phone: "11955500003" },
  { name: "Diego Alves", phone: "11955500004" },
  { name: "Elisa Rocha", phone: "11955500005" },
  { name: "Fábio Costa", phone: "11955500006" },
  { name: "Gabriela Dias", phone: "11955500007" },
];

async function main() {
  const { data: siteConfig } = await supabase
    .from("site_config")
    .select("id")
    .limit(1)
    .maybeSingle();
  if (siteConfig) {
    await supabase.from("site_config").update({ queue_open: true }).eq("id", siteConfig.id);
  }

  const { data: barbers } = await supabase
    .from("barbers")
    .select("id, name")
    .eq("active", true)
    .order("name");
  const { data: services } = await supabase
    .from("services")
    .select("id, name, duration_minutes")
    .eq("active", true)
    .order("name");

  if (!barbers?.length || !services?.length) {
    console.error("Precisa de ao menos 1 barbeiro e 1 serviço ativos antes de rodar este seed.");
    process.exit(1);
  }

  const clientIds = [];
  for (const c of fakeClients) {
    const { data, error } = await supabase
      .from("clients")
      .upsert({ name: c.name, phone: c.phone }, { onConflict: "phone" })
      .select("id")
      .single();
    if (error) {
      console.error("Erro ao criar cliente", c.name, error.message);
      continue;
    }
    clientIds.push(data.id);
  }

  await supabase.from("queue_entries").delete().in("client_id", clientIds);

  const now = Date.now();
  let idx = 0;

  for (const barber of barbers) {
    if (idx >= clientIds.length) break;
    const service = services[idx % services.length];
    const startedAt = new Date(now - 7 * 60_000);
    await supabase.from("queue_entries").insert({
      client_id: clientIds[idx],
      service_id: service.id,
      barber_id: barber.id,
      status: "em_atendimento",
      started_at: startedAt.toISOString(),
    });
    idx++;
  }

  for (; idx < clientIds.length; idx++) {
    const service = services[idx % services.length];
    const preferBarber = idx % 3 === 0 ? null : barbers[idx % barbers.length].id;
    const createdAt = new Date(now - (clientIds.length - idx) * 90_000);
    await supabase.from("queue_entries").insert({
      client_id: clientIds[idx],
      service_id: service.id,
      barber_id: preferBarber,
      status: "aguardando",
      created_at: createdAt.toISOString(),
    });
  }

  console.log(`Fila de teste criada: ${clientIds.length} clientes fictícios, fila aberta.`);
}

main();
