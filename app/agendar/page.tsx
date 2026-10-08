import {
  getActiveServices,
  getActiveBarbers,
  getSiteConfig,
} from "@/lib/site-data";
import { getOpeningHoursSummary } from "@/lib/business-hours";
import { createAdminClient } from "@/lib/supabase/admin";
import { BookingWizard } from "@/components/booking/BookingWizard";
import { Header } from "@/components/site/Header";
import { Footer } from "@/components/site/Footer";

export default async function AgendarPage() {
  const [siteConfig, services, barbers, openingHoursSummary] = await Promise.all([
    getSiteConfig(),
    getActiveServices(),
    getActiveBarbers(),
    getOpeningHoursSummary(createAdminClient()),
  ]);

  return (
    <>
      <Header siteConfig={siteConfig} />
      <main className="flex-1">
        <BookingWizard services={services} barbers={barbers} />
      </main>
      <Footer siteConfig={siteConfig} openingHoursSummary={openingHoursSummary} />
    </>
  );
}
