import { useState, useEffect, useMemo } from "react";
import axios from "axios";
import { format, addDays } from "date-fns";
import { Button } from "@/components/ui/button";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import { Check, Copy, Loader2 } from "lucide-react";

interface Teacher {
  id: number;
  name: string;
}

interface Props {
  teachers: Teacher[];
  currentTeacherId: number;
  weekStart: Date;
  headers: Record<string, string>;
  onClose: () => void;
}

/** Open slot keys ("yyyy-MM-dd|HH:mm") per teacher, already stripped of booked, noted and past slots. */
type FreeByTeacher = Map<number, string[]>;

const fmt12 = (t: string) => {
  const [hh, mm] = t.split(":");
  const h = Number(hh) % 24;
  return `${h % 12 === 0 ? 12 : h % 12}:${mm} ${h >= 12 ? "PM" : "AM"}`;
};

const addMinutes = (time: string, mins: number) => {
  const [hh, mm] = time.split(":").map(Number);
  const total = hh * 60 + mm + mins;
  return `${String(Math.floor(total / 60)).padStart(2, "0")}:${String(total % 60).padStart(2, "0")}`;
};

// appointment_date is stored as PHT display time — slice, never new Date()
const appointmentKey = (d: string) => {
  const n = d.includes("T") ? d : d.replace(" ", "T");
  return `${n.slice(0, 10)}|${n.slice(11, 16)}`;
};

/** Merge back-to-back 30-minute slots into "9:00 AM – 11:00 AM" ranges. */
const toRanges = (times: string[]) => {
  const ranges: string[] = [];
  let start: string | null = null;
  let end: string | null = null;
  for (const t of times) {
    if (start && end === t) { end = addMinutes(t, 30); continue; }
    if (start && end) ranges.push(`${fmt12(start)} – ${fmt12(end)}`);
    start = t;
    end = addMinutes(t, 30);
  }
  if (start && end) ranges.push(`${fmt12(start)} – ${fmt12(end)}`);
  return ranges;
};

export function AvailableSlotsDialog({ teachers, currentTeacherId, weekStart, headers, onClose }: Props) {
  const base = import.meta.env.VITE_API_URL;
  const [scope, setScope] = useState<"one" | "all">("one");
  const [style, setStyle] = useState<"ranges" | "times">("ranges");
  const [free, setFree] = useState<FreeByTeacher>(new Map());
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  const scopedTeachers = useMemo(
    () => (scope === "all" ? teachers : teachers.filter(t => t.id === currentTeacherId)),
    [scope, teachers, currentTeacherId],
  );

  useEffect(() => {
    let cancelled = false;
    const startStr = format(weekStart, "yyyy-MM-dd");
    setLoading(true);
    setError(null);
    Promise.all(scopedTeachers.map(async t => {
      const [slotsRes, schedRes, notesRes] = await Promise.all([
        axios.get(`${base}/api/admin/teachers/${t.id}/weekly-slots?startDate=${startStr}`, { headers }),
        axios.get(`${base}/api/admin/teachers/${t.id}/schedule?startDate=${startStr}`, { headers }),
        axios.get(`${base}/api/admin/teachers/${t.id}/notes?startDate=${startStr}`, { headers }),
      ]);
      // Same rules as the grid: a slot is only offerable if it's open, unbooked, carries
      // no teacher note, and hasn't started yet.
      const booked = new Set((schedRes.data as { appointment_date: string }[]).map(b => appointmentKey(b.appointment_date)));
      const noted = new Set((notesRes.data as { note_date: string; slot_time: string }[]).map(n => `${n.note_date}|${n.slot_time}`));
      const now = new Date();
      const keys = (slotsRes.data as { slot_date: string; slot_time: string }[])
        .map(s => `${s.slot_date}|${s.slot_time}`)
        .filter(k => !booked.has(k) && !noted.has(k))
        .filter(k => { const [d, tm] = k.split("|"); return new Date(`${d}T${tm}:00`) >= now; })
        .sort();
      return [t.id, keys] as const;
    }))
      .then(entries => { if (!cancelled) setFree(new Map(entries)); })
      .catch(err => {
        console.error("Error fetching available slots:", err);
        if (!cancelled) setError("Couldn't load available slots. Please try again.");
      })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [base, headers, weekStart, scopedTeachers]);

  // Per teacher, per day: the lines to show. Teachers and days with nothing open are dropped.
  const sections = useMemo(() => scopedTeachers.map(t => {
    const keys = free.get(t.id) ?? [];
    const days = [...Array(7)].map((_, i) => {
      const date = format(addDays(weekStart, i), "yyyy-MM-dd");
      const times = keys.filter(k => k.startsWith(date)).map(k => k.slice(11));
      const items = style === "ranges" ? toRanges(times) : times.map(fmt12);
      return { label: format(addDays(weekStart, i), "EEE, MMM d"), items };
    }).filter(d => d.items.length > 0);
    return { teacher: t, days, count: keys.length };
  }).filter(s => s.days.length > 0), [scopedTeachers, free, weekStart, style]);

  const weekLabel = `${format(weekStart, "MMM d")} – ${format(addDays(weekStart, 6), "MMM d, yyyy")}`;

  const text = useMemo(() => {
    const lines = [`Available class slots (${weekLabel}, PH time)`];
    for (const s of sections) {
      lines.push("", `Teacher ${s.teacher.name}`);
      for (const d of s.days) lines.push(`• ${d.label}: ${d.items.join(", ")}`);
    }
    return lines.join("\n");
  }, [sections, weekLabel]);

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      setError("Couldn't copy to the clipboard — please select the text manually.");
    }
  };

  // flex-1 so each pair splits its row evenly once it goes full-width on phones
  const toggleBtn = (active: boolean) =>
    `h-8 sm:h-7 flex-1 px-2 text-xs ${active ? "" : "text-muted-foreground"}`;

  return (
    <Dialog open onOpenChange={o => { if (!o) onClose(); }}>
      <DialogContent className="sm:max-w-lg p-4 sm:p-6">
        <DialogHeader>
          <DialogTitle>Available Slots</DialogTitle>
        </DialogHeader>
        <p className="text-xs text-muted-foreground -mt-2 text-center sm:text-left">
          Open, unbooked slots for {weekLabel}. Copy and send them to students.
        </p>

        <div className="flex flex-col sm:flex-row sm:items-center gap-2 sm:gap-3">
          <div className="flex w-full sm:w-auto rounded-md border p-0.5">
            <Button size="sm" variant={scope === "one" ? "default" : "ghost"} className={toggleBtn(scope === "one")} onClick={() => setScope("one")}>
              This teacher
            </Button>
            <Button size="sm" variant={scope === "all" ? "default" : "ghost"} className={toggleBtn(scope === "all")} onClick={() => setScope("all")}>
              All teachers
            </Button>
          </div>
          <div className="flex w-full sm:w-auto rounded-md border p-0.5">
            <Button size="sm" variant={style === "ranges" ? "default" : "ghost"} className={toggleBtn(style === "ranges")} onClick={() => setStyle("ranges")}>
              Time ranges
            </Button>
            <Button size="sm" variant={style === "times" ? "default" : "ghost"} className={toggleBtn(style === "times")} onClick={() => setStyle("times")}>
              Start times
            </Button>
          </div>
        </div>

        <div className="max-h-[45vh] sm:max-h-[50vh] overflow-y-auto rounded-md border bg-muted/30 p-2 sm:p-3 text-sm">
          {loading ? (
            <div className="flex justify-center py-8"><Loader2 className="h-6 w-6 animate-spin text-primary" /></div>
          ) : sections.length === 0 ? (
            <p className="py-6 text-center text-muted-foreground">No open slots left this week.</p>
          ) : (
            <div className="space-y-4">
              {sections.map(s => (
                <div key={s.teacher.id}>
                  <p className="font-semibold mb-1">
                    {s.teacher.name}
                    <span className="ml-2 text-xs font-normal text-muted-foreground">{s.count} slot{s.count === 1 ? "" : "s"}</span>
                  </p>
                  <ul className="space-y-2 sm:space-y-1">
                    {s.days.map(d => (
                      <li key={d.label} className="flex flex-col sm:flex-row gap-1 sm:gap-2">
                        <span className="sm:w-24 shrink-0 font-medium text-muted-foreground">{d.label}</span>
                        <span className="flex flex-wrap gap-1">
                          {d.items.map(item => (
                            <span key={item} className="rounded bg-green-100 px-1.5 py-0.5 text-xs text-green-700">{item}</span>
                          ))}
                        </span>
                      </li>
                    ))}
                  </ul>
                </div>
              ))}
            </div>
          )}
        </div>
        {error && <p className="text-xs text-red-600">{error}</p>}

        <DialogFooter>
          <Button variant="ghost" size="sm" className="w-full sm:w-auto" onClick={onClose}>Close</Button>
          <Button size="sm" className="w-full sm:w-auto" onClick={handleCopy} disabled={loading || sections.length === 0}>
            {copied
              ? <><Check className="h-4 w-4 mr-1" /> Copied</>
              : <><Copy className="h-4 w-4 mr-1" /> Copy as text</>}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
