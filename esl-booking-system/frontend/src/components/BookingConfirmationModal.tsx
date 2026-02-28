import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogDescription,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { CalendarCheck } from "lucide-react";

interface Props {
  show: boolean;
  onHide: () => void;
  confirmBooking: () => void;
}

const BookingConfirmationModal: React.FC<Props> = ({
  show,
  onHide,
  confirmBooking,
}) => {
  return (
    <Dialog open={show} onOpenChange={onHide}>
      <DialogContent className="sm:max-w-sm">
        <DialogHeader>
          <div className="flex justify-center mb-2">
            <CalendarCheck className="h-10 w-10 text-primary" />
          </div>
          <DialogTitle className="text-center">Confirm Booking</DialogTitle>
          <DialogDescription className="text-center">
            Are you sure you want to book this schedule? This will use one
            session from your package.
          </DialogDescription>
        </DialogHeader>
        <DialogFooter className="flex gap-2 sm:justify-center">
          <Button variant="outline" onClick={onHide}>
            Cancel
          </Button>
          <Button onClick={confirmBooking}>Yes, Book It</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

export default BookingConfirmationModal;
