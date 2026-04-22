import { useState, useEffect, useCallback } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import axios from "axios";
import BookingConfirmationModal from "../components/BookingConfirmationModal";
import { cn } from "@/lib/utils";
import { fmtDate, fmtTime, localToMysql, parseUTC } from "@/utils/timezone";
import { Button } from "@/components/ui/button";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { CalendarDays, Check, Copy, Info, RefreshCw, User, Video } from "lucide-react";

interface Booking {
  id: number;
  student_package_id: number;
  appointment_date: string;
  timeslot: string;
  status: string;
  rescheduled_by_admin: boolean;
  teacher_name?: string | null;
  class_mode?: string | null;
  meeting_link?: string | null;
  teacher_absent?: boolean;
  student_absent?: boolean;
}

const TimeslotPage = () => {
  const { t } = useTranslation();
  const { date } = useParams<{ date: string }>();
  const navigate = useNavigate();
  const [selectedSlot, setSelectedSlot] = useState<string | null>(null);
  const [showBookingModal, setShowBookingModal] = useState(false);
  const [bookingLoading, setBookingLoading] = useState(false);
  const [bookedSlots, setBookedSlots] = useState<{ [key: string]: Booking }>({});
  const [, setUserPackageId] = useState<number | null>(null);
  const [, setSubject] = useState<string | null>(null);
  const [showClassModal, setShowClassModal] = useState(false);
  const [selectedDateBookings, setSelectedDateBookings] = useState<Booking[]>([]);
  const [copiedLinkId, setCopiedLinkId] = useState<number | null>(null);
  const [absentLoadingId, setAbsentLoadingId] = useState<number | null>(null);
  const [cancellingId, setCancellingId] = useState<number | null>(null);

  // Teacher-aware scheduling
  const [effectiveTeacherId, setEffectiveTeacherId] = useState<number | null>(null);
  const [needsTeacherPicker, setNeedsTeacherPicker] = useState(false);
  const [selectedTeacherId, setSelectedTeacherId] = useState<number | null>(null);
  const [openSlots, setOpenSlots] = useState<Set<string>>(new Set());
  const [bookedMap, setBookedMap] = useState<Record<string, string>>({});
  const [durationMinutes, setDurationMinutes] = useState<number>(25);
  const slotsNeeded = Math.max(1, Math.ceil(durationMinutes / 30));
  const [contextLoaded, setContextLoaded] = useState(false);

  useEffect(() => {
    if (!localStorage.getItem("token")) navigate("/login");
  }, [navigate]);

  useEffect(() => {
    const fetchStudentContext = async () => {
      try {
        const token = localStorage.getItem("token");
        const headers = { Authorization: `Bearer ${token}` };
        const base = import.meta.env.VITE_API_URL;

        const [availRes, teachersRes, settingsRes] = await Promise.all([
          axios.get(`${base}/api/student/avail`, { headers }).catch(() => ({ data: null })),
          axios.get(`${base}/api/student/teachers`, { headers }),
          axios.get(`${base}/api/admin/company-settings`, { headers }),
        ]);

        const pkgTeacherId = availRes.data?.teacher_id || null;
        const teachers = Array.isArray(teachersRes.data) ? teachersRes.data : [];
        const allowPick = settingsRes.data?.allow_student_pick_teacher ?? true;

        setUserPackageId(availRes.data?.student_package_id || null);
        setDurationMinutes(availRes.data?.duration_minutes || 25);

        // Derive effective teacher: assigned > single teacher > none
        const effective = pkgTeacherId || (teachers.length === 1 ? teachers[0].id : null);
        setEffectiveTeacherId(effective);

        // Need picker: no effective teacher + multiple teachers + allow pick ON
        setNeedsTeacherPicker(!effective && teachers.length > 1 && allowPick);
      } catch (error) {
        console.error("Error fetching student context:", error);
      } finally {
        setContextLoaded(true);
      }
    };
    fetchStudentContext();
  }, []);

  const [refreshing, setRefreshing] = useState(false);

  const fetchBookedSlots = useCallback(async () => {
    if (!date || !contextLoaded) return;
    try {
      const token = localStorage.getItem("token");
      const response = await axios.get<Booking[]>(
        `${import.meta.env.VITE_API_URL}/api/student/bookings`,
        { headers: { Authorization: `Bearer ${token}` } }
      );
      const slotsMap: { [key: string]: Booking } = {};
      response.data.forEach((booking) => {
        const bookingDate = fmtDate(booking.appointment_date, "yyyy-MM-dd");
        if (bookingDate === date) {
          const formattedTime = fmtTime(booking.appointment_date).toUpperCase();
          slotsMap[formattedTime] = { ...booking, timeslot: formattedTime };
        }
      });
      setBookedSlots(slotsMap);
    } catch (error) {
      console.error("Error fetching booked slots:", error);
    }
  }, [date, contextLoaded]);

  const fetchTeacherSlots = useCallback(async () => {
    if (!date || !contextLoaded) return;
    try {
      const token = localStorage.getItem("token");
      const teacherParam = effectiveTeacherId ? `&teacher_id=${effectiveTeacherId}` : "";
      const res = await axios.get(
        `${import.meta.env.VITE_API_URL}/api/student/teacher-slots?date=${date}${teacherParam}`,
        { headers: { Authorization: `Bearer ${token}` } }
      );
      setOpenSlots(new Set(res.data.open_slots || []));
      setBookedMap(res.data.booked_map || {});
    } catch (error) {
      console.error("Error fetching teacher slots:", error);
    }
  }, [date, effectiveTeacherId, contextLoaded]);

  const handleRefresh = async () => {
    setRefreshing(true);
    await Promise.all([fetchBookedSlots(), fetchTeacherSlots()]);
    setRefreshing(false);
  };

  useEffect(() => { fetchBookedSlots(); }, [fetchBookedSlots]);
  useEffect(() => { fetchTeacherSlots(); }, [fetchTeacherSlots]);

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
    setSelectedDateBookings([{ ...booking, teacher_name: booking.teacher_name ?? null }]);
    setShowClassModal(true);
  };

  const handleCancelBooking = async (bookingId: number) => {
    setCancellingId(bookingId);
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
          if (updated[slotTime].id === bookingId) delete updated[slotTime];
        });
        return updated;
      });
      setShowClassModal(false);
    } catch (error) {
      console.error("Error deleting booking:", error);
    } finally {
      setCancellingId(null);
    }
  };

  const handleMarkTeacherAbsent = async (bookingId: number) => {
    setAbsentLoadingId(bookingId);
    try {
      const token = localStorage.getItem("token");
      if (!token) return;
      await axios.post(
        `${import.meta.env.VITE_API_URL}/api/student/bookings/${bookingId}/mark-teacher-absent`,
        {},
        { headers: { Authorization: `Bearer ${token}` } }
      );
      setSelectedDateBookings((prev) =>
        prev.map((b) => (b.id === bookingId ? { ...b, teacher_absent: true } : b))
      );
    } catch (error) {
      console.error("Error marking teacher absent:", error);
    } finally {
      setAbsentLoadingId(null);
    }
  };

  const handleSlotClick = async (slot: string) => {
    setSelectedSlot(slot);

    // Check if this is a slot booked by the current user
    // bookedSlots only contains the student's own bookings (API filters by student_id)
    const bookedByUser = slot in bookedSlots;
    if (bookedByUser) {
      handleBookedSlotClick(bookedSlots[slot]);
    } else {
      setShowBookingModal(true);
    }
  };

  const confirmBooking = async () => {
    if (!selectedSlot || bookingLoading) return;
    setBookingLoading(true);
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

      const to24Hour = (slot: string) => {
        const match = slot.match(/^(\d{1,2}):(\d{2})\s?(AM|PM)$/i);
        if (!match) return null;
        let hour = parseInt(match[1], 10);
        const minute = match[2];
        const meridiem = match[3].toUpperCase();
        if (meridiem === "AM" && hour === 12) hour = 0;
        if (meridiem === "PM" && hour < 12) hour += 12;
        return `${String(hour).padStart(2, "0")}:${minute}:00`;
      };
      const time24 = to24Hour(selectedSlot);
      if (!time24) {
        alert("Invalid time slot selected. Please try again.");
        return;
      }
      const appointmentDate = localToMysql(date as string, time24.slice(0, 5));
      await axios.post(
        `${import.meta.env.VITE_API_URL}/api/bookings`,
        {
          student_package_id: studentPackageId,
          appointment_date: appointmentDate,
          slot_date: date,
          slot_time: time24.slice(0, 5),
          status: "confirmed",
          rescheduled_by_admin: false,
          ...(selectedTeacherId ? { teacher_id: selectedTeacherId } : {}),
        },
        { headers: { Authorization: `Bearer ${token}` } }
      );

      alert("Booking confirmed successfully!");
      setShowBookingModal(false);
      // Refresh slots so the UI reflects the new booking immediately
      await Promise.all([fetchBookedSlots(), fetchTeacherSlots()]);
    } catch (error: unknown) {
      console.error("Error confirming booking:", error);
      const msg = (error as { response?: { data?: { message?: string } } })?.response?.data?.message || "Failed to confirm booking. Please try again.";
      alert(msg);
    } finally {
      setBookingLoading(false);
    }
  };

  return (
    <div className="min-h-screen brand-gradient-subtle pattern-dots-light">
      <div className="max-w-5xl mx-auto px-4 py-8">
      <div className="flex items-start justify-between mb-8">
        <div>
          <h2 className="text-2xl font-bold text-gray-800">
            {t("timeslot.title")}
          </h2>
          <p className="text-gray-500 text-sm mt-1">{date}</p>
        </div>
        <Button variant="outline" size="sm" className="gap-1.5" onClick={handleRefresh} disabled={refreshing}>
          <RefreshCw className={`h-4 w-4 ${refreshing ? "animate-spin" : ""}`} />
          {refreshing ? t("timeslot.refreshing") : t("timeslot.refresh")}
        </Button>
      </div>

      {/* Notes */}
      <div className="space-y-2 mb-6">
        <div className="flex items-start gap-2 bg-gray-50 border border-gray-200 rounded-xl p-3 text-xs text-gray-600">
          <Info className="h-3.5 w-3.5 mt-0.5 shrink-0" />
          <span>{t("timeslot.timezoneNote")}</span>
        </div>
        {slotsNeeded > 1 && (
          <div className="flex items-start gap-2 bg-blue-50 border border-blue-200 rounded-xl p-3 text-sm text-blue-700">
            <Info className="h-4 w-4 mt-0.5 shrink-0" />
            <span>{t("timeslot.durationNote", { duration: durationMinutes, slots: slotsNeeded })}</span>
          </div>
        )}
      </div>

      {/* Legend */}
      <div className="flex flex-wrap gap-4 mb-8 text-xs bg-white rounded-xl p-3 px-5 shadow-sm border">
        <span className="flex items-center gap-1.5">
          <span className="w-3 h-3 rounded-full bg-[#D0E8F0] border border-[#B0D4E8] inline-block" />
          {t("timeslot.available")}
        </span>
        <span className="flex items-center gap-1.5">
          <span className="w-3 h-3 rounded-full bg-gradient-to-br from-emerald-500 to-emerald-600 inline-block" />
          {t("timeslot.yourClass")}
        </span>
        <span className="flex items-center gap-1.5">
          <span className="w-3 h-3 rounded-full bg-amber-400 inline-block" />
          {t("timeslot.booked")}
        </span>
        <span className="flex items-center gap-1.5">
          <span className="w-3 h-3 rounded-full bg-gray-300 inline-block" />
          {t("timeslot.unavailable")}
        </span>
        {slotsNeeded > 1 && (
          <span className="flex items-center gap-1.5">
            <span className="w-3 h-3 rounded-full bg-orange-300 inline-block" />
            Can't fit {durationMinutes}min
          </span>
        )}
      </div>

      {contextLoaded && openSlots.size === 0 && (
        <div className="text-center py-8 text-muted-foreground text-sm bg-muted/30 rounded-xl border mb-4">
          {effectiveTeacherId
            ? "Your teacher has not opened any slots for this date. Please select a different date or contact your admin."
            : "No teachers have available slots for this date. Please select a different date."}
        </div>
      )}

      <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-3">
        {generateTimeSlots().map((slot, index) => {
          const now = new Date();
          const slotDateTime = new Date(`${date} ${slot}`);
          const isPast = slotDateTime < now;

          // Convert display time (12h) to 24h for matching
          const match24 = slot.match(/^(\d{1,2}):(\d{2})\s?(AM|PM)$/i);
          let time24 = "";
          if (match24) {
            let h = parseInt(match24[1]);
            if (match24[3].toUpperCase() === "PM" && h !== 12) h += 12;
            if (match24[3].toUpperCase() === "AM" && h === 12) h = 0;
            time24 = `${String(h).padStart(2, "0")}:${match24[2]}`;
          }

          const isOpen = openSlots.has(time24);
          const bookedStatus = bookedMap[time24];
          const isBookedByUser = slot in bookedSlots;
          const isBookedByOther = bookedStatus === "booked" && !isBookedByUser;
          const isYourClass = bookedStatus === "your_class" || isBookedByUser;

          // Check if consecutive slots are available for multi-slot classes
          const canStartHere = (() => {
            if (slotsNeeded <= 1) return true;
            const [hh, mm] = time24.split(":").map(Number);
            for (let i = 1; i < slotsNeeded; i++) {
              const totalMin = hh * 60 + mm + i * 30;
              const nh = Math.floor(totalMin / 60);
              const nm = totalMin % 60;
              if (nh >= 23 && nm > 0) return false;
              const nextTime = `${String(nh).padStart(2, "0")}:${String(nm).padStart(2, "0")}`;
              if (!openSlots.has(nextTime)) return false;
              if (bookedMap[nextTime] === "booked") return false;
            }
            return true;
          })();

          const isDisabled = isPast || (!isYourClass && (!isOpen || isBookedByOther || !canStartHere));

          return (
            <button
              key={`${date}-${slot}-${index}`}
              className={cn(
                "p-2.5 w-full rounded-xl text-sm text-center font-medium transition-all border",
                isPast
                  ? "bg-gray-100 text-gray-400 cursor-not-allowed border-gray-200"
                  : isYourClass
                  ? "bookedByUser-timeslot"
                  : isBookedByOther
                  ? "bg-amber-100 text-amber-700 border-amber-200 cursor-not-allowed"
                  : !isOpen
                  ? "bg-gray-100 text-gray-400 cursor-not-allowed border-gray-200"
                  : !canStartHere
                  ? "bg-orange-50 text-orange-400 cursor-not-allowed border-orange-200"
                  : "student-timeslots"
              )}
              onClick={() => !isDisabled && handleSlotClick(slot)}
              disabled={isDisabled}
              title={isOpen && !canStartHere && slotsNeeded > 1 ? `Cannot fit ${durationMinutes}-min class — next slot is not available` : undefined}
            >
              {isPast
                ? t("timeslot.unavailable")
                : isYourClass
                ? t("timeslot.yourClass")
                : isBookedByOther
                ? t("timeslot.booked")
                : !isOpen
                ? t("timeslot.unavailable")
                : !canStartHere
                ? slot
                : slot}
            </button>
          );
        })}
      </div>

      <BookingConfirmationModal
        show={showBookingModal}
        onHide={() => { setShowBookingModal(false); setSelectedTeacherId(null); }}
        confirmBooking={confirmBooking}
        loading={bookingLoading}
        showTeacherPicker={needsTeacherPicker}
        slotsNeeded={slotsNeeded}
        durationMinutes={durationMinutes}
        selectedDate={date}
        selectedTime={selectedSlot ?? undefined}
        selectedTeacherId={selectedTeacherId}
        onTeacherSelected={setSelectedTeacherId}
      />

      {/* Class Info Modal */}
      <Dialog open={showClassModal} onOpenChange={setShowClassModal}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Video className="h-4 w-4 text-primary" />
              Class Details
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            {selectedDateBookings.map((b) => {
              const classTime = parseUTC(b.appointment_date)?.getTime() ?? 0;
              const canMarkTeacherAbsent = Date.now() >= classTime + 15 * 60 * 1000 && !b.teacher_absent;
              return (
                <div key={b.id} className="rounded-lg border p-4 space-y-2.5">
                  <div className="flex items-center justify-between">
                    <span className="text-sm font-semibold">{b.timeslot}</span>
                    <span className={`text-xs px-2 py-1 rounded-full font-medium ${
                      b.status === "confirmed" ? "bg-green-100 text-green-700"
                      : b.status === "pending" ? "bg-yellow-100 text-yellow-700"
                      : "bg-gray-100 text-gray-700"
                    }`}>
                      {b.status}
                    </span>
                  </div>
                  <div className="text-sm text-muted-foreground space-y-1.5">
                    <div className="flex items-center gap-1.5">
                      <User className="h-3.5 w-3.5" />
                      <span>Teacher: <span className="text-foreground font-medium">{b.teacher_name || "TBA"}</span></span>
                    </div>
                    <div className="flex items-center gap-1.5">
                      <Video className="h-3.5 w-3.5" />
                      <span>Mode: <span className="text-foreground font-medium">{b.class_mode || "Not set"}</span></span>
                    </div>
                    {b.meeting_link ? (
                      <div className="flex items-start gap-1.5">
                        <CalendarDays className="h-3.5 w-3.5 mt-0.5" />
                        <span className="flex items-center gap-1.5 flex-wrap">Link: <a href={b.meeting_link} target="_blank" rel="noopener noreferrer"
                          className="text-primary underline break-all font-medium">{b.meeting_link}</a>
                          <button
                            onClick={() => {
                              navigator.clipboard.writeText(b.meeting_link!);
                              setCopiedLinkId(b.id);
                              setTimeout(() => setCopiedLinkId(null), 2000);
                            }}
                            className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-xs font-medium bg-primary/10 text-primary hover:bg-primary/20 transition-colors"
                            title="Copy meeting link"
                          >
                            {copiedLinkId === b.id ? <><Check className="h-3 w-3" /> Copied</> : <><Copy className="h-3 w-3" /> Copy</>}
                          </button>
                        </span>
                      </div>
                    ) : (
                      <div className="flex items-center gap-1.5">
                        <CalendarDays className="h-3.5 w-3.5" />
                        <span>Link: <span className="text-foreground font-medium">Not set</span></span>
                      </div>
                    )}
                  </div>
                  {/* Absence indicators / action */}
                  {b.student_absent && (
                    <div className="pt-1">
                      <span className="text-xs px-2 py-1 rounded-full font-medium bg-orange-100 text-orange-700">
                        You were marked absent
                      </span>
                    </div>
                  )}
                  {b.teacher_absent ? (
                    <div className="pt-1">
                      <span className="text-xs px-2 py-1 rounded-full font-medium bg-red-100 text-red-700">
                        Teacher marked as absent
                      </span>
                    </div>
                  ) : canMarkTeacherAbsent ? (
                    <div className="pt-1">
                      <Button
                        size="sm"
                        variant="outline"
                        className="text-xs h-7 border-red-400 text-red-600 hover:bg-red-50"
                        disabled={absentLoadingId === b.id}
                        onClick={() => handleMarkTeacherAbsent(b.id)}
                      >
                        {absentLoadingId === b.id ? "Marking..." : "Mark Teacher Absent"}
                      </Button>
                    </div>
                  ) : null}
                  {/* Cancel button — only shown for future classes */}
                  {Date.now() < (parseUTC(b.appointment_date)?.getTime() ?? 0) && (
                    <div className="pt-1">
                      <Button
                        size="sm"
                        variant="outline"
                        className="text-xs h-7 border-destructive text-destructive hover:bg-red-50"
                        disabled={cancellingId === b.id}
                        onClick={() => handleCancelBooking(b.id)}
                      >
                        {cancellingId === b.id ? "Cancelling..." : "Cancel Class"}
                      </Button>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </DialogContent>
      </Dialog>
      </div>
    </div>
  );
};

export default TimeslotPage;
