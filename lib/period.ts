export type Period = "today" | "week" | "month";

export type DateRange = { start: Date; end: Date };

export function periodRange(period: Period, now: Date): DateRange {
  if (period === "today") {
    const start = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const end = new Date(start.getFullYear(), start.getMonth(), start.getDate() + 1);
    return { start, end };
  }

  if (period === "week") {
    const start = new Date(now.getFullYear(), now.getMonth(), now.getDate() - now.getDay());
    const end = new Date(start.getFullYear(), start.getMonth(), start.getDate() + 7);
    return { start, end };
  }

  const start = new Date(now.getFullYear(), now.getMonth(), 1);
  const end = new Date(now.getFullYear(), now.getMonth() + 1, 1);
  return { start, end };
}

export function enumerateDays(range: DateRange): Date[] {
  const days: Date[] = [];
  for (
    let d = new Date(range.start);
    d.getTime() < range.end.getTime();
    d = new Date(d.getFullYear(), d.getMonth(), d.getDate() + 1)
  ) {
    days.push(d);
  }
  return days;
}
