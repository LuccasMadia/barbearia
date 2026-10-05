import type { Tables } from "@/lib/database.types";

export function ContactSection({
  siteConfig,
}: {
  siteConfig: Tables<"site_config">;
}) {
  const hasContact =
    siteConfig.address ||
    siteConfig.phone ||
    siteConfig.whatsapp ||
    siteConfig.instagram;

  if (!hasContact) return null;

  return (
    <section className="grid gap-8 bg-neutral-50 px-6 py-16 sm:grid-cols-2">
      <div className="space-y-2">
        <h2 className="text-xl font-semibold">Contato</h2>
        {siteConfig.address && <p>{siteConfig.address}</p>}
        {siteConfig.phone && <p>{siteConfig.phone}</p>}
        {siteConfig.whatsapp && <p>WhatsApp: {siteConfig.whatsapp}</p>}
        {siteConfig.instagram && <p>Instagram: {siteConfig.instagram}</p>}
      </div>
      {siteConfig.address && (
        <iframe
          title="Localização"
          className="h-64 w-full rounded-lg border-0"
          loading="lazy"
          src={`https://www.google.com/maps?q=${encodeURIComponent(
            siteConfig.address
          )}&output=embed`}
        />
      )}
    </section>
  );
}
