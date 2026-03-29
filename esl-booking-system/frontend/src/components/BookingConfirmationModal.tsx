import { useState, useEffect } from "react";
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
}

const BookingConfirmationModal: React.FC<Props> = ({
  show,
  onHide,
  confirmBooking,
  loading = false,
  showTeacherPicker = false,
  selectedDate,
  selectedTime,
  selectedTeacherId,
  onTeacherSelected,
}) => {
  const [availableTeachers, setAvailableTeachers] = useState<Teacher[]>([]);
  const [teachersLoading, setTeachersLoading] = useState(false);

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
          <DialogTitle className="text-center">Confirm Booking</DialogTitle>
          <DialogDescription className="text-center">
            Are you sure you want to book this schedule? This will use one
            session from your package.
          </DialogDescription>
        </DialogHeader>

        {showTeacherPicker && (
          <div className="px-1 py-2">
            <p className="text-sm font-medium mb-2">Select a teacher</p>
            {teachersLoading ? (
              <div className="flex items-center justify-center py-3">
                <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
                <span className="text-sm text-muted-foreground ml-2">Loading available teachers...</span>
              </div>
            ) : availableTeachers.length === 0 ? (
              <p className="text-sm text-destructive text-center py-2">
                No teachers available at this time. Please choose a different slot.
              </p>
            ) : (
              <Select
                value={selectedTeacherId ? String(selectedTeacherId) : ""}
                onValueChange={(v) => onTeacherSelected?.(Number(v))}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Choose a teacher" />
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
            {loading ? <><Loader2 className="h-4 w-4 animate-spin mr-2" /> Booking...</> : "Yes, Book It"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

export default BookingConfirmationModal;
