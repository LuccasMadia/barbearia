import {
  getSiteConfig,
  getActiveServices,
  getActiveBarbers,
} from "@/lib/site-data";
import { Header } from "@/components/site/Header";
import { Hero } from "@/components/site/Hero";
import { ServicesSection } from "@/components/site/ServicesSection";
import { BarbersSection } from "@/components/site/BarbersSection";
import { ContactSection } from "@/components/site/ContactSection";
import { Footer } from "@/components/site/Footer";

export default async function Home() {
  const [siteConfig, services, barbers] = await Promise.all([
    getSiteConfig(),
    getActiveServices(),
    getActiveBarbers(),
  ]);

  return (
    <>
      <Header siteConfig={siteConfig} />
      <main>
        <Hero siteConfig={siteConfig} />
        <ServicesSection services={services} />
        <BarbersSection barbers={barbers} />
        <ContactSection siteConfig={siteConfig} />
      </main>
      <Footer siteConfig={siteConfig} />
    </>
  );
}
