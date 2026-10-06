import {
  getActiveServices,
  getActiveBarbers,
  getSiteConfig,
} from "@/lib/site-data";
import { BookingWizard } from "@/components/booking/BookingWizard";
import { Header } from "@/components/site/Header";
import { Footer } from "@/components/site/Footer";

export default async function AgendarPage() {
  const [siteConfig, services, barbers] = await Promise.all([
    getSiteConfig(),
    getActiveServices(),
    getActiveBarbers(),
  ]);

  return (
    <>
      <Header siteConfig={siteConfig} />
      <main className="flex-1">
        <BookingWizard services={services} barbers={barbers} />
      </main>
      <Footer siteConfig={siteConfig} />
    </>
  );
}
