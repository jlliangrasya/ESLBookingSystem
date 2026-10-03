import { useState, useEffect, useCallback, useMemo, useRef } from "react";
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
import { StudentPackagePicker } from "@/components/StudentPackagePicker";
import {
  CalendarRange, ChevronLeft, ChevronRight, Loader2, GraduationCap,
} from "lucide-react";
import { localToMysql } from "@/utils/timezone";
import { isValidHex, getContrastText, DEFAULT_NOTE_COLOR } from "@/utils/noteColors";

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

const SLOT_TIMES: string[] = Array.from({ length: 34 }, (_, i) => {
  const totalMins = 7 * 60 + i * 30;
  const h = Math.floor(totalMins / 60).toString().padStart(2, "0");
  const m = (totalMins % 60).toString().padStart(2, "0");
  return `${h}:${m}`;
});

const fmt12 = (t: string) => {
  const [hh, mm] = t.split(":");
  const h = Number(hh) % 24; // "24:00" is the midnight range edge
  return `${h % 12 === 0 ? 12 : h % 12}:${mm} ${h >= 12 ? "PM" : "AM"}`;
};

const addMinutes = (time: string, mins: number) => {
  const [hh, mm] = time.split(":").map(Number);
  const total = hh * 60 + mm + mins;
  return `${String(Math.floor(total / 60)).padStart(2, "0")}:${String(total % 60).padStart(2, "0")}`;
};

// Applied to every cell of the row whose time label was clicked. The tint and the
// top/bottom rules live on a pseudo-element so they sit above the cells' own
// opaque status colors instead of being hidden behind them.
const ROW_HIGHLIGHT =
  "relative after:content-[''] after:absolute after:inset-0 after:pointer-events-none after:bg-primary/15 after:border-y-2 after:border-primary";

// Strong, white-text-legible colors for booked cells. Greens and yellows are left
// out so a booking never reads as an open (green) or pending (yellow) slot.
const STUDENT_COLORS = [
  "#2563eb", // blue
  "#7c3aed", // violet
  "#db2777", // pink
  "#dc2626", // red
  "#ea580c", // orange
  "#0891b2", // cyan
  "#4f46e5", // indigo
  "#c026d3", // fuchsia
  "#9f1239", // rose-dark
  "#0369a1", // sky-dark
  "#92400e", // brown
  "#475569", // slate-blue
  "#be123c", // rose
  "#6d28d9", // purple
  "#1e40af", // navy
  "#b45309", // amber-dark
];

/** Same student → same color on every load; spreads consecutive ids apart. */
const studentColor = (studentId: number) =>
  STUDENT_COLORS[(studentId * 7) % STUDENT_COLORS.length];

/** How far the pointer must travel before a press counts as a drag rather than a click. */
const DRAG_THRESHOLD_PX = 8;
/** Touch has no drag-to-select, so a hold starts one. */
const LONG_PRESS_MS = 500;
/** Finger travel before a hold is written off as the start of a scroll. */
const TOUCH_SCROLL_CANCEL_PX = 10;
/** Time rows visible in the grid's scroll box before it scrolls; the day headers stay pinned. */
const VISIBLE_ROWS = 16;
/** A drag this close to the scroll box's top or bottom edge scrolls the grid. */
const AUTOSCROLL_EDGE_PX = 32;
const AUTOSCROLL_MAX_STEP_PX = 14;

/**
 * The grid cell under a viewport point. Touch gives every pointermove to the element the
 * press started on, so a finger dragged across the grid has to be located by hit-testing
 * rather than by the mouse's enter/leave events.
 */
const cellFromPoint = (x: number, y: number): { d: number; t: number } | null => {
  const el = document.elementFromPoint(x, y);
  const cell = el instanceof Element ? el.closest("[data-slot-cell]") : null;
  if (!(cell instanceof HTMLElement)) return null;
  const [d, t] = (cell.dataset.slotCell ?? "").split(":").map(Number);
  return Number.isInteger(d) && Number.isInteger(t) ? { d, t } : null;
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
  const [notesByKey, setNotesByKey] = useState<Map<string, { note_text: string; note_color: string; note_icon: string | null; note_group_id: string | null }>>(new Map());

  const [bookableStudents, setBookableStudents] = useState<BookablePackage[]>([]);

  // Time label clicked in the first column — highlights that whole row
  const [highlightedTime, setHighlightedTime] = useState<string | null>(null);

  // Drag-selection over the grid, for opening or closing many slots at once. The
  // selection is the rectangle between the cell the drag started on (anchor) and the one
  // under the pointer (focus), both as { d: day column index, t: SLOT_TIMES index }.
  const [selAnchor, setSelAnchor] = useState<{ d: number; t: number } | null>(null);
  const [selFocus, setSelFocus] = useState<{ d: number; t: number } | null>(null);
  const [isSelecting, setIsSelecting] = useState(false);
  const [bulkBusy, setBulkBusy] = useState<"open" | "close" | null>(null);
  const [bulkError, setBulkError] = useState<string | null>(null);

  // True once a press has travelled far enough to count as a drag.
  const dragMovedRef = useRef(false);
  // Where the press went down, held in a ref so an ordinary click changes no state and
  // re-renders nothing — the grid clicks exactly as fast as it did before selection existed.
  const pressRef = useRef<{ d: number; t: number; x: number; y: number; touch: boolean } | null>(null);
  const longPressTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  // Mirrors isSelecting for the non-passive touchmove listener, which is registered once
  // and so cannot see the current render's state.
  const isSelectingRef = useRef(false);
  const gridScrollRef = useRef<HTMLDivElement>(null);
  const gridTableRef = useRef<HTMLTableElement>(null);
  // Height of the header plus VISIBLE_ROWS rows, measured so the cap stays exact if row height changes.
  const [gridMaxHeight, setGridMaxHeight] = useState<number | null>(null);
  // Last pointer position during a drag, read by the edge auto-scroll loop.
  const lastPointerRef = useRef<{ x: number; y: number } | null>(null);
  // True while a finished drag's highlight is still standing, waiting for a bulk action.
  // The cell click handlers fire after pointerup, so they can't read this off state.
  const selectionCommittedRef = useRef(false);
  // Set when a release ends a drag, so the click that follows it doesn't also act on a cell.
  const suppressClickRef = useRef(false);

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
      const [slotsRes, schedRes, notesRes] = await Promise.all([
        axios.get(`${base}/api/admin/teachers/${teacher.id}/weekly-slots?startDate=${startStr}`, { headers }),
        axios.get(`${base}/api/admin/teachers/${teacher.id}/schedule?startDate=${startStr}`, { headers }),
        axios.get(`${base}/api/admin/teachers/${teacher.id}/notes?startDate=${startStr}`, { headers }),
      ]);
      setOpenSlots(new Set(
        (slotsRes.data as { slot_date: string; slot_time: string }[]).map(s => `${s.slot_date}|${s.slot_time}`)
      ));
      setBookings(schedRes.data);
      setNotesByKey(new Map(
        (notesRes.data as { note_date: string; slot_time: string; note_text: string; note_color: string; note_icon: string | null; note_group_id: string | null }[])
          .map(n => [`${n.note_date}|${n.slot_time}`, { note_text: n.note_text, note_color: n.note_color, note_icon: n.note_icon, note_group_id: n.note_group_id ?? null }])
      ));
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

  const studentPickerItems = useMemo(() => bookableStudents.map(p => ({
    id: String(p.student_package_id),
    name: p.student_name,
    durationMinutes: p.duration_minutes || 25,
    sessionsRemaining: p.sessions_remaining,
    note: p.teacher_id && teacher && p.teacher_id !== teacher.id && p.teacher_name
      ? `assigned to ${p.teacher_name}`
      : undefined,
  })), [bookableStudents, teacher]);

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

  // Teacher notes saved across a range share one note_group_id, so draw each run as a
  // single tall cell — the same block the teacher sees on their own grid. `noteSpans` maps
  // a run's first slot to its height; `noteCovered` holds the slots it swallows.
  const noteSpans = new Map<string, number>();
  const noteCovered = new Set<string>();
  for (let j = 0; j < 7; j++) {
    const day = format(addDays(weekStart, j), "yyyy-MM-dd");
    let i = 0;
    while (i < SLOT_TIMES.length) {
      const groupId = notesByKey.get(`${day}|${SLOT_TIMES[i]}`)?.note_group_id;
      if (!groupId) { i++; continue; }
      // A run can't swallow a booked slot or straddle the past/future divide — those cells
      // render differently and have to stay on their own row.
      const headIsPast = new Date(`${day}T${SLOT_TIMES[i]}:00`) < new Date();
      let k = i + 1;
      while (
        k < SLOT_TIMES.length &&
        notesByKey.get(`${day}|${SLOT_TIMES[k]}`)?.note_group_id === groupId &&
        (new Date(`${day}T${SLOT_TIMES[k]}:00`) < new Date()) === headIsPast &&
        !bookingByKey.has(`${day}|${SLOT_TIMES[k]}`)
      ) k++;
      noteSpans.set(`${day}|${SLOT_TIMES[i]}`, k - i);
      for (let m = i + 1; m < k; m++) noteCovered.add(`${day}|${SLOT_TIMES[m]}`);
      i = k;
    }
  }

  // ——— Bulk selection ———

  // The cells inside the rectangle spanned by the anchor and focus cells, minus the ones a
  // bulk action can't touch: past, booked, and slots carrying a teacher's note (notes are
  // the teacher's to clear, and an open slot has nowhere to show one). Skipped cells never
  // highlight, so what you see highlighted is exactly what the action applies to.
  const selectedCells: { key: string; dateStr: string; time: string }[] = [];
  if (selAnchor && selFocus) {
    const d0 = Math.min(selAnchor.d, selFocus.d);
    const d1 = Math.max(selAnchor.d, selFocus.d);
    const t0 = Math.min(selAnchor.t, selFocus.t);
    const t1 = Math.max(selAnchor.t, selFocus.t);
    for (let d = d0; d <= d1; d++) {
      const dateStr = format(addDays(weekStart, d), "yyyy-MM-dd");
      for (let t = t0; t <= t1; t++) {
        const time = SLOT_TIMES[t];
        const key = `${dateStr}|${time}`;
        if (bookingByKey.has(key) || notesByKey.has(key)) continue;
        if (new Date(`${dateStr}T${time}:00`) < new Date()) continue;
        selectedCells.push({ key, dateStr, time });
      }
    }
  }
  const selectedKeys = new Set(selectedCells.map(c => c.key));
  const selectionSize = selectedCells.length;
  const selectionDayCount = new Set(selectedCells.map(c => c.dateStr)).size;
  const closedInSelection = selectedCells.filter(c => !openSlots.has(c.key)).length;
  const openInSelection = selectionSize - closedInSelection;
  const selectionLabel = (() => {
    if (selectionSize === 0) return "";
    const first = selectedCells[0];
    const dayLabel = (d: string) => format(new Date(`${d}T00:00:00`), "EEE MMM d");
    if (selectionSize === 1) return `${dayLabel(first.dateStr)} · ${fmt12(first.time)}`;
    if (selectionDayCount === 1) {
      const last = selectedCells[selectionSize - 1];
      return `${dayLabel(first.dateStr)} · ${fmt12(first.time)} – ${fmt12(addMinutes(last.time, 30))}`;
    }
    return `${selectionSize} slots across ${selectionDayCount} days`;
  })();

  const clearSelection = () => {
    selectionCommittedRef.current = false;
    isSelectingRef.current = false;
    setSelAnchor(null);
    setSelFocus(null);
    setIsSelecting(false);
    setBulkError(null);
  };

  // A gesture ends wherever the pointer is released, which is often outside the grid, so
  // the release is caught on the window. Only a drag that actually swept across more than
  // one usable cell leaves a highlight standing for the action bar to act on.
  useEffect(() => {
    const finish = (cancelled: boolean) => {
      pressRef.current = null;
      if (longPressTimerRef.current) clearTimeout(longPressTimerRef.current);
      longPressTimerRef.current = null;
      if (!isSelecting) return;
      isSelectingRef.current = false; // unlock grid scrolling immediately
      setIsSelecting(false);
      suppressClickRef.current = true; // the release must not also book or open a slot
      if (!cancelled && dragMovedRef.current && selectionSize > 1) {
        selectionCommittedRef.current = true;
        return;
      }
      selectionCommittedRef.current = false;
      setSelAnchor(null);
      setSelFocus(null);
    };
    const onUp = () => finish(false);
    const onCancel = () => finish(true);
    window.addEventListener("pointerup", onUp);
    window.addEventListener("pointercancel", onCancel);
    return () => {
      window.removeEventListener("pointerup", onUp);
      window.removeEventListener("pointercancel", onCancel);
    };
  }, [isSelecting, selectionSize]);

  // Once a hold has opened a highlight, finger movement must extend it rather than scroll
  // the grid. Only a non-passive listener may cancel the scroll, so this one is attached
  // directly instead of through React.
  useEffect(() => {
    const el = gridScrollRef.current;
    if (!el) return;
    const onTouchMove = (e: TouchEvent) => { if (isSelectingRef.current) e.preventDefault(); };
    el.addEventListener("touchmove", onTouchMove, { passive: false });
    return () => el.removeEventListener("touchmove", onTouchMove);
    // The grid unmounts while teachers load, so re-attach whenever it can have come back.
  }, [loadingTeachers, teachers.length]);

  // Cap the scroll box at the header plus VISIBLE_ROWS rows. The cut-off row's top edge,
  // measured from the table's top, is exactly that height. Re-measured on resize since a
  // narrow screen can wrap text and make rows taller.
  useEffect(() => {
    const table = gridTableRef.current;
    if (!table) return;
    const measure = () => {
      const cutoff = table.tBodies[0]?.rows[VISIBLE_ROWS];
      setGridMaxHeight(cutoff ? cutoff.offsetTop : null);
    };
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(table);
    return () => ro.disconnect();
  }, [loadingTeachers, teachers.length]);

  // While a drag is extending the highlight, holding the pointer near the scroll box's top
  // or bottom edge scrolls the grid, so a range can reach rows outside the visible window.
  useEffect(() => {
    if (!isSelecting) return;
    const onMove = (e: PointerEvent) => { lastPointerRef.current = { x: e.clientX, y: e.clientY }; };
    window.addEventListener("pointermove", onMove);
    let frame = 0;
    const tick = () => {
      const el = gridScrollRef.current;
      const p = lastPointerRef.current;
      if (el && p) {
        const rect = el.getBoundingClientRect();
        const thead = gridTableRef.current?.tHead?.getBoundingClientRect().height ?? 0;
        const top = rect.top + thead;
        let step = 0;
        if (p.y < top + AUTOSCROLL_EDGE_PX) {
          step = -Math.min(AUTOSCROLL_MAX_STEP_PX, top + AUTOSCROLL_EDGE_PX - p.y);
        } else if (p.y > rect.bottom - AUTOSCROLL_EDGE_PX) {
          step = Math.min(AUTOSCROLL_MAX_STEP_PX, p.y - (rect.bottom - AUTOSCROLL_EDGE_PX));
        }
        if (step !== 0) {
          const before = el.scrollTop;
          el.scrollTop += step;
          if (el.scrollTop !== before) {
            // The rows slid under a still pointer, so no cell got a pointer event — find
            // the one now under it, keeping the probe inside the body rows.
            const y = Math.min(Math.max(p.y, top + 2), rect.bottom - 2);
            const cell = cellFromPoint(p.x, y);
            if (cell) {
              dragMovedRef.current = true;
              setSelFocus(prev => (prev && prev.d === cell.d && prev.t === cell.t ? prev : cell));
            }
          }
        }
      }
      frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => {
      window.removeEventListener("pointermove", onMove);
      cancelAnimationFrame(frame);
      lastPointerRef.current = null;
    };
  }, [isSelecting]);

  // Changing the week or the teacher would leave the highlight pointing at other slots.
  useEffect(() => {
    selectionCommittedRef.current = false;
    isSelectingRef.current = false;
    setSelAnchor(null);
    setSelFocus(null);
    setIsSelecting(false);
    setBulkError(null);
  }, [weekStart, teacher?.id]);

  /** Open a one-cell highlight anchored where the finger is being held. */
  const beginTouchSelection = () => {
    longPressTimerRef.current = null;
    const press = pressRef.current;
    if (!press) return;
    dragMovedRef.current = false;
    selectionCommittedRef.current = false;
    // Set the ref up front, not via its effect: the very next touchmove has to be
    // cancelled, and the effect would not have run by then.
    isSelectingRef.current = true;
    setSelAnchor({ d: press.d, t: press.t });
    setSelFocus({ d: press.d, t: press.t });
    setIsSelecting(true);
  };

  // A press only records where it started; whether it becomes a click, a hold or a drag is
  // decided later by what the pointer does. Nothing here touches state, so an ordinary
  // click re-renders nothing.
  const handleCellPointerDown = (d: number, t: number, e: React.PointerEvent) => {
    if (e.pointerType === "mouse" && e.button !== 0) return;
    dragMovedRef.current = false;
    suppressClickRef.current = false;
    if (longPressTimerRef.current) clearTimeout(longPressTimerRef.current);
    longPressTimerRef.current = null;
    const touch = e.pointerType !== "mouse";
    pressRef.current = { d, t, x: e.clientX, y: e.clientY, touch };
    if (touch) longPressTimerRef.current = setTimeout(beginTouchSelection, LONG_PRESS_MS);
  };

  const handleCellPointerMove = (d: number, t: number, e: React.PointerEvent) => {
    const press = pressRef.current;
    if (!press) return;

    if (press.touch) {
      if (isSelecting) {
        // Touch sends every move to the cell the press began on, so hit-test for the one
        // actually under the finger.
        const cell = cellFromPoint(e.clientX, e.clientY);
        if (cell) {
          dragMovedRef.current = true;
          setSelFocus(cell);
        }
        return;
      }
      // Moving before the hold lands means the user is scrolling the grid, not selecting.
      if (
        Math.abs(e.clientX - press.x) > TOUCH_SCROLL_CANCEL_PX ||
        Math.abs(e.clientY - press.y) > TOUCH_SCROLL_CANCEL_PX
      ) {
        if (longPressTimerRef.current) clearTimeout(longPressTimerRef.current);
        longPressTimerRef.current = null;
        pressRef.current = null;
      }
      return;
    }

    if (isSelecting) return; // pointerenter extends it from here
    if (
      Math.abs(e.clientX - press.x) < DRAG_THRESHOLD_PX &&
      Math.abs(e.clientY - press.y) < DRAG_THRESHOLD_PX
    ) return;
    e.preventDefault(); // no text selection dragged across the grid
    dragMovedRef.current = true;
    selectionCommittedRef.current = false;
    setSelAnchor({ d: press.d, t: press.t });
    setSelFocus({ d, t }); // the cell the pointer has already reached
    setIsSelecting(true);
  };

  const handleCellPointerEnter = (d: number, t: number, e: React.PointerEvent) => {
    if (e.pointerType !== "mouse" || !isSelecting) return;
    setSelFocus({ d, t });
  };

  /**
   * Every cell's click runs through here first. A click that ends a drag does nothing, and
   * while a highlight is standing a click inside it keeps it (the action bar acts on it)
   * while a click outside simply dismisses it.
   */
  const guardCellClick = (key: string): boolean => {
    if (suppressClickRef.current) {
      suppressClickRef.current = false;
      return false;
    }
    if (selectionCommittedRef.current) {
      if (!selectedKeys.has(key)) clearSelection();
      return false;
    }
    return true;
  };

  /** Open or close every cell in the highlight that isn't already in that state. */
  const applyBulkSlots = async (action: "open" | "close") => {
    if (bulkBusy || !teacher) return;
    const targets = selectedCells.filter(c => (action === "open" ? !openSlots.has(c.key) : openSlots.has(c.key)));
    if (targets.length === 0) { clearSelection(); return; }
    setBulkBusy(action);
    setBulkError(null);
    try {
      await axios.post(`${base}/api/admin/teachers/${teacher.id}/weekly-slots/bulk`, {
        action,
        slots: targets.map(c => ({ slot_date: c.dateStr, slot_time: `${c.time}:00` })),
      }, { headers });
      clearSelection();
      fetchGrid();
    } catch (err: unknown) {
      const msg = (err as { response?: { data?: { message?: string } } })?.response?.data?.message
        || `Failed to ${action} the selected slots`;
      setBulkError(msg);
      fetchGrid(); // resync in case the week moved under us
    } finally {
      setBulkBusy(null);
    }
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
                    Drag across slots — or hold and drag on touch — to open or close a whole range at once.
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
              <div
                ref={gridScrollRef}
                style={gridMaxHeight ? { maxHeight: gridMaxHeight } : undefined}
                className={`overflow-auto overscroll-contain ${loadingGrid ? "opacity-50 pointer-events-none" : ""}`}
              >
                {/* select-none stops a drag across the grid turning into a text selection,
                    and touch-none keeps a finger extending the highlight instead of scrolling. */}
                <table
                  ref={gridTableRef}
                  className={`w-full text-xs border-collapse table-fixed select-none ${isSelecting ? "touch-none" : ""}`}
                  onContextMenu={e => e.preventDefault()}
                >
                  {/* Pinned while the rows scroll; z-20 keeps it above the highlighted
                      row's tint overlay. */}
                  <thead className="sticky top-0 z-20 bg-white shadow-[0_1px_0_0_var(--border)]">
                    <tr>
                      <th className="p-1 text-left w-16 bg-white">Time</th>
                      {[...Array(7)].map((_, i) => (
                        <th key={i} className="p-1 text-center bg-white">{format(addDays(weekStart, i), "EEE MM/dd")}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {SLOT_TIMES.map((time, timeIdx) => {
                      const isRowHighlighted = highlightedTime === time;
                      return (
                      <tr key={time} className="group">
                        <td
                          onClick={() => setHighlightedTime(prev => (prev === time ? null : time))}
                          title={isRowHighlighted ? "Click to clear the highlight" : "Click to highlight this time"}
                          className={`p-1 font-medium transition-colors rounded whitespace-nowrap cursor-pointer select-none ${
                            isRowHighlighted
                              ? `text-primary font-semibold ${ROW_HIGHLIGHT}`
                              : "text-muted-foreground group-hover:bg-primary/10 group-hover:text-primary group-hover:font-semibold"
                          }`}
                        >
                          {fmt12(time)}
                        </td>
                        {[...Array(7)].map((_, j) => {
                          const day = format(addDays(weekStart, j), "yyyy-MM-dd");
                          const key = `${day}|${time}`;
                          // Marks the cell for the touch hit-test in cellFromPoint, and
                          // feeds the drag-selection its day/time coordinates.
                          const dragProps = {
                            "data-slot-cell": `${j}:${timeIdx}`,
                            onPointerDown: (e: React.PointerEvent) => handleCellPointerDown(j, timeIdx, e),
                            onPointerMove: (e: React.PointerEvent) => handleCellPointerMove(j, timeIdx, e),
                            onPointerEnter: (e: React.PointerEvent) => handleCellPointerEnter(j, timeIdx, e),
                          };
                          const selectedRing = selectedKeys.has(key) ? " ring-2 ring-inset ring-primary" : "";
                          // Swallowed by the merged note block starting above it
                          if (noteCovered.has(key)) return null;
                          const noteSpan = noteSpans.get(key) ?? 1;
                          const booking = bookingByKey.get(key);
                          const isOpen = openSlots.has(key);
                          const isPast = new Date(`${day}T${time}:00`) < new Date();
                          const isToggling = togglingSlot === key;
                          const note = notesByKey.get(key);
                          const noteBg = note && isValidHex(note.note_color) ? note.note_color : note ? DEFAULT_NOTE_COLOR : null;

                          if (booking) {
                            const isDone = booking.status === "done";
                            const isPending = booking.status === "pending";
                            const isContinuation = !!booking.booking_group_id && groupFirstSlot.get(booking.booking_group_id) !== key;
                            const label = isContinuation ? `↳ ${booking.student_name}` : booking.student_name;
                            const tooltip = `${booking.student_name} — ${booking.package_name}${booking.duration_minutes ? ` (${booking.duration_minutes} min)` : ""} · ${booking.status}`;
                            return (
                              <td
                                key={j}
                                {...dragProps}
                                onClick={() => {
                                  if (!guardCellClick(key)) return;
                                  if (!isDone && cancellingId === null) handleBookedClick(booking);
                                }}
                                title={isDone ? `${tooltip} — completed, cannot cancel` : `${tooltip} — click to cancel`}
                                style={isDone ? undefined : { backgroundColor: studentColor(booking.student_id), color: "#fff" }}
                                className={`p-1 text-center border transition-[filter] ${
                                  isDone ? "bg-slate-200 text-slate-500 cursor-default"
                                  : isPending ? "cursor-pointer hover:brightness-110 bg-[repeating-linear-gradient(45deg,transparent_0_6px,rgba(255,255,255,0.35)_6px_12px)]"
                                  : "cursor-pointer hover:brightness-110"
                                }${selectedRing} ${isRowHighlighted ? ROW_HIGHLIGHT : ""}`}
                              >
                                <div className="truncate font-medium">{isPending ? `⏳ ${label}` : label}</div>
                              </td>
                            );
                          }

                          return (
                            <td
                              key={j}
                              rowSpan={noteSpan}
                              {...dragProps}
                              onClick={() => {
                                if (!guardCellClick(key)) return;
                                if (isPast || isToggling) return;
                                if (isOpen) openBookingModal(day, time);
                                else toggleSlot(day, time, "open");
                              }}
                              title={
                                note
                                  ? `Teacher note: ${note.note_icon ? note.note_icon + " " : ""}${note.note_text}${noteSpan > 1 ? ` · ${fmt12(time)} – ${fmt12(addMinutes(time, noteSpan * 30))}` : ""}`
                                  : isPast ? undefined : isOpen ? "Open — click to book a class" : "Closed — click to open this slot"
                              }
                              style={noteBg ? { backgroundColor: noteBg, color: getContrastText(noteBg) } : undefined}
                              className={`p-1 text-center border transition-colors ${
                                isPast ? "bg-gray-50 text-gray-300 cursor-not-allowed"
                                : noteBg ? "hover:brightness-95 cursor-pointer"
                                : isOpen ? "bg-green-100 text-green-700 hover:bg-green-200 cursor-pointer"
                                : "bg-gray-100 text-gray-400 hover:bg-gray-200 cursor-pointer"
                              }${selectedRing} ${isRowHighlighted ? ROW_HIGHLIGHT : ""}`}
                            >
                              {isToggling ? "..." : isPast ? "" : note ? (
                                <span className="block">
                                  <span className={`text-[10px] font-semibold block ${noteSpan > 1 ? "break-words" : "truncate"}`}>
                                    {note.note_icon ? `${note.note_icon} ` : ""}{note.note_text}
                                  </span>
                                  {noteSpan > 1 && (
                                    <span className="block text-[9px] opacity-75 mt-0.5">
                                      {fmt12(time)} – {fmt12(addMinutes(time, noteSpan * 30))}
                                    </span>
                                  )}
                                </span>
                              ) : isOpen ? "✓" : "+"}
                            </td>
                          );
                        })}
                      </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
              <div className="flex flex-wrap gap-4 mt-3 text-xs text-muted-foreground">
                <span><span className="inline-block w-3 h-3 bg-green-100 border rounded mr-1" />Open (✓) — click to book</span>
                <span><span className="inline-block w-3 h-3 bg-gray-100 border rounded mr-1" />Closed (+) — click to open</span>
                <span>
                  <span className="inline-block w-3 h-3 border rounded-l" style={{ backgroundColor: STUDENT_COLORS[0] }} />
                  <span className="inline-block w-3 h-3 border" style={{ backgroundColor: STUDENT_COLORS[2] }} />
                  <span className="inline-block w-3 h-3 border rounded-r mr-1" style={{ backgroundColor: STUDENT_COLORS[4] }} />
                  Booked (one color per student) — click to cancel
                </span>
                <span>⏳ Pending (striped)</span>
                <span><span className="inline-block w-3 h-3 bg-slate-200 border rounded mr-1" />Completed</span>
                <span><span className="inline-block w-3 h-3 bg-gray-50 border rounded mr-1" />Past</span>
                <span><span className="inline-block w-3 h-3 bg-amber-100 border rounded mr-1" />Teacher note (shared by teacher)</span>
                <span><span className="inline-block w-3 h-3 border-2 border-primary rounded mr-1" />Selected — drag to pick a range, then open or close it</span>
              </div>
            </CardContent>
          </Card>
        )}
      </div>

      {/* Bulk-selection action bar. Floated over the page rather than placed above the
          grid: appearing in the flow would shove every cell down mid-drag. */}
      {selectionSize > 0 && (
        <div className="fixed bottom-4 left-1/2 -translate-x-1/2 z-40 w-[min(42rem,calc(100vw-2rem))]">
          <div className="flex flex-wrap items-center gap-2 p-2 rounded-xl border border-primary/30 bg-white shadow-lg">
            <span className="text-xs font-medium">
              {selectionSize} slot{selectionSize === 1 ? "" : "s"} selected
              <span className="text-muted-foreground font-normal"> · {selectionLabel}</span>
            </span>
            <span className="text-[11px] text-muted-foreground">
              ({closedInSelection} closed, {openInSelection} open)
            </span>
            <div className="flex items-center gap-2 ml-auto">
              <Button
                size="sm" className="h-7 px-2 text-xs"
                disabled={closedInSelection === 0 || bulkBusy !== null}
                onClick={() => applyBulkSlots("open")}
              >
                {bulkBusy === "open"
                  ? <Loader2 className="h-3 w-3 animate-spin" />
                  : `Open ${closedInSelection} slot${closedInSelection === 1 ? "" : "s"}`}
              </Button>
              <Button
                size="sm" variant="outline" className="h-7 px-2 text-xs"
                disabled={openInSelection === 0 || bulkBusy !== null}
                onClick={() => applyBulkSlots("close")}
              >
                {bulkBusy === "close"
                  ? <Loader2 className="h-3 w-3 animate-spin" />
                  : `Close ${openInSelection} slot${openInSelection === 1 ? "" : "s"}`}
              </Button>
              <Button
                size="sm" variant="ghost" className="h-7 px-2 text-xs"
                disabled={bulkBusy !== null}
                onClick={clearSelection}
              >
                Clear
              </Button>
            </div>
            {bulkError && <p className="w-full text-xs text-red-600">{bulkError}</p>}
          </div>
        </div>
      )}

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
              <StudentPackagePicker
                items={studentPickerItems}
                value={selectedPkgId}
                onChange={v => { setSelectedPkgId(v); setBookingError(null); }}
                durationOptions={["25", "50"]}
                emptyMessage="No students with a paid package and sessions remaining."
              />
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
