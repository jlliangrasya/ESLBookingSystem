import { useEffect, useState } from "react";
import axios from "axios";
import { Loader2, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { fmtDate } from "@/utils/timezone";

/** The class to delete: any row of its booking group (the server removes the whole class). */
export interface DeleteClassTarget {
  id: number;
  appointment_date: string;
  student_name?: string | null;
  teacher_name?: string | null;
  student_absent?: boolean | number;
  teacher_absent?: boolean | number;
  late_notice?: boolean | number;
}

interface DeleteClassDialogProps {
  // null keeps the dialog closed
  target: DeleteClassTarget | null;
  onClose: () => void;
  onDeleted: (message: string) => void;
}

// Owner-only: permanently delete a finished class (present or absent).
// Shared by the student profile and the teacher profile class lists.
const DeleteClassDialog: React.FC<DeleteClassDialogProps> = ({ target, onClose, onDeleted }) => {
  const [refund, setRefund] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (target) {
      setRefund(true);
      setError(null);
    }
  }, [target]);

  const teacherAbsent = !!target?.teacher_absent;
  const attendance = !target ? ""
    : teacherAbsent ? "Teacher Absent"
    : target.late_notice ? "Late Notice"
    : target.student_absent ? "Student Absent"
    : "Present";

  const handleDelete = async () => {
    if (!target) return;
    setBusy(true);
    setError(null);
    try {
      const token = localStorage.getItem("token");
      const res = await axios.delete(`${import.meta.env.VITE_API_URL}/api/admin/bookings/${target.id}`, {
        headers: { Authorization: `Bearer ${token}` },
        params: { refund_session: refund && !teacherAbsent },
      });
      onDeleted(res.data?.message || "Class deleted.");
      onClose();
    } catch (err) {
      setError((err as { response?: { data?: { message?: string } } })?.response?.data?.message || "Failed to delete class");
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog open={!!target} onOpenChange={(o) => { if (!o && !busy) onClose(); }}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Trash2 className="h-5 w-5 text-destructive" /> Delete Class
          </DialogTitle>
        </DialogHeader>
        {target && (
          <div className="space-y-4 py-1">
            <div className="rounded-xl border p-3 text-sm space-y-1">
              <p className="font-medium">{fmtDate(target.appointment_date, "MMM d, yyyy h:mm a")}</p>
              {target.student_name && <p className="text-muted-foreground">Student: {target.student_name}</p>}
              {target.teacher_name && <p className="text-muted-foreground">Teacher: {target.teacher_name}</p>}
              <p className="text-muted-foreground">Attendance: {attendance}</p>
            </div>
            <p className="text-sm text-muted-foreground">
              This permanently removes the class and its class report. It will no longer count in the
              teacher's performance, payroll or the student's class history. This can't be undone.
            </p>
            {teacherAbsent ? (
              <p className="text-xs text-muted-foreground">
                The session for this class was already returned because the teacher was absent.
              </p>
            ) : (
              <div className="flex items-center justify-between gap-3 rounded-xl border p-3">
                <Label htmlFor="delete-class-refund" className="text-sm font-normal leading-snug">
                  Return 1 session to the student's package
                </Label>
                <Switch id="delete-class-refund" checked={refund} onCheckedChange={setRefund} disabled={busy} />
              </div>
            )}
            {error && <p className="text-sm text-destructive">{error}</p>}
          </div>
        )}
        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={busy}>Cancel</Button>
          <Button variant="destructive" onClick={handleDelete} disabled={busy} className="gap-1">
            {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />}
            Delete Class
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

export default DeleteClassDialog;
