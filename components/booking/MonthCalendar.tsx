"use client";

import { useState } from "react";

const WEEKDAY_LABELS = ["D", "S", "T", "Q", "Q", "S", "S"];
const MONTH_LABELS = [
  "Janeiro",
  "Fevereiro",
  "Março",
  "Abril",
  "Maio",
  "Junho",
  "Julho",
  "Agosto",
  "Setembro",
  "Outubro",
  "Novembro",
  "Dezembro",
];

function toDateKey(year: number, month: number, day: number) {
  const mm = String(month + 1).padStart(2, "0");
  const dd = String(day).padStart(2, "0");
  return `${year}-${mm}-${dd}`;
}

function startOfToday() {
  const now = new Date();
  now.setHours(0, 0, 0, 0);
  return now;
}

export function MonthCalendar({
  value,
  onChange,
}: {
  value: string;
  onChange: (date: string) => void;
}) {
  const today = startOfToday();
  const [viewDate, setViewDate] = useState(() => {
    if (value) {
      const [y, m] = value.split("-").map(Number);
      return new Date(y, m - 1, 1);
    }
    return new Date(today.getFullYear(), today.getMonth(), 1);
  });

  const year = viewDate.getFullYear();
  const month = viewDate.getMonth();
  const firstWeekday = new Date(year, month, 1).getDay();
  const daysInMonth = new Date(year, month + 1, 0).getDate();

  const isCurrentMonth =
    year === today.getFullYear() && month === today.getMonth();

  function goToMonth(offset: number) {
    setViewDate(new Date(year, month + offset, 1));
  }

  const cells: Array<{ day: number; key: string; disabled: boolean } | null> =
    [];
  for (let i = 0; i < firstWeekday; i++) cells.push(null);
  for (let day = 1; day <= daysInMonth; day++) {
    const cellDate = new Date(year, month, day);
    cells.push({
      day,
      key: toDateKey(year, month, day),
      disabled: cellDate < today,
    });
  }

  return (
    <div>
      <div className="flex items-center justify-between">
        <button
          type="button"
          onClick={() => goToMonth(-1)}
          disabled={isCurrentMonth}
          aria-label="Mês anterior"
          className="rounded-sm p-1.5 text-paper-dim transition-colors hover:text-gold disabled:opacity-20 disabled:hover:text-paper-dim"
        >
          ‹
        </button>
        <span className="text-sm text-paper">
          {MONTH_LABELS[month]} {year}
        </span>
        <button
          type="button"
          onClick={() => goToMonth(1)}
          aria-label="Próximo mês"
          className="rounded-sm p-1.5 text-paper-dim transition-colors hover:text-gold"
        >
          ›
        </button>
      </div>

      <div className="mt-4 grid grid-cols-7 gap-y-1 text-center">
        {WEEKDAY_LABELS.map((label, i) => (
          <span
            key={i}
            className="pb-2 text-[11px] uppercase tracking-wide text-paper-dim"
          >
            {label}
          </span>
        ))}

        {cells.map((cell, i) =>
          cell === null ? (
            <span key={`blank-${i}`} />
          ) : (
            <button
              key={cell.key}
              type="button"
              disabled={cell.disabled}
              onClick={() => onChange(cell.key)}
              className={`mx-auto flex h-8 w-8 items-center justify-center rounded-full text-sm transition-colors ${
                value === cell.key
                  ? "bg-gold text-gold-ink"
                  : cell.disabled
                    ? "text-paper-dim/30"
                    : "text-paper hover:bg-ink-line"
              }`}
            >
              {cell.day}
            </button>
          )
        )}
      </div>
    </div>
  );
}
