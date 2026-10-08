"use client";

import { useState, useTransition } from "react";
import type { Tables } from "@/lib/database.types";
import { saveBarberSchedule, type BarberScheduleDay } from "@/app/admin/configuracoes/actions";

const WEEKDAYS = [
  { value: 0, label: "Domingo" },
  { value: 1, label: "Segunda" },
  { value: 2, label: "Terça" },
  { value: 3, label: "Quarta" },
  { value: 4, label: "Quinta" },
  { value: 5, label: "Sexta" },
  { value: 6, label: "Sábado" },
];

function buildInitialDays(
  barberId: string,
  schedules: Tables<"barber_schedules">[]
): BarberScheduleDay[] {
  const rowsByWeekday = new Map<number, Tables<"barber_schedules">[]>();
  for (const row of schedules) {
    if (row.barber_id !== barberId) continue;
    const list = rowsByWeekday.get(row.weekday) ?? [];
    list.push(row);
    rowsByWeekday.set(row.weekday, list);
  }

  return WEEKDAYS.map(({ value: weekday }) => {
    const rows = (rowsByWeekday.get(weekday) ?? []).sort((a, b) =>
      a.start_time.localeCompare(b.start_time)
    );

    if (rows.length === 0) {
      return {
        weekday,
        closed: true,
        start: "09:00",
        end: "18:00",
        hasBreak: false,
        breakStart: "12:00",
        breakEnd: "13:00",
      };
    }
    if (rows.length === 1) {
      return {
        weekday,
        closed: false,
        start: rows[0].start_time.slice(0, 5),
        end: rows[0].end_time.slice(0, 5),
        hasBreak: false,
        breakStart: "12:00",
        breakEnd: "13:00",
      };
    }
    return {
      weekday,
      closed: false,
      start: rows[0].start_time.slice(0, 5),
      end: rows[rows.length - 1].end_time.slice(0, 5),
      hasBreak: true,
      breakStart: rows[0].end_time.slice(0, 5),
      breakEnd: rows[1].start_time.slice(0, 5),
    };
  });
}

export function SchedulesPanel({
  barbers,
  schedules,
  initialBarberId,
}: {
  barbers: Tables<"barbers">[];
  schedules: Tables<"barber_schedules">[];
  initialBarberId?: string;
}) {
  const [barberId, setBarberId] = useState(
    initialBarberId && barbers.some((b) => b.id === initialBarberId)
      ? initialBarberId
      : barbers[0]?.id ?? ""
  );
  const [days, setDays] = useState<BarberScheduleDay[]>(() => buildInitialDays(barberId, schedules));
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [isPending, startTransition] = useTransition();

  function handleSelectBarber(nextBarberId: string) {
    setBarberId(nextBarberId);
    setDays(buildInitialDays(nextBarberId, schedules));
    setSaved(false);
    setError(null);
  }

  function updateDay(weekday: number, patch: Partial<BarberScheduleDay>) {
    setDays((current) => current.map((day) => (day.weekday === weekday ? { ...day, ...patch } : day)));
  }

  function handleSave() {
    if (!barberId) return;
    setError(null);
    setSaved(false);
    startTransition(async () => {
      const result = await saveBarberSchedule(barberId, days);
      if (result.success) {
        setSaved(true);
      } else {
        setError(result.error);
      }
    });
  }

  if (barbers.length === 0) {
    return <p className="text-sm text-paper-dim">Cadastre um barbeiro ativo primeiro.</p>;
  }

  return (
    <div className="space-y-6">
      {barbers.length > 1 && (
        <select
          value={barberId}
          onChange={(e) => handleSelectBarber(e.target.value)}
          className="rounded-sm border border-ink-line bg-transparent px-3 py-2 text-sm text-paper focus:border-gold"
        >
          {barbers.map((barber) => (
            <option key={barber.id} value={barber.id} className="bg-ink">
              {barber.name}
            </option>
          ))}
        </select>
      )}

      <div className="space-y-3">
        {days.map((day) => (
          <div key={day.weekday} className="flex flex-wrap items-center gap-3 border-b border-ink-line pb-3">
            <span className="w-24 text-sm text-paper">{WEEKDAYS[day.weekday].label}</span>
            <label className="flex items-center gap-1.5 text-xs text-paper-dim">
              <input
                type="checkbox"
                checked={!day.closed}
                onChange={(e) => updateDay(day.weekday, { closed: !e.target.checked })}
              />
              aberto
            </label>
            {!day.closed && (
              <>
                <input
                  type="time"
                  value={day.start}
                  onChange={(e) => updateDay(day.weekday, { start: e.target.value })}
                  className="rounded-sm border border-ink-line bg-transparent px-2 py-1 text-sm text-paper focus:border-gold"
                />
                <span className="text-paper-dim">às</span>
                <input
                  type="time"
                  value={day.end}
                  onChange={(e) => updateDay(day.weekday, { end: e.target.value })}
                  className="rounded-sm border border-ink-line bg-transparent px-2 py-1 text-sm text-paper focus:border-gold"
                />
                <label className="flex items-center gap-1.5 text-xs text-paper-dim">
                  <input
                    type="checkbox"
                    checked={day.hasBreak}
                    onChange={(e) => updateDay(day.weekday, { hasBreak: e.target.checked })}
                  />
                  tem intervalo
                </label>
                {day.hasBreak && (
                  <>
                    <input
                      type="time"
                      value={day.breakStart}
                      onChange={(e) => updateDay(day.weekday, { breakStart: e.target.value })}
                      className="rounded-sm border border-ink-line bg-transparent px-2 py-1 text-sm text-paper focus:border-gold"
                    />
                    <span className="text-paper-dim">às</span>
                    <input
                      type="time"
                      value={day.breakEnd}
                      onChange={(e) => updateDay(day.weekday, { breakEnd: e.target.value })}
                      className="rounded-sm border border-ink-line bg-transparent px-2 py-1 text-sm text-paper focus:border-gold"
                    />
                  </>
                )}
              </>
            )}
          </div>
        ))}
      </div>

      {error && <p className="text-sm text-danger">{error}</p>}
      {saved && !error && <p className="text-sm text-gold">Horário salvo.</p>}

      <button
        type="button"
        onClick={handleSave}
        disabled={isPending}
        className="rounded-sm bg-gold px-5 py-2.5 text-sm font-semibold text-gold-ink transition-colors hover:bg-gold-bright disabled:opacity-40"
      >
        {isPending ? "Salvando..." : "Salvar horário"}
      </button>
    </div>
  );
}
