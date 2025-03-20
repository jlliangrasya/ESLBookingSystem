import { useState, useEffect } from "react";
import { useParams, useNavigate } from "react-router-dom";
import axios from "axios";
import BookingConfirmationModal from "../components/BookingConfirmationModal";

const TimeslotPage = () => {
  const { date } = useParams(); // Get selected date from URL
  const navigate = useNavigate();
  const [selectedSlot, setSelectedSlot] = useState<string | null>(null);
  const [showBookingModal, setShowBookingModal] = useState(false);

  useEffect(() => {
    if (!localStorage.getItem("token")) {
      console.error("No token found!");
      navigate("/login");
    }
  }, [navigate]);

  // Generate 30-minute slots from 8:00 AM to 9:00 PM
  const generateTimeSlots = () => {
    const slots: string[] = [];
    const startTime = new Date(`${date}T08:00:00`);
    const endTime = new Date(`${date}T21:00:00`);

    while (startTime < endTime) {
      slots.push(
        startTime.toLocaleTimeString([], {
          hour: "2-digit",
          minute: "2-digit",
          hour12: true, // Ensure AM/PM format
        })
      );
      startTime.setMinutes(startTime.getMinutes() + 30); // Increment by 30 minutes
    }

    return slots;
  };

  const handleSlotClick = (time: string) => {
    setSelectedSlot(time);
    setShowBookingModal(true);
  };

  const confirmBooking = async () => {
    if (!selectedSlot) {
      alert("Please select a time slot.");
      return;
    }

    try {
      const token = localStorage.getItem("token");
      if (!token) {
        console.error("No token found!");
        navigate("/login");
        return;
      }

      // Fetch student package ID using GET request
      const studentPackageResponse = await axios.get(
        `${import.meta.env.VITE_API_URL}/api/student/avail`,
        { headers: { Authorization: `Bearer ${token}` } }
      );
      console.log(import.meta.env.VITE_API_URL);

      const studentPackageId = studentPackageResponse.data?.student_package_id; // Ensure correct key
      if (!studentPackageId) {
        alert("No active package found. Please purchase a package.");
        return;
      }

      // Combine date and selected slot and convert to ISO string
      const appointmentDate = new Date(`${date} ${selectedSlot}`).toISOString();
      console.log("Formatted appointment date:", appointmentDate);

      // Send booking request to backend
      const response = await axios.post(
        `${import.meta.env.VITE_API_URL}/api/bookings`, // Corrected route
        {
          student_package_id: studentPackageId,
          appointment_date: appointmentDate, // Combine date and time
          status: "pending",
          rescheduled_by_admin: false,
        },
        { headers: { Authorization: `Bearer ${token}` } }
      );

      console.log("Booking saved:", response.data);
      alert("Booking confirmed successfully!");
      setShowBookingModal(false);
    } catch (error) {
      console.error("Error confirming booking:", error);
      alert("Failed to confirm booking. Please try again.");
    }
  };

  return (
    <div className="container mt-4">
      <h2>Available Time Slots for {date}</h2>
      <div className="grid grid-cols-3 gap-2 mt-4">
        {generateTimeSlots().map((slot, index) => (
          <button
            key={index}
            className="p-2 px-5 rounded hover:bg-blue-700 transition"
            onClick={() => handleSlotClick(slot)}
          >
            {slot}
          </button>
        ))}
      </div>

      {/* Booking Confirmation Modal */}
      <BookingConfirmationModal
        show={showBookingModal}
        onHide={() => setShowBookingModal(false)}
        confirmBooking={confirmBooking}
      />
    </div>
  );
};

export default TimeslotPage;
