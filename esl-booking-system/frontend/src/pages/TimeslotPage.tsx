import { useState, useEffect } from "react";
import { useParams, useNavigate } from "react-router-dom";
import axios from "axios";
import BookingConfirmationModal from "../components/BookingConfirmationModal";
import BookingDetailsModal from "../components/BookingDetailsModal";
import { cn } from "@/lib/utils";

interface Booking {
  id: number;
  student_package_id: number;
  appointment_date: string;
  timeslot: string;
  status: string;
  rescheduled_by_admin: boolean;
}

interface ClosedSlot {
  date: string;
  time: string;
}

const TimeslotPage = () => {
  const { date } = useParams<{ date: string }>();
  const navigate = useNavigate();
  const [selectedSlot, setSelectedSlot] = useState<string | null>(null);
  const [showBookingModal, setShowBookingModal] = useState(false);
  const [bookedSlots, setBookedSlots] = useState<{ [key: string]: number }>({});
  const [closedSlots, setClosedSlots] = useState<string[]>([]);
  const [userPackageId, setUserPackageId] = useState<number | null>(null);
  const [selectedBooking, setSelectedBooking] = useState<Booking | null>(null);
  const [subject, setSubject] = useState<string | null>(null);
  const [isModalOpen, setIsModalOpen] = useState(false);

  useEffect(() => {
    if (!localStorage.getItem("token")) navigate("/login");
  }, [navigate]);

  useEffect(() => {
    const fetchStudentPackageId = async () => {
      try {
        const token = localStorage.getItem("token");
        const response = await axios.get(
          `${import.meta.env.VITE_API_URL}/api/student/avail`,
          { headers: { Authorization: `Bearer ${token}` } }
        );
        setUserPackageId(response.data?.student_package_id || null);
      } catch (error) {
        console.error("Error fetching student package ID:", error);
      }
    };
    fetchStudentPackageId();
  }, []);

  useEffect(() => {
    if (!date || userPackageId === null) return;

    const fetchBookedSlots = async () => {
      try {
        const token = localStorage.getItem("token");
        const response = await axios.get<Booking[]>(
          `${import.meta.env.VITE_API_URL}/api/student-bookings`,
          { headers: { Authorization: `Bearer ${token}` } }
        );

        const slotsMap: { [key: string]: number } = {};
        response.data.forEach((booking) => {
          const bookingDate = booking.appointment_date.split("T")[0];
          if (bookingDate === date) {
            const formattedTime = new Date(booking.appointment_date)
              .toLocaleTimeString("en-US", {
                hour: "2-digit",
                minute: "2-digit",
                hour12: true,
                timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone,
              })
              .toUpperCase();
            slotsMap[formattedTime] = booking.student_package_id;
          }
        });

        setBookedSlots(slotsMap);
      } catch (error) {
        console.error("Error fetching booked slots:", error);
      }
    };

    fetchBookedSlots();
  }, [date, userPackageId]);

  useEffect(() => {
    if (!date) return;

    const fetchClosedSlots = async () => {
      try {
        const token = localStorage.getItem("token");
        const response = await axios.get<ClosedSlot[]>(
          `${import.meta.env.VITE_API_URL}/api/admin/closed-slots`,
          { headers: { Authorization: `Bearer ${token}` } }
        );
        const slots = response.data
          .filter(
            (slot) => new Date(slot.date).toISOString().split("T")[0] === date
          )
          .map((slot) => slot.time.toUpperCase());
        setClosedSlots(slots);
      } catch (error) {
        console.error("Error fetching closed slots:", error);
      }
    };

    fetchClosedSlots();
  }, [date]);

  const generateTimeSlots = () => {
    const slots: string[] = [];
    const startTime = new Date(`${date}T07:00:00`);
    const endTime = new Date(`${date}T23:00:00`);
    while (startTime < endTime) {
      slots.push(
        startTime
          .toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", hour12: true })
          .toUpperCase()
      );
      startTime.setMinutes(startTime.getMinutes() + 30);
    }
    return slots;
  };

  const convertToLocalTime = (utcDateString: string) =>
    new Date(utcDateString)
      .toLocaleString(undefined, {
        timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone,
        hour: "2-digit",
        minute: "2-digit",
        hour12: true,
      })
      .toUpperCase();

  const fetchSubject = async (student_package_id: number) => {
    try {
      const token = localStorage.getItem("token");
      if (!token) return;
      const response = await axios.get(
        `${import.meta.env.VITE_API_URL}/api/student-package/${student_package_id}`,
        { headers: { Authorization: `Bearer ${token}` } }
      );
      setSubject(response.data.subject);
    } catch (error) {
      console.error("Error fetching subject:", error);
    }
  };

  const handleBookedSlotClick = (booking: Booking) => {
    fetchSubject(booking.student_package_id);
    setSelectedBooking(booking);
    setIsModalOpen(true);
  };

  const handleCancelBooking = async (bookingId: number) => {
    try {
      const token = localStorage.getItem("token");
      if (!token) return;
      await axios.delete(
        `${import.meta.env.VITE_API_URL}/api/bookings/${bookingId}`,
        { headers: { Authorization: `Bearer ${token}` } }
      );
      setBookedSlots((prev) => {
        const updated = { ...prev };
        Object.keys(updated).forEach((slotTime) => {
          if (updated[slotTime] === bookingId) delete updated[slotTime];
        });
        return updated;
      });
      setIsModalOpen(false);
    } catch (error) {
      console.error("Error deleting booking:", error);
    }
  };

  const handleSlotClick = async (slot: string) => {
    setSelectedSlot(slot);

    // Check if this is a slot booked by the current user
    const bookedByUser = slot in bookedSlots && bookedSlots[slot] === userPackageId;
    if (bookedByUser) {
      try {
        const token = localStorage.getItem("token");
        const response = await axios.get<Booking[]>(
          `${import.meta.env.VITE_API_URL}/api/student-bookings`,
          { headers: { Authorization: `Bearer ${token}` } }
        );
        const userBooking = response.data.find((booking) => {
          const localDate = new Date(booking.appointment_date).toISOString().split("T")[0];
          const localTime = convertToLocalTime(booking.appointment_date);
          return (
            localDate === date &&
            localTime === slot &&
            booking.student_package_id === userPackageId
          );
        });
        if (userBooking) handleBookedSlotClick(userBooking);
      } catch (error) {
        console.error("Error fetching booking details:", error);
      }
    } else {
      setShowBookingModal(true);
    }
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
          status: "confirmed",
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
      <div className="mb-6">
        <h2 className="text-2xl font-bold text-gray-800">
          Available Time Slots
        </h2>
        <p className="text-muted-foreground text-sm mt-1">{date}</p>
      </div>

      {/* Legend */}
      <div className="flex flex-wrap gap-3 mb-6 text-xs">
        <span className="flex items-center gap-1.5">
          <span className="w-3 h-3 rounded-full bg-[#6bd4fd54] border border-[#6bd4fd] inline-block" />
          Available
        </span>
        <span className="flex items-center gap-1.5">
          <span className="w-3 h-3 rounded-full bg-[#25ce4cc7] inline-block" />
          Your booking
        </span>
        <span className="flex items-center gap-1.5">
          <span className="w-3 h-3 rounded-full bg-[#929292b6] inline-block" />
          Closed / Booked
        </span>
        <span className="flex items-center gap-1.5">
          <span className="w-3 h-3 rounded-full bg-gray-300 inline-block" />
          Unavailable
        </span>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-2">
        {generateTimeSlots().map((slot, index) => {
          const now = new Date();
          const slotDateTime = new Date(`${date} ${slot}`);
          const isPast = slotDateTime < now;
          const isBooked = slot in bookedSlots;
          const bookedByUser = isBooked && bookedSlots[slot] === userPackageId;
          const isClosed = closedSlots.includes(slot);

          const isDisabled = isPast || (!bookedByUser && (isBooked || isClosed));

          return (
            <button
              key={`${date}-${slot}-${index}`}
              className={cn(
                "p-2 w-full rounded-lg text-sm text-center font-medium transition-all border",
                isPast
                  ? "bg-gray-200 text-gray-400 cursor-not-allowed border-gray-200"
                  : bookedByUser
                  ? "bookedByUser-timeslot"
                  : isBooked || isClosed
                  ? "closed-timeslot"
                  : "student-timeslots"
              )}
              onClick={() => !isDisabled && handleSlotClick(slot)}
              disabled={isDisabled}
            >
              {isPast
                ? "UNAVAILABLE"
                : bookedByUser
                ? slot
                : isBooked || isClosed
                ? "CLOSED"
                : slot}
            </button>
          );
        })}
      </div>

      <BookingConfirmationModal
        show={showBookingModal}
        onHide={() => setShowBookingModal(false)}
        confirmBooking={confirmBooking}
      />

      {selectedBooking && subject && (
        <BookingDetailsModal
          isOpen={isModalOpen}
          onClose={() => setIsModalOpen(false)}
          booking={{ ...selectedBooking, subject }}
          onCancelBooking={handleCancelBooking}
        />
      )}
    </div>
  );
};

export default TimeslotPage;
