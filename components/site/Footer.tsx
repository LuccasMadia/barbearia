import type { Tables } from "@/lib/database.types";

export function Footer({ siteConfig }: { siteConfig: Tables<"site_config"> }) {
  return (
    <footer className="border-t border-neutral-200 bg-neutral-50 px-6 py-8 text-sm text-neutral-500">
      <p>{siteConfig.name}</p>
      {siteConfig.address && <p>{siteConfig.address}</p>}
      {siteConfig.phone && <p>{siteConfig.phone}</p>}
    </footer>
  );
}
