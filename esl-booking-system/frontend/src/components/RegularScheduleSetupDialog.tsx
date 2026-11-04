import { useEffect, useMemo, useState } from "react";
import axios from "axios";
import { Check, Loader2, Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Alert, AlertDescription } from "@/components/ui/alert";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { DAYS_OF_WEEK, summarizeRegularSlots, type TeacherRegularSlot } from "@/utils/regularSlots";

// One "time block": the same hours on a set of days, e.g. Sat + Sun 10 AM–12 PM.
// A teacher's regular schedule is any number of these; overlapping blocks merge.
type TimeBlock = { key: number; days: string[]; start: string; end: string };

const WEEKDAYS = DAYS_OF_WEEK.slice(0, 5);
const WEEKENDS = DAYS_OF_WEEK.slice(5);

// Range picker boundaries: every half hour plus 24:00 as the closing edge.
const RANGE_TIMES: string[] = Array.from({ length: 49 }, (_, i) =>
  `${String(Math.floor(i / 2)).padStart(2, "0")}:${i % 2 ? "30" : "00"}`,
);

const PRESETS: { label: string; days: string[]; start: string; end: string; peak?: boolean }[] = [
  { label: "⭐ Peak Hours (every day)", days: DAYS_OF_WEEK, start: "18:00", end: "22:00", peak: true },
  { label: "Weekdays Full Day", days: WEEKDAYS, start: "09:00", end: "18:00" },
  { label: "Weekday Mornings", days: WEEKDAYS, start: "07:00", end: "12:00" },
  { label: "Weekday Afternoons", days: WEEKDAYS, start: "13:00", end: "18:00" },
  { label: "Weekend Mornings", days: WEEKENDS, start: "10:00", end: "12:00" },
];

const WEEK_OPTIONS = [1, 2, 3, 4, 6, 8, 12];

const toMinutes = (t: string) => {
  const [h, m] = t.split(":").map(Number);
  return h * 60 + m;
};
const fromMinutes = (mins: number) =>
  `${String(Math.floor(mins / 60)).padStart(2, "0")}:${String(mins % 60).padStart(2, "0")}`;
const fmt12 = (t: string) => {
  const [h, m] = t.split(":").map(Number);
  if (h === 24) return "12:00 AM (midnight)";
  return `${h % 12 || 12}:${String(m).padStart(2, "0")} ${h < 12 ? "AM" : "PM"}`;
};

let nextKey = 1;
const newBlock = (days: string[], start: string, end: string): TimeBlock => ({ key: nextKey++, days: [...days], start, end });

// Saved slots → blocks: merge each day's slots into ranges, then put days that
// share exactly the same range into one block. So "peak hours every day, plus
// 10–12 on weekends" comes back as those two blocks.
function slotsToBlocks(slots: TeacherRegularSlot[]): TimeBlock[] {
  const daysByRange = new Map<string, string[]>();
  for (const day of DAYS_OF_WEEK) {
    const mins = slots.filter((s) => s.day_of_week === day).map((s) => toMinutes(s.slot_time)).sort((a, b) => a - b);
    if (mins.length === 0) continue;
    let start = mins[0];
    let prev = mins[0];
    for (const m of [...mins.slice(1), Infinity]) {
      if (m === prev + 30) { prev = m; continue; }
      const range = `${fromMinutes(start)}|${fromMinutes(prev + 30)}`;
      daysByRange.set(range, [...(daysByRange.get(range) ?? []), day]);
      start = m;
      prev = m;
    }
  }
  return [...daysByRange.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([range, days]) => {
      const [start, end] = range.split("|");
      return newBlock(days, start, end);
    });
}

// Blocks → one 30-minute slot per open half hour, deduplicated across blocks.
function blocksToSlots(blocks: TimeBlock[]): TeacherRegularSlot[] {
  const keys = new Set<string>();
  for (const b of blocks) {
    for (let m = toMinutes(b.start); m < toMinutes(b.end); m += 30) {
      for (const day of b.days) keys.add(`${day}|${fromMinutes(m)}`);
    }
  }
  return [...keys].map((k) => {
    const [day_of_week, slot_time] = k.split("|");
    return { day_of_week, slot_time };
  });
}

const sameDays = (a: string[], b: string[]) => a.length === b.length && b.every((d) => a.includes(d));

interface RegularScheduleSetupDialogProps {
  open: boolean;
  onClose: () => void;
  // Called after a save that opened slots, so the calendar can refresh
  onApplied: () => void;
}

// The teacher's own regular weekly schedule. It is saved (so it is filled in
// next time, and admins see it on their Regular Schedule view), then opened on
// the real calendar for the number of weeks chosen.
const RegularScheduleSetupDialog: React.FC<RegularScheduleSetupDialogProps> = ({ open, onClose, onApplied }) => {
  const [blocks, setBlocks] = useState<TimeBlock[]>([]);
  const [weeks, setWeeks] = useState(4);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [hadSaved, setHadSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<{ slotsCreated: number; slotsClosed: number; leaveDays: string[] } | null>(null);

  const url = `${import.meta.env.VITE_API_URL}/api/teacher/regular-slots`;
  const headers = { Authorization: `Bearer ${localStorage.getItem("token")}` };

  // Prefill with the saved regular schedule every time it opens.
  useEffect(() => {
    if (!open) return;
    setError(null);
    setResult(null);
    setBlocks([]);
    setLoading(true);
    axios
      .get<TeacherRegularSlot[]>(url, { headers })
      .then((res) => {
        setBlocks(slotsToBlocks(res.data));
        setHadSaved(res.data.length > 0);
      })
      .catch(() => setError("Couldn't load your saved regular schedule."))
      .finally(() => setLoading(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const slots = useMemo(() => blocksToSlots(blocks), [blocks]);
  const summary = useMemo(() => summarizeRegularSlots(slots), [slots]);
  const emptyBlock = blocks.some((b) => b.days.length === 0);

  const updateBlock = (key: number, patch: Partial<TimeBlock>) =>
    setBlocks((prev) => prev.map((b) => (b.key === key ? { ...b, ...patch } : b)));

  const toggleDay = (b: TimeBlock, day: string) =>
    updateBlock(b.key, { days: b.days.includes(day) ? b.days.filter((d) => d !== day) : [...b.days, day] });

  const handleSave = async () => {
    setSaving(true);
    setError(null);
    try {
      const res = await axios.put(url, { slots, weeks }, { headers });
      setResult({ slotsCreated: res.data?.slotsCreated ?? 0, slotsClosed: res.data?.slotsClosed ?? 0, leaveDays: res.data?.leave_days ?? [] });
      setHadSaved(slots.length > 0);
      onApplied();
    } catch (err: unknown) {
      const data = axios.isAxiosError(err) ? err.response?.data : undefined;
      setError(data?.message || "Failed to save your regular schedule.");
    } finally {
      setSaving(false);
    }
  };

  const hoursPerWeek = slots.length / 2;

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o && !saving) onClose(); }}>
      <DialogContent className="sm:max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Setting Regular Schedule</DialogTitle>
          <DialogDescription>
            Your usual weekly open hours. Add one time block per set of hours — for example ⭐ Peak Hours every day,
            plus Sat &amp; Sun 10:00 AM–12:00 PM as a second block.
          </DialogDescription>
        </DialogHeader>

        {loading ? (
          <div className="flex justify-center py-8"><Loader2 className="h-5 w-5 animate-spin text-muted-foreground" /></div>
        ) : result ? (
          <div className="space-y-2">
            <div className="p-3 bg-green-50 border border-green-200 rounded-lg space-y-0.5 text-green-700 font-medium">
              <p className="flex items-center gap-1.5"><Check className="h-4 w-4" /> Regular schedule saved</p>
              <p className="flex items-center gap-1.5">
                <Check className="h-4 w-4" /> {result.slotsCreated} slot{result.slotsCreated === 1 ? "" : "s"} opened,{" "}
                {result.slotsClosed} closed for the next {weeks} week{weeks === 1 ? "" : "s"}
              </p>
            </div>
            {result.slotsCreated === 0 && result.slotsClosed === 0 && slots.length > 0 && (
              <p className="text-xs text-muted-foreground">Your calendar already matched this schedule.</p>
            )}
            {result.leaveDays.length > 0 && (
              <p className="text-xs text-amber-600">Not opened — you're on leave: {result.leaveDays.join(", ")}</p>
            )}
          </div>
        ) : (
          <div className="space-y-4">
            {/* Presets add a block, so they can be stacked */}
            <div>
              <p className="text-xs text-muted-foreground mb-2 font-medium uppercase tracking-wide">Add a preset</p>
              <div className="flex flex-wrap gap-2">
                {PRESETS.map((p) => (
                  <button
                    key={p.label}
                    type="button"
                    onClick={() => setBlocks((prev) => [...prev, newBlock(p.days, p.start, p.end)])}
                    className={`px-3 py-1 rounded-full text-xs font-medium border transition-colors ${p.peak ? "bg-amber-50 text-amber-700 border-amber-300 hover:bg-amber-100 hover:border-amber-400" : "bg-white text-muted-foreground border-gray-200 hover:border-primary hover:text-primary"}`}
                  >
                    + {p.label}
                  </button>
                ))}
              </div>
            </div>

            {/* Time blocks */}
            <div className="space-y-2">
              {blocks.length === 0 && (
                <p className="text-sm text-muted-foreground border border-dashed rounded-lg p-4 text-center">
                  No regular hours yet. Add a preset above or a time block below.
                </p>
              )}
              {blocks.map((b, i) => (
                <div key={b.key} className="border rounded-lg p-3 space-y-2">
                  <div className="flex items-center justify-between gap-2">
                    <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Time block {i + 1}</p>
                    <div className="flex items-center gap-1">
                      {[
                        { label: "Every day", days: DAYS_OF_WEEK },
                        { label: "Weekdays", days: WEEKDAYS },
                        { label: "Weekends", days: WEEKENDS },
                      ].map((q) => (
                        <button
                          key={q.label}
                          type="button"
                          onClick={() => updateBlock(b.key, { days: q.days })}
                          className={`px-2 py-0.5 rounded text-[11px] ${sameDays(b.days, q.days) ? "bg-primary/10 text-primary font-medium" : "text-muted-foreground hover:text-primary"}`}
                        >
                          {q.label}
                        </button>
                      ))}
                      <button
                        type="button"
                        aria-label={`Remove time block ${i + 1}`}
                        onClick={() => setBlocks((prev) => prev.filter((x) => x.key !== b.key))}
                        className="ml-1 p-1 rounded text-muted-foreground hover:text-destructive hover:bg-red-50"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  </div>
                  <div className="flex flex-wrap gap-1.5">
                    {DAYS_OF_WEEK.map((day) => (
                      <button
                        key={day}
                        type="button"
                        onClick={() => toggleDay(b, day)}
                        className={`px-2.5 py-1 rounded-full text-xs font-medium border transition-colors ${b.days.includes(day) ? "bg-primary text-white border-primary" : "bg-white text-muted-foreground border-gray-200 hover:border-primary"}`}
                      >
                        {day.slice(0, 3)}
                      </button>
                    ))}
                  </div>
                  <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-2">
                    <select
                      aria-label="From"
                      className="w-full border rounded-lg px-2 py-1.5 text-sm"
                      value={b.start}
                      onChange={(e) => {
                        const v = e.target.value;
                        updateBlock(b.key, v >= b.end ? { start: v, end: fromMinutes(toMinutes(v) + 30) } : { start: v });
                      }}
                    >
                      {RANGE_TIMES.slice(0, -1).map((t) => <option key={t} value={t}>{fmt12(t)}</option>)}
                    </select>
                    <span className="text-xs text-muted-foreground">to</span>
                    <select
                      aria-label="To"
                      className="w-full border rounded-lg px-2 py-1.5 text-sm"
                      value={b.end}
                      onChange={(e) => {
                        const v = e.target.value;
                        updateBlock(b.key, v <= b.start ? { end: v, start: fromMinutes(toMinutes(v) - 30) } : { end: v });
                      }}
                    >
                      {RANGE_TIMES.slice(1).map((t) => <option key={t} value={t}>{fmt12(t)}</option>)}
                    </select>
                  </div>
                  {b.days.length === 0 && <p className="text-xs text-destructive">Pick at least one day.</p>}
                </div>
              ))}
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="w-full"
                onClick={() => setBlocks((prev) => [...prev, newBlock([], "09:00", "12:00")])}
              >
                <Plus className="h-3.5 w-3.5 mr-1" /> Add time block
              </Button>
            </div>

            {/* What the blocks add up to, per day */}
            {summary.length > 0 && (
              <div className="rounded-lg bg-muted/50 p-3">
                <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-1.5">
                  Your week · {hoursPerWeek} hour{hoursPerWeek === 1 ? "" : "s"}
                </p>
                <ul className="space-y-0.5 text-sm">
                  {summary.map((s) => (
                    <li key={s.day} className="flex gap-2">
                      <span className="font-medium w-9 shrink-0">{s.day}</span>
                      <span className="text-muted-foreground">{s.ranges}</span>
                    </li>
                  ))}
                </ul>
              </div>
            )}

            <div>
              <label className="text-sm font-medium block mb-1">Apply to my calendar for</label>
              <select
                className="w-full border rounded-lg px-3 py-2 text-sm"
                value={weeks}
                onChange={(e) => setWeeks(Number(e.target.value))}
              >
                {WEEK_OPTIONS.map((w) => (
                  <option key={w} value={w}>the next {w} week{w > 1 ? "s" : ""}</option>
                ))}
              </select>
              <p className="text-xs text-muted-foreground mt-1">
                Starting tomorrow, these hours are opened and every other slot is closed. Leave days and slots with a class are left alone.{" "}
                {hadSaved
                  ? "Your saved schedule is filled in above — change it if you need to, then apply again for more weeks."
                  : "It's saved, so next time it's filled in and you only pick the weeks."}
              </p>
            </div>
          </div>
        )}

        {error && (
          <Alert variant="destructive">
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}

        <DialogFooter>
          {result ? (
            <Button onClick={onClose}>Done</Button>
          ) : (
            <>
              <Button variant="outline" disabled={saving} onClick={onClose}>Cancel</Button>
              <Button onClick={handleSave} disabled={loading || saving || emptyBlock}>
                {saving && <Loader2 className="h-4 w-4 animate-spin mr-2" />}
                Save &amp; Apply
              </Button>
            </>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

export default RegularScheduleSetupDialog;
