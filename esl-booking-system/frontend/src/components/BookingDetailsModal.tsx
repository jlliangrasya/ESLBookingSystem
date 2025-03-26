import React from "react";
import { Modal, Button } from "react-bootstrap";

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

// Function to format date to "Month Day, Year at HH:mm AM/PM"
const formatDateTime = (utcDateString: string, timeslot: string) => {
  const date = new Date(utcDateString);

  return date.toLocaleString("en-US", {
    month: "long", // "March"
    day: "numeric", // "25"
    year: "numeric", // "2025"
    hour: "2-digit",
    minute: "2-digit",
    hour12: true, // "10:30 PM"
  });
};

const BookingDetailsModal: React.FC<BookingDetailsModalProps> = ({
  isOpen,
  onClose,
  booking,
  onCancelBooking,
}) => {
  if (!isOpen) return null;

  return (
    <Modal show={isOpen} onHide={onClose} centered>
      <Modal.Header closeButton>
        <Modal.Title>Booking Details</Modal.Title>
      </Modal.Header>
      <Modal.Body>
        <p>
          <strong>Subject:</strong> {booking.subject}
        </p>
        <p>
          <strong>Date:</strong>{" "}
          {formatDateTime(booking.appointment_date, booking.timeslot)}
        </p>
      </Modal.Body>
      <Modal.Footer>
        <Button variant="danger" onClick={() => onCancelBooking(booking.id)}>
          Cancel Schedule
        </Button>
        <Button variant="secondary" onClick={onClose}>
          Close
        </Button>
      </Modal.Footer>
    </Modal>
  );
};

export default BookingDetailsModal;
