import { getActiveServices, getActiveBarbers, getSiteConfig } from "@/lib/site-data";
import { QueueJoinForm } from "@/components/queue/QueueJoinForm";
import { Header } from "@/components/site/Header";
import { Footer } from "@/components/site/Footer";

export default async function FilaPage() {
  const [siteConfig, services, barbers] = await Promise.all([
    getSiteConfig(),
    getActiveServices(),
    getActiveBarbers(),
  ]);

  return (
    <>
      <Header siteConfig={siteConfig} />
      <main className="flex-1">
        {siteConfig.queue_open ? (
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
      <Footer siteConfig={siteConfig} />
    </>
  );
}
