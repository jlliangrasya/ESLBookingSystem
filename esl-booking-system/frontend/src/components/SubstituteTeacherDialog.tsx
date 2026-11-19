import { useState, useEffect, useCallback, useMemo } from "react";
import axios from "axios";
import { format } from "date-fns";
import { Button } from "@/components/ui/button";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import { Loader2 } from "lucide-react";

interface SubTeacher {
  id: number;
  name: string;
}

interface SubstituteData {
  booking: {
    id: number;
    date: string;
    time: string;
    duration_minutes: number;
    teacher_id: number | null;
    teacher_name: string | null;
    student_name: string;
  };
  open: SubTeacher[];
  free_but_closed: SubTeacher[];
  // Other start times that day the class could move to, and who has them open
  other_times?: { time: string; teachers: SubTeacher[] }[];
}

interface Props {
  bookingId: number;
  onClose: () => void;
  onAssigned: (teacherName: string) => void;
  // The class was moved to another time that day
  onMoved: (message: string) => void;
}

const fmt12 = (t: string) => {
  const [hh, mm] = t.split(":").map(Number);
  const h = hh % 24;
  return `${h % 12 === 0 ? 12 : h % 12}:${String(mm).padStart(2, "0")} ${h >= 12 ? "PM" : "AM"}`;
};

const addMinutes = (time: string, mins: number) => {
  const [hh, mm] = time.split(":").map(Number);
  const total = hh * 60 + mm + mins;
  return `${String(Math.floor(total / 60)).padStart(2, "0")}:${String(total % 60).padStart(2, "0")}`;
};

const errMessage = (err: unknown, fallback: string) =>
  (err as { response?: { data?: { message?: string } } })?.response?.data?.message || fallback;

/**
 * Finds teachers who can cover a class and hands it to the one the admin picks.
 * Teachers with the slot open are listed first (green); teachers who are free but
 * haven't opened the slot follow (gray), since the admin should check with them.
 * Below them, other open times the same day the class can be moved to.
 */
export function SubstituteTeacherDialog({ bookingId, onClose, onAssigned, onMoved }: Props) {
  const token = localStorage.getItem("token");
  const headers = useMemo(() => ({ Authorization: `Bearer ${token}` }), [token]);
  const base = import.meta.env.VITE_API_URL;

  const [data, setData] = useState<SubstituteData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [confirmId, setConfirmId] = useState<number | null>(null);
  const [assigning, setAssigning] = useState(false);
  const [moveConfirm, setMoveConfirm] = useState<{ time: string; teacher: SubTeacher } | null>(null);

  const fetchSubstitutes = useCallback(async () => {
    setLoading(true);
    try {
      const res = await axios.get(`${base}/api/admin/bookings/${bookingId}/substitutes`, { headers });
      setData(res.data);
    } catch (err) {
      setError(errMessage(err, "Failed to load teachers"));
    } finally {
      setLoading(false);
    }
  }, [base, headers, bookingId]);

  useEffect(() => { fetchSubstitutes(); }, [fetchSubstitutes]);

  const assign = async (teacher: SubTeacher) => {
    setAssigning(true);
    setError(null);
    try {
      await axios.post(`${base}/api/admin/bookings/${bookingId}/substitute`, { teacher_id: teacher.id }, { headers });
      onAssigned(teacher.name);
    } catch (err) {
      setError(errMessage(err, "Failed to reassign class"));
      setConfirmId(null);
      fetchSubstitutes(); // the list was stale — show who is free now
    } finally {
      setAssigning(false);
    }
  };

  const move = async (time: string, teacher: SubTeacher) => {
    setAssigning(true);
    setError(null);
    try {
      const res = await axios.post(`${base}/api/admin/bookings/${bookingId}/move`, { time, teacher_id: teacher.id }, { headers });
      onMoved(res.data?.message || `Class moved to ${fmt12(time)}.`);
    } catch (err) {
      setError(errMessage(err, "Failed to move class"));
      setMoveConfirm(null);
      fetchSubstitutes();
    } finally {
      setAssigning(false);
    }
  };

  const renderRow = (t: SubTeacher, isOpen: boolean) => (
    <li
      key={t.id}
      className={`flex items-center justify-between gap-2 rounded-md border border-l-4 px-3 py-2 ${
        isOpen ? "border-l-green-500 bg-green-50" : "border-l-slate-300 bg-slate-50"
      }`}
    >
      <div className="flex items-center gap-2 min-w-0">
        <span className={`truncate text-sm font-medium ${isOpen ? "" : "text-muted-foreground"}`}>{t.name}</span>
        <span className={`shrink-0 rounded-full px-2 py-0.5 text-[11px] font-semibold ${
          isOpen ? "bg-green-100 text-green-700" : "bg-slate-200 text-slate-600"
        }`}>
          {isOpen ? "Open" : "Closed"}
        </span>
      </div>
      {confirmId === t.id ? (
        <div className="flex shrink-0 gap-1">
          <Button size="sm" variant="ghost" onClick={() => setConfirmId(null)} disabled={assigning}>Back</Button>
          <Button size="sm" onClick={() => assign(t)} disabled={assigning}>
            {assigning ? <Loader2 className="h-4 w-4 animate-spin" /> : "Confirm"}
          </Button>
        </div>
      ) : (
        <Button size="sm" variant={isOpen ? "default" : "outline"} className="shrink-0"
          onClick={() => { setMoveConfirm(null); setConfirmId(t.id); }} disabled={assigning}>
          Assign
        </Button>
      )}
    </li>
  );

  const b = data?.booking;
  const open = data?.open ?? [];
  const closed = data?.free_but_closed ?? [];
  const otherTimes = data?.other_times ?? [];
  // Morning before 12 PM, afternoon 12–6 PM, evening from 6 PM
  const timeGroups = [
    { label: "Morning", items: otherTimes.filter(o => o.time < "12:00") },
    { label: "Afternoon", items: otherTimes.filter(o => o.time >= "12:00" && o.time < "18:00") },
    { label: "Evening", items: otherTimes.filter(o => o.time >= "18:00") },
  ].filter(g => g.items.length > 0);

  return (
    <Dialog open onOpenChange={o => { if (!o && !assigning) onClose(); }}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader><DialogTitle>Reassign Class</DialogTitle></DialogHeader>

        {loading && !data ? (
          <div className="flex justify-center py-8"><Loader2 className="h-5 w-5 animate-spin text-muted-foreground" /></div>
        ) : b ? (
          <div className="space-y-4">
            <div className="text-sm space-y-0.5">
              <p><span className="font-medium">{b.student_name}</span></p>
              <p className="text-muted-foreground">
                {format(new Date(`${b.date}T00:00:00`), "MMM d, yyyy")} · {fmt12(b.time)} – {fmt12(addMinutes(b.time, b.duration_minutes))}
              </p>
              <p className="text-muted-foreground">Current teacher: <span className="text-foreground">{b.teacher_name || "Unassigned"}</span></p>
            </div>

            <p className="text-xs font-medium text-muted-foreground">
              <span className="text-green-700">{open.length} open</span> · {closed.length} closed
            </p>

            <div className="max-h-[55vh] overflow-y-auto space-y-4 pr-1">
              {open.length === 0 && closed.length === 0 ? (
                <p className="text-sm text-muted-foreground text-center py-2">No other teacher is free at this time.</p>
              ) : (<>
                <section className="space-y-2">
                  <h3 className="text-sm font-semibold text-green-700">🟢 Open slot ({open.length})</h3>
                  {open.length === 0
                    ? <p className="text-xs text-muted-foreground">No teachers have this slot open.</p>
                    : <ul className="space-y-1.5">{open.map(t => renderRow(t, true))}</ul>}
                </section>

                <section className="space-y-2 border-t pt-3">
                  <h3 className="text-sm font-semibold text-slate-600">⚪ Slot closed ({closed.length})</h3>
                  <p className="text-xs text-muted-foreground">
                    Free at this time but hasn't opened the slot — check with them first.
                  </p>
                  {closed.length === 0
                    ? <p className="text-xs text-muted-foreground">No other free teachers.</p>
                    : <ul className="space-y-1.5">{closed.map(t => renderRow(t, false))}</ul>}
                </section>
              </>)}

              <section className="space-y-2 border-t pt-3">
                <h3 className="text-sm font-semibold text-primary">
                  🕒 Other open times on {format(new Date(`${b.date}T00:00:00`), "MMM d")} ({otherTimes.length})
                </h3>
                <p className="text-xs text-muted-foreground">Move the class to another time this day.</p>
                {otherTimes.length === 0 ? (
                  <p className="text-xs text-muted-foreground">No other open times this day.</p>
                ) : (
                  timeGroups.map(g => (
                  <div key={g.label} className="space-y-1.5">
                  <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground pt-1">
                    {g.label} ({g.items.length})
                  </p>
                  <ul className="space-y-1.5">
                    {g.items.map(o => (
                      <li key={o.time} className="rounded-md border border-l-4 border-l-primary bg-primary/5 px-3 py-2 space-y-1.5">
                        <p className="text-sm font-medium">
                          {fmt12(o.time)} – {fmt12(addMinutes(o.time, b.duration_minutes))}
                        </p>
                        <div className="flex flex-wrap gap-1.5">
                          {[...o.teachers]
                            .sort((x, y) => Number(y.id === b.teacher_id) - Number(x.id === b.teacher_id))
                            .map(t => moveConfirm?.time === o.time && moveConfirm.teacher.id === t.id ? (
                              <div key={t.id} className="flex items-center gap-1">
                                <span className="text-xs">Move to {t.name}?</span>
                                <Button size="sm" variant="ghost" className="h-7" onClick={() => setMoveConfirm(null)} disabled={assigning}>Back</Button>
                                <Button size="sm" className="h-7" onClick={() => move(o.time, t)} disabled={assigning}>
                                  {assigning ? <Loader2 className="h-4 w-4 animate-spin" /> : "Confirm"}
                                </Button>
                              </div>
                            ) : (
                              <Button key={t.id} size="sm" variant="outline" className="h-7 text-xs"
                                onClick={() => { setConfirmId(null); setMoveConfirm({ time: o.time, teacher: t }); }} disabled={assigning}>
                                {t.name}{t.id === b.teacher_id ? " (current)" : ""}
                              </Button>
                            ))}
                        </div>
                      </li>
                    ))}
                  </ul>
                  </div>
                  ))
                )}
              </section>
            </div>
          </div>
        ) : null}

        {error && <p className="text-sm text-destructive">{error}</p>}

        <DialogFooter>
          <Button variant="ghost" onClick={onClose} disabled={assigning}>Close</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
