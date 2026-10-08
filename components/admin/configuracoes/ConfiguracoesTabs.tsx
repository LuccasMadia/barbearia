import Link from "next/link";

const TABS: { value: string; label: string }[] = [
  { value: "identidade", label: "Identidade" },
  { value: "barbeiros", label: "Barbeiros" },
  { value: "servicos", label: "Serviços" },
  { value: "horarios", label: "Horários" },
];

export function ConfiguracoesTabs({ active }: { active: string }) {
  return (
    <div className="flex gap-2 border-b border-ink-line pb-4">
      {TABS.map((tab) => (
        <Link
          key={tab.value}
          href={`/admin/configuracoes?tab=${tab.value}`}
          aria-current={tab.value === active ? "page" : undefined}
          className={`rounded-sm border px-3 py-1.5 text-sm transition-colors ${
            tab.value === active
              ? "border-gold bg-ink-raised text-paper"
              : "border-ink-line text-paper-dim hover:border-ink-line-strong"
          }`}
        >
          {tab.label}
        </Link>
      ))}
    </div>
  );
}
