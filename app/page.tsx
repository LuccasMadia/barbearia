import { getSiteConfig, getActiveServices } from "@/lib/site-data";
import { Header } from "@/components/site/Header";
import { Hero } from "@/components/site/Hero";
import { ServicesSection } from "@/components/site/ServicesSection";
import { AboutSection } from "@/components/site/AboutSection";
import { ContactSection } from "@/components/site/ContactSection";
import { Footer } from "@/components/site/Footer";

export default async function Home() {
  const [siteConfig, services] = await Promise.all([
    getSiteConfig(),
    getActiveServices(),
  ]);

  return (
    <>
      <Header siteConfig={siteConfig} />
      <main>
        <Hero siteConfig={siteConfig} />
        <ServicesSection services={services} />
        <AboutSection siteConfig={siteConfig} />
        <ContactSection siteConfig={siteConfig} />
      </main>
      <Footer siteConfig={siteConfig} />
    </>
  );
}
