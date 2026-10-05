import type { Tables } from "@/lib/database.types";

export function AboutSection({
  siteConfig,
}: {
  siteConfig: Tables<"site_config">;
}) {
  if (!siteConfig.about && !siteConfig.opening_hours) return null;

  return (
    <section className="mx-auto max-w-2xl px-6 py-16 text-center">
      {siteConfig.about && (
        <p className="text-neutral-700">{siteConfig.about}</p>
      )}
      {siteConfig.opening_hours && (
        <p className="mt-4 font-medium">{siteConfig.opening_hours}</p>
      )}
    </section>
  );
}
