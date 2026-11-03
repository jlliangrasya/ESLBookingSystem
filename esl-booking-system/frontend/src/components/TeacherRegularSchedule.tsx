import { useCallback, useEffect, useMemo, useState } from "react";
import axios from "axios";
import { AlertTriangle, CalendarPlus, Check, Loader2, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Alert, AlertDescription } from "@/components/ui/alert";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

// One student's agreed weekly slot with this teacher, plus the package that
// "Apply to Actual" would book it from.
interface RegularSlot {
  id: number;
  student_id: number;
  student_name: string;
  day_of_week: string;
  start_time: string; // "HH:MM"
  student_package_id: number | null;
  sessions_remaining: number;
  duration_minutes: number | null;
}

type StudentResult = {
  student_id: number;
  student_name: string;
  sessions_booked: number;
  sessions_remaining?: number;
  error?: string;
  groups?: { label: string; sessions_booked: number; skipped_dates: { date: string; reason: string }[] }[];
};

const DAYS_OF_WEEK = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"];

const fmt12 = (t: string) => {
  const [h, m] = t.split(":").map(Number);
  return `${h % 12 || 12}:${String(m).padStart(2, "0")} ${h < 12 ? "AM" : "PM"}`;
};
const toMinutes = (t: string) => {
  const [h, m] = t.split(":").map(Number);
  return h * 60 + m;
};

interface TeacherRegularScheduleProps {
  teacher: { id: number; name: string };
  // The calendar's own row times and student colors, so both views line up.
  slotTimes: string[];
  palette: string[];
  canApply: boolean;
  // Add/remove students' regular slots by clicking the grid
  canEdit: boolean;
  // Called after classes are booked, so the Actual view can refresh.
  onApplied: () => void;
}

// The calendar's "Regular Schedule" view: every student's agreed weekly slots
// with this teacher, as a Mon–Sun template. Viewing it changes nothing; only
// "Apply to Actual" books classes and deducts sessions.
const TeacherRegularSchedule: React.FC<TeacherRegularScheduleProps> = ({ teacher, slotTimes, palette, canApply, canEdit, onApplied }) => {
  const [slots, setSlots] = useState<RegularSlot[]>([]);
  const [loading, setLoading] = useState(true);
  const [showApply, setShowApply] = useState(false);
  // The grid cell being edited
  const [editCell, setEditCell] = useState<{ day: string; time: string } | null>(null);

  const fetchSlots = useCallback(async () => {
    setLoading(true);
    try {
      const token = localStorage.getItem("token");
      const res = await axios.get(`${import.meta.env.VITE_API_URL}/api/admin/teachers/${teacher.id}/regular-schedule`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      setSlots(Array.isArray(res.data) ? res.data : []);
    } catch {
      setSlots([]);
    } finally {
      setLoading(false);
    }
  }, [teacher.id]);

  useEffect(() => { fetchSlots(); }, [fetchSlots]);

  const colorByStudent = useMemo(() => {
    const ids = [...new Set(slots.map((s) => s.student_id))].sort((a, b) => a - b);
    return new Map(ids.map((id, i) => [id, palette[i % palette.length]]));
  }, [slots, palette]);

  // Each slot sits in the grid row its start time falls in, and runs down as
  // many 30-min rows as the package's class length (like the Actual view).
  // Times outside the grid's hours are listed underneath instead.
  const { cells, outside } = useMemo(() => {
    const cells = new Map<string, { slot: RegularSlot; continuation: boolean }[]>();
    const outside: RegularSlot[] = [];
    const first = toMinutes(slotTimes[0]);
    for (const s of slots) {
      const rowIdx = Math.floor((toMinutes(s.start_time) - first) / 30);
      if (rowIdx < 0 || rowIdx >= slotTimes.length) { outside.push(s); continue; }
      const span = Math.max(1, Math.ceil((s.duration_minutes || 25) / 30));
      for (let i = 0; i < span && rowIdx + i < slotTimes.length; i++) {
        const key = `${s.day_of_week}|${slotTimes[rowIdx + i]}`;
        cells.set(key, [...(cells.get(key) ?? []), { slot: s, continuation: i > 0 }]);
      }
    }
    return { cells, outside };
  }, [slots, slotTimes]);

  const studentCount = colorByStudent.size;

  return (
    <>
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 mb-4">
        <p className="text-xs text-muted-foreground">
          The weekly slots agreed with {teacher.name}'s students, kept as a record.
          {canEdit && " Click a slot to add or remove a student."} Nothing here is booked until you apply it.
        </p>
        {canApply && (
          <Button size="sm" className="shrink-0" disabled={loading || slots.length === 0} onClick={() => setShowApply(true)}>
            <CalendarPlus className="h-4 w-4 mr-1" /> Apply to Actual
          </Button>
        )}
      </div>

      {loading ? (
        <div className="flex justify-center py-16">
          <Loader2 className="h-6 w-6 animate-spin text-primary" />
        </div>
      ) : slots.length === 0 && !canEdit ? (
        <p className="text-sm text-muted-foreground text-center py-16">
          No student has a regular schedule with {teacher.name} yet.
        </p>
      ) : (
        <>
          <div className="overflow-auto max-h-[70vh] overscroll-contain">
            <table className="w-full text-xs border-collapse table-fixed">
              <thead className="sticky top-0 z-10 bg-white shadow-[0_1px_0_0_var(--border)]">
                <tr>
                  <th className="p-1 text-left w-16 bg-white">Time</th>
                  {DAYS_OF_WEEK.map((d) => (
                    <th key={d} className="p-1 text-center bg-white">{d.slice(0, 3)}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {slotTimes.map((time) => (
                  <tr key={time}>
                    <td className="p-1 font-medium text-muted-foreground whitespace-nowrap">{fmt12(time)}</td>
                    {DAYS_OF_WEEK.map((day) => {
                      const here = cells.get(`${day}|${time}`) ?? [];
                      const onClick = canEdit ? () => setEditCell({ day, time }) : undefined;
                      if (here.length === 0) {
                        return (
                          <td
                            key={day}
                            onClick={onClick}
                            title={canEdit ? "Click to add a student's regular slot" : undefined}
                            className={`p-1 text-center border bg-gray-50 ${canEdit ? "cursor-pointer text-transparent hover:bg-primary/10 hover:text-primary" : ""}`}
                          >
                            {canEdit && "+"}
                          </td>
                        );
                      }
                      const clash = here.length > 1;
                      const only = here[0];
                      return (
                        <td
                          key={day}
                          onClick={onClick}
                          title={here.map(({ slot }) => `${slot.student_name} — ${slot.day_of_week} ${fmt12(slot.start_time)}`).join("\n")
                            + (clash ? "\n⚠ More than one student in this slot" : "")
                            + (canEdit ? "\nClick to edit" : "")}
                          style={clash ? undefined : { backgroundColor: colorByStudent.get(only.slot.student_id), color: "#fff" }}
                          className={`p-1 text-center border ${clash ? "bg-amber-100 text-amber-800" : ""} ${canEdit ? "cursor-pointer hover:brightness-110" : ""}`}
                        >
                          {clash ? (
                            <div className="truncate font-medium">⚠ {here.map(({ slot }) => slot.student_name).join(", ")}</div>
                          ) : (
                            <div className="truncate font-medium">
                              {only.continuation ? `↳ ${only.slot.student_name}` : only.slot.student_name}
                            </div>
                          )}
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {outside.length > 0 && (
            <p className="text-xs text-muted-foreground mt-2">
              Outside the grid hours:{" "}
              {outside.map((s) => `${s.student_name} (${s.day_of_week.slice(0, 3)} ${fmt12(s.start_time)})`).join(", ")}
            </p>
          )}
          <div className="flex flex-wrap gap-4 mt-3 text-xs text-muted-foreground">
            <span>{studentCount} student{studentCount === 1 ? "" : "s"} · {slots.length} slot{slots.length === 1 ? "" : "s"} a week</span>
            <span>
              <span className="inline-block w-3 h-3 border rounded-l" style={{ backgroundColor: palette[0] }} />
              <span className="inline-block w-3 h-3 border rounded-r mr-1" style={{ backgroundColor: palette[2] }} />
              Agreed slot (one color per student)
            </span>
            <span><span className="inline-block w-3 h-3 bg-amber-100 border rounded mr-1" />⚠ Two students agreed on the same slot</span>
          </div>
        </>
      )}

      <EditRegularSlotDialog
        cell={editCell}
        teacher={teacher}
        // Everything covering this cell, including longer classes that started above it
        entries={editCell ? (cells.get(`${editCell.day}|${editCell.time}`) ?? []).map(({ slot }) => slot) : []}
        onClose={() => setEditCell(null)}
        onChanged={(fresh) => (fresh ? setSlots(fresh) : fetchSlots())}
      />

      <ApplyTeacherRegularDialog
        open={showApply}
        teacher={teacher}
        slots={slots}
        onClose={() => setShowApply(false)}
        // Refresh the session counts shown here as well as the Actual view
        onApplied={() => { fetchSlots(); onApplied(); }}
      />
    </>
  );
};

interface EditRegularSlotDialogProps {
  // null keeps the dialog closed
  cell: { day: string; time: string } | null;
  teacher: { id: number; name: string };
  entries: RegularSlot[];
  onClose: () => void;
  // Fresh slot list when the server returned one, otherwise undefined to refetch.
  onChanged: (fresh?: RegularSlot[]) => void;
}

// Add or remove students' regular slots at one day/time of this teacher's
// template. A record only — nothing is booked until "Apply to Actual".
const EditRegularSlotDialog: React.FC<EditRegularSlotDialogProps> = ({ cell, teacher, entries, onClose, onChanged }) => {
  const [students, setStudents] = useState<{ id: number; name: string }[]>([]);
  const [studentId, setStudentId] = useState("");
  const [time, setTime] = useState("");
  const [saving, setSaving] = useState(false);
  const [removingId, setRemovingId] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);

  const token = localStorage.getItem("token");
  const base = import.meta.env.VITE_API_URL;

  // Fresh form every time it opens; the student list is loaded once.
  useEffect(() => {
    if (!cell) return;
    setStudentId("");
    setTime(cell.time);
    setError(null);
    if (students.length > 0) return;
    axios
      .get(`${base}/api/student/students`, { headers: { Authorization: `Bearer ${token}` } })
      .then((res) => {
        const rows: { id: number; name: string; is_active?: boolean | number }[] = Array.isArray(res.data) ? res.data : (res.data?.data ?? []);
        setStudents(
          rows
            .filter((s) => s.is_active === undefined || !!s.is_active)
            .map(({ id, name }) => ({ id, name }))
            .sort((a, b) => a.name.localeCompare(b.name)),
        );
      })
      .catch(() => setStudents([]));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cell]);

  const handleAdd = async () => {
    if (!cell || !studentId) return;
    setSaving(true);
    setError(null);
    try {
      const res = await axios.post(
        `${base}/api/admin/teachers/${teacher.id}/regular-schedule`,
        { student_id: Number(studentId), day_of_week: cell.day, start_time: time },
        { headers: { Authorization: `Bearer ${token}` } },
      );
      onChanged(Array.isArray(res.data) ? res.data : undefined);
      onClose();
    } catch (err: unknown) {
      setError(axios.isAxiosError(err) && err.response ? err.response.data?.message || "Failed to add slot" : "An unexpected error occurred");
    } finally {
      setSaving(false);
    }
  };

  const handleRemove = async (entryId: number) => {
    setRemovingId(entryId);
    setError(null);
    try {
      await axios.delete(`${base}/api/admin/regular-schedule/${entryId}`, { headers: { Authorization: `Bearer ${token}` } });
      onChanged();
    } catch (err: unknown) {
      setError(axios.isAxiosError(err) && err.response ? err.response.data?.message || "Failed to remove slot" : "An unexpected error occurred");
    } finally {
      setRemovingId(null);
    }
  };

  const busy = saving || removingId !== null;

  return (
    <Dialog open={!!cell} onOpenChange={(o) => { if (!o && !busy) onClose(); }}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Regular Schedule — {cell?.day} {cell ? fmt12(cell.time) : ""}</DialogTitle>
          <DialogDescription>
            Agreed weekly slots with {teacher.name}. Kept as a record — this doesn't book classes or
            deduct sessions.
          </DialogDescription>
        </DialogHeader>

        {entries.length > 0 && (
          <div className="border rounded-lg divide-y text-sm">
            {entries.map((e) => (
              <div key={e.id} className="flex items-center justify-between gap-2 px-3 py-2">
                <span className="truncate">
                  <span className="font-medium">{e.student_name}</span>
                  <span className="text-muted-foreground"> · {e.day_of_week.slice(0, 3)} {fmt12(e.start_time)}</span>
                </span>
                <Button
                  size="sm"
                  variant="ghost"
                  aria-label={`Remove ${e.student_name}'s slot`}
                  className="h-7 w-7 p-0 shrink-0 text-destructive hover:text-destructive hover:bg-destructive/10"
                  disabled={busy}
                  onClick={() => handleRemove(e.id)}
                >
                  {removingId === e.id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Trash2 className="h-3.5 w-3.5" />}
                </Button>
              </div>
            ))}
          </div>
        )}

        <div className="space-y-2">
          <p className="text-sm font-medium">{entries.length > 0 ? "Add another student" : "Add a student"}</p>
          <div className="grid grid-cols-[1fr_7.5rem] gap-2">
            <Select value={studentId} onValueChange={setStudentId} disabled={busy}>
              <SelectTrigger aria-label="Student">
                <SelectValue placeholder="Select a student" />
              </SelectTrigger>
              <SelectContent>
                {students.map((s) => (
                  <SelectItem key={s.id} value={String(s.id)}>{s.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Input type="time" aria-label="Start time" value={time} onChange={(e) => setTime(e.target.value)} disabled={busy} />
          </div>
        </div>

        {error && (
          <Alert variant="destructive">
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}

        <DialogFooter>
          <Button variant="outline" disabled={busy} onClick={onClose}>Close</Button>
          <Button onClick={handleAdd} disabled={busy || !studentId || !time}>
            {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : "Add Slot"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

interface ApplyTeacherRegularDialogProps {
  open: boolean;
  teacher: { id: number; name: string };
  slots: RegularSlot[];
  onClose: () => void;
  onApplied: () => void;
}

// Books the teacher's whole regular schedule for N weeks. Each student is
// booked (or not) on their own, so one student short on sessions doesn't
// hold up the rest.
const ApplyTeacherRegularDialog: React.FC<ApplyTeacherRegularDialogProps> = ({ open, teacher, slots, onClose, onApplied }) => {
  const [weeks, setWeeks] = useState("4");
  const [startDate, setStartDate] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [results, setResults] = useState<StudentResult[] | null>(null);

  // Fresh form every time it opens
  useEffect(() => {
    if (!open) return;
    setWeeks("4");
    setStartDate("");
    setError(null);
    setResults(null);
  }, [open]);

  const weeksNum = Math.min(12, Math.max(1, parseInt(weeks) || 4));

  const perStudent = useMemo(() => {
    const map = new Map<number, { id: number; name: string; count: number; packageId: number | null; sessions: number }>();
    for (const s of slots) {
      const cur = map.get(s.student_id) ?? { id: s.student_id, name: s.student_name, count: 0, packageId: s.student_package_id, sessions: s.sessions_remaining };
      cur.count += 1;
      map.set(s.student_id, cur);
    }
    return [...map.values()].sort((a, b) => a.name.localeCompare(b.name));
  }, [slots]);

  const handleApply = async () => {
    setLoading(true);
    setError(null);
    try {
      const token = localStorage.getItem("token");
      const res = await axios.post(
        `${import.meta.env.VITE_API_URL}/api/admin/teachers/${teacher.id}/regular-schedule/apply`,
        { num_weeks: weeksNum, start_date: startDate || undefined },
        { headers: { Authorization: `Bearer ${token}` } },
      );
      setResults(res.data?.students ?? []);
      onApplied();
    } catch (err: unknown) {
      const data = axios.isAxiosError(err) ? err.response?.data : undefined;
      setError(data?.message || "Failed to apply regular schedule");
      if (data?.students) setResults(data.students);
    } finally {
      setLoading(false);
    }
  };

  const totalBooked = results?.reduce((n, r) => n + r.sessions_booked, 0) ?? 0;

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o && !loading) onClose(); }}>
      <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Apply to Actual — {teacher.name}</DialogTitle>
          <DialogDescription>
            Books every student's regular slots with {teacher.name} as real classes and deducts 1
            session per class from each student's package. Each student is booked separately: one
            without enough sessions is skipped and the rest still go ahead.
          </DialogDescription>
        </DialogHeader>

        {!results && (
          <>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>Weeks (1–12)</Label>
                <Input type="number" min={1} max={12} value={weeks} onChange={(e) => setWeeks(e.target.value)} disabled={loading} />
              </div>
              <div className="space-y-1.5">
                <Label>Start Date</Label>
                <Input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} disabled={loading} />
              </div>
            </div>
            <p className="text-xs text-muted-foreground -mt-1">Start date defaults to tomorrow.</p>
            <div className="border rounded-lg divide-y text-sm">
              {perStudent.map((s) => {
                const planned = s.count * weeksNum;
                return (
                  <div key={s.id} className="flex items-center justify-between gap-2 px-3 py-2">
                    <span className="font-medium truncate">{s.name}</span>
                    <span className="text-xs text-muted-foreground shrink-0 text-right">
                      up to {planned} class{planned === 1 ? "" : "es"} · {s.packageId ? `${s.sessions} sessions left` : "no active package"}
                      {s.packageId && planned > s.sessions && (
                        <span className="block text-amber-600">
                          <AlertTriangle className="h-3 w-3 inline mr-0.5" />may not have enough sessions
                        </span>
                      )}
                    </span>
                  </div>
                );
              })}
            </div>
          </>
        )}

        {results && (
          <div className="space-y-2">
            {totalBooked > 0 && (
              <div className="p-3 bg-green-50 border border-green-200 rounded-lg">
                <p className="text-green-700 font-medium flex items-center gap-1.5">
                  <Check className="h-4 w-4" /> {totalBooked} classes booked
                </p>
              </div>
            )}
            <div className="border rounded-lg divide-y text-sm max-h-72 overflow-y-auto">
              {results.map((r) => (
                <div key={r.student_id} className="px-3 py-2">
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-medium truncate">{r.student_name}</span>
                    {r.error ? (
                      <span className="text-xs text-destructive shrink-0">Not booked</span>
                    ) : (
                      <span className="text-xs text-green-700 shrink-0">
                        {r.sessions_booked} booked · {r.sessions_remaining} sessions left
                      </span>
                    )}
                  </div>
                  {r.error && <p className="text-xs text-destructive mt-0.5">{r.error}</p>}
                  {r.groups?.flatMap((g) => g.skipped_dates.map((d) => ({ ...d, label: g.label }))).map((d, i) => (
                    <p key={i} className="text-xs text-amber-600 mt-0.5">
                      <span className="font-mono text-gray-600">{d.date}</span> {d.label}: {d.reason}
                    </p>
                  ))}
                </div>
              ))}
            </div>
          </div>
        )}

        {error && !results && (
          <Alert variant="destructive">
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}

        <DialogFooter>
          {results ? (
            <Button onClick={onClose}>Done</Button>
          ) : (
            <>
              <Button variant="outline" disabled={loading} onClick={onClose}>Cancel</Button>
              <Button onClick={handleApply} disabled={loading || slots.length === 0}>
                {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : "Apply to Actual"}
              </Button>
            </>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

export default TeacherRegularSchedule;
