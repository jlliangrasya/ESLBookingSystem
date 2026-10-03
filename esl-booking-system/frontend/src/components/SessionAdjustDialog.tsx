import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import axios from "axios";
import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

export type AdjustMode = "add" | "deduct";

interface SessionAdjustDialogProps {
  // null keeps the dialog closed
  mode: AdjustMode | null;
  studentPackageId: number | null;
  studentName?: string;
  sessionsRemaining: number;
  unusedSessions: number;
  onClose: () => void;
  // Called once the server accepts the change, before the dialog auto-closes.
  onAdjusted: (adjustment: number, newSessionsRemaining: number) => void;
}

// Add/Deduct sessions with a required reason. Shared by the student profile
// and the Students List so both go through the same form and audit trail.
const SessionAdjustDialog: React.FC<SessionAdjustDialogProps> = ({
  mode,
  studentPackageId,
  studentName,
  sessionsRemaining,
  unusedSessions,
  onClose,
  onAdjusted,
}) => {
  const { t } = useTranslation();
  const [amount, setAmount] = useState("1");
  const [remarkPreset, setRemarkPreset] = useState("");
  const [remarks, setRemarks] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  // Fresh form every time it opens
  useEffect(() => {
    if (mode) {
      setAmount("1");
      setRemarkPreset("");
      setRemarks("");
      setError(null);
      setSuccess(null);
    }
  }, [mode, studentPackageId]);

  const ADD_PRESETS = [
    {
      value: "Free Class",
      label: t("profile.adjustment.presets.add.freeClass"),
    },
    {
      value: "Teacher Absent",
      label: t("profile.adjustment.presets.add.teacherAbsent"),
    },
    {
      value: "Makeup Class",
      label: t("profile.adjustment.presets.add.makeupClass"),
    },
    {
      value: "Bonus Sessions",
      label: t("profile.adjustment.presets.add.bonusSessions"),
    },
    {
      value: "Referral Reward",
      label: t("profile.adjustment.presets.add.referralReward"),
    },
    {
      value: "Correction of Count",
      label: t("profile.adjustment.presets.add.correctionOfCount"),
    },
    { value: "Other", label: t("profile.adjustment.presets.add.other") },
  ];
  const DEDUCT_PRESETS = [
    {
      value: "Class Already Used",
      label: t("profile.adjustment.presets.deduct.classUsed"),
    },
    {
      value: "Student Absent",
      label: t("profile.adjustment.presets.deduct.studentAbsent"),
    },
    {
      value: "Session Consumed",
      label: t("profile.adjustment.presets.deduct.sessionConsumed"),
    },
    {
      value: "Correction of Count",
      label: t("profile.adjustment.presets.deduct.correctionOfCount"),
    },
    { value: "Other", label: t("profile.adjustment.presets.deduct.other") },
  ];

  const handleSubmit = async () => {
    if (!studentPackageId || !remarks.trim()) return;
    setLoading(true);
    setError(null);
    setSuccess(null);
    try {
      const adj =
        mode === "deduct"
          ? -Math.abs(Number(amount))
          : Math.abs(Number(amount));
      const token = localStorage.getItem("token");
      const res = await axios.post(
        `${import.meta.env.VITE_API_URL}/api/admin/student-packages/${studentPackageId}/adjust-sessions`,
        { adjustment: adj, remarks: remarks.trim() },
        { headers: { Authorization: `Bearer ${token}` } },
      );
      setSuccess(res.data.message);
      onAdjusted(adj, res.data.sessions_remaining);
      // Keep the dialog open briefly to show success, then close
      setTimeout(onClose, 1500);
    } catch (err: unknown) {
      const msg =
        (err as { response?: { data?: { message?: string } } })?.response?.data
          ?.message || "Failed to adjust sessions";
      setError(msg);
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog
      open={!!mode}
      onOpenChange={(o) => {
        if (!o) onClose();
      }}
    >
      <DialogContent className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle>
            {mode === "add" ? "Add Sessions" : "Deduct Sessions"}
            {studentName && (
              <span className="block text-sm font-normal text-muted-foreground mt-0.5">
                {studentName}
              </span>
            )}
          </DialogTitle>
        </DialogHeader>
        <div className="space-y-3 py-2">
          {error && <p className="text-sm text-destructive">{error}</p>}
          {success && <p className="text-sm text-green-600">{success}</p>}

          <div className="space-y-1.5">
            <Label>
              Number of sessions to {mode === "add" ? "add" : "deduct"}{" "}
              <span className="text-destructive">*</span>
            </Label>
            <Input
              type="number"
              min="1"
              max="100"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
            />
          </div>

          <div className="space-y-1.5">
            <Label>
              Reason <span className="text-destructive">*</span>
            </Label>
            <Select
              value={remarkPreset}
              onValueChange={(val) => {
                setRemarkPreset(val);
                if (val !== "Other") setRemarks(val);
                else setRemarks("");
              }}
            >
              <SelectTrigger>
                <SelectValue placeholder="Select a reason..." />
              </SelectTrigger>
              <SelectContent>
                {(mode === "add" ? ADD_PRESETS : DEDUCT_PRESETS).map(
                  (preset) => (
                    <SelectItem key={preset.value} value={preset.value}>
                      {preset.label}
                    </SelectItem>
                  ),
                )}
              </SelectContent>
            </Select>
            {remarkPreset === "Other" && (
              <Textarea
                placeholder="Enter custom reason..."
                value={remarks}
                onChange={(e) => setRemarks(e.target.value)}
                rows={2}
              />
            )}
            <p className="text-xs text-muted-foreground">
              This note will be included in the notification sent to the
              student.
            </p>
          </div>

          <div className="bg-muted/50 rounded-lg p-3 text-sm">
            <p className="text-muted-foreground">
              Remaining sessions: <strong>{unusedSessions}</strong>
            </p>
            <p className="text-muted-foreground">
              Available to book: <strong>{sessionsRemaining}</strong>
            </p>
            <p className="text-muted-foreground">
              After adjustment (available to book):{" "}
              <strong>
                {mode === "add"
                  ? sessionsRemaining + Math.abs(Number(amount) || 0)
                  : Math.max(
                      0,
                      sessionsRemaining - Math.abs(Number(amount) || 0),
                    )}
              </strong>
            </p>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button
            onClick={handleSubmit}
            disabled={
              loading ||
              !!success ||
              !remarks.trim() ||
              !amount ||
              Number(amount) < 1
            }
            variant={mode === "deduct" ? "destructive" : "default"}
          >
            {loading ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : mode === "add" ? (
              "Add Sessions"
            ) : (
              "Deduct Sessions"
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

export default SessionAdjustDialog;
