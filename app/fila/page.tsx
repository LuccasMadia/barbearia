import { getActiveServices, getActiveBarbers, getSiteConfig } from "@/lib/site-data";
import { getQueueBoard } from "@/lib/queue-server";
import { getOpeningHoursSummary } from "@/lib/business-hours";
import { createAdminClient } from "@/lib/supabase/admin";
import { QueueJoinForm } from "@/components/queue/QueueJoinForm";
import { Header } from "@/components/site/Header";
import { SiteNavBar } from "@/components/site/SiteNavBar";
import { Footer } from "@/components/site/Footer";

export default async function FilaPage() {
  const admin = createAdminClient();
  const [siteConfig, services, barbers, board, openingHoursSummary] = await Promise.all([
    getSiteConfig(),
    getActiveServices(),
    getActiveBarbers(),
    getQueueBoard(admin),
    getOpeningHoursSummary(admin),
  ]);

  return (
    <>
      <Header siteConfig={siteConfig} />
      <SiteNavBar />
      <main className="flex-1">
        {board.queueOpen ? (
          <QueueJoinForm services={services} barbers={barbers} />
        ) : (
          <div className="mx-auto max-w-md px-6 py-24 text-center">
            <h1 className="font-display text-2xl text-paper">Fila fechada</h1>
            <p className="mt-2 text-sm text-paper-dim">
              A fila de atendimento está fechada no momento. Volte durante o horário de
              funcionamento.
            </p>
          </div>
        )}
      </main>
      <Footer siteConfig={siteConfig} openingHoursSummary={openingHoursSummary} />
    </>
  );
}
