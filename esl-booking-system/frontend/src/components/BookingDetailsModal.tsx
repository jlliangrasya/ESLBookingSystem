import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogDescription,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { CalendarDays, BookOpen } from "lucide-react";
import { fmtDate } from "@/utils/timezone";

interface BookingDetailsModalProps {
  isOpen: boolean;
  onClose: () => void;
  booking: {
    id: number;
    appointment_date: string;
    timeslot: string;
    subject: string;
  };
  onCancelBooking: (bookingId: number) => void;
}

const BookingDetailsModal: React.FC<BookingDetailsModalProps> = ({
  isOpen,
  onClose,
  booking,
  onCancelBooking,
}) => {
  if (!isOpen) return null;

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle>Booking Details</DialogTitle>
          <DialogDescription>Your scheduled session information.</DialogDescription>
        </DialogHeader>

        <div className="space-y-3 py-2">
          <div className="flex items-center gap-3 text-sm">
            <BookOpen className="h-4 w-4 text-primary flex-shrink-0" />
            <span>
              <span className="text-muted-foreground">Subject: </span>
              <strong>{booking.subject}</strong>
            </span>
          </div>
          <div className="flex items-center gap-3 text-sm">
            <CalendarDays className="h-4 w-4 text-primary flex-shrink-0" />
            <span>
              <span className="text-muted-foreground">Date: </span>
              <strong>{fmtDate(booking.appointment_date, "MMMM d, yyyy h:mm a")}</strong>
            </span>
          </div>
        </div>

        <DialogFooter className="flex gap-2">
          <Button
            variant="destructive"
            onClick={() => onCancelBooking(booking.id)}
          >
            Cancel Schedule
          </Button>
          <Button variant="outline" onClick={onClose}>
            Close
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

export default BookingDetailsModal;
