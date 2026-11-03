import { useEffect, useState } from "react";
import axios from "axios";
import { AlertTriangle, Check, Loader2 } from "lucide-react";
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
import { RegularScheduleList, type RegularScheduleEntry } from "@/components/RegularScheduleDialog";

type ApplyResult = {
  sessions_booked: number;
  sessions_remaining: number;
  groups: { label: string; sessions_booked: number; skipped_dates: { date: string; reason: string }[] }[];
};

interface ApplyRegularScheduleDialogProps {
  // null keeps the dialog closed
  student: {
    id: number;
    name: string;
    regular_schedule?: RegularScheduleEntry[] | null;
    student_package_id: number | null;
    sessions_remaining: number;
  } | null;
  onClose: () => void;
  // Called once classes are booked, so the page can refresh session counts.
  onApplied: () => void;
}

// Books the saved regular schedule onto the teachers' calendars for N weeks.
// Unlike editing the schedule, this creates real classes and deducts sessions.
const ApplyRegularScheduleDialog: React.FC<ApplyRegularScheduleDialogProps> = ({ student, onClose, onApplied }) => {
  const [weeks, setWeeks] = useState("4");
  const [startDate, setStartDate] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<ApplyResult | null>(null);

  // Fresh form every time it opens
  useEffect(() => {
    if (!student) return;
    setWeeks("4");
    setStartDate("");
    setError(null);
    setResult(null);
  }, [student]);

  const entries = student?.regular_schedule ?? [];
  const weeksNum = Math.min(12, Math.max(1, parseInt(weeks) || 4));
  const planned = entries.length * weeksNum;
  const available = student?.sessions_remaining ?? 0;

  const handleApply = async () => {
    if (!student) return;
    setLoading(true);
    setError(null);
    try {
      const token = localStorage.getItem("token");
      const res = await axios.post(
        `${import.meta.env.VITE_API_URL}/api/admin/students/${student.id}/regular-schedule/apply`,
        { student_package_id: student.student_package_id, num_weeks: weeksNum, start_date: startDate || undefined },
        { headers: { Authorization: `Bearer ${token}` } },
      );
      setResult(res.data);
      onApplied();
    } catch (err: unknown) {
      const data = axios.isAxiosError(err) ? err.response?.data : undefined;
      setError(data?.message || "Failed to apply regular schedule");
      if (data?.groups) setResult({ sessions_booked: 0, sessions_remaining: available, groups: data.groups });
    } finally {
      setLoading(false);
    }
  };

  const skipped = result?.groups.filter((g) => g.skipped_dates.length > 0) ?? [];
  const done = !!result && result.sessions_booked > 0;

  return (
    <Dialog
      open={!!student}
      onOpenChange={(open) => {
        if (!open && !loading) onClose();
      }}
    >
      <DialogContent className="max-w-md max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Apply to Schedule — {student?.name}</DialogTitle>
          <DialogDescription>
            Books these slots as real classes on the teachers' schedules and
            deducts 1 session per class from the student's package.
          </DialogDescription>
        </DialogHeader>

        <div className="rounded-lg border p-3">
          <RegularScheduleList entries={entries} />
        </div>

        {!done && (
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
            <div className="p-3 bg-primary/5 border border-primary/20 rounded-lg text-sm space-y-1">
              <p>
                <strong>Preview:</strong> up to {planned} classes over {weeksNum} week{weeksNum === 1 ? "" : "s"}
              </p>
              <p>
                Sessions available: <strong>{available}</strong>
              </p>
              {planned > available && (
                <p className="text-amber-600 flex items-center gap-1">
                  <AlertTriangle className="h-3 w-3" /> May not have enough sessions
                </p>
              )}
            </div>
          </>
        )}

        {done && (
          <div className="p-3 bg-green-50 border border-green-200 rounded-lg space-y-1">
            <p className="text-green-700 font-medium flex items-center gap-1.5">
              <Check className="h-4 w-4" /> Regular schedule applied!
            </p>
            <p className="text-sm">{result.sessions_booked} classes booked</p>
            <p className="text-sm">Sessions remaining: {result.sessions_remaining}</p>
          </div>
        )}

        {error && (
          <Alert variant="destructive">
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}

        {skipped.length > 0 && (
          <div>
            <p className="text-sm font-medium text-amber-600 mb-1 flex items-center gap-1">
              <AlertTriangle className="h-3.5 w-3.5" /> Skipped dates:
            </p>
            <div className="max-h-40 overflow-y-auto space-y-2 border rounded-lg p-2">
              {skipped.map((g) => (
                <div key={g.label}>
                  <p className="text-xs font-medium">{g.label}</p>
                  {g.skipped_dates.map((s, i) => (
                    <div key={i} className="text-xs flex gap-2">
                      <span className="font-mono text-gray-600">{s.date}</span>
                      <span className="text-amber-600">{s.reason}</span>
                    </div>
                  ))}
                </div>
              ))}
            </div>
          </div>
        )}

        <DialogFooter>
          {done ? (
            <Button onClick={onClose}>Done</Button>
          ) : (
            <>
              <Button variant="outline" disabled={loading} onClick={onClose}>
                Cancel
              </Button>
              <Button onClick={handleApply} disabled={loading || entries.length === 0 || !student?.student_package_id}>
                {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : "Apply to Schedule"}
              </Button>
            </>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

export default ApplyRegularScheduleDialog;
