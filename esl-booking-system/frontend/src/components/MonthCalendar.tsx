import { useMemo, useState } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";

export interface MonthCalendarEvent {
  student: string;
  time: string;
}

interface MonthCalendarProps {
  events: Record<string, MonthCalendarEvent[]>; // keyed by yyyy-MM-dd
  onDayClick?: (key: string) => void;
}

const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const MONTH_NAMES = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

const dateKey = (d: Date) => d.toLocaleDateString("en-CA");

export default function MonthCalendar({ events, onDayClick }: MonthCalendarProps) {
  const today = new Date();
  const [viewYear, setViewYear] = useState(today.getFullYear());
  const [viewMonth, setViewMonth] = useState(today.getMonth());

  const goToday = () => { setViewYear(today.getFullYear()); setViewMonth(today.getMonth()); };
  const goPrev = () => {
    if (viewMonth === 0) { setViewYear(viewYear - 1); setViewMonth(11); }
    else setViewMonth(viewMonth - 1);
  };
  const goNext = () => {
    if (viewMonth === 11) { setViewYear(viewYear + 1); setViewMonth(0); }
    else setViewMonth(viewMonth + 1);
  };

  // Build the visible grid: full weeks covering the month
  const cells = useMemo(() => {
    const firstOfMonth = new Date(viewYear, viewMonth, 1);
    const gridStart = new Date(viewYear, viewMonth, 1 - firstOfMonth.getDay());
    const lastOfMonth = new Date(viewYear, viewMonth + 1, 0);
    const gridEnd = new Date(viewYear, viewMonth, lastOfMonth.getDate() + (6 - lastOfMonth.getDay()));
    const out: Date[] = [];
    for (let d = new Date(gridStart); d <= gridEnd; d.setDate(d.getDate() + 1)) {
      out.push(new Date(d));
    }
    return out;
  }, [viewYear, viewMonth]);

  const todayKey = dateKey(today);
  const monthClassCount = useMemo(
    () =>
      Object.entries(events).reduce((sum, [key, list]) => {
        const [y, m] = key.split("-").map(Number);
        return y === viewYear && m - 1 === viewMonth ? sum + list.length : sum;
      }, 0),
    [events, viewYear, viewMonth]
  );

  return (
    <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between gap-3 px-5 pt-5 pb-4 flex-wrap">
        <div>
          <h3 className="text-xl font-semibold tracking-tight text-slate-900">
            {MONTH_NAMES[viewMonth]} <span className="text-slate-400 font-normal">{viewYear}</span>
          </h3>
          <p className="text-xs text-slate-500 mt-0.5">
            {monthClassCount > 0
              ? `${monthClassCount} class${monthClassCount > 1 ? "es" : ""} scheduled this month`
              : "No classes scheduled this month"}
          </p>
        </div>
        <div className="flex items-center rounded-lg border border-slate-200 overflow-hidden shadow-xs">
          <button
            onClick={goPrev}
            aria-label="Previous month"
            className="p-2 text-slate-500 hover:text-brand hover:bg-brand-light/40 transition-colors"
          >
            <ChevronLeft className="h-4 w-4" />
          </button>
          <button
            onClick={goToday}
            className="px-3 py-1.5 text-xs font-semibold text-slate-600 border-x border-slate-200 hover:text-brand hover:bg-brand-light/40 transition-colors"
          >
            Today
          </button>
          <button
            onClick={goNext}
            aria-label="Next month"
            className="p-2 text-slate-500 hover:text-brand hover:bg-brand-light/40 transition-colors"
          >
            <ChevronRight className="h-4 w-4" />
          </button>
        </div>
      </div>

      {/* Accent line */}
      <div className="h-[3px] bg-gradient-to-r from-brand via-[#4A9EAF] to-accent-gold" />

      {/* Weekday header */}
      <div className="grid grid-cols-7 border-b border-slate-200 bg-slate-50/60">
        {WEEKDAYS.map((d) => (
          <div
            key={d}
            className="py-2.5 text-center text-[10px] font-semibold uppercase tracking-[0.14em] text-slate-400"
          >
            {d}
          </div>
        ))}
      </div>

      {/* Day grid */}
      <div className="grid grid-cols-7" style={{ gridAutoRows: "minmax(96px, auto)" }}>
        {cells.map((date, i) => {
          const key = dateKey(date);
          const inMonth = date.getMonth() === viewMonth;
          const isToday = key === todayKey;
          const isPast = key < todayKey;
          const dayEvents = events[key] || [];
          const hasEvents = dayEvents.length > 0;
          const visible = dayEvents.slice(0, 10);
          const overflow = dayEvents.length - visible.length;
          const isWeekend = date.getDay() === 0 || date.getDay() === 6;

          return (
            <div
              key={key}
              onClick={() => hasEvents && onDayClick?.(key)}
              className={[
                "relative flex flex-col gap-1 p-1.5 border-b border-r border-slate-100 transition-colors",
                i % 7 === 0 ? "border-l-0" : "",
                isToday ? "bg-brand-light/25" : !inMonth ? "bg-slate-50/70" : isWeekend ? "bg-slate-50/40" : "bg-white",
                hasEvents ? "cursor-pointer hover:bg-brand-light/30" : "",
              ].join(" ")}
            >
              <div className="flex justify-end">
                {isToday ? (
                  <span className="inline-flex h-6 w-6 items-center justify-center rounded-full bg-brand text-white text-xs font-semibold shadow-sm">
                    {date.getDate()}
                  </span>
                ) : (
                  <span
                    className={`inline-flex h-6 w-6 items-center justify-center text-xs ${
                      inMonth ? "font-medium text-slate-600" : "text-slate-300"
                    }`}
                  >
                    {date.getDate()}
                  </span>
                )}
              </div>

              {visible.map((e, idx) => (
                <div
                  key={idx}
                  title={`${e.student} · ${e.time}`}
                  className={[
                    "flex items-center gap-1.5 rounded-md border px-1.5 py-[3px] text-[10px] leading-tight min-w-0",
                    isPast
                      ? "bg-slate-50 border-slate-200 text-slate-400"
                      : "bg-brand-light/50 border-brand-light text-[#1B3D5C]",
                  ].join(" ")}
                >
                  <span
                    className={`h-1.5 w-1.5 rounded-full shrink-0 ${
                      isPast ? "bg-slate-300" : isToday ? "bg-accent-gold" : "bg-brand"
                    }`}
                  />
                  <span className="font-semibold truncate">{e.student}</span>
                  <span className={`ml-auto shrink-0 ${isPast ? "text-slate-400" : "text-brand"}`}>
                    {e.time}
                  </span>
                </div>
              ))}

              {overflow > 0 && (
                <span className="text-[10px] font-semibold text-brand pl-1">+{overflow} more</span>
              )}
            </div>
          );
        })}
      </div>

      {/* Legend */}
      <div className="flex items-center gap-4 px-5 py-2.5 border-t border-slate-100 bg-slate-50/60 text-[10px] text-slate-500">
        <span className="flex items-center gap-1.5">
          <span className="h-1.5 w-1.5 rounded-full bg-brand" /> Upcoming
        </span>
        <span className="flex items-center gap-1.5">
          <span className="h-1.5 w-1.5 rounded-full bg-accent-gold" /> Today
        </span>
        <span className="flex items-center gap-1.5">
          <span className="h-1.5 w-1.5 rounded-full bg-slate-300" /> Past
        </span>
        <span className="ml-auto hidden sm:block text-slate-400">Click a day to view details</span>
      </div>
    </div>
  );
}
