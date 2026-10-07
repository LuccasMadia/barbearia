import Link from "next/link";
import type { Period } from "@/lib/period";

const OPTIONS: { value: Period; label: string }[] = [
  { value: "today", label: "Hoje" },
  { value: "week", label: "Semana" },
  { value: "month", label: "Mês" },
];

export function PeriodFilter({ active }: { active: Period }) {
  return (
    <div className="flex gap-2">
      {OPTIONS.map((option) => (
        <Link
          key={option.value}
          href={`/admin?period=${option.value}`}
          aria-current={option.value === active ? "page" : undefined}
          className={`rounded-sm border px-3 py-1.5 text-sm transition-colors ${
            option.value === active
              ? "border-gold bg-ink-raised text-paper"
              : "border-ink-line text-paper-dim hover:border-ink-line-strong"
          }`}
        >
          {option.label}
        </Link>
      ))}
    </div>
  );
}
