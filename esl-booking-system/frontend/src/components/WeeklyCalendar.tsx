import { useState } from "react";
import {
  format,
  addDays,
  startOfWeek,
  isBefore,
  parse,
  parseISO,
} from "date-fns";
import axios from "axios";
import "bootstrap/dist/css/bootstrap.min.css";

interface Booking {
  id: number;
  student_name: string;
  package_name: string;
  appointment_date: string;
  status: "pending" | "confirmed" | "rejected";
  rescheduled_by_admin: boolean;
  created_at: string;
}

interface WeeklyCalendarProps {
  bookings: Booking[];
  closedSlots: { date: string; time: string }[];
  fetchClosedSlots: () => void; // Function to refresh closed slots
}

const WeeklyCalendar: React.FC<WeeklyCalendarProps> = ({
  bookings,
  closedSlots,
  fetchClosedSlots,
}) => {
  const [currentWeek, setCurrentWeek] = useState(new Date());
  const [selectedSlots, setSelectedSlots] = useState<
    { date: string; time: string }[]
  >([]);
  const [multiSelect, setMultiSelect] = useState(false);

  // Get the start of the week (Monday)
  const weekStart = startOfWeek(currentWeek, { weekStartsOn: 1 });

  // Generate 30-minute time slots (08:00 AM - 09:00 PM)
  const generateTimeSlots = () => {
    const slots: string[] = [];
    const startTime = new Date();
    startTime.setHours(7, 0, 0, 0); // Start at 07:00 AM
    const endTime = new Date();
    endTime.setHours(23, 0, 0, 0); // End at 11:00 PM

    while (startTime < endTime) {
      slots.push(format(startTime, "hh:mm a"));
      startTime.setMinutes(startTime.getMinutes() + 30);
    }

    return slots;
  };

  // Process booked slots from API
  const bookedSlots = bookings.map((booking) =>
    format(parseISO(booking.appointment_date), "yyyy-MM-dd hh:mm a")
  );

  const toggleSlotSelection = (date: string, time: string) => {
    if (!multiSelect) return;

    setSelectedSlots((prev) => {
      const exists = prev.some(
        (slot) => slot.date === date && slot.time === time
      );

      if (exists) {
        return prev.filter(
          (slot) => !(slot.date === date && slot.time === time)
        );
      } else {
        return [...prev, { date, time }];
      }
    });
  };

  const updateSlotStatus = async (action: "close" | "open") => {
    if (selectedSlots.length === 0) return;

    // Prevent closing already closed slots
    const filteredSlots =
      action === "close"
        ? selectedSlots.filter(
            (slot) =>
              !closedSlots.some(
                (closed) =>
                  closed.date === slot.date && closed.time === slot.time
              )
          )
        : selectedSlots; // No filtering needed when opening

    if (filteredSlots.length === 0) {
      console.warn("No new slots to update.");
      return;
    }

    try {
      const token = localStorage.getItem("token");
      await axios.post(
        `${import.meta.env.VITE_API_URL}/api/admin/update-slots`,
        { slots: selectedSlots, action },
        { headers: { Authorization: `Bearer ${token}` } }
      );

      setSelectedSlots([]);
      fetchClosedSlots(); // Refresh closed slots after update
    } catch (err) {
      console.error("Error updating slots", err);
    }
  };

  return (
    <div className="container mt-4 weekly-calendar">
      <h2 className="text-center">Weekly Calendar</h2>

      {/* Control Buttons */}
      <div className="d-flex justify-content-between mb-3">
        <button
          className="btn btn-secondary"
          onClick={() => setMultiSelect(!multiSelect)}
        >
          {multiSelect ? "Disable Multi-Select" : "Select Multiple Slots"}
        </button>
        <button
          className="btn btn-danger"
          disabled={selectedSlots.length === 0}
          onClick={() => updateSlotStatus("close")}
        >
          Close Slots
        </button>
        <button
          className="btn btn-success"
          disabled={selectedSlots.length === 0}
          onClick={() => updateSlotStatus("open")}
        >
          Open Slots
        </button>
      </div>

      {/* Week Navigation */}
      <div className="d-flex justify-content-between align-items-center mb-3">
        <button
          className="btn btn-primary"
          onClick={() => setCurrentWeek(addDays(currentWeek, -7))}
        >
          ⬅ Previous Week
        </button>
        <h4>
          {format(weekStart, "MMMM d, yyyy")} -{" "}
          {format(addDays(weekStart, 6), "MMMM d, yyyy")}
        </h4>
        <button
          className="btn btn-primary"
          onClick={() => setCurrentWeek(addDays(currentWeek, 7))}
        >
          Next Week ➡
        </button>
      </div>

      {/* Weekly Schedule Table */}
      <div className="table-responsive">
        <table className="table table-bordered text-center">
          <thead>
            <tr>
              <th>Time</th>
              {[...Array(7)].map((_, i) => (
                <th key={i}>{format(addDays(weekStart, i), "EEE MM/dd")}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {generateTimeSlots().map((time, i) => (
              <tr key={i}>
                {/* Time Column */}
                <td className="font-weight-bold">{time}</td>

                {/* Time Slots for Each Day */}
                {[...Array(7)].map((_, j) => {
                  const day = format(addDays(weekStart, j), "yyyy-MM-dd");
                  const timeSlot = `${day} ${time}`;

                  const slotDateTime = parse(
                    timeSlot,
                    "yyyy-MM-dd hh:mm a",
                    new Date()
                  );
                  const now = new Date();

                  const isClosed = closedSlots.some(
                    (slot) => slot.date === day && slot.time === time
                  );
                  const isBooked = bookedSlots.includes(timeSlot);
                  const isPast = isBefore(slotDateTime, now);
                  const isSelected = selectedSlots.some(
                    (slot) => slot.date === day && slot.time === time
                  );

                  let slotClass = "available";
                  let displayText = "Available";
                  let isClickable = true;

                  if (isPast) {
                    slotClass = "unavailable";
                    displayText = "UNAVAILABLE";
                    isClickable = false;
                  } else if (isBooked) {
                    slotClass = "booked";
                    displayText = "Booked";
                    isClickable = false;
                  } else if (isClosed) {
                    slotClass = "closed";
                    displayText = "Closed";
                    isClickable = false;
                  } else if (isSelected) {
                    slotClass = "selected";
                    displayText = "✔ Selected";
                  }

                  return (
                    <td
                      key={j}
                      className={`p-2 ${slotClass}`}
                      onClick={() =>
                        isClickable || (multiSelect && isClosed) // Allow clicking closed slots when multiSelect is on
                          ? toggleSlotSelection(day, time)
                          : null
                      }
                      style={{
                        cursor:
                          isClickable || (multiSelect && isClosed)
                            ? "pointer"
                            : "not-allowed",
                        opacity:
                          isClickable || (multiSelect && isClosed) ? 1 : 0.5,
                      }}
                    >
                      {displayText}
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Selected Slot Info */}
      {selectedSlots.length > 0 && (
        <div className="alert alert-info text-center mt-3">
          <h5>Selected Slots:</h5>
          {selectedSlots.map((slot, index) => (
            <p key={index}>{`${slot.date} ${slot.time}`}</p>
          ))}
        </div>
      )}
    </div>
  );
};

export default WeeklyCalendar;
