export type ScheduleWindow = {
  weekday: number;
  startTime: string;
  endTime: string;
};

const WEEKDAY_ABBREVIATIONS = ["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sáb"];

function timeStringToMinutes(time: string): number {
  const [hours, minutes] = time.split(":").map(Number);
  return hours * 60 + minutes;
}

function formatHHMM(time: string): string {
  return time.slice(0, 5);
}

export function isAnyBarberOnShiftNow(
  schedules: ScheduleWindow[],
  weekday: number,
  now: Date
): boolean {
  const nowMinutes = now.getHours() * 60 + now.getMinutes();
  return schedules.some(
    (window) =>
      window.weekday === weekday &&
      nowMinutes >= timeStringToMinutes(window.startTime) &&
      nowMinutes < timeStringToMinutes(window.endTime)
  );
}

export function summarizeOpeningHours(schedules: ScheduleWindow[]): string | null {
  const rangeByWeekday = new Map<number, { start: string; end: string }>();

  for (const window of schedules) {
    const existing = rangeByWeekday.get(window.weekday);
    if (!existing) {
      rangeByWeekday.set(window.weekday, { start: window.startTime, end: window.endTime });
      continue;
    }
    if (window.startTime < existing.start) existing.start = window.startTime;
    if (window.endTime > existing.end) existing.end = window.endTime;
  }

  if (rangeByWeekday.size === 0) return null;

  type Group = { fromWeekday: number; toWeekday: number; start: string; end: string };
  const groups: Group[] = [];

  for (let weekday = 0; weekday <= 6; weekday++) {
    const range = rangeByWeekday.get(weekday);
    if (!range) continue;

    const last = groups[groups.length - 1];
    if (
      last &&
      last.toWeekday === weekday - 1 &&
      last.start === range.start &&
      last.end === range.end
    ) {
      last.toWeekday = weekday;
    } else {
      groups.push({ fromWeekday: weekday, toWeekday: weekday, start: range.start, end: range.end });
    }
  }

  return groups
    .map((group) => {
      const label =
        group.fromWeekday === group.toWeekday
          ? WEEKDAY_ABBREVIATIONS[group.fromWeekday]
          : `${WEEKDAY_ABBREVIATIONS[group.fromWeekday]} a ${WEEKDAY_ABBREVIATIONS[group.toWeekday]}`;
      return `${label}: ${formatHHMM(group.start)}–${formatHHMM(group.end)}`;
    })
    .join(" · ");
}
