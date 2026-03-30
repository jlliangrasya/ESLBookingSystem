import { useState, useEffect } from "react";
import { useTranslation } from "react-i18next";
import axios from "axios";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogDescription,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { CalendarCheck, Loader2 } from "lucide-react";

interface Teacher {
  id: number;
  name: string;
}

interface Props {
  show: boolean;
  onHide: () => void;
  confirmBooking: () => void;
  loading?: boolean;
  showTeacherPicker?: boolean;
  selectedDate?: string;
  selectedTime?: string;
  selectedTeacherId?: number | null;
  onTeacherSelected?: (id: number | null) => void;
  slotsNeeded?: number;
  durationMinutes?: number;
}

const BookingConfirmationModal: React.FC<Props> = ({
  show,
  onHide,
  confirmBooking,
  loading = false,
  showTeacherPicker = false,
  slotsNeeded = 1,
  durationMinutes = 25,
  selectedDate,
  selectedTime,
  selectedTeacherId,
  onTeacherSelected,
}) => {
  const [availableTeachers, setAvailableTeachers] = useState<Teacher[]>([]);
  const [teachersLoading, setTeachersLoading] = useState(false);

  const { t } = useTranslation();

  useEffect(() => {
    if (!show || !showTeacherPicker || !selectedDate || !selectedTime) {
      setAvailableTeachers([]);
      return;
    }
    const fetchTeachers = async () => {
      setTeachersLoading(true);
      try {
        const token = localStorage.getItem("token");
        const res = await axios.get(
          `${import.meta.env.VITE_API_URL}/api/student/available-teachers?date=${selectedDate}&time=${encodeURIComponent(selectedTime)}`,
          { headers: { Authorization: `Bearer ${token}` } }
        );
        setAvailableTeachers(Array.isArray(res.data) ? res.data : []);
      } catch {
        setAvailableTeachers([]);
      } finally {
        setTeachersLoading(false);
      }
    };
    fetchTeachers();
  }, [show, showTeacherPicker, selectedDate, selectedTime]);

  const canConfirm = !showTeacherPicker || !!selectedTeacherId;

  return (
    <Dialog open={show} onOpenChange={(o) => { if (!o && !loading) onHide(); }}>
      <DialogContent className="sm:max-w-sm">
        <DialogHeader>
          <div className="flex justify-center mb-2">
            <div className="brand-gradient rounded-xl p-2.5 shadow-md">
              <CalendarCheck className="h-8 w-8 text-white" />
            </div>
          </div>
          <DialogTitle className="text-center">{t("timeslot.confirmBooking")}</DialogTitle>
          <DialogDescription className="text-center">
            {slotsNeeded > 1
              ? t("timeslot.confirmMulti", { duration: durationMinutes, slots: slotsNeeded })
              : t("timeslot.confirmSingle")}
          </DialogDescription>
        </DialogHeader>

        {showTeacherPicker && (
          <div className="px-1 py-2">
            <p className="text-sm font-medium mb-2">{t("timeslot.selectTeacher")}</p>
            {teachersLoading ? (
              <div className="flex items-center justify-center py-3">
                <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
                <span className="text-sm text-muted-foreground ml-2">{t("timeslot.loadingTeachers")}</span>
              </div>
            ) : availableTeachers.length === 0 ? (
              <p className="text-sm text-destructive text-center py-2">
                {t("timeslot.noTeachers")}
              </p>
            ) : (
              <Select
                value={selectedTeacherId ? String(selectedTeacherId) : ""}
                onValueChange={(v) => onTeacherSelected?.(Number(v))}
              >
                <SelectTrigger>
                  <SelectValue placeholder={t("timeslot.chooseTeacher")} />
                </SelectTrigger>
                <SelectContent>
                  {availableTeachers.map((t) => (
                    <SelectItem key={t.id} value={String(t.id)}>{t.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
          </div>
        )}

        <DialogFooter className="flex gap-2 sm:justify-center">
          <Button variant="outline" onClick={onHide} disabled={loading}>
            Cancel
          </Button>
          <Button
            onClick={confirmBooking}
            disabled={loading || !canConfirm || (showTeacherPicker && availableTeachers.length === 0)}
          >
            {loading ? <><Loader2 className="h-4 w-4 animate-spin mr-2" /> {t("timeslot.booking")}</> : t("timeslot.yesBookIt")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

export default BookingConfirmationModal;
