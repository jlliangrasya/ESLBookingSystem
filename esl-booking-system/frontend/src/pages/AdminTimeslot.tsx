import { useState, useEffect } from "react";
import { useParams, useNavigate } from "react-router-dom";
import axios from "axios";
import BookingConfirmationModal from "../components/BookingConfirmationModal";

const AdminTimeslotPage = () => {
  const { date } = useParams();
  const navigate = useNavigate();
  const [selectedSlot, setSelectedSlot] = useState<string | null>(null);
  const [showBookingModal, setShowBookingModal] = useState(false);

  useEffect(() => {
    if (!localStorage.getItem("token")) navigate("/login");
  }, [navigate]);

  const generateTimeSlots = () => {
    const slots: string[] = [];
    const startTime = new Date(`${date}T07:00:00`);
    const endTime = new Date(`${date}T23:00:00`);
    while (startTime < endTime) {
      slots.push(
        startTime.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", hour12: true })
      );
      startTime.setMinutes(startTime.getMinutes() + 30);
    }
    return slots;
  };

  const handleSlotClick = (time: string) => {
    setSelectedSlot(time);
    setShowBookingModal(true);
  };

  const confirmBooking = async () => {
    if (!selectedSlot) return;
    try {
      const token = localStorage.getItem("token");
      if (!token) { navigate("/login"); return; }

      const studentPackageResponse = await axios.get(
        `${import.meta.env.VITE_API_URL}/api/student/avail`,
        { headers: { Authorization: `Bearer ${token}` } }
      );
      const studentPackageId = studentPackageResponse.data?.student_package_id;
      if (!studentPackageId) {
        alert("No active package found. Please purchase a package.");
        return;
      }

      const appointmentDate = new Date(`${date} ${selectedSlot}`).toISOString();
      await axios.post(
        `${import.meta.env.VITE_API_URL}/api/bookings`,
        {
          student_package_id: studentPackageId,
          appointment_date: appointmentDate,
          status: "pending",
          rescheduled_by_admin: false,
        },
        { headers: { Authorization: `Bearer ${token}` } }
      );

      alert("Booking confirmed successfully!");
      setShowBookingModal(false);
    } catch (error) {
      console.error("Error confirming booking:", error);
      alert("Failed to confirm booking. Please try again.");
    }
  };

  return (
    <div className="max-w-5xl mx-auto px-4 py-8">
      <h2 className="text-2xl font-bold mb-2">Time Slots</h2>
      <p className="text-muted-foreground text-sm mb-6">{date}</p>

      <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-2">
        {generateTimeSlots().map((slot, index) => (
          <button
            key={index}
            className="p-2 rounded-lg border text-sm font-medium bg-white hover:bg-primary hover:text-white transition-colors"
            onClick={() => handleSlotClick(slot)}
          >
            {slot}
          </button>
        ))}
      </div>

      <BookingConfirmationModal
        show={showBookingModal}
        onHide={() => setShowBookingModal(false)}
        confirmBooking={confirmBooking}
      />
    </div>
  );
};

export default AdminTimeslotPage;
