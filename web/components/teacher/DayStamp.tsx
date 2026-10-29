"use client";

import { whenText } from "@/components/TeacherText";
import { useLocale, useT } from "@/lib/i18n/client";
import { daysLabel } from "@/lib/roster-view";

/** A planner-style date for a yyyy-mm-dd day: weekday, the day of the month large, month, then "tomorrow" / "in 3 days". */
export function DayStamp({ date, days }: { date: string; days: number }) {
  const t = useT();
  const locale = useLocale();
  const [y, m, d] = date.split("-").map(Number);
  const at = new Date(Date.UTC(y, m - 1, d));
  const fmt = (o: Intl.DateTimeFormatOptions) => at.toLocaleDateString(locale === "en" ? "en-US" : locale, { ...o, timeZone: "UTC" });
  return (
    <div data-ui className="flex flex-col items-start leading-tight">
      <span className="text-[13px] font-semibold text-zinc-600">
        {fmt({ weekday: "short" })} · {fmt({ month: "short" })}
      </span>
      <span className="font-display text-[28px] leading-none font-bold tabular-nums text-ink">{d}</span>
      <span className="mt-1 text-[13px] font-semibold text-blue-700">{whenText(t, daysLabel(days))}</span>
    </div>
  );
}
