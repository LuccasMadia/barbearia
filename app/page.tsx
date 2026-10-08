import {
  getSiteConfig,
  getActiveServices,
  getActiveBarbers,
} from "@/lib/site-data";
import { getOpeningHoursSummary } from "@/lib/business-hours";
import { createAdminClient } from "@/lib/supabase/admin";
import { Header } from "@/components/site/Header";
import { SiteNavBar } from "@/components/site/SiteNavBar";
import { Hero } from "@/components/site/Hero";
import { ServicesSection } from "@/components/site/ServicesSection";
import { BarbersSection } from "@/components/site/BarbersSection";
import { ContactSection } from "@/components/site/ContactSection";
import { Footer } from "@/components/site/Footer";

export default async function Home() {
  const [siteConfig, services, barbers, openingHoursSummary] = await Promise.all([
    getSiteConfig(),
    getActiveServices(),
    getActiveBarbers(),
    getOpeningHoursSummary(createAdminClient()),
  ]);

  return (
    <>
      <Header siteConfig={siteConfig} />
      <SiteNavBar />
      <main>
        <Hero siteConfig={siteConfig} openingHoursSummary={openingHoursSummary} />
        <ServicesSection services={services} />
        <BarbersSection barbers={barbers} />
        <ContactSection siteConfig={siteConfig} openingHoursSummary={openingHoursSummary} />
      </main>
      <Footer siteConfig={siteConfig} openingHoursSummary={openingHoursSummary} />
    </>
  );
}
