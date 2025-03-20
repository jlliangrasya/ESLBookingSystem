import { useState, useEffect } from "react";
import { useParams, useNavigate } from "react-router-dom";
import axios from "axios";
import BookingConfirmationModal from "../components/BookingConfirmationModal";

interface Booking {
  id: number;
  student_package_id: number;
  appointment_date: string; // ISO string from backend
  status: string;
  rescheduled_by_admin: boolean;
}

interface ClosedSlot {
  date: string; // Format: "yyyy-MM-dd"
  time: string; // Format: e.g., "10:30 AM"
}

const TimeslotPage = () => {
  const { date } = useParams<{ date: string }>(); // e.g., "2025-03-20"
  const navigate = useNavigate();
  const [selectedSlot, setSelectedSlot] = useState<string | null>(null);
  const [showBookingModal, setShowBookingModal] = useState(false);
  const [bookedSlots, setBookedSlots] = useState<{ [key: string]: number }>({});
  const [closedSlots, setClosedSlots] = useState<string[]>([]);
  const [userPackageId, setUserPackageId] = useState<number | null>(null);

  useEffect(() => {
    if (!localStorage.getItem("token")) {
      console.error("No token found!");
      navigate("/login");
    }
  }, [navigate]);

  // Fetch current student's package ID
  useEffect(() => {
    const fetchStudentPackageId = async () => {
      try {
        const token = localStorage.getItem("token");
        const response = await axios.get(
          `${import.meta.env.VITE_API_URL}/api/student/avail`,
          { headers: { Authorization: `Bearer ${token}` } }
        );
        const fetchedPackageId = response.data?.student_package_id || null;
        setUserPackageId(fetchedPackageId);
        console.log("Fetched User's Package ID:", fetchedPackageId);
      } catch (error) {
        console.error("Error fetching student package ID:", error);
      }
    };

    fetchStudentPackageId();
  }, []);

  // Fetch booked slots for the given date
  useEffect(() => {
    const fetchBookedSlots = async () => {
      try {
        const token = localStorage.getItem("token");
        const response = await axios.get<Booking[]>(
          `${import.meta.env.VITE_API_URL}/api/student-bookings`,
          { headers: { Authorization: `Bearer ${token}` } }
        );
        console.log("API Response - Bookings:", response.data);

        const slotsMap: { [key: string]: number } = {};

        response.data.forEach((booking) => {
          const bookingDate = booking.appointment_date.split("T")[0]; // Extract YYYY-MM-DD

          if (bookingDate === date) {
            // Convert appointment_date to correct timeslot format
            const formattedTime = new Date(booking.appointment_date)
              .toLocaleTimeString("en-US", {
                hour: "2-digit",
                minute: "2-digit",
                hour12: true,
                timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone,
              })
              .toUpperCase();

            slotsMap[formattedTime] = booking.student_package_id; // Store package ID
          }
        });

        console.log("Processed Booked Slots:", slotsMap);
        setBookedSlots(slotsMap);
      } catch (error) {
        console.error("Error fetching booked slots:", error);
      }
    };

    if (date && userPackageId !== null) {
      fetchBookedSlots();
    }
  }, [date, userPackageId]);

  // useEffect(() => {
  //   const fetchBookings = async () => {
  //     const url = `/api/bookings?student_package_id=${userPackageId}`;
  //     console.log("Fetching:", url);

  //     const response = await fetch(url);
  //     const data = await response.json();

  //     console.log("API Response - Bookings:", data);
  //   };

  //   fetchBookings();
  // }, [userPackageId]);

  // Fetch closed slots from backend
  useEffect(() => {
    const fetchClosedSlots = async () => {
      try {
        const token = localStorage.getItem("token");
        const response = await axios.get<ClosedSlot[]>(
          `${import.meta.env.VITE_API_URL}/api/admin/closed-slots`,
          { headers: { Authorization: `Bearer ${token}` } }
        );
        // Filter closed slots for the selected date and normalize times to uppercase
        const slots = response.data
          .filter(
            (slot) => new Date(slot.date).toISOString().split("T")[0] === date
          )

          .map((slot) => slot.time.toUpperCase());

        console.log("Closed slots for", date, ":", slots);
        setClosedSlots(slots);
      } catch (error) {
        console.error("Error fetching closed slots:", error);
      }
    };

    if (date) {
      fetchClosedSlots();
    }
  }, [date]);

  // Generate 30-minute slots for the day (08:00 AM - 09:00 PM) normalized to uppercase
  const generateTimeSlots = () => {
    const slots: string[] = [];
    const startTime = new Date(`${date}T07:00:00`);
    const endTime = new Date(`${date}T23:00:00`);

    while (startTime < endTime) {
      const slotTime = startTime
        .toLocaleTimeString([], {
          hour: "2-digit",
          minute: "2-digit",
          hour12: true,
        })
        .toUpperCase();

      slots.push(slotTime);
      startTime.setMinutes(startTime.getMinutes() + 30);
    }
    console.log("Generated Slots for", date, ":", slots);
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
      console.log("Formatted appointment date:", appointmentDate);
      const response = await axios.post(
        `${import.meta.env.VITE_API_URL}/api/bookings`,
        {
          student_package_id: studentPackageId,
          appointment_date: appointmentDate,
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
      <div className="row g-2">
        {generateTimeSlots().map((slot, index) => {
          const now = new Date();
          const slotDateTime = new Date(`${date} ${slot}`);
          const isPast = slotDateTime < now;
          const isBooked = slot in bookedSlots;
          const bookedByUser = isBooked && bookedSlots[slot] === userPackageId;
          const isClosed = closedSlots.includes(slot);

          return (
            <div className="col-6 col-md-4 col-lg-3">
              <button
                key={index}
                className={`p-2 w-100 rounded text-center transition ${
                  isPast
                    ? "bg-gray-400 cursor-not-allowed" // Past slots
                    : bookedByUser
                    ? "bookedByUser-timeslot" // User's booking
                    : isBooked
                    ? "closed-timeslot" // Booked by someone else
                    : isClosed
                    ? "closed-timeslot cursor-not-allowed" // Closed by admin
                    : "student-timeslots" // Available slots
                }`}
                onClick={() => {
                  if (!isPast && !isBooked && !isClosed) {
                    handleSlotClick(slot);
                  }
                }}
                disabled={isPast || isBooked || isClosed}
              >
                {isPast
                  ? "UNAVAILABLE"
                  : bookedByUser
                  ? slot
                  : isBooked
                  ? "CLOSED"
                  : isClosed
                  ? "CLOSED"
                  : slot}
              </button>
            </div>
          );
        })}
      </div>

      <BookingConfirmationModal
        show={showBookingModal}
        onHide={() => setShowBookingModal(false)}
        confirmBooking={confirmBooking}
      />
    </div>
  );
};

export default TimeslotPage;
