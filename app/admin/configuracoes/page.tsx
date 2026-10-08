import { createClient } from "@/lib/supabase/server";
import { ConfiguracoesTabs } from "@/components/admin/configuracoes/ConfiguracoesTabs";
import { IdentityPanel } from "@/components/admin/configuracoes/IdentityPanel";
import { BarbersPanel } from "@/components/admin/configuracoes/BarbersPanel";
import { ServicesPanel } from "@/components/admin/configuracoes/ServicesPanel";
import { SchedulesPanel } from "@/components/admin/configuracoes/SchedulesPanel";

type Tab = "identidade" | "barbeiros" | "servicos" | "horarios";

function parseTab(value: string | undefined): Tab {
  if (value === "barbeiros" || value === "servicos" || value === "horarios") return value;
  return "identidade";
}

export default async function ConfiguracoesPage({
  searchParams,
}: {
  searchParams: Promise<{ tab?: string; barberId?: string }>;
}) {
  const params = await searchParams;
  const tab = parseTab(params.tab);

  const supabase = await createClient();
  const [{ data: siteConfig }, { data: barbers }, { data: services }, { data: schedules }] =
    await Promise.all([
      supabase.from("site_config").select("*").limit(1).maybeSingle(),
      supabase.from("barbers").select("*").order("name"),
      supabase.from("services").select("*").order("name"),
      supabase.from("barber_schedules").select("*"),
    ]);

  return (
    <div className="mx-auto max-w-4xl space-y-8">
      <div>
        <h1 className="font-display text-2xl text-paper">Configurações</h1>
        <p className="mt-1 text-sm text-paper-dim">
          Identidade, barbeiros, serviços e horários de funcionamento.
        </p>
      </div>

      <ConfiguracoesTabs active={tab} />

      {tab === "identidade" && siteConfig && <IdentityPanel siteConfig={siteConfig} />}
      {tab === "barbeiros" && <BarbersPanel barbers={barbers ?? []} />}
      {tab === "servicos" && <ServicesPanel services={services ?? []} />}
      {tab === "horarios" && (
        <SchedulesPanel
          barbers={(barbers ?? []).filter((b) => b.active)}
          schedules={schedules ?? []}
          initialBarberId={params.barberId}
        />
      )}
    </div>
  );
}
