import { useState, useEffect, useCallback, useMemo } from "react";
import { Link } from "react-router-dom";
import axios from "axios";
import NavBar from "@/components/Navbar";
import { format, addDays, startOfWeek } from "date-fns";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  CalendarRange, ChevronLeft, ChevronRight, Loader2, GraduationCap,
} from "lucide-react";
import { localToMysql } from "@/utils/timezone";

interface Teacher {
  id: number;
  name: string;
}

interface CalendarBooking {
  id: number;
  appointment_date: string;
  status: string;
  booking_group_id: string | null;
  recurring_schedule_id: number | null;
  student_id: number;
  student_name: string;
  package_name: string;
  duration_minutes: number | null;
}

interface BookablePackage {
  student_id: number;
  student_name: string;
  student_package_id: number;
  sessions_remaining: number;
  subject: string | null;
  teacher_id: number | null;
  teacher_name: string | null;
  package_name: string;
  duration_minutes: number | null;
}

const SLOT_TIMES: string[] = Array.from({ length: 32 }, (_, i) => {
  const totalMins = 7 * 60 + i * 30;
  const h = Math.floor(totalMins / 60).toString().padStart(2, "0");
  const m = (totalMins % 60).toString().padStart(2, "0");
  return `${h}:${m}`;
});

const fmt12 = (t: string) => {
  const [hh, mm] = t.split(":");
  const h = Number(hh);
  return `${h % 12 === 0 ? 12 : h % 12}:${mm} ${h >= 12 ? "PM" : "AM"}`;
};

const addMinutes = (time: string, mins: number) => {
  const [hh, mm] = time.split(":").map(Number);
  const total = hh * 60 + mm + mins;
  return `${String(Math.floor(total / 60)).padStart(2, "0")}:${String(total % 60).padStart(2, "0")}`;
};

const slotsForDuration = (duration: number | null) =>
  Math.max(1, Math.ceil((duration || 25) / 30));

// appointment_date is stored as PHT display time — slice, never new Date()
const bookingKey = (b: CalendarBooking) => {
  const normalized = b.appointment_date.includes("T")
    ? b.appointment_date
    : b.appointment_date.replace(" ", "T");
  return `${normalized.slice(0, 10)}|${normalized.slice(11, 16)}`;
};

const AdminCalendarPage = () => {
  const token = localStorage.getItem("token");
  const headers = useMemo(() => ({ Authorization: `Bearer ${token}` }), [token]);
  const base = import.meta.env.VITE_API_URL;

  const [teachers, setTeachers] = useState<Teacher[]>([]);
  const [teacherIdx, setTeacherIdx] = useState(0);
  const [loadingTeachers, setLoadingTeachers] = useState(true);

  const [weekStart, setWeekStart] = useState<Date>(() => startOfWeek(new Date(), { weekStartsOn: 1 }));
  const [openSlots, setOpenSlots] = useState<Set<string>>(new Set());
  const [bookings, setBookings] = useState<CalendarBooking[]>([]);
  const [loadingGrid, setLoadingGrid] = useState(false);
  const [togglingSlot, setTogglingSlot] = useState<string | null>(null);

  const [bookableStudents, setBookableStudents] = useState<BookablePackage[]>([]);

  // Booking modal
  const [bookingSlot, setBookingSlot] = useState<{ date: string; time: string } | null>(null);
  const [selectedPkgId, setSelectedPkgId] = useState("");
  const [bookingSaving, setBookingSaving] = useState(false);
  const [bookingError, setBookingError] = useState<string | null>(null);

  // Cancel dialogs
  const [cancelTarget, setCancelTarget] = useState<CalendarBooking | null>(null);
  const [recurringCancelBooking, setRecurringCancelBooking] = useState<CalendarBooking | null>(null);
  const [cancellingId, setCancellingId] = useState<number | null>(null);

  const teacher = teachers[teacherIdx] ?? null;

  const fetchTeachers = useCallback(async () => {
    try {
      const res = await axios.get(`${base}/api/admin/teachers`, { headers });
      setTeachers((res.data as Teacher[]).map(t => ({ id: t.id, name: t.name })));
    } catch (err) {
      console.error("Error fetching teachers:", err);
    } finally {
      setLoadingTeachers(false);
    }
  }, [base, headers]);

  const fetchBookableStudents = useCallback(async () => {
    try {
      const res = await axios.get(`${base}/api/admin/bookable-students`, { headers });
      setBookableStudents(res.data);
    } catch (err) {
      console.error("Error fetching bookable students:", err);
    }
  }, [base, headers]);

  const fetchGrid = useCallback(async () => {
    if (!teacher) return;
    setLoadingGrid(true);
    try {
      const startStr = format(weekStart, "yyyy-MM-dd");
      const [slotsRes, schedRes] = await Promise.all([
        axios.get(`${base}/api/admin/teachers/${teacher.id}/weekly-slots?startDate=${startStr}`, { headers }),
        axios.get(`${base}/api/admin/teachers/${teacher.id}/schedule?startDate=${startStr}`, { headers }),
      ]);
      setOpenSlots(new Set(
        (slotsRes.data as { slot_date: string; slot_time: string }[]).map(s => `${s.slot_date}|${s.slot_time}`)
      ));
      setBookings(schedRes.data);
    } catch (err) {
      console.error("Error fetching calendar grid:", err);
    } finally {
      setLoadingGrid(false);
    }
  }, [base, headers, teacher, weekStart]);

  useEffect(() => { fetchTeachers(); fetchBookableStudents(); }, [fetchTeachers, fetchBookableStudents]);
  useEffect(() => { fetchGrid(); }, [fetchGrid]);

  const { bookingByKey, groupFirstSlot } = useMemo(() => {
    const byKey = new Map<string, CalendarBooking>();
    const firstSlot = new Map<string, string>();
    for (const b of bookings) {
      const key = bookingKey(b);
      byKey.set(key, b);
      if (b.booking_group_id) {
        const cur = firstSlot.get(b.booking_group_id);
        if (!cur || key < cur) firstSlot.set(b.booking_group_id, key);
      }
    }
    return { bookingByKey: byKey, groupFirstSlot: firstSlot };
  }, [bookings]);

  const toggleSlot = async (dateStr: string, time: string, action: "open" | "close") => {
    if (!teacher) return;
    const key = `${dateStr}|${time}`;
    setTogglingSlot(key);
    try {
      await axios.post(`${base}/api/admin/teachers/${teacher.id}/weekly-slots`, {
        slot_date: dateStr, slot_time: `${time}:00`, action,
      }, { headers });
      setOpenSlots(prev => {
        const next = new Set(prev);
        if (action === "open") next.add(key); else next.delete(key);
        return next;
      });
    } catch (err) {
      console.error("Error toggling slot:", err);
    } finally {
      setTogglingSlot(null);
    }
  };

  // ——— Booking ———

  const openBookingModal = (date: string, time: string) => {
    setSelectedPkgId("");
    setBookingError(null);
    setBookingSlot({ date, time });
  };

  const selectedPkg = bookableStudents.find(p => String(p.student_package_id) === selectedPkgId) ?? null;

  // Validate that every consecutive slot the selected package needs is bookable
  const bookingValidation = useMemo(() => {
    if (!bookingSlot || !selectedPkg) return null;
    const slotsNeeded = slotsForDuration(selectedPkg.duration_minutes);
    for (let i = 0; i < slotsNeeded; i++) {
      const t = addMinutes(bookingSlot.time, i * 30);
      const key = `${bookingSlot.date}|${t}`;
      if (!SLOT_TIMES.includes(t)) return `The ${fmt12(t)} slot is outside the calendar grid.`;
      if (bookingByKey.has(key)) return `The ${fmt12(t)} slot is already booked.`;
      if (!openSlots.has(key)) return `The ${fmt12(t)} slot is not open.`;
      if (new Date(`${bookingSlot.date}T${t}:00`) < new Date()) return `The ${fmt12(t)} slot is in the past.`;
    }
    return null;
  }, [bookingSlot, selectedPkg, bookingByKey, openSlots]);

  const handleConfirmBooking = async () => {
    if (!bookingSlot || !selectedPkg || !teacher || bookingValidation) return;
    setBookingSaving(true);
    setBookingError(null);
    try {
      await axios.post(`${base}/api/admin/bookings`, {
        student_package_id: selectedPkg.student_package_id,
        appointment_date: localToMysql(bookingSlot.date, bookingSlot.time),
        teacher_id: teacher.id,
        require_open_slot: true,
      }, { headers });
      setBookingSlot(null);
      fetchGrid();
      fetchBookableStudents();
    } catch (err: unknown) {
      const msg = (err as { response?: { data?: { message?: string } } })?.response?.data?.message || "Failed to book class";
      setBookingError(msg);
      fetchGrid(); // resync in case another admin/student took the slot
    } finally {
      setBookingSaving(false);
    }
  };

  const handleCloseSlotInstead = async () => {
    if (!bookingSlot) return;
    await toggleSlot(bookingSlot.date, bookingSlot.time, "close");
    setBookingSlot(null);
  };

  // ——— Cancelling ———

  const handleBookedClick = (booking: CalendarBooking) => {
    if (booking.status === "done") return;
    if (booking.recurring_schedule_id) {
      setRecurringCancelBooking(booking);
    } else {
      setCancelTarget(booking);
    }
  };

  const doCancel = async (bookingId: number, cancelAll: boolean) => {
    setCancellingId(bookingId);
    try {
      const url = cancelAll
        ? `${base}/api/bookings/cancel/${bookingId}?cancelAll=true`
        : `${base}/api/bookings/cancel/${bookingId}`;
      await axios.post(url, {}, { headers });
      setCancelTarget(null);
      setRecurringCancelBooking(null);
      fetchGrid();
      fetchBookableStudents();
    } catch (err) {
      console.error("Error cancelling booking:", err);
    } finally {
      setCancellingId(null);
    }
  };

  /** Class start slot key ("date|time") for a booking — the group's first slot for multi-slot classes */
  const classStartKey = (b: CalendarBooking) =>
    (b.booking_group_id && groupFirstSlot.get(b.booking_group_id)) || bookingKey(b);

  const classSpanLabel = (b: CalendarBooking) => {
    const [date, time] = classStartKey(b).split("|");
    const slots = slotsForDuration(b.duration_minutes);
    const end = addMinutes(time, slots * 30);
    return `${format(new Date(`${date}T00:00:00`), "MMM d, yyyy")} · ${fmt12(time)} – ${fmt12(end)}`;
  };

  const prevTeacher = () => setTeacherIdx(i => (i - 1 + teachers.length) % teachers.length);
  const nextTeacher = () => setTeacherIdx(i => (i + 1) % teachers.length);

  const bookingSpanSummary = () => {
    if (!bookingSlot || !selectedPkg) return null;
    const slots = slotsForDuration(selectedPkg.duration_minutes);
    const end = addMinutes(bookingSlot.time, slots * 30);
    return `Books ${slots} slot${slots > 1 ? "s" : ""}, ${fmt12(bookingSlot.time)} – ${fmt12(end)} · 1 session`;
  };

  return (
    <>
      <NavBar />
      <div className="max-w-7xl mx-auto px-4 sm:px-6 py-8">
        {loadingTeachers ? (
          <div className="flex justify-center py-20">
            <Loader2 className="h-8 w-8 animate-spin text-primary" />
          </div>
        ) : teachers.length === 0 ? (
          <Card className="glow-card border-0 rounded-2xl">
            <CardContent className="py-16 text-center">
              <GraduationCap className="h-10 w-10 mx-auto text-muted-foreground mb-3" />
              <p className="font-medium mb-1">No active teachers yet</p>
              <p className="text-sm text-muted-foreground mb-4">Add a teacher to start scheduling classes on the calendar.</p>
              <Button asChild variant="outline"><Link to="/teachers">Go to Teachers</Link></Button>
            </CardContent>
          </Card>
        ) : (
          <Card className="glow-card border-0 rounded-2xl">
            <CardHeader>
              <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
                <div>
                  <CardTitle className="flex items-center gap-2">
                    <CalendarRange className="h-5 w-5 text-primary" />
                    Calendar — {teacher?.name}
                  </CardTitle>
                  <p className="text-xs text-muted-foreground mt-1">
                    Click a booked slot to cancel, a green slot to book a class, a gray slot to open it.
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <Button variant="outline" size="sm" onClick={prevTeacher} disabled={teachers.length <= 1}>
                    <ChevronLeft className="h-4 w-4 mr-1" /> Prev
                  </Button>
                  <Select
                    value={teacher ? String(teacher.id) : ""}
                    onValueChange={v => {
                      const idx = teachers.findIndex(t => String(t.id) === v);
                      if (idx >= 0) setTeacherIdx(idx);
                    }}
                  >
                    <SelectTrigger className="w-44 h-9">
                      <SelectValue placeholder="Select teacher" />
                    </SelectTrigger>
                    <SelectContent>
                      {teachers.map(t => (
                        <SelectItem key={t.id} value={String(t.id)}>{t.name}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <Button variant="outline" size="sm" onClick={nextTeacher} disabled={teachers.length <= 1}>
                    Next <ChevronRight className="h-4 w-4 ml-1" />
                  </Button>
                </div>
              </div>
              <p className="text-xs text-muted-foreground text-right">
                Teacher {teacherIdx + 1} of {teachers.length}
              </p>
            </CardHeader>
            <CardContent>
              <div className="flex items-center justify-between mb-4">
                <Button variant="outline" size="sm" onClick={() => setWeekStart(addDays(weekStart, -7))}>
                  <ChevronLeft className="h-4 w-4 mr-1" /> Prev
                </Button>
                <div className="flex items-center gap-2">
                  <span className="text-sm font-medium">
                    {format(weekStart, "MMM d")} – {format(addDays(weekStart, 6), "MMM d, yyyy")}
                  </span>
                  <Button
                    variant="ghost" size="sm" className="h-7 px-2 text-xs"
                    onClick={() => setWeekStart(startOfWeek(new Date(), { weekStartsOn: 1 }))}
                  >
                    This Week
                  </Button>
                </div>
                <Button variant="outline" size="sm" onClick={() => setWeekStart(addDays(weekStart, 7))}>
                  Next <ChevronRight className="h-4 w-4 ml-1" />
                </Button>
              </div>
              <div className={`overflow-x-auto ${loadingGrid ? "opacity-50 pointer-events-none" : ""}`}>
                <table className="w-full text-xs border-collapse">
                  <thead>
                    <tr>
                      <th className="p-1 text-left w-16">Time</th>
                      {[...Array(7)].map((_, i) => (
                        <th key={i} className="p-1 text-center">{format(addDays(weekStart, i), "EEE MM/dd")}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {SLOT_TIMES.map(time => (
                      <tr key={time} className="group">
                        <td className="p-1 font-medium text-muted-foreground group-hover:bg-primary/10 group-hover:text-primary group-hover:font-semibold transition-colors rounded whitespace-nowrap">
                          {fmt12(time)}
                        </td>
                        {[...Array(7)].map((_, j) => {
                          const day = format(addDays(weekStart, j), "yyyy-MM-dd");
                          const key = `${day}|${time}`;
                          const booking = bookingByKey.get(key);
                          const isOpen = openSlots.has(key);
                          const isPast = new Date(`${day}T${time}:00`) < new Date();
                          const isToggling = togglingSlot === key;

                          if (booking) {
                            const isDone = booking.status === "done";
                            const isPending = booking.status === "pending";
                            const isContinuation = !!booking.booking_group_id && groupFirstSlot.get(booking.booking_group_id) !== key;
                            const label = isContinuation ? `↳ ${booking.student_name}` : booking.student_name;
                            const tooltip = `${booking.student_name} — ${booking.package_name}${booking.duration_minutes ? ` (${booking.duration_minutes} min)` : ""} · ${booking.status}`;
                            return (
                              <td
                                key={j}
                                onClick={() => !isDone && cancellingId === null && handleBookedClick(booking)}
                                title={isDone ? `${tooltip} — completed, cannot cancel` : `${tooltip} — click to cancel`}
                                className={`p-1 text-center border transition-colors ${
                                  isDone ? "bg-slate-200 text-slate-500 cursor-default"
                                  : isPending ? "bg-yellow-100 text-yellow-800 cursor-pointer hover:bg-yellow-200"
                                  : "bg-blue-100 text-blue-700 cursor-pointer hover:bg-blue-200"
                                }`}
                              >
                                <div className="truncate max-w-22.5 mx-auto font-medium">{label}</div>
                              </td>
                            );
                          }

                          return (
                            <td
                              key={j}
                              onClick={() => {
                                if (isPast || isToggling) return;
                                if (isOpen) openBookingModal(day, time);
                                else toggleSlot(day, time, "open");
                              }}
                              title={isPast ? undefined : isOpen ? "Open — click to book a class" : "Closed — click to open this slot"}
                              className={`p-1 text-center border transition-colors ${
                                isPast ? "bg-gray-50 text-gray-300 cursor-not-allowed"
                                : isOpen ? "bg-green-100 text-green-700 hover:bg-green-200 cursor-pointer"
                                : "bg-gray-100 text-gray-400 hover:bg-gray-200 cursor-pointer"
                              }`}
                            >
                              {isToggling ? "..." : isPast ? "" : isOpen ? "✓" : "+"}
                            </td>
                          );
                        })}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <div className="flex flex-wrap gap-4 mt-3 text-xs text-muted-foreground">
                <span><span className="inline-block w-3 h-3 bg-green-100 border rounded mr-1" />Open (✓) — click to book</span>
                <span><span className="inline-block w-3 h-3 bg-gray-100 border rounded mr-1" />Closed (+) — click to open</span>
                <span><span className="inline-block w-3 h-3 bg-blue-100 border rounded mr-1" />Booked — click to cancel</span>
                <span><span className="inline-block w-3 h-3 bg-yellow-100 border rounded mr-1" />Pending</span>
                <span><span className="inline-block w-3 h-3 bg-slate-200 border rounded mr-1" />Completed</span>
                <span><span className="inline-block w-3 h-3 bg-gray-50 border rounded mr-1" />Past</span>
              </div>
            </CardContent>
          </Card>
        )}
      </div>

      {/* Booking Modal */}
      {bookingSlot && (
        <Dialog open onOpenChange={o => { if (!o && !bookingSaving) setBookingSlot(null); }}>
          <DialogContent className="sm:max-w-md">
            <DialogHeader>
              <DialogTitle>Book a Class</DialogTitle>
            </DialogHeader>
            <div className="space-y-3">
              <p className="text-sm text-muted-foreground">
                {teacher?.name} · {format(new Date(`${bookingSlot.date}T00:00:00`), "EEEE, MMM d, yyyy")} at {fmt12(bookingSlot.time)}
              </p>
              <Select value={selectedPkgId} onValueChange={v => { setSelectedPkgId(v); setBookingError(null); }}>
                <SelectTrigger className="w-full">
                  <SelectValue placeholder="Select a student…" />
                </SelectTrigger>
                <SelectContent>
                  {bookableStudents.length === 0 ? (
                    <div className="px-3 py-2 text-sm text-muted-foreground">No students with a paid package and sessions remaining.</div>
                  ) : bookableStudents.map(p => (
                    <SelectItem key={p.student_package_id} value={String(p.student_package_id)}>
                      {p.student_name} — {p.package_name} ({p.duration_minutes || 25} min, {p.sessions_remaining} left)
                      {p.teacher_id && teacher && p.teacher_id !== teacher.id && p.teacher_name ? ` · assigned to ${p.teacher_name}` : ""}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {selectedPkg && !bookingValidation && (
                <p className="text-xs text-muted-foreground">{bookingSpanSummary()}</p>
              )}
              {selectedPkg && bookingValidation && (
                <p className="text-xs text-red-600">{bookingValidation}</p>
              )}
              {bookingError && <p className="text-sm text-red-600">{bookingError}</p>}
            </div>
            <DialogFooter className="flex-col sm:flex-row gap-2">
              <Button variant="outline" size="sm" onClick={handleCloseSlotInstead} disabled={bookingSaving}>
                Close this slot instead
              </Button>
              <Button variant="ghost" size="sm" onClick={() => setBookingSlot(null)} disabled={bookingSaving}>
                Cancel
              </Button>
              <Button size="sm" onClick={handleConfirmBooking} disabled={!selectedPkg || !!bookingValidation || bookingSaving}>
                {bookingSaving ? <Loader2 className="h-4 w-4 animate-spin" /> : "Confirm Booking"}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      )}

      {/* Cancel Confirmation Dialog */}
      {cancelTarget && (
        <Dialog open onOpenChange={o => { if (!o && cancellingId === null) setCancelTarget(null); }}>
          <DialogContent className="sm:max-w-sm">
            <DialogHeader><DialogTitle>Cancel Class</DialogTitle></DialogHeader>
            <div className="text-sm space-y-1 py-1">
              <p><span className="font-medium">{cancelTarget.student_name}</span> — {cancelTarget.package_name}</p>
              <p className="text-muted-foreground">{classSpanLabel(cancelTarget)}</p>
              {cancelTarget.booking_group_id && (
                <p className="text-xs text-muted-foreground">
                  This is a {cancelTarget.duration_minutes || 50}-minute class — all {slotsForDuration(cancelTarget.duration_minutes)} of its slots will be cancelled together.
                </p>
              )}
              <p className="text-xs text-muted-foreground">1 session will be refunded to the student's package.</p>
            </div>
            <DialogFooter>
              <Button variant="ghost" onClick={() => setCancelTarget(null)} disabled={cancellingId !== null}>
                Keep it
              </Button>
              <Button variant="destructive" onClick={() => doCancel(cancelTarget.id, false)} disabled={cancellingId !== null}>
                {cancellingId === cancelTarget.id ? <Loader2 className="h-4 w-4 animate-spin" /> : "Cancel Class"}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      )}

      {/* Recurring Cancel Choice Dialog */}
      {recurringCancelBooking && (
        <Dialog open onOpenChange={o => { if (!o && cancellingId === null) setRecurringCancelBooking(null); }}>
          <DialogContent className="sm:max-w-sm">
            <DialogHeader><DialogTitle>Cancel Class</DialogTitle></DialogHeader>
            <p className="text-sm text-muted-foreground py-1">
              <span className="font-medium text-foreground">{recurringCancelBooking.student_name}</span> · {classSpanLabel(recurringCancelBooking)}
            </p>
            <p className="text-sm text-muted-foreground">
              This class is part of a recurring schedule. What would you like to cancel?
            </p>
            <div className="flex flex-col gap-2 pt-1">
              <Button variant="outline" className="justify-start"
                disabled={cancellingId === recurringCancelBooking.id}
                onClick={() => doCancel(recurringCancelBooking.id, false)}>
                {cancellingId === recurringCancelBooking.id ? <Loader2 className="h-4 w-4 animate-spin" /> : "Cancel this session only"}
              </Button>
              <Button variant="destructive" className="justify-start"
                disabled={cancellingId === recurringCancelBooking.id}
                onClick={() => doCancel(recurringCancelBooking.id, true)}>
                {cancellingId === recurringCancelBooking.id ? <Loader2 className="h-4 w-4 animate-spin" /> : "Cancel all upcoming sessions in this series"}
              </Button>
              <Button variant="ghost" onClick={() => setRecurringCancelBooking(null)}>Keep it</Button>
            </div>
          </DialogContent>
        </Dialog>
      )}
    </>
  );
};

export default AdminCalendarPage;
