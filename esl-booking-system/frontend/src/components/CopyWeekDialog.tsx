import { useState, useEffect, useMemo } from "react";
import axios from "axios";
import { format, addDays, addWeeks } from "date-fns";
import { Button } from "@/components/ui/button";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import { CheckCircle2, Loader2 } from "lucide-react";

interface Props {
  teacherId: number;
  teacherName: string;
  weekStart: Date;
  headers: Record<string, string>;
  onClose: () => void;
  /** Called after classes were actually created, so the grid can refresh. */
  onCopied: () => void;
}

interface CopyItem {
  date: string;
  time: string;
  student_id: number;
  student_name: string;
  slots: number;
  reason?: string;
}

interface CopyResult {
  created: CopyItem[];
  skipped: CopyItem[];
  message?: string;
}

/** Weeks offered as copy targets, counted from the week after the one shown. */
const WEEK_CHOICES = 12;

const fmt12 = (t: string) => {
  const [hh, mm] = t.split(":");
  const h = Number(hh) % 24;
  return `${h % 12 === 0 ? 12 : h % 12}:${mm} ${h >= 12 ? "PM" : "AM"}`;
};

const dayLabel = (d: string) => format(new Date(`${d}T00:00:00`), "EEE, MMM d");

export function CopyWeekDialog({ teacherId, teacherName, weekStart, headers, onClose, onCopied }: Props) {
  const base = import.meta.env.VITE_API_URL;
  const weeks = useMemo(
    () => [...Array(WEEK_CHOICES)].map((_, i) => addWeeks(weekStart, i + 1)),
    [weekStart],
  );
  const [selected, setSelected] = useState<Set<string>>(
    () => new Set([format(addWeeks(weekStart, 1), "yyyy-MM-dd")]),
  );
  const [preview, setPreview] = useState<CopyResult | null>(null);
  const [previewing, setPreviewing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [done, setDone] = useState<CopyResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  const sourceStr = format(weekStart, "yyyy-MM-dd");
  const targetList = useMemo(() => [...selected].sort(), [selected]);

  // Re-run the dry run whenever the picked weeks change, so the counts are always current.
  useEffect(() => {
    if (done) return;
    // Also clear the spinner: a request cancelled by this change never reaches its finally
    if (targetList.length === 0) { setPreview(null); setPreviewing(false); return; }
    let cancelled = false;
    setPreviewing(true);
    setError(null);
    const timer = setTimeout(() => {
      axios.post(`${base}/api/admin/teachers/${teacherId}/copy-week`, {
        source_week_start: sourceStr, target_week_starts: targetList, dry_run: true,
      }, { headers })
        .then(res => { if (!cancelled) setPreview(res.data); })
        .catch(err => {
          if (!cancelled) setError(err?.response?.data?.message || "Couldn't preview the copy. Please try again.");
        })
        .finally(() => { if (!cancelled) setPreviewing(false); });
    }, 300);
    return () => { cancelled = true; clearTimeout(timer); };
  }, [base, headers, teacherId, sourceStr, targetList, done]);

  const toggleWeek = (key: string) => setSelected(prev => {
    const next = new Set(prev);
    if (next.has(key)) next.delete(key); else next.add(key);
    return next;
  });
  const selectFirst = (n: number) =>
    setSelected(new Set(weeks.slice(0, n).map(w => format(w, "yyyy-MM-dd"))));

  const handleCopy = async () => {
    setSaving(true);
    setError(null);
    try {
      const res = await axios.post(`${base}/api/admin/teachers/${teacherId}/copy-week`, {
        source_week_start: sourceStr, target_week_starts: targetList,
      }, { headers });
      setDone(res.data);
      if (res.data.created.length > 0) onCopied();
    } catch (err: unknown) {
      setError((err as { response?: { data?: { message?: string } } })?.response?.data?.message || "Failed to copy the schedule");
    } finally {
      setSaving(false);
    }
  };

  const result = done ?? preview;
  const weekLabel = `${format(weekStart, "MMM d")} – ${format(addDays(weekStart, 6), "MMM d, yyyy")}`;

  const itemLine = (c: CopyItem) => (
    <>
      <span className="font-medium">{c.student_name}</span>
      <span className="text-muted-foreground"> · {dayLabel(c.date)}, {fmt12(c.time)}</span>
    </>
  );

  return (
    <Dialog open onOpenChange={o => { if (!o && !saving) onClose(); }}>
      <DialogContent className="sm:max-w-lg p-4 sm:p-6">
        <DialogHeader>
          <DialogTitle>Copy Week's Classes</DialogTitle>
        </DialogHeader>
        <p className="text-xs text-muted-foreground -mt-2 text-center sm:text-left">
          Books {teacherName}'s classes from {weekLabel} on the same day and time in the weeks you pick.
          A class is skipped if its slot isn't open, someone is already booked, the teacher is on leave,
          or the student has no sessions left.
        </p>

        {!done && (
          <div className="space-y-2">
            <div className="flex items-center justify-between gap-2">
              <span className="text-xs font-medium">Copy to</span>
              <div className="flex gap-1">
                {[1, 4, 8].map(n => (
                  <Button key={n} size="sm" variant="ghost" className="h-7 px-2 text-xs" onClick={() => selectFirst(n)}>
                    Next {n === 1 ? "week" : `${n} weeks`}
                  </Button>
                ))}
              </div>
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-1">
              {weeks.map(w => {
                const key = format(w, "yyyy-MM-dd");
                const on = selected.has(key);
                return (
                  <button
                    key={key}
                    type="button"
                    onClick={() => toggleWeek(key)}
                    className={`rounded-md border px-2 py-1.5 text-xs transition-colors ${
                      on ? "border-primary bg-primary/10 text-primary font-medium" : "text-muted-foreground hover:bg-muted"
                    }`}
                  >
                    {format(w, "MMM d")} – {format(addDays(w, 6), "MMM d")}
                  </button>
                );
              })}
            </div>
          </div>
        )}

        <div className="max-h-[40vh] overflow-y-auto rounded-md border bg-muted/30 p-2 sm:p-3 text-sm">
          {done && (
            <p className="flex items-center gap-1.5 mb-2 font-medium text-green-700">
              <CheckCircle2 className="h-4 w-4" />
              {done.created.length} class{done.created.length === 1 ? "" : "es"} booked
            </p>
          )}
          {!done && (previewing || (!result && targetList.length > 0)) ? (
            <div className="flex justify-center py-6"><Loader2 className="h-6 w-6 animate-spin text-primary" /></div>
          ) : targetList.length === 0 && !done ? (
            <p className="py-6 text-center text-muted-foreground">Pick at least one week.</p>
          ) : result?.message ? (
            <p className="py-6 text-center text-muted-foreground">{result.message}</p>
          ) : result ? (
            <div className="space-y-3">
              {!done && (
                <div>
                  <p className="text-xs font-semibold text-green-700 mb-1">
                    Will book ({result.created.length})
                  </p>
                  {result.created.length === 0
                    ? <p className="text-xs text-muted-foreground">Nothing can be booked in the selected weeks.</p>
                    : (
                      <ul className="space-y-0.5 text-xs">
                        {result.created.map((c, i) => <li key={i}>{itemLine(c)}</li>)}
                      </ul>
                    )}
                </div>
              )}
              {result.skipped.length > 0 && (
                <div>
                  <p className="text-xs font-semibold text-amber-700 mb-1">
                    Skipped ({result.skipped.length})
                  </p>
                  <ul className="space-y-0.5 text-xs">
                    {result.skipped.map((c, i) => (
                      <li key={i}>
                        {itemLine(c)}
                        <span className="ml-1 rounded bg-amber-100 px-1 text-amber-800">{c.reason}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          ) : null}
        </div>
        {error && <p className="text-xs text-red-600">{error}</p>}

        <DialogFooter>
          {done ? (
            <Button size="sm" className="w-full sm:w-auto" onClick={onClose}>Done</Button>
          ) : (
            <>
              <Button variant="ghost" size="sm" className="w-full sm:w-auto" onClick={onClose} disabled={saving}>Cancel</Button>
              <Button
                size="sm" className="w-full sm:w-auto"
                onClick={handleCopy}
                disabled={saving || previewing || !preview || preview.created.length === 0}
              >
                {saving
                  ? <Loader2 className="h-4 w-4 animate-spin" />
                  : `Book ${preview?.created.length ?? 0} class${preview?.created.length === 1 ? "" : "es"}`}
              </Button>
            </>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
