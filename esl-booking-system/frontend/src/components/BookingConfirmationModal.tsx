import React from "react";
import { Modal, Button } from "react-bootstrap";

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
    <Modal show={show} onHide={onHide}>
      <Modal.Header closeButton>
        <Modal.Title>Book this schedule?</Modal.Title>
      </Modal.Header>
      <Modal.Footer>
        <Button variant="secondary" onClick={onHide}>
          No
        </Button>
        <Button variant="primary" onClick={confirmBooking}>
          Yes
        </Button>
      </Modal.Footer>
    </Modal>
  );
};

export default BookingConfirmationModal;
