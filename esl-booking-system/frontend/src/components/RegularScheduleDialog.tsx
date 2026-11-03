import { useEffect, useState } from "react";
import axios from "axios";
import { Loader2, Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
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

// One agreed weekly slot. A student can have several, each on its own day,
// time and teacher. Kept as a record only — it never books or deducts classes.
export interface RegularScheduleEntry {
  id?: number;
  day_of_week: string;
  start_time: string; // "HH:MM", 24h
  teacher_id: number | null;
  teacher_name?: string | null;
}

const DAYS_OF_WEEK = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"];
const NO_TEACHER = "none";

const fmtScheduleTime =(hhmm: string) => {
  const [h, m] = hhmm.split(":").map(Number);
  return `${h % 12 || 12}:${String(m).padStart(2, "0")} ${h < 12 ? "AM" : "PM"}`;
};

// Compact read-only list, e.g. "Mon 7:00 PM · Anna".
export const RegularScheduleList: React.FC<{ entries?: RegularScheduleEntry[] | null }> = ({ entries }) => {
  if (!entries || entries.length === 0) return <span className="text-muted-foreground">—</span>;
  return (
    <ul className="space-y-0.5">
      {entries.map((e, i) => (
        <li key={e.id ?? i} className="text-sm whitespace-nowrap">
          <span className="font-medium">{e.day_of_week.slice(0, 3)}</span> {fmtScheduleTime(e.start_time)}
          {e.teacher_name && <span className="text-muted-foreground"> · {e.teacher_name}</span>}
        </li>
      ))}
    </ul>
  );
};

interface TeacherOption {
  id: number;
  name: string;
  is_active?: boolean | number;
}

interface RegularScheduleDialogProps {
  // null keeps the dialog closed
  student: { id: number; name: string; regular_schedule?: RegularScheduleEntry[] | null } | null;
  onClose: () => void;
  onSaved: (schedule: RegularScheduleEntry[]) => void;
}

// Edit a student's agreed regular schedule. Shared by the Students List and
// the student profile. Saving replaces the whole list.
const RegularScheduleDialog: React.FC<RegularScheduleDialogProps> = ({ student, onClose, onSaved }) => {
  const [entries, setEntries] = useState<RegularScheduleEntry[]>([]);
  const [teachers, setTeachers] = useState<TeacherOption[]>([]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Fresh copy of the saved schedule every time it opens
  useEffect(() => {
    if (!student) return;
    setEntries((student.regular_schedule ?? []).map((e) => ({ ...e })));
    setError(null);
    const token = localStorage.getItem("token");
    axios
      .get(`${import.meta.env.VITE_API_URL}/api/admin/teachers`, {
        headers: { Authorization: `Bearer ${token}` },
      })
      .then((res) => {
        const rows: TeacherOption[] = Array.isArray(res.data) ? res.data : (res.data?.data ?? []);
        setTeachers(rows);
      })
      .catch(() => setTeachers([]));
  }, [student]);

  const update = (i: number, patch: Partial<RegularScheduleEntry>) =>
    setEntries((prev) => prev.map((e, j) => (j === i ? { ...e, ...patch } : e)));

  // A new row copies the last row's teacher, since most students keep one.
  const addEntry = () =>
    setEntries((prev) => [
      ...prev,
      { day_of_week: "Monday", start_time: "09:00", teacher_id: prev[prev.length - 1]?.teacher_id ?? null },
    ]);

  // Archived teachers stay selectable only on rows that already use them.
  const teacherChoices = (current: number | null) =>
    teachers.filter((t) => t.is_active === undefined || !!t.is_active || t.id === current);

  const handleSave = async () => {
    if (!student) return;
    setSaving(true);
    setError(null);
    try {
      const token = localStorage.getItem("token");
      const res = await axios.put(
        `${import.meta.env.VITE_API_URL}/api/admin/students/${student.id}/regular-schedule`,
        {
          entries: entries.map((e) => ({
            day_of_week: e.day_of_week,
            start_time: e.start_time,
            teacher_id: e.teacher_id,
          })),
        },
        { headers: { Authorization: `Bearer ${token}` } },
      );
      onSaved(res.data?.regular_schedule ?? []);
      onClose();
    } catch (err: unknown) {
      setError(
        axios.isAxiosError(err) && err.response
          ? err.response.data?.message || "Failed to save regular schedule"
          : "An unexpected error occurred",
      );
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog
      open={!!student}
      onOpenChange={(open) => {
        if (!open && !saving) onClose();
      }}
    >
      <DialogContent className="max-w-xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Regular Schedule — {student?.name}</DialogTitle>
          <DialogDescription>
            The days, times and teachers agreed with this student, kept for
            reference. Saving does not book classes or deduct sessions from
            their package.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-2">
          {entries.length === 0 && (
            <p className="text-sm text-muted-foreground">No regular schedule recorded yet.</p>
          )}
          {entries.map((e, i) => (
            <div key={i} className="grid grid-cols-[1fr_auto] sm:grid-cols-[8.5rem_7.5rem_1fr_auto] gap-2 items-center">
              <Select value={e.day_of_week} onValueChange={(v) => update(i, { day_of_week: v })}>
                <SelectTrigger aria-label="Day">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {DAYS_OF_WEEK.map((d) => (
                    <SelectItem key={d} value={d}>
                      {d}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Input
                type="time"
                aria-label="Start time"
                value={e.start_time}
                onChange={(ev) => update(i, { start_time: ev.target.value })}
                className="order-3 sm:order-none"
              />
              <Select
                value={e.teacher_id ? String(e.teacher_id) : NO_TEACHER}
                onValueChange={(v) => {
                  const id = v === NO_TEACHER ? null : Number(v);
                  update(i, { teacher_id: id, teacher_name: teachers.find((t) => t.id === id)?.name ?? null });
                }}
              >
                <SelectTrigger aria-label="Teacher" className="order-4 sm:order-none">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={NO_TEACHER}>No teacher</SelectItem>
                  {teacherChoices(e.teacher_id).map((t) => (
                    <SelectItem key={t.id} value={String(t.id)}>
                      {t.name}
                    </SelectItem>
                  ))}
                  {/* Keep the current choice visible before the teacher list loads */}
                  {e.teacher_id && !teachers.some((t) => t.id === e.teacher_id) && (
                    <SelectItem value={String(e.teacher_id)}>{e.teacher_name || "Teacher"}</SelectItem>
                  )}
                </SelectContent>
              </Select>
              <Button
                size="sm"
                variant="ghost"
                aria-label="Remove this slot"
                className="h-8 w-8 p-0 text-destructive hover:text-destructive hover:bg-destructive/10 order-2 sm:order-none"
                onClick={() => setEntries((prev) => prev.filter((_, j) => j !== i))}
              >
                <Trash2 className="h-3.5 w-3.5" />
              </Button>
            </div>
          ))}
          <Button size="sm" variant="outline" onClick={addEntry} disabled={entries.length >= 21}>
            <Plus className="h-3.5 w-3.5 mr-1" /> Add day
          </Button>
        </div>

        {error && (
          <Alert variant="destructive">
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}

        <DialogFooter>
          <Button variant="outline" disabled={saving} onClick={onClose}>
            Cancel
          </Button>
          <Button onClick={handleSave} disabled={saving || entries.some((e) => !e.start_time)}>
            {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : "Save"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

export default RegularScheduleDialog;
