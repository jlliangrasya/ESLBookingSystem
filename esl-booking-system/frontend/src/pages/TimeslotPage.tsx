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
  // bookedSlots: key is a time string in uppercase (e.g., "10:30 AM"), value is student_package_id (number)
  const [bookedSlots, setBookedSlots] = useState<{ [key: string]: number }>({});
  // closedSlots: array of time strings (normalized to uppercase)
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
          // Convert appointment_date to a Date object
          const bookingDateTime = new Date(booking.appointment_date); // Ensure correct parsing
          const formattedTime = bookingDateTime
            .toLocaleTimeString("en-US", {
              hour: "2-digit",
              minute: "2-digit",
              hour12: true,
              timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone, // Uses user's local timezone
            })
            .toLowerCase();

          if (booking.student_package_id) {
            // Ensure ID is defined
            slotsMap[formattedTime] = booking.student_package_id;
          }
          console.log(
            `Booking Time: ${formattedTime}, Student Package ID:`,
            booking.student_package_id
          );

          slotsMap[formattedTime] = booking.student_package_id;
        });
        console.log("Processed Booked Slots:", slotsMap);
        setBookedSlots(slotsMap);
      } catch (error) {
        console.error("Error fetching booked slots:", error);
      }
    };

    if (date) {
      fetchBookedSlots();
    }
  }, [date]);

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
          .filter((slot) => slot.date === date)
          .map((slot) => slot.time.toUpperCase());
        setClosedSlots(slots);
        console.log("Closed slots for", date, ":", slots);
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
      <div className="grid grid-cols-3 gap-2 mt-4">
        {generateTimeSlots().map((slot, index) => {
          const now = new Date();
          const slotDateTime = new Date(`${date} ${slot}`);
          const isPast = slotDateTime < now;
          const isBooked = slot in bookedSlots;
          const bookedByUser =
            isBooked && Number(bookedSlots[slot]) === Number(userPackageId);

          const isClosed = closedSlots.includes(slot);

          return (
            <button
              key={index}
              className={`p-2 px-5 rounded transition ${
                isPast
                  ? "bg-gray-400 text-white cursor-not-allowed"
                  : bookedByUser
                  ? "bg-green-500 text-white"
                  : isBooked || isClosed
                  ? "bg-red-500 text-white cursor-not-allowed"
                  : "bg-blue-500 hover:bg-blue-700"
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
                ? "YOUR BOOKING"
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
    </div>
  );
};

export default TimeslotPage;
