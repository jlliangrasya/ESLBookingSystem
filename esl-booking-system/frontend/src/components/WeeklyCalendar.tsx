import { useState } from "react";
import {
  format,
  addDays,
  startOfWeek,
  isBefore,
  parse,
} from "date-fns";
import axios from "axios";
import { Button } from "@/components/ui/button";
import { ChevronLeft, ChevronRight } from "lucide-react";
import "../index.css";
import { fmtDate } from "@/utils/timezone";

interface Booking {
  appointment_date: string;
  [key: string]: unknown;
}

interface WeeklyCalendarProps {
  bookings: Booking[];
  closedSlots: { date: string; time: string }[];
  fetchClosedSlots: () => void;
  onUpdateSlots?: (slots: { date: string; time: string }[], action: "close" | "open") => Promise<void>;
}

const WeeklyCalendar: React.FC<WeeklyCalendarProps> = ({
  bookings,
  closedSlots,
  fetchClosedSlots,
  onUpdateSlots,
}) => {
  const [currentWeek, setCurrentWeek] = useState(new Date());
  const [selectedSlots, setSelectedSlots] = useState<{ date: string; time: string }[]>([]);
  const [multiSelect, setMultiSelect] = useState(false);

  const weekStart = startOfWeek(currentWeek, { weekStartsOn: 1 });

  const generateTimeSlots = () => {
    const slots: string[] = [];
    const startTime = new Date();
    startTime.setHours(7, 0, 0, 0);
    const endTime = new Date();
    endTime.setHours(23, 0, 0, 0);
    while (startTime < endTime) {
      slots.push(format(startTime, "hh:mm a"));
      startTime.setMinutes(startTime.getMinutes() + 30);
    }
    return slots;
  };

  const bookedSlots = bookings.map((booking) =>
    fmtDate(booking.appointment_date, "yyyy-MM-dd hh:mm a")
  );

  const toggleSlotSelection = (date: string, time: string) => {
    if (!multiSelect) return;
    setSelectedSlots((prev) => {
      const exists = prev.some((s) => s.date === date && s.time === time);
      if (exists) return prev.filter((s) => !(s.date === date && s.time === time));
      return [...prev, { date, time }];
    });
  };

  const updateSlotStatus = async (action: "close" | "open") => {
    if (selectedSlots.length === 0) return;
    const filteredSlots =
      action === "close"
        ? selectedSlots.filter(
            (slot) =>
              !closedSlots.some(
                (closed) => closed.date === slot.date && closed.time === slot.time
              )
          )
        : selectedSlots;
    if (filteredSlots.length === 0) return;

    try {
      if (onUpdateSlots) {
        await onUpdateSlots(filteredSlots, action);
      } else {
        const token = localStorage.getItem("token");
        await axios.post(
          `${import.meta.env.VITE_API_URL}/api/admin/update-slots`,
          { slots: selectedSlots, action },
          { headers: { Authorization: `Bearer ${token}` } }
        );
      }
      setSelectedSlots([]);
      fetchClosedSlots();
    } catch (err) {
      console.error("Error updating slots", err);
    }
  };

  return (
    <div className="weekly-calendar mt-6">
      <h2 className="text-xl font-semibold text-center mb-4">Weekly Calendar</h2>

      {/* Controls */}
      <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
        <Button
          variant={multiSelect ? "default" : "outline"}
          size="sm"
          onClick={() => {
            setMultiSelect(!multiSelect);
            setSelectedSlots([]);
          }}
        >
          {multiSelect ? "Disable Multi-Select" : "Select Multiple Slots"}
        </Button>

        <div className="flex gap-2">
          <Button
            size="sm"
            variant="destructive"
            disabled={selectedSlots.length === 0}
            onClick={() => updateSlotStatus("close")}
          >
            Close Slots
          </Button>
          <Button
            size="sm"
            className="bg-green-600 hover:bg-green-700"
            disabled={selectedSlots.length === 0}
            onClick={() => updateSlotStatus("open")}
          >
            Open Slots
          </Button>
        </div>
      </div>

      {/* Week Navigation */}
      <div className="flex items-center justify-between mb-4">
        <Button
          variant="outline"
          size="sm"
          onClick={() => setCurrentWeek(addDays(currentWeek, -7))}
        >
          <ChevronLeft className="h-4 w-4" />
          Prev
        </Button>
        <span className="text-sm font-medium">
          {format(weekStart, "MMM d")} – {format(addDays(weekStart, 6), "MMM d, yyyy")}
        </span>
        <Button
          variant="outline"
          size="sm"
          onClick={() => setCurrentWeek(addDays(currentWeek, 7))}
        >
          Next
          <ChevronRight className="h-4 w-4" />
        </Button>
      </div>

      {/* Table */}
      <div className="overflow-x-auto">
        <table>
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
                <td className="font-semibold text-xs">{time}</td>
                {[...Array(7)].map((_, j) => {
                  const day = format(addDays(weekStart, j), "yyyy-MM-dd");
                  const timeSlot = `${day} ${time}`;
                  const slotDateTime = parse(timeSlot, "yyyy-MM-dd hh:mm a", new Date());
                  const now = new Date();

                  const isClosed = closedSlots.some(
                    (s) => s.date === day && s.time === time
                  );
                  const isBooked = bookedSlots.includes(timeSlot);
                  const isPast = isBefore(slotDateTime, now);
                  const isSelected = selectedSlots.some(
                    (s) => s.date === day && s.time === time
                  );

                  let slotClass = "available";
                  let displayText = "";
                  let isClickable = true;

                  if (isPast) {
                    slotClass = "";
                    displayText = "";
                    isClickable = false;
                  } else if (isBooked) {
                    slotClass = "booked";
                    displayText = "Booked";
                    isClickable = false;
                  } else if (isClosed) {
                    slotClass = "closed";
                    displayText = "Closed";
                    isClickable = multiSelect;
                  } else if (isSelected) {
                    slotClass = "selected";
                    displayText = "✔";
                  }

                  return (
                    <td
                      key={j}
                      className={slotClass}
                      onClick={() =>
                        (isClickable || (multiSelect && isClosed))
                          ? toggleSlotSelection(day, time)
                          : undefined
                      }
                      style={{
                        cursor:
                          isClickable || (multiSelect && isClosed)
                            ? "pointer"
                            : "not-allowed",
                        opacity: isPast ? 0.35 : 1,
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

      {/* Selected Slots Info */}
      {selectedSlots.length > 0 && (
        <div className="mt-4 p-3 rounded-lg bg-sky-50 border border-sky-200 text-sm">
          <p className="font-semibold mb-1">Selected Slots ({selectedSlots.length})</p>
          <div className="flex flex-wrap gap-2">
            {selectedSlots.map((slot, i) => (
              <span key={i} className="bg-primary/20 text-primary px-2 py-0.5 rounded text-xs">
                {slot.date} {slot.time}
              </span>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};

export default WeeklyCalendar;
