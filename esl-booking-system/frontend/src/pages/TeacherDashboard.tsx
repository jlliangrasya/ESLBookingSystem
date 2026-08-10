import { useState, useEffect, useContext, useRef, useMemo } from "react";
import axios from "axios";
import { useNavigate } from "react-router-dom";
import AuthContext from "@/context/AuthContext";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  CalendarDays,
  Users,
  LogOut,
  Loader2,
  FileText,
  CalendarOff,
  Plus,
  X,
  Video,
  LayoutList,
  UserCircle,
  Activity,
  CheckSquare,
  ChevronLeft,
  ChevronRight,
  Menu,
  UserX,
  Timer,
  CheckCircle2,
  Search,
  Repeat,
  Sparkles,
} from "lucide-react";
import BrandLogo from "@/components/BrandLogo";
import NotificationBell from "@/components/NotificationBell";
import InstallAppButton from "@/components/InstallAppButton";
import ReportModal from "@/components/ReportModal";
import { fmtDate, fmtDateOnly, TIMEZONES } from "@/utils/timezone";
import {
  NOTE_COLOR_PRESETS,
  NOTE_ICONS,
  DEFAULT_NOTE_COLOR,
  isValidHex,
  getContrastText,
} from "@/utils/noteColors";
import AnnouncementPanel from "@/components/AnnouncementPanel";
import TablePagination from "@/components/TablePagination";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  Popover,
  PopoverTrigger,
  PopoverContent,
} from "@/components/ui/popover";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import MonthCalendar, { MonthCalendarEvent } from "@/components/MonthCalendar";
import LinkedAccountsCard from "@/components/LinkedAccountsCard";
import { useLinkedAccounts, roleLabel } from "@/hooks/useLinkedAccounts";

type Page = "dashboard" | "classes" | "profile";

interface Teacher {
  id: number;
  name: string;
  email: string;
}
interface AssignedStudent {
  id: number;
  name: string;
  nationality: string;
  age: number;
  duration_minutes: number;
  sessions_remaining: number;
  unused_sessions: number;
  subject: string;
  payment_status: string;
}
interface Booking {
  id: number;
  appointment_date: string;
  status: string;
  student_name: string;
  duration_minutes: number;
  subject: string;
  class_mode: string | null;
  meeting_link: string | null;
  student_absent: boolean;
  slot_count?: number;
  recurring_schedule_id: number | null;
}
interface CompletedBooking {
  id: number;
  appointment_date: string;
  status: string;
  student_name: string;
  student_id: number;
  duration_minutes: number;
  subject: string;
  has_report: boolean;
  student_absent: boolean;
  teacher_absent: boolean;
  slot_count?: number;
}
interface PendingItem {
  id: number;
  appointment_date: string;
  status: string;
  student_name: string;
  student_id: number;
  duration_minutes: number;
  subject: string;
  student_package_id: number;
  student_absent: boolean;
  slot_count?: number;
}
interface WeekBooking {
  id: number;
  appointment_date: string;
  status: string;
  student_name: string;
  subject: string;
  student_absent: boolean;
  teacher_absent: boolean;
  slot_count?: number;
}
interface TeacherLeave {
  id: number;
  leave_date: string;
  reason_type: string;
  notes: string | null;
  status: string;
  created_at: string;
}
interface Health {
  total_done: number;
  total_absent: number;
  attended: number;
}

const MONTHS = [
  "January",
  "February",
  "March",
  "April",
  "May",
  "June",
  "July",
  "August",
  "September",
  "October",
  "November",
  "December",
];

const SLOT_TIMES: string[] = Array.from({ length: 32 }, (_, i) => {
  const totalMins = 7 * 60 + i * 30;
  const h = Math.floor(totalMins / 60)
    .toString()
    .padStart(2, "0");
  const m = (totalMins % 60).toString().padStart(2, "0");
  return `${h}:${m}`;
});

/** A single 30-min cell in the weekly availability grid. */
type SlotRef = { dateStr: string; time: string };

type SlotNote = {
  note_text: string;
  admin_visibility: boolean;
  note_color: string;
  note_icon: string | null;
  note_group_id: string | null;
};

/** What the note dialog is currently editing — one slot, a drag-selection, or a merged block. */
type NoteTarget = {
  slots: SlotRef[];
  /** Existing merged block being edited (null when creating). */
  groupId: string | null;
  /** True when the slots are one contiguous run on a single day, so they can be merged. */
  mergeable: boolean;
  /** Human-readable range for the dialog title. */
  label: string;
  /** True when at least one of the slots already carries a note. */
  existing: boolean;
};

/** Availability grid cells are read-only once their start time has gone by. */
const isPastSlot = (dateStr: string, time: string): boolean =>
  new Date(`${dateStr}T${time}:00`) < new Date();

/** "Mon, Aug 10" for a YYYY-MM-DD key, read as a local date (never UTC-shifted). */
const labelForDate = (dateStr: string): string =>
  new Date(`${dateStr}T00:00:00`).toLocaleDateString("en-US", {
    weekday: "short",
    month: "short",
    day: "numeric",
  });

/** End of a run of `span` half-hour slots starting at `time`, as HH:mm. */
const slotRangeEnd = (time: string, span: number): string => {
  const [h, m] = time.split(":").map(Number);
  const total = h * 60 + m + span * 30;
  return `${String(Math.floor(total / 60) % 24).padStart(2, "0")}:${String(total % 60).padStart(2, "0")}`;
};

const getWeekStart = (d: Date): Date => {
  const date = new Date(d);
  const day = date.getDay();
  const diff = date.getDate() - day + (day === 0 ? -6 : 1);
  date.setDate(diff);
  date.setHours(0, 0, 0, 0);
  return date;
};

const fmt12 = (time: string): string => {
  const [hStr, mStr] = time.split(":");
  let h = parseInt(hStr);
  const ampm = h >= 12 ? "PM" : "AM";
  if (h > 12) h -= 12;
  if (h === 0) h = 12;
  return `${h}:${mStr} ${ampm}`;
};

// Every "YYYY-MM-DD|HH:mm" availability-grid key a booking occupies. Multi-slot bookings
// (slot_count > 1) cover consecutive 30-min slots, so they expand to one key each.
const slotKeysFor = (appointmentDate: string, slotCount = 1): string[] => {
  const dateKey = fmtDate(appointmentDate, "yyyy-MM-dd");
  const [bh, bm] = fmtDate(appointmentDate, "HH:mm").split(":").map(Number);
  return Array.from({ length: slotCount || 1 }, (_, i) => {
    const totalMin = bh * 60 + bm + i * 30;
    const h = String(Math.floor(totalMin / 60)).padStart(2, "0");
    const m = String(totalMin % 60).padStart(2, "0");
    return `${dateKey}|${h}:${m}`;
  });
};

// Formats a "yyyy-MM-dd" calendar key as a local date, avoiding the UTC
// off-by-one that plain `new Date("yyyy-MM-dd")` parsing can introduce.
const fmtDayKey = (key: string): string => {
  const [y, m, d] = key.split("-").map(Number);
  return new Date(y, m - 1, d).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
};

const statusColors: Record<string, string> = {
  pending: "bg-yellow-100 text-yellow-800",
  confirmed: "bg-green-100 text-green-800",
  done: "bg-blue-100 text-blue-800",
  cancelled: "bg-red-100 text-red-800",
};
const leaveStatusColors: Record<string, string> = {
  pending: "bg-yellow-100 text-yellow-800",
  approved: "bg-green-100 text-green-800",
  rejected: "bg-red-100 text-red-800",
};

function HealthBadge({ health }: { health: Health }) {
  const total = health.attended + health.total_absent;
  if (total === 0)
    return <span className="text-xs text-muted-foreground">No data yet</span>;
  const rate = Math.round((health.attended / total) * 100);
  const { label, cls } =
    rate >= 90
      ? { label: "Excellent", cls: "bg-green-100 text-green-700" }
      : rate >= 75
        ? { label: "Good", cls: "bg-blue-100 text-blue-700" }
        : rate >= 50
          ? { label: "Fair", cls: "bg-yellow-100 text-yellow-700" }
          : { label: "At Risk", cls: "bg-red-100 text-red-700" };
  return (
    <div className="flex flex-col gap-1">
      <span
        className={`text-xs px-2 py-0.5 rounded-full font-medium w-fit ${cls}`}
      >
        {label} — {rate}% attendance
      </span>
      <span className="text-xs text-muted-foreground">
        {health.attended} attended · {health.total_absent} absent · {total}{" "}
        total
      </span>
    </div>
  );
}

const TeacherDashboard = () => {
  const authContext = useContext(AuthContext);
  const navigate = useNavigate();
  const token = localStorage.getItem("token");
  const headers = { Authorization: `Bearer ${token}` };

  const [page, setPage] = useState<Page>("dashboard");
  const [loading, setLoading] = useState(true);

  // Core data
  const [teacher, setTeacher] = useState<Teacher | null>(null);
  const [students, setStudents] = useState<AssignedStudent[]>([]);
  const [bookings, setBookings] = useState<Booking[]>([]);
  const [completedBookings, setCompletedBookings] = useState<
    CompletedBooking[]
  >([]);
  const [pendingConfirmation, setPendingConfirmation] = useState<PendingItem[]>(
    [],
  );
  const [upcomingPage, setUpcomingPage] = useState(1);
  const [upcomingPageSize, setUpcomingPageSize] = useState(10);
  // Upcoming classes filters & sort
  const [upcomingSearch, setUpcomingSearch] = useState("");
  const [upcomingFilterStudent, setUpcomingFilterStudent] = useState("all");
  const [upcomingFilterNoClassInfo, setUpcomingFilterNoClassInfo] =
    useState(false);
  const [upcomingFilterDate, setUpcomingFilterDate] = useState("");
  const [upcomingSort, setUpcomingSort] = useState("date-asc");
  const [completedPage, setCompletedPage] = useState(1);
  const [completedPageSize, setCompletedPageSize] = useState(20);
  const [classesThisWeek, setClassesThisWeek] = useState(0);
  const [classesThisMonth, setClassesThisMonth] = useState(0);
  const [completedWithReportThisWeek, setCompletedWithReportThisWeek] =
    useState(0);
  const [absentStudentsThisWeek, setAbsentStudentsThisWeek] = useState(0);
  const [fiftyMinThisWeek, setFiftyMinThisWeek] = useState(0);
  const [twentyFiveMinThisWeek, setTwentyFiveMinThisWeek] = useState(0);
  const [health, setHealth] = useState<Health>({
    total_done: 0,
    total_absent: 0,
    attended: 0,
  });
  const [leaves, setLeaves] = useState<TeacherLeave[]>([]);
  const [feedback, setFeedback] = useState<
    { id: number; student_name: string; message: string; created_at: string }[]
  >([]);
  const [cancellationHours, setCancellationHours] = useState(1);

  // Calendar
  const [calendarBookings, setCalendarBookings] = useState<
    Record<string, { student: string; time: string; sortTime: string }[]>
  >({});
  // Admin-visible notes shown as chips on the main month calendar, keyed by yyyy-MM-dd
  const [calendarNotes, setCalendarNotes] = useState<
    Record<string, MonthCalendarEvent[]>
  >({});
  const monthNotesReqIdRef = useRef(0);
  const monthCalendarEvents = useMemo(() => {
    const merged: Record<string, MonthCalendarEvent[]> = {};
    Object.entries(calendarBookings).forEach(([key, list]) => {
      merged[key] = [...list];
    });
    Object.entries(calendarNotes).forEach(([key, list]) => {
      merged[key] = [...(merged[key] || []), ...list];
    });
    return merged;
  }, [calendarBookings, calendarNotes]);
  const [selectedDayBookings, setSelectedDayBookings] = useState<Booking[]>([]);
  const [selectedDayNotes, setSelectedDayNotes] = useState<
    MonthCalendarEvent[]
  >([]);
  const [selectedDayKey, setSelectedDayKey] = useState<string | null>(null);
  // Bookings + notes merged into one chronological list for the day-schedule modal
  const dayScheduleItems = useMemo(() => {
    type DayItem =
      | { kind: "booking"; sortTime: string; booking: Booking }
      | { kind: "note"; sortTime: string; note: MonthCalendarEvent };
    const items: DayItem[] = [
      ...selectedDayBookings.map((b) => ({
        kind: "booking" as const,
        sortTime: fmtDate(b.appointment_date, "HH:mm"),
        booking: b,
      })),
      ...selectedDayNotes.map((n) => ({
        kind: "note" as const,
        sortTime: n.sortTime || "",
        note: n,
      })),
    ];
    return items.sort((a, b) => a.sortTime.localeCompare(b.sortTime));
  }, [selectedDayBookings, selectedDayNotes]);
  const [showDayModal, setShowDayModal] = useState(false);
  // Inline class-info editing inside the day modal
  const [dayModalEditingId, setDayModalEditingId] = useState<number | null>(
    null,
  );
  const [dayModalForm, setDayModalForm] = useState({
    class_mode: "",
    meeting_link: "",
  });
  const [dayModalOtherMode, setDayModalOtherMode] = useState(false);
  const [dayModalSaving, setDayModalSaving] = useState(false);
  const [dayModalError, setDayModalError] = useState<string | null>(null);
  const [dayModalCopiedId, setDayModalCopiedId] = useState<number | null>(null);

  // Confirm classes
  const [doneLoadingId, setDoneLoadingId] = useState<number | null>(null);
  const [absentLoadingId, setAbsentLoadingId] = useState<number | null>(null);
  const [postDoneReport, setPostDoneReport] = useState<{
    bookingId: number;
    studentId: number;
    studentName: string;
    classDate: string;
  } | null>(null);

  // Classes page — completed filter
  const [classesMonth, setClassesMonth] = useState(new Date().getMonth() + 1);
  const [classesYear, setClassesYear] = useState(new Date().getFullYear());
  const [filteredCompleted, setFilteredCompleted] = useState<
    CompletedBooking[]
  >([]);
  const [filteredLoading, setFilteredLoading] = useState(false);

  // Class info modal (upcoming)
  const [editingBooking, setEditingBooking] = useState<Booking | null>(null);
  const [classForm, setClassForm] = useState({
    class_mode: "",
    meeting_link: "",
  });
  const [classInfoLoading, setClassInfoLoading] = useState(false);
  const [classInfoError, setClassInfoError] = useState<string | null>(null);
  const classModeOptions = [
    "Voov/Tencent",
    "Classin",
    "Google Meet",
    "Zoom",
    "Others",
  ];
  const knownModes = ["Voov/Tencent", "Classin", "Google Meet", "Zoom"];
  const [otherModeActive, setOtherModeActive] = useState(false);
  const selectValue =
    otherModeActive ||
    (classForm.class_mode !== "" && !knownModes.includes(classForm.class_mode))
      ? "Others"
      : classForm.class_mode;

  // Bulk selection for class info
  const [selectedBookingIds, setSelectedBookingIds] = useState<Set<number>>(
    new Set(),
  );
  const [bulkClassInfoOpen, setBulkClassInfoOpen] = useState(false);

  // Cancel booking
  const [cancelConfirm, setCancelConfirm] = useState<Booking | null>(null);
  const [cancelLoading, setCancelLoading] = useState(false);
  const [cancelBlocked, setCancelBlocked] = useState(false);
  const [recurringCancelBooking, setRecurringCancelBooking] =
    useState<Booking | null>(null);

  // Leave modal
  const [showLeaveModal, setShowLeaveModal] = useState(false);
  const [leaveForm, setLeaveForm] = useState({
    leave_date: "",
    reason_type: "personal",
    notes: "",
  });
  const [leaveLoading, setLeaveLoading] = useState(false);

  // Profile edit
  const [profileForm, setProfileForm] = useState({
    name: "",
    email: "",
    password: "",
    timezone: "UTC",
  });
  const [profileLoading, setProfileLoading] = useState(false);
  const [profileSuccess, setProfileSuccess] = useState(false);
  const [profileError, setProfileError] = useState<string | null>(null);

  // Weekly availability
  const [weekStart, setWeekStart] = useState<Date>(() =>
    getWeekStart(new Date()),
  );
  const [openSlots, setOpenSlots] = useState<Set<string>>(new Set());
  const [weekSlotsLoading, setWeekSlotsLoading] = useState(false);
  const [togglingSlot, setTogglingSlot] = useState<string | null>(null);
  // Drag-highlight over the grid. The selection is the rectangle between the cell the
  // drag started on (anchor) and the one under the pointer (focus), both as
  // { d: day column index, t: SLOT_TIMES index }. Null when nothing is selected.
  const [selAnchor, setSelAnchor] = useState<{ d: number; t: number } | null>(
    null,
  );
  const [selFocus, setSelFocus] = useState<{ d: number; t: number } | null>(
    null,
  );
  const [isSelecting, setIsSelecting] = useState(false);
  const [bulkBusy, setBulkBusy] = useState<"open" | "close" | null>(null);
  // Every booking in the displayed week (any date, any status but cancelled) — `bookings`
  // above only holds upcoming classes, so past cells in the grid need their own source.
  const [weekBookings, setWeekBookings] = useState<WeekBooking[]>([]);

  // Personal calendar notes (e.g. "LUNCH") on closed slots — double-click a slot to add
  const [slotNotes, setSlotNotes] = useState<Map<string, SlotNote>>(new Map());
  // The dialog writes to a list of slots: one for a plain double-click, the whole
  // drag-selection for a bulk note, or every slot of a merged block when editing one.
  const [noteTarget, setNoteTarget] = useState<NoteTarget | null>(null);
  const [noteMerge, setNoteMerge] = useState(true);
  const [noteText, setNoteText] = useState("");
  const [noteAdminVisible, setNoteAdminVisible] = useState(false);
  const [noteColor, setNoteColor] = useState(DEFAULT_NOTE_COLOR);
  const [noteIcon, setNoteIcon] = useState("");
  const [noteSaving, setNoteSaving] = useState(false);
  const [noteError, setNoteError] = useState<string | null>(null);
  const [iconPickerOpen, setIconPickerOpen] = useState(false);

  // Recurring availability dialog
  const [showRecurringAvail, setShowRecurringAvail] = useState(false);
  const [recurringAvailDays, setRecurringAvailDays] = useState<string[]>([]);
  const [recurringAvailStart, setRecurringAvailStart] = useState("09:00");
  const [recurringAvailEnd, setRecurringAvailEnd] = useState("17:00");
  const [recurringAvailWeeks, setRecurringAvailWeeks] = useState(4);
  const [recurringAvailLoading, setRecurringAvailLoading] = useState(false);
  const [recurringAvailMsg, setRecurringAvailMsg] = useState<string | null>(
    null,
  );
  const [clearingWeek, setClearingWeek] = useState(false);

  // Report modal
  const [reportModal, setReportModal] = useState<{
    open: boolean;
    bookingId: number;
    studentId: number;
    studentName: string;
    classDate: string;
  }>({
    open: false,
    bookingId: 0,
    studentId: 0,
    studentName: "",
    classDate: "",
  });

  const fetchData = async () => {
    try {
      const [dashRes, settingsRes, feedbackRes] = await Promise.all([
        axios.get(`${import.meta.env.VITE_API_URL}/api/teacher/dashboard`, {
          headers,
        }),
        axios.get(
          `${import.meta.env.VITE_API_URL}/api/admin/company-settings`,
          { headers },
        ),
        axios.get(`${import.meta.env.VITE_API_URL}/api/teacher/feedback`, {
          headers,
        }),
      ]);
      const dash = dashRes.data;
      setTeacher(dash.teacher);
      setStudents(dash.students);
      setBookings(dash.bookings);
      setSelectedBookingIds(new Set());
      setCompletedBookings(dash.completedBookings || []);
      setClassesThisWeek(dash.classes_this_week ?? 0);
      setClassesThisMonth(dash.classes_this_month ?? 0);
      setCompletedWithReportThisWeek(dash.completed_with_report_this_week ?? 0);
      setAbsentStudentsThisWeek(dash.absent_students_this_week ?? 0);
      setFiftyMinThisWeek(dash.fifty_min_this_week ?? 0);
      setTwentyFiveMinThisWeek(dash.twenty_five_min_this_week ?? 0);
      setHealth(dash.health ?? { total_done: 0, total_absent: 0, attended: 0 });
      setCancellationHours(settingsRes.data.cancellation_hours ?? 1);
      setFeedback(feedbackRes.data || []);

      // Build calendar map
      const calMap: Record<
        string,
        { student: string; time: string; sortTime: string }[]
      > = {};
      [...(dash.bookings as Booking[])]
        .sort(
          (a, b) =>
            new Date(a.appointment_date).getTime() -
            new Date(b.appointment_date).getTime(),
        )
        .forEach((b) => {
          const key = fmtDate(b.appointment_date, "yyyy-MM-dd");
          if (!calMap[key]) calMap[key] = [];
          calMap[key].push({
            student: b.student_name,
            time: fmtDate(b.appointment_date, "h:mm a"),
            sortTime: fmtDate(b.appointment_date, "HH:mm"),
          });
        });
      setCalendarBookings(calMap);

      // Profile form seed
      setProfileForm((prev) => ({
        ...prev,
        name: dash.teacher?.name || "",
        email: dash.teacher?.email || "",
      }));
    } catch (err) {
      console.error("Error fetching teacher dashboard:", err);
    } finally {
      setLoading(false);
    }
  };

  const fetchPending = async () => {
    try {
      const res = await axios.get(
        `${import.meta.env.VITE_API_URL}/api/teacher/pending-confirmation`,
        { headers },
      );
      setPendingConfirmation(res.data || []);
    } catch {
      // non-critical
    }
  };

  const fetchLeaves = async () => {
    try {
      const res = await axios.get(
        `${import.meta.env.VITE_API_URL}/api/teacher/leaves`,
        { headers },
      );
      setLeaves(res.data);
    } catch (err) {
      console.error(err);
    }
  };

  const fetchFilteredCompleted = async (
    month = classesMonth,
    year = classesYear,
  ) => {
    setFilteredLoading(true);
    try {
      const res = await axios.get(
        `${import.meta.env.VITE_API_URL}/api/teacher/completed-classes?month=${month}&year=${year}`,
        { headers },
      );
      setFilteredCompleted(res.data);
    } catch (err) {
      console.error(err);
    } finally {
      setFilteredLoading(false);
    }
  };

  const fetchOpenSlots = async (start: Date) => {
    setWeekSlotsLoading(true);
    try {
      const startStr = start.toLocaleDateString("en-CA");
      const res = await axios.get(
        `${import.meta.env.VITE_API_URL}/api/teacher/weekly-slots?startDate=${startStr}`,
        { headers },
      );
      const slotSet = new Set<string>(
        (res.data as { slot_date: string; slot_time: string }[]).map(
          (s) => `${s.slot_date}|${s.slot_time}`,
        ),
      );
      setOpenSlots(slotSet);
    } catch {
      // non-critical
    } finally {
      setWeekSlotsLoading(false);
    }
  };

  const fetchWeekBookings = async (start: Date) => {
    try {
      const startStr = start.toLocaleDateString("en-CA");
      const res = await axios.get(
        `${import.meta.env.VITE_API_URL}/api/teacher/week-bookings?startDate=${startStr}`,
        { headers },
      );
      setWeekBookings(res.data || []);
    } catch {
      // non-critical — the grid still renders, past cells just stay empty
    }
  };

  // True once a press has been dragged onto a different cell. Read by the cell's click
  // handler, which fires after mouseup: the derived selection can't be used for this,
  // because pressing on a merged block already selects every slot it covers.
  const dragMovedRef = useRef(false);

  const clearSelection = () => {
    setSelAnchor(null);
    setSelFocus(null);
    setIsSelecting(false);
  };

  const toggleSlot = async (dateStr: string, time: string) => {
    const key = `${dateStr}|${time}`;
    const isOpen = openSlots.has(key);
    const action = isOpen ? "close" : "open";
    setTogglingSlot(key);
    try {
      await axios.post(
        `${import.meta.env.VITE_API_URL}/api/teacher/weekly-slots`,
        { slot_date: dateStr, slot_time: `${time}:00`, action },
        { headers },
      );
      setOpenSlots((prev) => {
        const next = new Set(prev);
        if (isOpen) next.delete(key);
        else next.add(key);
        return next;
      });
    } catch (err: unknown) {
      alert(
        (err as { response?: { data?: { message?: string } } })?.response?.data
          ?.message || "Failed to update slot",
      );
    } finally {
      setTogglingSlot(null);
    }
  };

  // A native double-click fires two "click" events before "dblclick" — without this guard,
  // both clicks would read the same stale openSlots state and toggle the slot before the
  // note dialog opens. Delay the single-click toggle briefly so a following dblclick can cancel it.
  const slotClickTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const handleSlotClick = (dateStr: string, time: string) => {
    if (slotClickTimer.current) clearTimeout(slotClickTimer.current);
    slotClickTimer.current = setTimeout(() => {
      slotClickTimer.current = null;
      toggleSlot(dateStr, time);
    }, 250);
  };

  const handleSlotDoubleClick = (dateStr: string, time: string) => {
    if (slotClickTimer.current) {
      clearTimeout(slotClickTimer.current);
      slotClickTimer.current = null;
    }
    openNoteDialog(dateStr, time);
  };

  const fetchSlotNotes = async (start: Date) => {
    try {
      const startStr = start.toLocaleDateString("en-CA");
      const res = await axios.get(
        `${import.meta.env.VITE_API_URL}/api/teacher/notes?startDate=${startStr}`,
        { headers },
      );
      const noteMap = new Map<string, SlotNote>();
      (res.data as ({ note_date: string; slot_time: string } & SlotNote)[]).forEach(
        (n) => {
          noteMap.set(`${n.note_date}|${n.slot_time}`, {
            note_text: n.note_text,
            admin_visibility: n.admin_visibility,
            note_color: n.note_color,
            note_icon: n.note_icon,
            note_group_id: n.note_group_id ?? null,
          });
        },
      );
      setSlotNotes(noteMap);
    } catch {
      // non-critical
    }
  };

  // Admin-visible notes for the month shown behind the main calendar (MonthCalendar).
  const fetchMonthNotes = async (year: number, month: number) => {
    const reqId = ++monthNotesReqIdRef.current;
    try {
      const start = new Date(year, month, 1).toLocaleDateString("en-CA");
      const end = new Date(year, month + 1, 1).toLocaleDateString("en-CA");
      const res = await axios.get(
        `${import.meta.env.VITE_API_URL}/api/teacher/notes?startDate=${start}&endDate=${end}`,
        { headers },
      );
      if (reqId !== monthNotesReqIdRef.current) return; // a newer month was requested since
      // Drop notes on days already past, matching how the backend only returns
      // upcoming bookings (DATE(appointment_date) >= today) — past cells stay empty.
      const today = new Date().toLocaleDateString("en-CA");
      const noteMap: Record<string, MonthCalendarEvent[]> = {};
      const rows = (
        res.data as {
          note_date: string;
          slot_time: string;
          note_text: string;
          admin_visibility: boolean;
          note_color: string;
          note_icon: string | null;
          note_group_id: string | null;
        }[]
      ).filter((n) => n.admin_visibility && n.note_date >= today);

      // A merged note is stored as one row per slot sharing a note_group_id. Show one
      // chip per block covering its whole range, not one chip per half hour.
      const groupLastSlot = new Map<string, string>();
      rows.forEach((n) => {
        if (!n.note_group_id) return;
        const seenEnd = groupLastSlot.get(n.note_group_id);
        if (!seenEnd || n.slot_time > seenEnd)
          groupLastSlot.set(n.note_group_id, n.slot_time);
      });
      const seenGroups = new Set<string>();

      // Rows arrive sorted by date then time, so the first row of a group is its start.
      rows.forEach((n) => {
        if (n.note_group_id) {
          if (seenGroups.has(n.note_group_id)) return;
          seenGroups.add(n.note_group_id);
        }
        const lastSlot = n.note_group_id
          ? groupLastSlot.get(n.note_group_id)
          : undefined;
        if (!noteMap[n.note_date]) noteMap[n.note_date] = [];
        noteMap[n.note_date].push({
          kind: "note",
          time:
            lastSlot && lastSlot !== n.slot_time
              ? `${fmt12(n.slot_time)} – ${fmt12(slotRangeEnd(lastSlot, 1))}`
              : fmt12(n.slot_time),
          sortTime: n.slot_time,
          noteText: n.note_text,
          noteColor: n.note_color,
          noteIcon: n.note_icon,
        });
      });
      setCalendarNotes(noteMap);
    } catch {
      // non-critical
    }
  };

  /** Seed and open the note dialog for whatever set of slots was picked. */
  const openNoteDialogFor = (target: NoteTarget) => {
    const seed = target.slots
      .map((s) => slotNotes.get(`${s.dateStr}|${s.time}`))
      .find(Boolean);
    setNoteText(seed?.note_text || "");
    setNoteAdminVisible(seed?.admin_visibility || false);
    setNoteColor(seed?.note_color || DEFAULT_NOTE_COLOR);
    setNoteIcon(seed?.note_icon || "");
    // Editing an existing block keeps it merged; a fresh contiguous run defaults to merged
    // since that's what "8:00 PM to 9:30 PM is one note" means.
    setNoteMerge(target.mergeable);
    setNoteError(null);
    setNoteTarget(target);
  };

  const openNoteDialog = (dateStr: string, time: string) =>
    openNoteDialogFor({
      slots: [{ dateStr, time }],
      groupId: null,
      mergeable: false,
      label: `${labelForDate(dateStr)} · ${fmt12(time)}`,
      existing: slotNotes.has(`${dateStr}|${time}`),
    });

  const saveNote = async () => {
    if (!noteTarget || !noteText.trim()) return;
    const merge = noteTarget.mergeable && noteMerge;
    setNoteSaving(true);
    setNoteError(null);
    try {
      await axios.post(
        `${import.meta.env.VITE_API_URL}/api/teacher/notes`,
        {
          slots: noteTarget.slots.map((s) => ({
            slot_date: s.dateStr,
            slot_time: `${s.time}:00`,
          })),
          merge,
          note_text: noteText.trim(),
          admin_visibility: noteAdminVisible,
          note_color: noteColor,
          note_icon: noteIcon || null,
        },
        { headers },
      );
      // Re-editing a block that shrank/grew shifts group membership around, so pull the
      // week back from the server rather than guessing the new shape locally.
      await Promise.all([fetchSlotNotes(weekStart), fetchOpenSlots(weekStart)]);
      setNoteTarget(null);
      clearSelection();
    } catch (err: unknown) {
      setNoteError(
        (err as { response?: { data?: { message?: string } } })?.response?.data
          ?.message || "Failed to save note",
      );
    } finally {
      setNoteSaving(false);
    }
  };

  const deleteNote = async () => {
    if (!noteTarget) return;
    setNoteSaving(true);
    setNoteError(null);
    try {
      await axios.delete(`${import.meta.env.VITE_API_URL}/api/teacher/notes`, {
        headers,
        data: noteTarget.groupId
          ? { note_group_id: noteTarget.groupId }
          : {
              slots: noteTarget.slots.map((s) => ({
                slot_date: s.dateStr,
                slot_time: `${s.time}:00`,
              })),
            },
      });
      setSlotNotes((prev) => {
        const next = new Map(prev);
        if (noteTarget.groupId) {
          next.forEach((n, k) => {
            if (n.note_group_id === noteTarget.groupId) next.delete(k);
          });
        } else {
          noteTarget.slots.forEach((s) => next.delete(`${s.dateStr}|${s.time}`));
        }
        return next;
      });
      setNoteTarget(null);
      clearSelection();
    } catch (err: unknown) {
      setNoteError(
        (err as { response?: { data?: { message?: string } } })?.response?.data
          ?.message || "Failed to remove note",
      );
    } finally {
      setNoteSaving(false);
    }
  };

  const handleRecurringAvailability = async () => {
    if (recurringAvailDays.length === 0) return;
    setRecurringAvailLoading(true);
    setRecurringAvailMsg(null);
    try {
      const res = await axios.post(
        `${import.meta.env.VITE_API_URL}/api/teacher/weekly-slots/recurring`,
        {
          days: recurringAvailDays,
          start_time: recurringAvailStart,
          end_time: recurringAvailEnd,
          weeks: recurringAvailWeeks,
        },
        { headers },
      );
      setRecurringAvailMsg(`Done! ${res.data.slotsCreated} slots opened.`);
      fetchOpenSlots(weekStart);
    } catch (err: unknown) {
      setRecurringAvailMsg(
        (err as { response?: { data?: { message?: string } } })?.response?.data
          ?.message || "Failed to set recurring schedule.",
      );
    } finally {
      setRecurringAvailLoading(false);
    }
  };

  const handleClearWeek = async () => {
    if (!confirm("Clear all open slots for this week?")) return;
    setClearingWeek(true);
    try {
      const startStr = weekStart.toLocaleDateString("en-CA");
      await axios.delete(
        `${import.meta.env.VITE_API_URL}/api/teacher/weekly-slots/week?startDate=${startStr}`,
        { headers },
      );
      fetchOpenSlots(weekStart);
    } catch {
      alert("Failed to clear week.");
    } finally {
      setClearingWeek(false);
    }
  };

  const prevWeek = () => {
    const d = new Date(weekStart);
    d.setDate(d.getDate() - 7);
    setWeekStart(d);
  };

  const nextWeek = () => {
    const d = new Date(weekStart);
    d.setDate(d.getDate() + 7);
    setWeekStart(d);
  };

  useEffect(() => {
    if (!token) {
      navigate("/login");
      return;
    }
    fetchData();
    fetchPending();
    fetchLeaves();
  }, []);

  // Fetch profile timezone separately
  useEffect(() => {
    axios
      .get(`${import.meta.env.VITE_API_URL}/api/teacher/profile`, { headers })
      .then((res) =>
        setProfileForm((prev) => ({
          ...prev,
          timezone: res.data.timezone || "UTC",
        })),
      )
      .catch(() => {});
  }, []);

  // Fetch open slots whenever weekStart changes (and on mount)
  useEffect(() => {
    if (token) {
      fetchOpenSlots(weekStart);
      fetchSlotNotes(weekStart);
      fetchWeekBookings(weekStart);
    }
  }, [weekStart]);

  // Changing weeks would leave the selection pointing at the wrong dates.
  useEffect(() => {
    setSelAnchor(null);
    setSelFocus(null);
    setIsSelecting(false);
  }, [weekStart]);

  // A drag ends wherever the button is released, which is often outside the grid.
  // A press that never left its starting cell isn't a selection at all — drop it so the
  // cell's own click / double-click handling takes over unchanged.
  useEffect(() => {
    if (!isSelecting) return;
    const onMouseUp = () => {
      setIsSelecting(false);
      if (
        selAnchor &&
        selFocus &&
        selAnchor.d === selFocus.d &&
        selAnchor.t === selFocus.t
      ) {
        setSelAnchor(null);
        setSelFocus(null);
      }
    };
    window.addEventListener("mouseup", onMouseUp);
    return () => window.removeEventListener("mouseup", onMouseUp);
  }, [isSelecting, selAnchor, selFocus]);

  // Escape drops the highlight (unless the note dialog owns the key press).
  useEffect(() => {
    if (!selAnchor || noteTarget) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      setSelAnchor(null);
      setSelFocus(null);
      setIsSelecting(false);
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [selAnchor, noteTarget]);

  // Load filtered completed when navigating to classes page
  useEffect(() => {
    if (page === "classes") fetchFilteredCompleted(classesMonth, classesYear);
  }, [page]);

  // Computed — use fmtDate for consistent date handling (appointment_date is stored as display time)
  const todayKey = fmtDate(new Date().toISOString(), "yyyy-MM-dd");
  const todayUpcoming = bookings.filter(
    (b) => fmtDate(b.appointment_date, "yyyy-MM-dd") === todayKey,
  ).length;
  const todayCompleted = completedBookings.filter(
    (b) =>
      fmtDate(b.appointment_date, "yyyy-MM-dd") === todayKey &&
      b.status === "done",
  ).length;

  // Filtered + sorted upcoming classes (derived, no state needed)
  const filteredUpcoming = bookings
    .filter((b) => {
      if (upcomingSearch) {
        const q = upcomingSearch.toLowerCase();
        if (
          !b.student_name.toLowerCase().includes(q) &&
          !(b.subject ?? "").toLowerCase().includes(q)
        )
          return false;
      }
      if (
        upcomingFilterStudent !== "all" &&
        b.student_name !== upcomingFilterStudent
      )
        return false;
      if (upcomingFilterNoClassInfo && (b.class_mode || b.meeting_link))
        return false;
      if (
        upcomingFilterDate &&
        fmtDate(b.appointment_date, "yyyy-MM-dd") !== upcomingFilterDate
      )
        return false;
      return true;
    })
    .sort((a, b) => {
      if (upcomingSort === "date-desc")
        return b.appointment_date.localeCompare(a.appointment_date);
      if (upcomingSort === "student-asc")
        return a.student_name.localeCompare(b.student_name);
      if (upcomingSort === "student-desc")
        return b.student_name.localeCompare(a.student_name);
      return a.appointment_date.localeCompare(b.appointment_date); // date-asc default
    });

  // Unique student names for the student filter dropdown
  const upcomingStudentNames = [
    ...new Set(bookings.map((b) => b.student_name)),
  ].sort();
  const hasUpcomingFilters =
    upcomingSearch ||
    upcomingFilterStudent !== "all" ||
    upcomingFilterDate ||
    upcomingFilterNoClassInfo;

  const weekDays = Array.from({ length: 7 }, (_, i) => {
    const d = new Date(weekStart);
    d.setDate(d.getDate() + i);
    return d;
  });

  // Build a Set of "YYYY-MM-DD|HH:mm" keys for all booked upcoming slots.
  // Multi-slot bookings (slot_count > 1) are expanded into every 30-min slot they occupy
  // so the availability grid marks ALL covered slots as booked, not just the first.
  const bookedSlotKeys = new Set<string>(
    bookings.flatMap((b) => slotKeysFor(b.appointment_date, b.slot_count)),
  );

  // Same expansion for the whole displayed week, but keyed to the booking itself so past
  // cells can render who the class was with instead of going blank.
  const weekBookingBySlot = new Map<string, WeekBooking>();
  weekBookings.forEach((b) => {
    slotKeysFor(b.appointment_date, b.slot_count).forEach((k) =>
      weekBookingBySlot.set(k, b),
    );
  });

  // ── Weekly grid: merged note blocks ───────────────────────────────────────────
  // A note saved over a range stamps one shared note_group_id on every slot it covers.
  // Collapse each run into a single tall cell: `noteSpans` maps the run's first slot to its
  // height, `noteCovered` holds the slots it swallows (they render nothing), and
  // `noteRunSlots` lets a click anywhere in the run edit the block as a whole.
  const noteSpans = new Map<string, number>();
  const noteCovered = new Set<string>();
  const noteRunSlots = new Map<string, SlotRef[]>();
  // Runs per day as SLOT_TIMES index ranges, so a drag can snap out to whole blocks.
  const noteRunRanges = new Map<string, { start: number; end: number }[]>();
  weekDays.forEach((day) => {
    const dateStr = day.toLocaleDateString("en-CA");
    const ranges: { start: number; end: number }[] = [];
    let i = 0;
    while (i < SLOT_TIMES.length) {
      const groupId = slotNotes.get(
        `${dateStr}|${SLOT_TIMES[i]}`,
      )?.note_group_id;
      if (!groupId) {
        i++;
        continue;
      }
      // A run can't straddle the past/future divide or a booked slot — those cells have
      // their own rendering and can't be swallowed by the block above them.
      const headIsPast = isPastSlot(dateStr, SLOT_TIMES[i]);
      let j = i + 1;
      while (
        j < SLOT_TIMES.length &&
        slotNotes.get(`${dateStr}|${SLOT_TIMES[j]}`)?.note_group_id ===
          groupId &&
        isPastSlot(dateStr, SLOT_TIMES[j]) === headIsPast &&
        !bookedSlotKeys.has(`${dateStr}|${SLOT_TIMES[j]}`)
      ) {
        j++;
      }
      const run = SLOT_TIMES.slice(i, j).map((time) => ({ dateStr, time }));
      noteSpans.set(`${dateStr}|${SLOT_TIMES[i]}`, run.length);
      run.forEach((s, k) => {
        noteRunSlots.set(`${s.dateStr}|${s.time}`, run);
        if (k > 0) noteCovered.add(`${s.dateStr}|${s.time}`);
      });
      ranges.push({ start: i, end: j - 1 });
      i = j;
    }
    noteRunRanges.set(dateStr, ranges);
  });

  // ── Weekly grid: drag-selection ───────────────────────────────────────────────
  // Every cell inside the rectangle spanned by the anchor and focus cells.
  const selectedCells: {
    key: string;
    dateStr: string;
    time: string;
    isPast: boolean;
    isBooked: boolean;
  }[] = [];
  if (selAnchor && selFocus) {
    const [d0, d1] = [
      Math.min(selAnchor.d, selFocus.d),
      Math.max(selAnchor.d, selFocus.d),
    ];
    let t0 = Math.min(selAnchor.t, selFocus.t);
    let t1 = Math.max(selAnchor.t, selFocus.t);
    // A merged block renders as one cell, so the pointer only ever reports its top row.
    // Grow the range until every block it touches is covered end to end — otherwise a
    // bulk action would slice a block in half. Runs are disjoint, so this settles fast.
    for (let grew = true; grew; ) {
      grew = false;
      for (let d = d0; d <= d1; d++) {
        const ranges =
          noteRunRanges.get(weekDays[d].toLocaleDateString("en-CA")) ?? [];
        for (const r of ranges) {
          if (r.start > t1 || r.end < t0) continue; // no overlap
          if (r.start < t0) {
            t0 = r.start;
            grew = true;
          }
          if (r.end > t1) {
            t1 = r.end;
            grew = true;
          }
        }
      }
    }
    for (let d = d0; d <= d1; d++) {
      const dateStr = weekDays[d].toLocaleDateString("en-CA");
      for (let t = t0; t <= t1; t++) {
        const time = SLOT_TIMES[t];
        const key = `${dateStr}|${time}`;
        selectedCells.push({
          key,
          dateStr,
          time,
          isPast: isPastSlot(dateStr, time),
          isBooked: bookedSlotKeys.has(key),
        });
      }
    }
  }
  const selectedKeys = new Set(selectedCells.map((c) => c.key));
  // Past and booked cells are read-only, so bulk actions only ever touch the rest.
  const editableSelection = selectedCells.filter(
    (c) => !c.isPast && !c.isBooked,
  );
  const selectionDayCount = new Set(editableSelection.map((c) => c.dateStr))
    .size;
  // Only one unbroken run on a single day can be drawn as one merged cell. The rectangle
  // is contiguous by construction, but dropping past/booked cells can punch holes in it.
  const selectionMergeable =
    editableSelection.length > 1 &&
    selectionDayCount === 1 &&
    editableSelection.every(
      (c, i, arr) =>
        i === 0 ||
        SLOT_TIMES.indexOf(c.time) === SLOT_TIMES.indexOf(arr[i - 1].time) + 1,
    );
  const selectionLabel = (() => {
    if (editableSelection.length === 0) return "";
    const first = editableSelection[0];
    if (editableSelection.length === 1)
      return `${labelForDate(first.dateStr)} · ${fmt12(first.time)}`;
    if (selectionDayCount === 1) {
      const last = editableSelection[editableSelection.length - 1];
      return `${labelForDate(first.dateStr)} · ${fmt12(first.time)} – ${fmt12(slotRangeEnd(last.time, 1))}`;
    }
    return `${editableSelection.length} slots across ${selectionDayCount} days`;
  })();

  const handleCellMouseDown = (d: number, t: number, e: React.MouseEvent) => {
    if (e.button !== 0) return;
    e.preventDefault(); // keep the browser from text-selecting across the grid
    dragMovedRef.current = false;
    setSelAnchor({ d, t });
    setSelFocus({ d, t });
    setIsSelecting(true);
  };

  const handleCellMouseEnter = (d: number, t: number) => {
    if (!isSelecting) return;
    if (selAnchor && (selAnchor.d !== d || selAnchor.t !== t)) {
      dragMovedRef.current = true;
    }
    setSelFocus({ d, t });
  };

  /** Bulk open or close every editable cell in the selection. */
  const applyBulkSlots = async (action: "open" | "close") => {
    const targets = editableSelection.filter((c) =>
      action === "open" ? !openSlots.has(c.key) : openSlots.has(c.key),
    );
    if (targets.length === 0) return;
    // A note only lives on a closed slot, so opening one throws its note away.
    if (
      action === "open" &&
      targets.some((c) => slotNotes.has(c.key)) &&
      !window.confirm(
        "Some selected slots have notes on them. Opening those slots will delete their notes. Continue?",
      )
    ) {
      return;
    }
    setBulkBusy(action);
    try {
      await axios.post(
        `${import.meta.env.VITE_API_URL}/api/teacher/weekly-slots/bulk`,
        {
          action,
          slots: targets.map((c) => ({
            slot_date: c.dateStr,
            slot_time: `${c.time}:00`,
          })),
        },
        { headers },
      );
      await Promise.all([fetchOpenSlots(weekStart), fetchSlotNotes(weekStart)]);
      clearSelection();
    } catch (err: unknown) {
      alert(
        (err as { response?: { data?: { message?: string } } })?.response?.data
          ?.message || `Failed to ${action} the selected slots`,
      );
    } finally {
      setBulkBusy(null);
    }
  };

  const openNoteDialogForSelection = () => {
    if (editableSelection.length === 0) return;
    openNoteDialogFor({
      slots: editableSelection.map(({ dateStr, time }) => ({ dateStr, time })),
      groupId: null,
      mergeable: selectionMergeable,
      label: selectionLabel,
      existing: editableSelection.some((c) => slotNotes.has(c.key)),
    });
  };

  /** Open the dialog on the whole merged block a cell belongs to. */
  const openNoteDialogForRun = (dateStr: string, time: string) => {
    const run = noteRunSlots.get(`${dateStr}|${time}`);
    if (!run || run.length < 2) {
      openNoteDialog(dateStr, time);
      return;
    }
    const last = run[run.length - 1];
    openNoteDialogFor({
      slots: run,
      groupId: slotNotes.get(`${dateStr}|${time}`)?.note_group_id ?? null,
      mergeable: true,
      label: `${labelForDate(run[0].dateStr)} · ${fmt12(run[0].time)} – ${fmt12(slotRangeEnd(last.time, 1))}`,
      existing: true,
    });
  };

  // Handlers
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const handleLogout = () => {
    authContext?.logout();
    navigate("/");
  };

  // Empty unless this teacher has linked another account of their own (e.g. admin)
  const { accounts: linkedAccounts, switchTo, switching } = useLinkedAccounts();

  const handleMarkDone = async (item: PendingItem) => {
    setDoneLoadingId(item.id);
    try {
      await axios.post(
        `${import.meta.env.VITE_API_URL}/api/teacher/bookings/${item.id}/done`,
        {},
        { headers },
      );
      setPendingConfirmation((prev) => prev.filter((p) => p.id !== item.id));
      fetchData();
      fetchWeekBookings(weekStart); // the grid shows this past class — refresh its status
      // Open report modal right after marking done
      setPostDoneReport({
        bookingId: item.id,
        studentId: item.student_id,
        studentName: item.student_name,
        classDate: item.appointment_date,
      });
    } catch (err: unknown) {
      alert(
        (err as { response?: { data?: { message?: string } } })?.response?.data
          ?.message || "Failed to confirm class",
      );
    } finally {
      setDoneLoadingId(null);
    }
  };

  const handleMarkStudentAbsent = async (bookingId: number) => {
    setAbsentLoadingId(bookingId);
    try {
      await axios.post(
        `${import.meta.env.VITE_API_URL}/api/teacher/bookings/${bookingId}/mark-student-absent`,
        {},
        { headers },
      );
      setPendingConfirmation((prev) =>
        prev.map((p) =>
          p.id === bookingId ? { ...p, student_absent: true } : p,
        ),
      );
    } catch (err: unknown) {
      alert(
        (err as { response?: { data?: { message?: string } } })?.response?.data
          ?.message || "Failed to mark absent",
      );
    } finally {
      setAbsentLoadingId(null);
    }
  };

  const handleSaveClassInfo = async () => {
    if (!editingBooking) return;
    setClassInfoLoading(true);
    setClassInfoError(null);
    try {
      await axios.put(
        `${import.meta.env.VITE_API_URL}/api/teacher/bookings/${editingBooking.id}/class-info`,
        classForm,
        { headers },
      );
      setEditingBooking(null);
      fetchData();
    } catch (err: unknown) {
      setClassInfoError(
        (err as { response?: { data?: { message?: string } } })?.response?.data
          ?.message || "Failed to update",
      );
    } finally {
      setClassInfoLoading(false);
    }
  };

  const handleSaveDayModalClassInfo = async () => {
    if (!dayModalEditingId) return;
    setDayModalSaving(true);
    setDayModalError(null);
    try {
      await axios.put(
        `${import.meta.env.VITE_API_URL}/api/teacher/bookings/${dayModalEditingId}/class-info`,
        dayModalForm,
        { headers },
      );
      // Update the booking in selectedDayBookings and the main bookings list
      setSelectedDayBookings((prev) =>
        prev.map((b) =>
          b.id === dayModalEditingId
            ? {
                ...b,
                class_mode: dayModalForm.class_mode || null,
                meeting_link: dayModalForm.meeting_link || null,
              }
            : b,
        ),
      );
      setDayModalEditingId(null);
      fetchData();
    } catch (err: unknown) {
      setDayModalError(
        (err as { response?: { data?: { message?: string } } })?.response?.data
          ?.message || "Failed to update",
      );
    } finally {
      setDayModalSaving(false);
    }
  };

  const toggleBookingSelection = (id: number) => {
    setSelectedBookingIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const toggleSelectAll = () => {
    const visibleIds = filteredUpcoming.map((b) => b.id);
    if (visibleIds.every((id) => selectedBookingIds.has(id))) {
      setSelectedBookingIds(new Set());
    } else {
      setSelectedBookingIds(new Set(visibleIds));
    }
  };

  const handleBulkSaveClassInfo = async () => {
    if (selectedBookingIds.size === 0) return;
    setClassInfoLoading(true);
    setClassInfoError(null);
    try {
      await axios.put(
        `${import.meta.env.VITE_API_URL}/api/teacher/bookings/bulk-class-info`,
        { booking_ids: Array.from(selectedBookingIds), ...classForm },
        { headers },
      );
      setBulkClassInfoOpen(false);
      setSelectedBookingIds(new Set());
      fetchData();
    } catch (err: unknown) {
      setClassInfoError(
        (err as { response?: { data?: { message?: string } } })?.response?.data
          ?.message || "Failed to update",
      );
    } finally {
      setClassInfoLoading(false);
    }
  };

  const handleCancelBooking = async (cancelAll?: boolean) => {
    const booking = cancelConfirm ?? recurringCancelBooking;
    if (!booking) return;
    setCancelLoading(true);
    try {
      const url = cancelAll
        ? `${import.meta.env.VITE_API_URL}/api/teacher/bookings/${booking.id}/cancel?cancelAll=true`
        : `${import.meta.env.VITE_API_URL}/api/teacher/bookings/${booking.id}/cancel`;
      await axios.post(url, {}, { headers });
      setCancelConfirm(null);
      setRecurringCancelBooking(null);
      fetchData();
      fetchWeekBookings(weekStart);
    } catch (err: unknown) {
      alert(
        (err as { response?: { data?: { message?: string } } })?.response?.data
          ?.message || "Failed to cancel",
      );
    } finally {
      setCancelLoading(false);
    }
  };

  const handleInitiateCancel = (booking: Booking) => {
    if (booking.recurring_schedule_id) {
      setRecurringCancelBooking(booking);
    } else {
      setCancelConfirm(booking);
    }
  };

  const handleSubmitLeave = async () => {
    setLeaveLoading(true);
    try {
      await axios.post(
        `${import.meta.env.VITE_API_URL}/api/teacher/leaves`,
        leaveForm,
        { headers },
      );
      setShowLeaveModal(false);
      setLeaveForm({ leave_date: "", reason_type: "personal", notes: "" });
      fetchLeaves();
    } catch (err) {
      console.error(err);
    } finally {
      setLeaveLoading(false);
    }
  };

  const handleCancelLeave = async (id: number) => {
    try {
      await axios.delete(
        `${import.meta.env.VITE_API_URL}/api/teacher/leaves/${id}`,
        { headers },
      );
      fetchLeaves();
    } catch (err) {
      console.error(err);
    }
  };

  const handleSaveProfile = async () => {
    setProfileLoading(true);
    setProfileError(null);
    setProfileSuccess(false);
    try {
      const payload: Record<string, string> = {
        name: profileForm.name,
        email: profileForm.email,
        timezone: profileForm.timezone,
      };
      if (profileForm.password) payload.password = profileForm.password;
      await axios.put(
        `${import.meta.env.VITE_API_URL}/api/teacher/profile`,
        payload,
        { headers },
      );
      setProfileSuccess(true);
      setProfileForm((prev) => ({ ...prev, password: "" }));
      fetchData();
    } catch (err: unknown) {
      setProfileError(
        (err as { response?: { data?: { message?: string } } })?.response?.data
          ?.message || "Failed to update profile",
      );
    } finally {
      setProfileLoading(false);
    }
  };

  const openReport = (b: CompletedBooking) =>
    setReportModal({
      open: true,
      bookingId: b.id,
      studentId: b.student_id,
      studentName: b.student_name,
      classDate: b.appointment_date,
    });

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  // --- NAV ---
  const navItems: { key: Page; label: string; icon: React.ReactNode }[] = [
    {
      key: "dashboard",
      label: "Dashboard",
      icon: <CalendarDays className="h-4 w-4" />,
    },
    {
      key: "classes",
      label: "My Classes",
      icon: <LayoutList className="h-4 w-4" />,
    },
    {
      key: "profile",
      label: "Profile",
      icon: <UserCircle className="h-4 w-4" />,
    },
  ];

  return (
    <div className="min-h-screen brand-gradient-subtle pattern-dots-light">
      {/* Header */}
      <div className="brand-gradient shadow-lg sticky top-0 z-50 overflow-x-hidden">
        <div className="max-w-7xl mx-auto px-3 sm:px-6 lg:px-8 h-14 min-[620px]:h-16 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <BrandLogo variant="white" />
            <div className="hidden min-[620px]:block">
              <p className="text-xs text-white/60 leading-none">
                Welcome back,
              </p>
              <p className="font-semibold text-sm leading-tight text-white">
                {teacher?.name || "Teacher"}
              </p>
            </div>
          </div>

          {/* Desktop (>= 620px) */}
          <div className="hidden min-[620px]:flex items-center gap-2">
            <Badge className="bg-white/15 text-white border-0 text-xs">
              Teacher
            </Badge>
            <InstallAppButton variant="white" />
            <NotificationBell variant="white" />
            {linkedAccounts.map((acct) => (
              <Button
                key={acct.id}
                variant="ghost"
                size="sm"
                disabled={switching}
                onClick={() => switchTo(acct)}
                className="h-9 gap-1.5 text-white/80 hover:text-white hover:bg-white/10"
              >
                <Repeat className="h-4 w-4" />
                <span className="text-xs font-medium">
                  {switching
                    ? "Switching..."
                    : `Switch to ${roleLabel(acct.role)}`}
                </span>
              </Button>
            ))}
            <Button
              variant="ghost"
              size="icon"
              onClick={handleLogout}
              className="h-9 w-9 text-white/70 hover:text-white hover:bg-white/10"
            >
              <LogOut className="h-5 w-5" />
            </Button>
          </div>

          {/* Mobile (< 620px) */}
          <div className="flex min-[620px]:hidden items-center gap-1">
            <NotificationBell variant="white" />
            <Button
              variant="ghost"
              size="icon"
              className="h-8 w-8 text-white/80 hover:text-white hover:bg-white/10"
              onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
            >
              {mobileMenuOpen ? (
                <X className="h-5 w-5" />
              ) : (
                <Menu className="h-5 w-5" />
              )}
            </Button>
          </div>
        </div>

        {/* Mobile dropdown (< 620px) */}
        {mobileMenuOpen && (
          <div className="min-[620px]:hidden border-t border-white/10 pb-2">
            <div className="px-4 py-2 text-sm text-white/80">
              {teacher?.name || "Teacher"}
            </div>
            <div className="flex items-center gap-3 px-4 py-2">
              <InstallAppButton variant="white" />
            </div>
            {linkedAccounts.map((acct) => (
              <button
                key={acct.id}
                disabled={switching}
                onClick={() => {
                  setMobileMenuOpen(false);
                  switchTo(acct);
                }}
                className="flex items-center gap-3 px-4 py-3 text-white/80 hover:text-white hover:bg-white/10 w-full disabled:opacity-50"
              >
                <Repeat className="h-5 w-5" />
                <span className="text-sm">
                  {switching
                    ? "Switching..."
                    : `Switch to ${roleLabel(acct.role)}`}
                </span>
              </button>
            ))}
            <button
              onClick={() => {
                setMobileMenuOpen(false);
                handleLogout();
              }}
              className="flex items-center gap-3 px-4 py-3 text-red-300 hover:text-red-200 hover:bg-white/10 w-full"
            >
              <LogOut className="h-5 w-5" />{" "}
              <span className="text-sm">Logout</span>
            </button>
          </div>
        )}
        {/* Nav tabs */}
        <div className="max-w-7xl mx-auto px-4 flex gap-0">
          {navItems.map((item) => (
            <button
              key={item.key}
              onClick={() => setPage(item.key)}
              className={`flex items-center gap-1.5 px-4 py-2 text-sm font-medium border-b-2 transition-colors ${
                page === item.key
                  ? "border-white text-white"
                  : "border-transparent text-white/60 hover:text-white/90"
              }`}
            >
              {item.icon} {item.label}
            </button>
          ))}
        </div>
      </div>

      <div className="max-w-7xl mx-auto px-4 py-6 space-y-6">
        <AnnouncementPanel />

        {/* A teacher invited during their school's onboarding lands here before any
            student exists, so every panel below is legitimately empty. Without this
            the dashboard reads as broken on the exact login that completes the
            school's setup milestone. Disappears the moment real data arrives. */}
        {students.length === 0 && bookings.length === 0 && (
          <Card className="border border-primary/20 bg-primary/5">
            <CardContent className="p-4 flex items-start gap-3">
              <Sparkles className="h-5 w-5 text-primary shrink-0 mt-0.5" />
              <div className="min-w-0">
                <p className="text-sm font-semibold text-gray-800">
                  You're all set up, {teacher?.name?.split(" ")[0] || "there"}{" "}
                  👋
                </p>
                <p className="text-xs text-muted-foreground mt-1">
                  Your account is ready and your school can see you. Your
                  students and classes will show up here as soon as they're
                  enrolled — nothing is missing.
                </p>
                <p className="text-xs text-muted-foreground mt-1.5">
                  In the meantime, the most useful thing you can do is{" "}
                  <strong>open your weekly availability</strong> — students can
                  only book times you've marked as open.
                </p>
              </div>
            </CardContent>
          </Card>
        )}

        {/* ═══ DASHBOARD PAGE ═══ */}
        {page === "dashboard" && (
          <>
            {/* KPIs + Calendar */}
            <div className="grid grid-cols-1 lg:grid-cols-5 gap-6">
              {/* Left: KPI grid — 2/5 width */}
              <div className="space-y-4 lg:col-span-2">
                <h2 className="font-semibold text-sm text-muted-foreground uppercase tracking-wide">
                  Overview
                </h2>
                <div className="grid grid-cols-2 gap-3">
                  <Card>
                    <CardContent className="p-3">
                      <p className="text-xl font-bold">{students.length}</p>
                      <p className="text-xs text-muted-foreground flex items-center gap-1 mt-0.5">
                        <Users className="h-3.5 w-3.5" /> Assigned Students
                      </p>
                    </CardContent>
                  </Card>
                  <Card>
                    <CardContent className="p-3">
                      <p className="text-xl font-bold text-orange-600">
                        {todayUpcoming}
                      </p>
                      <p className="text-xs text-muted-foreground flex items-center gap-1 mt-0.5">
                        <CalendarDays className="h-3.5 w-3.5" /> Upcoming Today
                      </p>
                    </CardContent>
                  </Card>
                  <Card>
                    <CardContent className="p-3">
                      <p className="text-xl font-bold text-green-600">
                        {todayCompleted}
                      </p>
                      <p className="text-xs text-muted-foreground flex items-center gap-1 mt-0.5">
                        <FileText className="h-3.5 w-3.5" /> Completed Today
                      </p>
                    </CardContent>
                  </Card>
                  <Card>
                    <CardContent className="p-3">
                      <p className="text-xl font-bold text-primary">
                        {classesThisMonth}
                      </p>
                      <p className="text-xs text-muted-foreground flex items-center gap-1 mt-0.5">
                        <CalendarDays className="h-3.5 w-3.5" /> This Month
                      </p>
                    </CardContent>
                  </Card>
                </div>
                {/* This week stat */}
                <div className="border rounded-lg p-3 bg-white flex items-center justify-between">
                  <span className="text-sm text-muted-foreground">
                    Classes this week
                  </span>
                  <span className="font-bold text-blue-600 text-lg">
                    {classesThisWeek}
                  </span>
                </div>
                {/* Weekly detail KPIs */}
                <div className="grid grid-cols-2 gap-3">
                  <Card>
                    <CardContent className="p-3">
                      <p className="text-xl font-bold text-emerald-600">
                        {completedWithReportThisWeek}
                      </p>
                      <p className="text-xs text-muted-foreground flex items-center gap-1 mt-0.5">
                        <CheckCircle2 className="h-3.5 w-3.5" /> Completed This
                        Week
                      </p>
                    </CardContent>
                  </Card>
                  <Card>
                    <CardContent className="p-3">
                      <p className="text-xl font-bold text-red-500">
                        {absentStudentsThisWeek}
                      </p>
                      <p className="text-xs text-muted-foreground flex items-center gap-1 mt-0.5">
                        <UserX className="h-3.5 w-3.5" /> Absent Students This
                        Week
                      </p>
                    </CardContent>
                  </Card>
                  <Card>
                    <CardContent className="p-3">
                      <p className="text-xl font-bold text-indigo-600">
                        {fiftyMinThisWeek}
                      </p>
                      <p className="text-xs text-muted-foreground flex items-center gap-1 mt-0.5">
                        <Timer className="h-3.5 w-3.5" /> 50-min Completed This
                        Week
                      </p>
                    </CardContent>
                  </Card>
                  <Card>
                    <CardContent className="p-3">
                      <p className="text-xl font-bold text-violet-600">
                        {twentyFiveMinThisWeek}
                      </p>
                      <p className="text-xs text-muted-foreground flex items-center gap-1 mt-0.5">
                        <Timer className="h-3.5 w-3.5" /> 25-min Completed This
                        Week
                      </p>
                    </CardContent>
                  </Card>
                </div>
                {/* Pending confirmation badge */}
                {pendingConfirmation.length > 0 && (
                  <div className="border border-orange-200 rounded-lg p-3 bg-orange-50 flex items-center justify-between">
                    <span className="text-sm text-orange-700 font-medium">
                      {pendingConfirmation.length} class
                      {pendingConfirmation.length > 1 ? "es" : ""} pending
                      confirmation
                    </span>
                    <span className="text-xs text-orange-500">↓ see below</span>
                  </div>
                )}
                {/* Student feedback preview */}
                {feedback.length > 0 && (
                  <Card>
                    <CardHeader className="pb-2">
                      <CardTitle className="text-sm flex items-center gap-2">
                        <FileText className="h-4 w-4 text-primary" /> Recent
                        Feedback ({feedback.length})
                      </CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-2 max-h-40 overflow-y-auto">
                      {feedback.slice(0, 3).map((f) => (
                        <div key={f.id} className="border rounded p-2 text-xs">
                          <div className="flex justify-between mb-0.5">
                            <span className="font-medium">
                              {f.student_name}
                            </span>
                            <span className="text-muted-foreground">
                              {fmtDateOnly(f.created_at)}
                            </span>
                          </div>
                          <p className="text-muted-foreground">{f.message}</p>
                        </div>
                      ))}
                    </CardContent>
                  </Card>
                )}
              </div>

              {/* Right: Calendar — 3/5 width */}
              <div className="lg:col-span-3">
                <h2 className="font-semibold text-sm text-muted-foreground uppercase tracking-wide mb-4">
                  My Schedule
                </h2>
                <MonthCalendar
                  events={monthCalendarEvents}
                  onDayClick={(key) => {
                    const dayBkgs = bookings.filter(
                      (b) => fmtDate(b.appointment_date, "yyyy-MM-dd") === key,
                    );
                    const dayNotes = calendarNotes[key] || [];
                    if (dayBkgs.length > 0 || dayNotes.length > 0) {
                      setSelectedDayBookings(dayBkgs);
                      setSelectedDayNotes(dayNotes);
                      setSelectedDayKey(key);
                      setShowDayModal(true);
                    }
                  }}
                  onMonthChange={(year, month) => {
                    if (token) fetchMonthNotes(year, month);
                  }}
                />
              </div>
            </div>

            {/* Weekly Availability Calendar */}
            <Card>
              <CardHeader>
                <div className="flex items-center justify-between flex-wrap gap-2">
                  <CardTitle className="text-base flex items-center gap-2">
                    <CalendarDays className="h-4 w-4 text-primary" />
                    My Availability
                    <span className="text-xs text-muted-foreground font-normal">
                      — click a slot to open or close it, or drag to select many
                    </span>
                  </CardTitle>
                  <div className="flex items-center gap-2">
                    <Button
                      size="sm"
                      variant="outline"
                      className="h-7 px-2 text-xs"
                      onClick={() => {
                        setRecurringAvailMsg(null);
                        setShowRecurringAvail(true);
                      }}
                    >
                      Set Recurring
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      className="h-7 px-2 text-xs text-red-600 border-red-200 hover:bg-red-50"
                      disabled={clearingWeek}
                      onClick={handleClearWeek}
                    >
                      {clearingWeek ? (
                        <Loader2 className="h-3 w-3 animate-spin" />
                      ) : (
                        "Clear Week"
                      )}
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      className="h-7 px-2"
                      onClick={prevWeek}
                    >
                      <ChevronLeft className="h-4 w-4" />
                    </Button>
                    <span className="text-xs font-medium">
                      {weekDays[0].toLocaleDateString("en-US", {
                        month: "short",
                        day: "numeric",
                      })}
                      {" – "}
                      {weekDays[6].toLocaleDateString("en-US", {
                        month: "short",
                        day: "numeric",
                        year: "numeric",
                      })}
                    </span>
                    <Button
                      size="sm"
                      variant="outline"
                      className="h-7 px-2"
                      onClick={nextWeek}
                    >
                      <ChevronRight className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
              </CardHeader>
              <CardContent>
                <div className="flex items-center gap-4 mb-3 text-xs flex-wrap">
                  <span className="flex items-center gap-1.5">
                    <span className="w-3 h-3 rounded-sm bg-green-500 inline-block" />{" "}
                    Booked
                  </span>
                  <span className="flex items-center gap-1.5">
                    <span className="w-3 h-3 rounded-sm bg-green-200 inline-block" />{" "}
                    Open (Available)
                  </span>
                  <span className="flex items-center gap-1.5">
                    <span className="w-3 h-3 rounded-sm bg-gray-200 inline-block" />{" "}
                    Closed
                  </span>
                  <span className="flex items-center gap-1.5">
                    <span className="w-3 h-3 rounded-sm bg-gray-100 inline-block" />{" "}
                    Past (gray = history, read-only)
                  </span>
                  <span className="flex items-center gap-1.5">
                    <span className="w-3 h-3 rounded-sm bg-amber-100 inline-block" />{" "}
                    Note — pick a color/icon (double-click a slot to add)
                  </span>
                </div>

                {/* Bulk actions for a drag-highlighted range */}
                {editableSelection.length > 0 && (
                  <div className="flex items-center gap-2 flex-wrap mb-3 rounded border border-primary/40 bg-primary/5 px-3 py-2">
                    <span className="text-xs font-medium">
                      {editableSelection.length} slot
                      {editableSelection.length === 1 ? "" : "s"} selected
                      <span className="text-muted-foreground font-normal">
                        {" "}
                        — {selectionLabel}
                      </span>
                    </span>
                    <div className="flex items-center gap-2 ml-auto">
                      <Button
                        size="sm"
                        className="h-7 px-2 text-xs"
                        disabled={bulkBusy !== null}
                        onClick={() => applyBulkSlots("open")}
                      >
                        {bulkBusy === "open" ? (
                          <Loader2 className="h-3 w-3 animate-spin" />
                        ) : (
                          "Open all"
                        )}
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        className="h-7 px-2 text-xs"
                        disabled={bulkBusy !== null}
                        onClick={() => applyBulkSlots("close")}
                      >
                        {bulkBusy === "close" ? (
                          <Loader2 className="h-3 w-3 animate-spin" />
                        ) : (
                          "Close all"
                        )}
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        className="h-7 px-2 text-xs"
                        disabled={bulkBusy !== null}
                        onClick={openNoteDialogForSelection}
                      >
                        {selectionMergeable ? "Add merged note" : "Add note"}
                      </Button>
                      <Button
                        size="sm"
                        variant="ghost"
                        className="h-7 px-2 text-xs text-muted-foreground"
                        onClick={clearSelection}
                      >
                        Clear
                      </Button>
                    </div>
                  </div>
                )}
                {weekSlotsLoading ? (
                  <div className="flex justify-center py-8">
                    <Loader2 className="h-6 w-6 animate-spin text-primary" />
                  </div>
                ) : (
                  <div className="overflow-auto max-h-96 rounded border">
                    <table className="min-w-full border-collapse text-xs">
                      <thead className="sticky top-0 bg-white z-10">
                        <tr>
                          <th className="border-b border-r p-1.5 text-left text-muted-foreground w-16 bg-white">
                            Time
                          </th>
                          {weekDays.map((day, i) => {
                            const isToday =
                              day.toDateString() === new Date().toDateString();
                            return (
                              <th
                                key={i}
                                className={`border-b border-r p-1.5 text-center min-w-[90px] ${
                                  isToday ? "bg-primary/10" : "bg-white"
                                }`}
                              >
                                <div className="font-semibold">
                                  {
                                    [
                                      "Mon",
                                      "Tue",
                                      "Wed",
                                      "Thu",
                                      "Fri",
                                      "Sat",
                                      "Sun",
                                    ][i]
                                  }
                                </div>
                                <div className="text-muted-foreground font-normal">
                                  {day.toLocaleDateString("en-US", {
                                    month: "short",
                                    day: "numeric",
                                  })}
                                </div>
                              </th>
                            );
                          })}
                        </tr>
                      </thead>
                      <tbody>
                        {SLOT_TIMES.map((time, timeIdx) => (
                          <tr key={time} className="group">
                            <td className="border-b border-r p-1 text-right pr-2 whitespace-nowrap bg-gray-50 text-muted-foreground group-hover:bg-primary/10 group-hover:text-primary group-hover:font-semibold transition-colors">
                              {fmt12(time)}
                            </td>
                            {weekDays.map((day, i) => {
                              const dateStr = day.toLocaleDateString("en-CA");
                              const key = `${dateStr}|${time}`;
                              // Swallowed by the merged note block starting above it
                              if (noteCovered.has(key)) return null;
                              const rowSpan = noteSpans.get(key) ?? 1;
                              const isPast = isPastSlot(dateStr, time);
                              const isBooked = bookedSlotKeys.has(key);
                              const isOpen = openSlots.has(key);
                              const isToggling = togglingSlot === key;
                              const note = slotNotes.get(key);
                              // A merged block highlights when any slot it covers is in
                              // the drag rectangle.
                              const isSelected =
                                rowSpan > 1
                                  ? SLOT_TIMES.slice(
                                      timeIdx,
                                      timeIdx + rowSpan,
                                    ).some((t) =>
                                      selectedKeys.has(`${dateStr}|${t}`),
                                    )
                                  : selectedKeys.has(key);
                              const dragProps = {
                                onMouseDown: (e: React.MouseEvent) =>
                                  handleCellMouseDown(i, timeIdx, e),
                                onMouseEnter: () =>
                                  handleCellMouseEnter(i, timeIdx),
                              };
                              const selectedRing = isSelected
                                ? " ring-2 ring-inset ring-primary"
                                : "";

                              // Past slots are read-only and uniformly gray — no booked green,
                              // no note colors. Only the text carries over, so the week still
                              // reads as history instead of a wall of blanks.
                              if (isPast) {
                                const pastBooking = weekBookingBySlot.get(key);
                                const when = `${day.toLocaleDateString("en-US", { month: "short", day: "numeric" })} · ${fmt12(time)}`;

                                let pastText = "";
                                let pastTitle = when;
                                if (pastBooking) {
                                  const outcome = pastBooking.student_absent
                                    ? "student absent"
                                    : pastBooking.teacher_absent
                                      ? "you were absent"
                                      : pastBooking.status === "done"
                                        ? "completed"
                                        : "not yet confirmed";
                                  pastText =
                                    pastBooking.student_name.split(" ")[0];
                                  pastTitle = `${when} — ${pastBooking.student_name}${pastBooking.subject ? ` (${pastBooking.subject})` : ""} · ${outcome}`;
                                } else if (note) {
                                  pastText = `${note.note_icon ? `${note.note_icon} ` : ""}${note.note_text}`;
                                  pastTitle = `${when} — ${pastText} (past note)`;
                                }

                                return (
                                  <td
                                    key={i}
                                    rowSpan={rowSpan}
                                    {...dragProps}
                                    className={`border-b border-r p-1 text-center bg-gray-50 select-none${selectedRing}`}
                                    title={pastTitle}
                                  >
                                    {pastText ? (
                                      <span className="text-[10px] font-medium text-gray-400 truncate block max-w-[80px] mx-auto">
                                        {pastText}
                                      </span>
                                    ) : (
                                      <>&nbsp;</>
                                    )}
                                  </td>
                                );
                              }

                              if (isBooked) {
                                const booking = weekBookingBySlot.get(key);
                                return (
                                  <td
                                    key={i}
                                    {...dragProps}
                                    className={`border-b border-r p-1 bg-green-500 text-center select-none${selectedRing}`}
                                    title={
                                      booking
                                        ? `Class with ${booking.student_name}${booking.subject ? ` (${booking.subject})` : ""}`
                                        : "Class booked at this slot"
                                    }
                                  >
                                    <span className="text-[11px] font-semibold text-white select-none truncate block max-w-[80px] mx-auto">
                                      {booking
                                        ? booking.student_name.split(" ")[0]
                                        : "BOOKED"}
                                    </span>
                                  </td>
                                );
                              }

                              const noteBg =
                                note && isValidHex(note.note_color)
                                  ? note.note_color
                                  : note
                                    ? DEFAULT_NOTE_COLOR
                                    : null;

                              const isMergedNote = rowSpan > 1;

                              return (
                                <td
                                  key={i}
                                  rowSpan={rowSpan}
                                  {...dragProps}
                                  style={
                                    noteBg
                                      ? {
                                          backgroundColor: noteBg,
                                          color: getContrastText(noteBg),
                                        }
                                      : undefined
                                  }
                                  className={`border-b border-r p-1 text-center cursor-pointer transition-colors select-none${selectedRing} ${
                                    noteBg
                                      ? "hover:brightness-95"
                                      : isOpen
                                        ? "bg-green-100 hover:bg-green-200 text-green-700"
                                        : "bg-white hover:bg-gray-100 text-gray-400"
                                  }`}
                                  onClick={() => {
                                    // A drag that ended back on its starting cell still
                                    // fires a click — don't also toggle that cell.
                                    if (dragMovedRef.current) return;
                                    if (note) openNoteDialogForRun(dateStr, time);
                                    else if (!isToggling)
                                      handleSlotClick(dateStr, time);
                                  }}
                                  onDoubleClick={() =>
                                    !isOpen &&
                                    handleSlotDoubleClick(dateStr, time)
                                  }
                                  title={
                                    note
                                      ? `${note.note_icon ? note.note_icon + " " : ""}${note.note_text}${isMergedNote ? ` · ${fmt12(time)} – ${fmt12(slotRangeEnd(time, rowSpan))}` : ""}${note.admin_visibility ? " (visible to admin)" : " (private)"} — click to edit`
                                      : isOpen
                                        ? "Click to close slot · close it first to add a note"
                                        : "Click to open slot · double-click to add a note · drag to select a range"
                                  }
                                >
                                  {isToggling ? (
                                    <Loader2 className="h-3 w-3 animate-spin mx-auto" />
                                  ) : note ? (
                                    <span className="block max-w-[80px] mx-auto">
                                      <span
                                        className={`text-[11px] font-semibold block ${isMergedNote ? "break-words" : "truncate"}`}
                                      >
                                        {note.note_icon
                                          ? `${note.note_icon} `
                                          : ""}
                                        {note.note_text}
                                      </span>
                                      {isMergedNote && (
                                        <span className="block text-[9px] opacity-75 mt-0.5">
                                          {fmt12(time)} –{" "}
                                          {fmt12(slotRangeEnd(time, rowSpan))}
                                        </span>
                                      )}
                                    </span>
                                  ) : (
                                    <span className="text-[11px]">
                                      {isOpen ? "✓" : "+"}
                                    </span>
                                  )}
                                </td>
                              );
                            })}
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </CardContent>
            </Card>

            {/* Confirm Classes */}
            <Card>
              <CardHeader>
                <CardTitle className="text-base flex items-center gap-2">
                  <CheckSquare className="h-4 w-4 text-orange-500" />
                  Confirm Classes
                  {pendingConfirmation.length > 0 && (
                    <span className="text-xs px-2 py-0.5 rounded-full bg-orange-100 text-orange-700 font-medium">
                      {pendingConfirmation.length} pending
                    </span>
                  )}
                </CardTitle>
              </CardHeader>
              <CardContent>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Date & Time</TableHead>
                      <TableHead>Student</TableHead>
                      <TableHead>Duration</TableHead>
                      <TableHead>Subject</TableHead>
                      <TableHead>Student Attendance</TableHead>
                      <TableHead>Action</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {pendingConfirmation.length === 0 ? (
                      <TableRow>
                        <TableCell
                          colSpan={6}
                          className="text-center text-muted-foreground text-sm py-8"
                        >
                          No classes pending confirmation
                        </TableCell>
                      </TableRow>
                    ) : (
                      pendingConfirmation.map((b) => (
                        <TableRow key={b.id}>
                          <TableCell className="text-sm">
                            {fmtDate(b.appointment_date, "MMM d, h:mm a")}
                            {(b.slot_count ?? 1) > 1 && (
                              <span className="ml-1 text-xs text-muted-foreground">
                                ({(b.slot_count ?? 1) * 30}min)
                              </span>
                            )}
                          </TableCell>
                          <TableCell className="font-medium">
                            {b.student_name}
                          </TableCell>
                          <TableCell className="text-xs">
                            {b.duration_minutes} min
                          </TableCell>
                          <TableCell className="text-xs">{b.subject}</TableCell>
                          <TableCell>
                            {b.student_absent ? (
                              <span className="text-xs px-2 py-1 rounded-full bg-red-100 text-red-700 font-medium">
                                Absent
                              </span>
                            ) : (
                              <Button
                                size="sm"
                                variant="outline"
                                className="text-xs h-7 border-orange-400 text-orange-600 hover:bg-orange-50"
                                disabled={absentLoadingId === b.id}
                                onClick={() => handleMarkStudentAbsent(b.id)}
                              >
                                {absentLoadingId === b.id ? (
                                  <Loader2 className="h-3 w-3 animate-spin" />
                                ) : (
                                  "Mark Absent"
                                )}
                              </Button>
                            )}
                          </TableCell>
                          <TableCell>
                            <Button
                              size="sm"
                              className="h-7 text-xs bg-green-600 hover:bg-green-700"
                              disabled={doneLoadingId === b.id}
                              onClick={() => handleMarkDone(b)}
                            >
                              {doneLoadingId === b.id ? (
                                <Loader2 className="h-3 w-3 animate-spin" />
                              ) : (
                                "Mark as Done"
                              )}
                            </Button>
                          </TableCell>
                        </TableRow>
                      ))
                    )}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          </>
        )}

        {/* ═══ CLASSES PAGE ═══ */}
        {page === "classes" && (
          <>
            {/* Upcoming Classes */}
            <Card>
              <CardHeader className="flex flex-row items-center justify-between flex-wrap gap-3">
                <CardTitle className="text-base flex items-center gap-2">
                  <CalendarDays className="h-4 w-4 text-primary" /> Upcoming
                  Classes
                  {filteredUpcoming.length !== bookings.length && (
                    <span className="text-xs font-normal text-muted-foreground">
                      ({filteredUpcoming.length} of {bookings.length})
                    </span>
                  )}
                </CardTitle>
                {selectedBookingIds.size > 0 && (
                  <Button
                    size="sm"
                    className="gap-1"
                    onClick={() => {
                      setClassForm({ class_mode: "", meeting_link: "" });
                      setOtherModeActive(false);
                      setClassInfoError(null);
                      setBulkClassInfoOpen(true);
                    }}
                  >
                    <Video className="h-3 w-3" /> Set Info for{" "}
                    {selectedBookingIds.size} Selected
                  </Button>
                )}
              </CardHeader>
              <CardContent>
                {/* Filter toolbar */}
                <div className="flex flex-wrap gap-2 mb-4">
                  {/* Search */}
                  <div className="relative flex-1 min-w-[180px]">
                    <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground pointer-events-none" />
                    <Input
                      placeholder="Search student or subject..."
                      value={upcomingSearch}
                      onChange={(e) => {
                        setUpcomingSearch(e.target.value);
                        setUpcomingPage(1);
                      }}
                      className="h-8 pl-8 text-xs"
                    />
                  </div>

                  {/* Filter by student name */}
                  <Select
                    value={upcomingFilterStudent}
                    onValueChange={(v) => {
                      setUpcomingFilterStudent(v);
                      setUpcomingPage(1);
                    }}
                  >
                    <SelectTrigger className="h-8 text-xs w-40">
                      <SelectValue placeholder="All Students" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">All Students</SelectItem>
                      {upcomingStudentNames.map((name) => (
                        <SelectItem key={name} value={name}>
                          {name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>

                  {/* Filter by date */}
                  <Input
                    type="date"
                    value={upcomingFilterDate}
                    onChange={(e) => {
                      setUpcomingFilterDate(e.target.value);
                      setUpcomingPage(1);
                    }}
                    className="h-8 text-xs w-36"
                  />

                  {/* Filter: no class info set */}
                  <Button
                    size="sm"
                    variant={upcomingFilterNoClassInfo ? "default" : "outline"}
                    className={`h-8 text-xs gap-1.5 ${upcomingFilterNoClassInfo ? "" : "text-muted-foreground"}`}
                    onClick={() => {
                      setUpcomingFilterNoClassInfo((v) => !v);
                      setUpcomingPage(1);
                    }}
                  >
                    <Video className="h-3 w-3" />
                    No Class Info
                  </Button>

                  {/* Sort */}
                  <Select
                    value={upcomingSort}
                    onValueChange={(v) => {
                      setUpcomingSort(v);
                      setUpcomingPage(1);
                    }}
                  >
                    <SelectTrigger className="h-8 text-xs w-44">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="date-asc">
                        Date: Earliest First
                      </SelectItem>
                      <SelectItem value="date-desc">
                        Date: Latest First
                      </SelectItem>
                      <SelectItem value="student-asc">
                        Student: A → Z
                      </SelectItem>
                      <SelectItem value="student-desc">
                        Student: Z → A
                      </SelectItem>
                    </SelectContent>
                  </Select>

                  {/* Clear all filters */}
                  {hasUpcomingFilters && (
                    <Button
                      size="sm"
                      variant="ghost"
                      className="h-8 text-xs text-muted-foreground"
                      onClick={() => {
                        setUpcomingSearch("");
                        setUpcomingFilterStudent("all");
                        setUpcomingFilterDate("");
                        setUpcomingFilterNoClassInfo(false);
                        setUpcomingPage(1);
                      }}
                    >
                      <X className="h-3 w-3 mr-1" /> Clear
                    </Button>
                  )}
                </div>

                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="w-10">
                        <input
                          type="checkbox"
                          checked={
                            filteredUpcoming.length > 0 &&
                            filteredUpcoming.every((b) =>
                              selectedBookingIds.has(b.id),
                            )
                          }
                          onChange={toggleSelectAll}
                          className="accent-primary h-4 w-4 cursor-pointer"
                        />
                      </TableHead>
                      <TableHead>Date & Time</TableHead>
                      <TableHead>Student</TableHead>
                      <TableHead>Duration</TableHead>
                      <TableHead>Subject</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead>Class Info</TableHead>
                      <TableHead>Attendance</TableHead>
                      <TableHead></TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filteredUpcoming.length === 0 ? (
                      <TableRow>
                        <TableCell
                          colSpan={8}
                          className="text-center text-muted-foreground text-sm py-8"
                        >
                          {bookings.length === 0
                            ? "No upcoming classes"
                            : "No classes match the current filters"}
                        </TableCell>
                      </TableRow>
                    ) : (
                      filteredUpcoming
                        .slice(
                          (upcomingPage - 1) * upcomingPageSize,
                          upcomingPage * upcomingPageSize,
                        )
                        .map((b) => {
                          const classTime = new Date(
                            String(b.appointment_date).replace(" ", "T") +
                              "+08:00",
                          ).getTime();
                          const canMarkAbsent =
                            Date.now() >= classTime + 15 * 60 * 1000;
                          return (
                            <TableRow
                              key={b.id}
                              className={
                                selectedBookingIds.has(b.id)
                                  ? "bg-primary/10 border-l-2 border-l-primary"
                                  : ""
                              }
                            >
                              <TableCell>
                                <input
                                  type="checkbox"
                                  checked={selectedBookingIds.has(b.id)}
                                  onChange={() => toggleBookingSelection(b.id)}
                                  className="accent-primary h-4 w-4 cursor-pointer"
                                />
                              </TableCell>
                              <TableCell className="text-sm">
                                {fmtDate(b.appointment_date, "MMM d, h:mm a")}
                                {(b.slot_count ?? 1) > 1 && (
                                  <span className="ml-1 text-xs text-muted-foreground">
                                    ({(b.slot_count ?? 1) * 30}min)
                                  </span>
                                )}
                              </TableCell>
                              <TableCell className="font-medium">
                                {b.student_name}
                              </TableCell>
                              <TableCell className="text-xs">
                                {b.duration_minutes} min
                              </TableCell>
                              <TableCell className="text-xs">
                                {b.subject}
                              </TableCell>
                              <TableCell>
                                <span
                                  className={`text-xs px-2 py-1 rounded-full font-medium ${statusColors[b.status] || "bg-gray-100"}`}
                                >
                                  {b.status}
                                </span>
                              </TableCell>
                              <TableCell>
                                <Button
                                  size="sm"
                                  variant="outline"
                                  className="text-xs h-7 gap-1"
                                  onClick={() => {
                                    setEditingBooking(b);
                                    setClassForm({
                                      class_mode: b.class_mode || "",
                                      meeting_link: b.meeting_link || "",
                                    });
                                    setOtherModeActive(
                                      !!b.class_mode &&
                                        !knownModes.includes(b.class_mode),
                                    );
                                    setClassInfoError(null);
                                  }}
                                >
                                  <Video className="h-3 w-3" />{" "}
                                  {b.class_mode ? "Edit Info" : "Set Info"}
                                </Button>
                              </TableCell>
                              <TableCell>
                                {b.student_absent ? (
                                  <span className="text-xs px-2 py-1 rounded-full bg-red-100 text-red-700">
                                    Absent
                                  </span>
                                ) : canMarkAbsent ? (
                                  <Button
                                    size="sm"
                                    variant="outline"
                                    className="text-xs h-7 border-orange-400 text-orange-600 hover:bg-orange-50"
                                    disabled={absentLoadingId === b.id}
                                    onClick={() =>
                                      handleMarkStudentAbsent(b.id)
                                    }
                                  >
                                    {absentLoadingId === b.id ? (
                                      <Loader2 className="h-3 w-3 animate-spin" />
                                    ) : (
                                      "Mark Absent"
                                    )}
                                  </Button>
                                ) : (
                                  <span className="text-xs text-muted-foreground">
                                    —
                                  </span>
                                )}
                              </TableCell>
                              <TableCell>
                                <Button
                                  size="sm"
                                  variant="ghost"
                                  className="text-xs h-7 text-destructive hover:text-destructive hover:bg-red-50"
                                  onClick={() => handleInitiateCancel(b)}
                                >
                                  Cancel
                                </Button>
                              </TableCell>
                            </TableRow>
                          );
                        })
                    )}
                  </TableBody>
                </Table>
                {filteredUpcoming.length > 0 && (
                  <TablePagination
                    page={upcomingPage}
                    totalPages={Math.max(
                      1,
                      Math.ceil(filteredUpcoming.length / upcomingPageSize),
                    )}
                    pageSize={upcomingPageSize}
                    totalItems={filteredUpcoming.length}
                    onPageChange={setUpcomingPage}
                    onPageSizeChange={(s) => {
                      setUpcomingPageSize(s);
                      setUpcomingPage(1);
                    }}
                    pageSizeOptions={[10, 15, 20, 30]}
                  />
                )}
              </CardContent>
            </Card>

            {/* Completed Classes with filter */}
            <Card>
              <CardHeader className="flex flex-row items-center justify-between flex-wrap gap-3">
                <CardTitle className="text-base flex items-center gap-2">
                  <FileText className="h-4 w-4 text-primary" /> Completed
                  Classes
                </CardTitle>
                <div className="flex items-center gap-2">
                  <Select
                    value={String(classesMonth)}
                    onValueChange={(v) => {
                      const m = parseInt(v);
                      setClassesMonth(m);
                      fetchFilteredCompleted(m, classesYear);
                    }}
                  >
                    <SelectTrigger className="h-8 text-sm w-36">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {MONTHS.map((name, i) => (
                        <SelectItem key={i + 1} value={String(i + 1)}>
                          {name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <Select
                    value={String(classesYear)}
                    onValueChange={(v) => {
                      const y = parseInt(v);
                      setClassesYear(y);
                      fetchFilteredCompleted(classesMonth, y);
                    }}
                  >
                    <SelectTrigger className="h-8 text-sm w-28">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {Array.from(
                        { length: 4 },
                        (_, i) => new Date().getFullYear() - i,
                      ).map((y) => (
                        <SelectItem key={y} value={String(y)}>
                          {y}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </CardHeader>
              <CardContent>
                {filteredLoading ? (
                  <div className="flex justify-center py-8">
                    <Loader2 className="h-6 w-6 animate-spin text-primary" />
                  </div>
                ) : (
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Date & Time</TableHead>
                        <TableHead>Student</TableHead>
                        <TableHead>Duration</TableHead>
                        <TableHead>Subject</TableHead>
                        <TableHead>Attendance</TableHead>
                        <TableHead>Report</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {(() => {
                        const doneList = filteredCompleted.filter(
                          (b) => b.status === "done",
                        );
                        const paged = doneList.slice(
                          (completedPage - 1) * completedPageSize,
                          completedPage * completedPageSize,
                        );
                        return doneList.length === 0 ? (
                          <TableRow>
                            <TableCell
                              colSpan={6}
                              className="text-center text-muted-foreground text-sm py-8"
                            >
                              No completed classes in {MONTHS[classesMonth - 1]}{" "}
                              {classesYear}
                            </TableCell>
                          </TableRow>
                        ) : (
                          paged.map((b) => (
                            <TableRow key={b.id}>
                              <TableCell className="text-sm">
                                {fmtDate(b.appointment_date, "MMM d, h:mm a")}
                                {(b.slot_count ?? 1) > 1 && (
                                  <span className="ml-1 text-xs text-muted-foreground">
                                    ({(b.slot_count ?? 1) * 30}min)
                                  </span>
                                )}
                              </TableCell>
                              <TableCell className="font-medium">
                                {b.student_name}
                              </TableCell>
                              <TableCell className="text-xs">
                                {b.duration_minutes} min
                              </TableCell>
                              <TableCell className="text-xs">
                                {b.subject}
                              </TableCell>
                              <TableCell>
                                <div className="flex gap-1 flex-wrap">
                                  {!!b.student_absent && (
                                    <span className="text-xs px-2 py-0.5 rounded-full bg-orange-100 text-orange-700">
                                      Student Absent
                                    </span>
                                  )}
                                  {!!b.teacher_absent && (
                                    <span className="text-xs px-2 py-0.5 rounded-full bg-red-100 text-red-700">
                                      Teacher Absent
                                    </span>
                                  )}
                                  {!b.student_absent && !b.teacher_absent && (
                                    <span className="text-xs text-muted-foreground">
                                      Present
                                    </span>
                                  )}
                                </div>
                              </TableCell>
                              <TableCell>
                                {b.has_report ? (
                                  <Button
                                    size="sm"
                                    variant="outline"
                                    className="text-xs h-7 border-green-400 text-green-700 hover:bg-green-50"
                                    onClick={() => openReport(b)}
                                  >
                                    ✓ View / Edit Report
                                  </Button>
                                ) : (
                                  <Button
                                    size="sm"
                                    variant="outline"
                                    className="text-xs h-7"
                                    onClick={() => openReport(b)}
                                  >
                                    Submit Report
                                  </Button>
                                )}
                              </TableCell>
                            </TableRow>
                          ))
                        );
                      })()}
                    </TableBody>
                  </Table>
                )}
                {filteredCompleted.filter((b) => b.status === "done").length >
                  0 && (
                  <TablePagination
                    page={completedPage}
                    totalPages={Math.max(
                      1,
                      Math.ceil(
                        filteredCompleted.filter((b) => b.status === "done")
                          .length / completedPageSize,
                      ),
                    )}
                    pageSize={completedPageSize}
                    totalItems={
                      filteredCompleted.filter((b) => b.status === "done")
                        .length
                    }
                    onPageChange={setCompletedPage}
                    onPageSizeChange={setCompletedPageSize}
                  />
                )}
              </CardContent>
            </Card>
          </>
        )}

        {/* ═══ PROFILE PAGE ═══ */}
        {page === "profile" && (
          <>
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              {/* Edit Profile */}
              <Card>
                <CardHeader>
                  <CardTitle className="text-base flex items-center gap-2">
                    <UserCircle className="h-4 w-4 text-primary" /> My Profile
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-3">
                  {profileError && (
                    <p className="text-sm text-destructive">{profileError}</p>
                  )}
                  {profileSuccess && (
                    <p className="text-sm text-green-600">
                      Profile updated successfully.
                    </p>
                  )}
                  <div className="space-y-1.5">
                    <Label>Full Name</Label>
                    <Input
                      value={profileForm.name}
                      onChange={(e) =>
                        setProfileForm((p) => ({ ...p, name: e.target.value }))
                      }
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label>Email</Label>
                    <Input
                      type="email"
                      value={profileForm.email}
                      onChange={(e) =>
                        setProfileForm((p) => ({ ...p, email: e.target.value }))
                      }
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label>Timezone</Label>
                    <Select
                      value={profileForm.timezone}
                      onValueChange={(v) =>
                        setProfileForm((p) => ({ ...p, timezone: v }))
                      }
                    >
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent className="max-h-60">
                        {TIMEZONES.map((tz) => (
                          <SelectItem key={tz.value} value={tz.value}>
                            {tz.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-1.5">
                    <Label>
                      New Password{" "}
                      <span className="text-muted-foreground text-xs">
                        (leave blank to keep current)
                      </span>
                    </Label>
                    <Input
                      type="password"
                      placeholder="••••••••"
                      value={profileForm.password}
                      onChange={(e) =>
                        setProfileForm((p) => ({
                          ...p,
                          password: e.target.value,
                        }))
                      }
                    />
                  </div>
                  <Button
                    onClick={handleSaveProfile}
                    disabled={profileLoading}
                    className="w-full"
                  >
                    {profileLoading ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      "Save Changes"
                    )}
                  </Button>
                </CardContent>
              </Card>

              {/* Health Metrics */}
              <Card>
                <CardHeader>
                  <CardTitle className="text-base flex items-center gap-2">
                    <Activity className="h-4 w-4 text-primary" /> Health Metrics
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  <HealthBadge health={health} />
                  <div className="grid grid-cols-3 gap-3 pt-2">
                    <div className="text-center p-3 bg-green-50 rounded-lg">
                      <p className="text-xl font-bold text-green-600">
                        {health.attended}
                      </p>
                      <p className="text-xs text-muted-foreground">Attended</p>
                    </div>
                    <div className="text-center p-3 bg-red-50 rounded-lg">
                      <p className="text-xl font-bold text-red-600">
                        {health.total_absent}
                      </p>
                      <p className="text-xs text-muted-foreground">Absent</p>
                    </div>
                    <div className="text-center p-3 bg-blue-50 rounded-lg">
                      <p className="text-xl font-bold text-blue-600">
                        {health.total_done}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        Total Done
                      </p>
                    </div>
                  </div>
                  <div className="border rounded-lg p-3 space-y-1">
                    <p className="text-xs font-medium text-muted-foreground">
                      This period
                    </p>
                    <div className="flex justify-between text-sm">
                      <span>This week</span>
                      <span className="font-semibold text-blue-600">
                        {classesThisWeek}
                      </span>
                    </div>
                    <div className="flex justify-between text-sm">
                      <span>This month</span>
                      <span className="font-semibold text-primary">
                        {classesThisMonth}
                      </span>
                    </div>
                  </div>
                </CardContent>
              </Card>
            </div>

            <div className="mt-6">
              <LinkedAccountsCard />
            </div>

            {/* Assigned Students */}
            <Card>
              <CardHeader>
                <CardTitle className="text-base flex items-center gap-2">
                  <Users className="h-4 w-4 text-primary" /> My Students
                </CardTitle>
              </CardHeader>
              <CardContent>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Name</TableHead>
                      <TableHead>Nationality</TableHead>
                      <TableHead>Age</TableHead>
                      <TableHead>Duration</TableHead>
                      <TableHead>Subject</TableHead>
                      {/* <TableHead>Sessions</TableHead> */}
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {students.length === 0 ? (
                      <TableRow>
                        <TableCell
                          colSpan={6}
                          className="text-center text-muted-foreground text-sm py-8"
                        >
                          No students assigned yet
                        </TableCell>
                      </TableRow>
                    ) : (
                      students.map((s) => (
                        <TableRow key={s.id}>
                          <TableCell className="font-medium">
                            {s.name}
                          </TableCell>
                          <TableCell>{s.nationality || "—"}</TableCell>
                          <TableCell>{s.age || "—"}</TableCell>
                          <TableCell className="text-xs">
                            {s.duration_minutes} min
                          </TableCell>
                          <TableCell className="text-xs">{s.subject}</TableCell>
                          {/* <TableCell>
                          <div className="flex gap-1">
                            <Badge variant="secondary">{s.unused_sessions ?? s.sessions_remaining} remaining</Badge>
                            {s.sessions_remaining !== (s.unused_sessions ?? s.sessions_remaining) && (
                              <Badge variant="outline" className="text-muted-foreground text-[10px]">{s.sessions_remaining} available to book</Badge>
                            )}
                          </div>
                        </TableCell> */}
                        </TableRow>
                      ))
                    )}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>

            {/* Leave Requests */}
            <Card>
              <CardHeader className="flex flex-row items-center justify-between">
                <CardTitle className="text-base flex items-center gap-2">
                  <CalendarOff className="h-4 w-4 text-primary" /> My Leave
                  Requests
                </CardTitle>
                <Button
                  size="sm"
                  onClick={() => setShowLeaveModal(true)}
                  className="gap-1 text-xs"
                >
                  <Plus className="h-3 w-3" /> Request Leave
                </Button>
              </CardHeader>
              <CardContent>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Leave Date</TableHead>
                      <TableHead>Reason</TableHead>
                      <TableHead>Notes</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead></TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {leaves.length === 0 ? (
                      <TableRow>
                        <TableCell
                          colSpan={5}
                          className="text-center text-muted-foreground text-sm py-8"
                        >
                          No leave requests submitted
                        </TableCell>
                      </TableRow>
                    ) : (
                      leaves.map((lv) => (
                        <TableRow key={lv.id}>
                          <TableCell className="text-sm font-medium">
                            {fmtDateOnly(lv.leave_date)}
                          </TableCell>
                          <TableCell className="text-sm capitalize">
                            {lv.reason_type}
                          </TableCell>
                          <TableCell className="text-xs text-muted-foreground">
                            {lv.notes || "—"}
                          </TableCell>
                          <TableCell>
                            <span
                              className={`text-xs px-2 py-1 rounded-full font-medium ${leaveStatusColors[lv.status] || "bg-gray-100 text-gray-700"}`}
                            >
                              {lv.status}
                            </span>
                          </TableCell>
                          <TableCell>
                            {lv.status === "pending" && (
                              <Button
                                size="sm"
                                variant="ghost"
                                className="h-7 text-xs text-destructive hover:text-destructive"
                                onClick={() => handleCancelLeave(lv.id)}
                              >
                                <X className="h-3 w-3 mr-1" /> Cancel
                              </Button>
                            )}
                          </TableCell>
                        </TableRow>
                      ))
                    )}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          </>
        )}
      </div>

      {/* ── Dialogs ── */}

      {/* Day schedule modal */}
      <Dialog
        open={showDayModal}
        onOpenChange={(o) => {
          if (!o) {
            setShowDayModal(false);
            setDayModalEditingId(null);
            setDayModalOtherMode(false);
            setDayModalError(null);
          }
        }}
      >
        <DialogContent className="sm:max-w-md max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>
              {selectedDayKey ? fmtDayKey(selectedDayKey) : ""} Schedule
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-3 py-2">
            {dayScheduleItems.map((item, idx) => {
              if (item.kind === "note") {
                const n = item.note;
                const bg = isValidHex(n.noteColor)
                  ? n.noteColor!
                  : DEFAULT_NOTE_COLOR;
                return (
                  <div
                    key={`note-${idx}`}
                    className="rounded-lg border p-3 flex items-center gap-2"
                    style={{
                      backgroundColor: bg,
                      borderColor: bg,
                      color: getContrastText(bg),
                    }}
                  >
                    {n.noteIcon && (
                      <span className="shrink-0">{n.noteIcon}</span>
                    )}
                    <span className="font-medium text-sm truncate">
                      {n.noteText}
                    </span>
                    {n.time && (
                      <span className="ml-auto shrink-0 text-xs font-semibold">
                        {n.time}
                      </span>
                    )}
                  </div>
                );
              }

              const b = item.booking;
              const isEditing = dayModalEditingId === b.id;
              const hasInfo = !!(b.class_mode || b.meeting_link);
              return (
                <div key={b.id} className="rounded-lg border p-3 space-y-2">
                  {/* Time + status */}
                  <div className="flex items-center justify-between">
                    <span className="font-semibold text-sm">
                      {fmtDate(b.appointment_date, "h:mm a")}
                    </span>
                    <span
                      className={`text-xs px-2 py-0.5 rounded-full ${statusColors[b.status] || "bg-gray-100"}`}
                    >
                      {b.status}
                    </span>
                  </div>

                  {/* Student + subject */}
                  <p className="text-sm font-medium">
                    {b.student_name}{" "}
                    <span className="text-muted-foreground font-normal">
                      · {b.subject}
                    </span>
                  </p>

                  {/* Class info — display or edit */}
                  {isEditing ? (
                    <div className="space-y-2 pt-1 border-t">
                      {dayModalError && (
                        <p className="text-xs text-destructive">
                          {dayModalError}
                        </p>
                      )}
                      <div className="space-y-1">
                        <label className="text-xs font-medium text-muted-foreground">
                          Mode of Class
                        </label>
                        <Select
                          value={
                            dayModalOtherMode ||
                            (dayModalForm.class_mode !== "" &&
                              !knownModes.includes(dayModalForm.class_mode))
                              ? "Others"
                              : dayModalForm.class_mode
                          }
                          onValueChange={(v) => {
                            if (v === "Others") {
                              setDayModalOtherMode(true);
                              setDayModalForm((f) => ({
                                ...f,
                                class_mode: "",
                              }));
                            } else {
                              setDayModalOtherMode(false);
                              setDayModalForm((f) => ({ ...f, class_mode: v }));
                            }
                          }}
                        >
                          <SelectTrigger className="h-8 text-xs">
                            <SelectValue placeholder="Select platform" />
                          </SelectTrigger>
                          <SelectContent>
                            {classModeOptions.map((v) => (
                              <SelectItem key={v} value={v} className="text-xs">
                                {v}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                        {(dayModalOtherMode ||
                          (dayModalForm.class_mode !== "" &&
                            !knownModes.includes(dayModalForm.class_mode))) && (
                          <Input
                            placeholder="Enter platform name..."
                            value={dayModalForm.class_mode}
                            onChange={(e) =>
                              setDayModalForm((f) => ({
                                ...f,
                                class_mode: e.target.value,
                              }))
                            }
                            className="h-8 text-xs mt-1"
                          />
                        )}
                      </div>
                      <div className="space-y-1">
                        <label className="text-xs font-medium text-muted-foreground">
                          Meeting Link
                        </label>
                        <Input
                          placeholder="https://..."
                          value={dayModalForm.meeting_link}
                          onChange={(e) =>
                            setDayModalForm((f) => ({
                              ...f,
                              meeting_link: e.target.value,
                            }))
                          }
                          className="h-8 text-xs"
                        />
                      </div>
                      <div className="flex gap-2 pt-1">
                        <Button
                          size="sm"
                          className="h-7 text-xs flex-1"
                          onClick={handleSaveDayModalClassInfo}
                          disabled={dayModalSaving}
                        >
                          {dayModalSaving ? (
                            <Loader2 className="h-3 w-3 animate-spin" />
                          ) : (
                            "Save"
                          )}
                        </Button>
                        <Button
                          size="sm"
                          variant="outline"
                          className="h-7 text-xs"
                          onClick={() => {
                            setDayModalEditingId(null);
                            setDayModalOtherMode(false);
                            setDayModalError(null);
                          }}
                        >
                          Cancel
                        </Button>
                      </div>
                    </div>
                  ) : (
                    <div className="space-y-1 pt-1 border-t">
                      {hasInfo ? (
                        <>
                          {b.class_mode && (
                            <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                              <Video className="h-3 w-3 shrink-0" />
                              <span className="font-medium text-foreground">
                                {b.class_mode}
                              </span>
                            </div>
                          )}
                          {b.meeting_link ? (
                            <div className="flex items-center gap-1.5 text-xs text-muted-foreground flex-wrap">
                              <Video className="h-3 w-3 shrink-0" />
                              <a
                                href={b.meeting_link}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="text-primary underline break-all"
                              >
                                {b.meeting_link}
                              </a>
                              <button
                                onClick={() => {
                                  navigator.clipboard.writeText(
                                    b.meeting_link!,
                                  );
                                  setDayModalCopiedId(b.id);
                                  setTimeout(
                                    () => setDayModalCopiedId(null),
                                    2000,
                                  );
                                }}
                                className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded text-[10px] font-medium bg-primary/10 text-primary hover:bg-primary/20"
                              >
                                {dayModalCopiedId === b.id ? "Copied!" : "Copy"}
                              </button>
                            </div>
                          ) : (
                            <p className="text-xs text-muted-foreground">
                              No link set
                            </p>
                          )}
                          <Button
                            size="sm"
                            variant="outline"
                            className="h-6 text-xs gap-1 mt-1"
                            onClick={() => {
                              setDayModalEditingId(b.id);
                              setDayModalOtherMode(
                                !!(
                                  b.class_mode &&
                                  !knownModes.includes(b.class_mode)
                                ),
                              );
                              setDayModalForm({
                                class_mode: b.class_mode || "",
                                meeting_link: b.meeting_link || "",
                              });
                              setDayModalError(null);
                            }}
                          >
                            <Video className="h-3 w-3" /> Edit Info
                          </Button>
                        </>
                      ) : (
                        <Button
                          size="sm"
                          variant="outline"
                          className="h-6 text-xs gap-1"
                          onClick={() => {
                            setDayModalEditingId(b.id);
                            setDayModalOtherMode(false);
                            setDayModalForm({
                              class_mode: "",
                              meeting_link: "",
                            });
                            setDayModalError(null);
                          }}
                        >
                          <Video className="h-3 w-3" /> Set Class Info
                        </Button>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </DialogContent>
      </Dialog>

      {/* Class Info dialog */}
      <Dialog
        open={!!editingBooking}
        onOpenChange={(o) => {
          if (!o) setEditingBooking(null);
        }}
      >
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>Set Class Info</DialogTitle>
          </DialogHeader>
          <div className="space-y-3 py-2">
            {classInfoError && (
              <p className="text-sm text-destructive">{classInfoError}</p>
            )}
            <div className="space-y-1.5">
              <Label>Mode of Class</Label>
              <Select
                value={selectValue}
                onValueChange={(v) => {
                  if (v === "Others") {
                    setOtherModeActive(true);
                    setClassForm((p) => ({ ...p, class_mode: "" }));
                  } else {
                    setOtherModeActive(false);
                    setClassForm((p) => ({ ...p, class_mode: v }));
                  }
                }}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Select platform" />
                </SelectTrigger>
                <SelectContent>
                  {classModeOptions.map((v) => (
                    <SelectItem key={v} value={v}>
                      {v}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {selectValue === "Others" && (
                <Input
                  placeholder="Enter platform name..."
                  value={classForm.class_mode}
                  onChange={(e) =>
                    setClassForm((p) => ({ ...p, class_mode: e.target.value }))
                  }
                  className="mt-1.5"
                />
              )}
            </div>
            <div className="space-y-1.5">
              <Label>Meeting Link</Label>
              <Input
                placeholder="https://..."
                value={classForm.meeting_link}
                onChange={(e) =>
                  setClassForm((p) => ({ ...p, meeting_link: e.target.value }))
                }
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditingBooking(null)}>
              Cancel
            </Button>
            <Button onClick={handleSaveClassInfo} disabled={classInfoLoading}>
              {classInfoLoading ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                "Save"
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Slot note dialog — personal calendar note, e.g. "LUNCH" */}
      <Dialog
        open={!!noteTarget}
        onOpenChange={(o) => {
          if (!o) setNoteTarget(null);
        }}
      >
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>
              {noteTarget && `Note — ${noteTarget.label}`}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-3 py-2">
            <p className="text-xs text-muted-foreground">
              This is a personal note, not a booking. Saving it will close{" "}
              {noteTarget && noteTarget.slots.length > 1
                ? `all ${noteTarget.slots.length} selected slots`
                : "this slot"}{" "}
              if currently open.
            </p>
            {noteError && (
              <p className="text-sm text-destructive">{noteError}</p>
            )}
            <div className="space-y-1.5">
              <Label>Note</Label>
              <Input
                placeholder="e.g. LUNCH"
                value={noteText}
                maxLength={100}
                onChange={(e) => setNoteText(e.target.value)}
              />
            </div>
            <div className="space-y-1.5">
              <Label>Icon</Label>
              <Popover open={iconPickerOpen} onOpenChange={setIconPickerOpen}>
                <PopoverTrigger asChild>
                  <Button
                    type="button"
                    variant="outline"
                    className="h-9 w-20 text-lg"
                  >
                    {noteIcon || (
                      <span className="text-xs text-muted-foreground">
                        Pick
                      </span>
                    )}
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-64 p-2" align="start">
                  <div className="grid grid-cols-6 gap-1">
                    {NOTE_ICONS.map((icon) => (
                      <button
                        key={icon}
                        type="button"
                        onClick={() => {
                          setNoteIcon(icon);
                          setIconPickerOpen(false);
                        }}
                        className={`h-8 w-8 flex items-center justify-center rounded text-lg transition-colors ${
                          icon === noteIcon
                            ? "bg-primary/10 ring-1 ring-primary"
                            : "hover:bg-gray-100"
                        }`}
                        title={icon}
                      >
                        {icon}
                      </button>
                    ))}
                  </div>
                  {noteIcon && (
                    <button
                      type="button"
                      onClick={() => {
                        setNoteIcon("");
                        setIconPickerOpen(false);
                      }}
                      className="mt-2 w-full text-xs text-muted-foreground hover:text-foreground text-center py-1 border-t"
                    >
                      Clear icon
                    </button>
                  )}
                </PopoverContent>
              </Popover>
            </div>
            <div className="space-y-1.5">
              <Label>Color</Label>
              <div className="flex items-center gap-1.5 flex-wrap">
                {NOTE_COLOR_PRESETS.map((c) => (
                  <button
                    key={c.hex}
                    type="button"
                    onClick={() => setNoteColor(c.hex)}
                    title={c.label}
                    style={{ backgroundColor: c.hex }}
                    className={`h-7 w-7 rounded-full transition-all ${
                      noteColor.toLowerCase() === c.hex.toLowerCase()
                        ? "ring-2 ring-offset-2 ring-primary"
                        : "hover:scale-110"
                    }`}
                  />
                ))}
                <input
                  type="color"
                  value={isValidHex(noteColor) ? noteColor : DEFAULT_NOTE_COLOR}
                  onChange={(e) => setNoteColor(e.target.value)}
                  title="Custom color"
                  className="h-7 w-7 rounded cursor-pointer border-0 p-0 bg-transparent"
                />
                <Input
                  value={noteColor}
                  onChange={(e) => setNoteColor(e.target.value)}
                  placeholder="#FFBF00"
                  maxLength={7}
                  className="w-24 h-8 text-sm font-mono"
                />
              </div>
              {!isValidHex(noteColor) && (
                <p className="text-xs text-destructive">
                  Enter a valid hex color, e.g. #FFBF00
                </p>
              )}
            </div>
            {noteTarget?.mergeable && (
              <label className="flex items-start gap-2 text-sm cursor-pointer">
                <input
                  type="checkbox"
                  checked={noteMerge}
                  onChange={(e) => setNoteMerge(e.target.checked)}
                  className="accent-primary h-4 w-4 mt-0.5"
                />
                <span>
                  Merge into one block
                  <span className="block text-xs text-muted-foreground">
                    Draws {noteTarget.label.split(" · ")[1]} as a single cell
                    instead of {noteTarget.slots.length} separate notes.
                  </span>
                </span>
              </label>
            )}
            <label className="flex items-center gap-2 text-sm cursor-pointer">
              <input
                type="checkbox"
                checked={noteAdminVisible}
                onChange={(e) => setNoteAdminVisible(e.target.checked)}
                className="accent-primary h-4 w-4"
              />
              Show this note to admin
            </label>
          </div>
          <DialogFooter className="gap-2 sm:gap-0">
            {noteTarget?.existing && (
              <Button
                variant="destructive"
                onClick={deleteNote}
                disabled={noteSaving}
              >
                {noteSaving ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  "Remove"
                )}
              </Button>
            )}
            <Button variant="outline" onClick={() => setNoteTarget(null)}>
              Cancel
            </Button>
            <Button
              onClick={saveNote}
              disabled={
                noteSaving || !noteText.trim() || !isValidHex(noteColor)
              }
            >
              {noteSaving ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                "Save"
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Bulk Class Info dialog */}
      <Dialog
        open={bulkClassInfoOpen}
        onOpenChange={(o) => {
          if (!o) setBulkClassInfoOpen(false);
        }}
      >
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>
              Set Class Info for {selectedBookingIds.size} Booking(s)
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-3 py-2">
            {classInfoError && (
              <p className="text-sm text-destructive">{classInfoError}</p>
            )}
            <div className="space-y-1.5">
              <Label>Mode of Class</Label>
              <Select
                value={selectValue}
                onValueChange={(v) => {
                  if (v === "Others") {
                    setOtherModeActive(true);
                    setClassForm((p) => ({ ...p, class_mode: "" }));
                  } else {
                    setOtherModeActive(false);
                    setClassForm((p) => ({ ...p, class_mode: v }));
                  }
                }}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Select platform" />
                </SelectTrigger>
                <SelectContent>
                  {classModeOptions.map((v) => (
                    <SelectItem key={v} value={v}>
                      {v}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {selectValue === "Others" && (
                <Input
                  placeholder="Enter platform name..."
                  value={classForm.class_mode}
                  onChange={(e) =>
                    setClassForm((p) => ({ ...p, class_mode: e.target.value }))
                  }
                  className="mt-1.5"
                />
              )}
            </div>
            <div className="space-y-1.5">
              <Label>Meeting Link</Label>
              <Input
                placeholder="https://..."
                value={classForm.meeting_link}
                onChange={(e) =>
                  setClassForm((p) => ({ ...p, meeting_link: e.target.value }))
                }
              />
            </div>
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setBulkClassInfoOpen(false)}
            >
              Cancel
            </Button>
            <Button
              onClick={handleBulkSaveClassInfo}
              disabled={classInfoLoading}
            >
              {classInfoLoading ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                "Save"
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Cancel Booking dialog */}
      {cancelConfirm && (
        <Dialog
          open
          onOpenChange={(o) => {
            if (!o) setCancelConfirm(null);
          }}
        >
          <DialogContent className="sm:max-w-sm">
            <DialogHeader>
              <DialogTitle>Cancel Class</DialogTitle>
            </DialogHeader>
            <p className="text-sm text-muted-foreground py-2">
              Are you sure? The student and admin will be notified.
            </p>
            <DialogFooter>
              <Button variant="outline" onClick={() => setCancelConfirm(null)}>
                No, Keep It
              </Button>
              <Button
                variant="destructive"
                onClick={() => handleCancelBooking(false)}
                disabled={cancelLoading}
              >
                {cancelLoading ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  "Yes, Cancel"
                )}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      )}

      {/* Recurring Cancel Choice dialog */}
      {recurringCancelBooking && (
        <Dialog
          open
          onOpenChange={(o) => {
            if (!o) setRecurringCancelBooking(null);
          }}
        >
          <DialogContent className="sm:max-w-sm">
            <DialogHeader>
              <DialogTitle>Cancel Class</DialogTitle>
            </DialogHeader>
            <p className="text-sm text-muted-foreground py-2">
              This class is part of a recurring schedule. What would you like to
              cancel?
            </p>
            <div className="flex flex-col gap-2 pt-1">
              <Button
                variant="outline"
                className="justify-start"
                onClick={() => handleCancelBooking(false)}
                disabled={cancelLoading}
              >
                {cancelLoading ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  "Cancel this session only"
                )}
              </Button>
              <Button
                variant="destructive"
                className="justify-start"
                onClick={() => handleCancelBooking(true)}
                disabled={cancelLoading}
              >
                {cancelLoading ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  "Cancel all upcoming sessions in this series"
                )}
              </Button>
              <Button
                variant="ghost"
                onClick={() => setRecurringCancelBooking(null)}
              >
                No, Keep It
              </Button>
            </div>
          </DialogContent>
        </Dialog>
      )}

      {/* Cancel Blocked dialog */}
      {cancelBlocked && (
        <Dialog
          open
          onOpenChange={(o) => {
            if (!o) setCancelBlocked(false);
          }}
        >
          <DialogContent className="sm:max-w-sm">
            <DialogHeader>
              <DialogTitle>Cannot Cancel</DialogTitle>
            </DialogHeader>
            <p className="text-sm text-muted-foreground py-2">
              Cancellation is not allowed within{" "}
              <span className="font-semibold">{cancellationHours} hour(s)</span>{" "}
              of the scheduled class time. Your admin has been notified.
            </p>
            <DialogFooter>
              <Button variant="outline" onClick={() => setCancelBlocked(false)}>
                Close
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      )}

      {/* Leave Request dialog */}
      <Dialog open={showLeaveModal} onOpenChange={setShowLeaveModal}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>Request Leave</DialogTitle>
          </DialogHeader>
          <div className="space-y-3 py-2">
            <div className="space-y-1.5">
              <Label>Leave Date</Label>
              <Input
                type="date"
                value={leaveForm.leave_date}
                onChange={(e) =>
                  setLeaveForm((p) => ({ ...p, leave_date: e.target.value }))
                }
              />
            </div>
            <div className="space-y-1.5">
              <Label>Reason Type</Label>
              <Select
                value={leaveForm.reason_type}
                onValueChange={(v) =>
                  setLeaveForm((p) => ({ ...p, reason_type: v }))
                }
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {["sick", "personal", "vacation", "other"].map((v) => (
                    <SelectItem key={v} value={v} className="capitalize">
                      {v}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Notes (optional)</Label>
              <Input
                placeholder="Additional details..."
                value={leaveForm.notes}
                onChange={(e) =>
                  setLeaveForm((p) => ({ ...p, notes: e.target.value }))
                }
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowLeaveModal(false)}>
              Cancel
            </Button>
            <Button
              onClick={handleSubmitLeave}
              disabled={leaveLoading || !leaveForm.leave_date}
            >
              {leaveLoading ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                "Submit"
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Report Modal — triggered after marking done OR from completed list */}
      <ReportModal
        open={reportModal.open || !!postDoneReport}
        onClose={() => {
          setReportModal((prev) => ({ ...prev, open: false }));
          setPostDoneReport(null);
          fetchData();
          if (page === "classes")
            fetchFilteredCompleted(classesMonth, classesYear);
        }}
        bookingId={postDoneReport?.bookingId ?? reportModal.bookingId}
        studentId={postDoneReport?.studentId ?? reportModal.studentId}
        studentName={postDoneReport?.studentName ?? reportModal.studentName}
        classDate={postDoneReport?.classDate ?? reportModal.classDate}
      />

      {/* Recurring Availability Dialog */}
      <Dialog
        open={showRecurringAvail}
        onOpenChange={(o) => {
          if (!o) {
            setShowRecurringAvail(false);
            setRecurringAvailMsg(null);
          }
        }}
      >
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Set Recurring Availability</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            {/* Quick presets */}
            <div>
              <p className="text-xs text-muted-foreground mb-2 font-medium uppercase tracking-wide">
                Quick Presets
              </p>
              <div className="flex flex-wrap gap-2">
                {[
                  {
                    label: "Weekdays Full Day",
                    days: [
                      "Monday",
                      "Tuesday",
                      "Wednesday",
                      "Thursday",
                      "Friday",
                    ],
                    start: "09:00",
                    end: "18:00",
                  },
                  {
                    label: "Weekday Mornings",
                    days: [
                      "Monday",
                      "Tuesday",
                      "Wednesday",
                      "Thursday",
                      "Friday",
                    ],
                    start: "07:00",
                    end: "12:00",
                  },
                  {
                    label: "Weekday Afternoons",
                    days: [
                      "Monday",
                      "Tuesday",
                      "Wednesday",
                      "Thursday",
                      "Friday",
                    ],
                    start: "13:00",
                    end: "18:00",
                  },
                  {
                    label: "Mon / Wed / Fri",
                    days: ["Monday", "Wednesday", "Friday"],
                    start: "09:00",
                    end: "18:00",
                  },
                  {
                    label: "⭐ Peak Hours",
                    days: [
                      "Monday",
                      "Tuesday",
                      "Wednesday",
                      "Thursday",
                      "Friday",
                      "Saturday",
                      "Sunday",
                    ],
                    start: "18:00",
                    end: "22:00",
                  },
                ].map((p) => (
                  <button
                    key={p.label}
                    type="button"
                    onClick={() => {
                      setRecurringAvailDays(p.days);
                      setRecurringAvailStart(p.start);
                      setRecurringAvailEnd(p.end);
                    }}
                    className={`px-3 py-1 rounded-full text-xs font-medium border transition-colors ${p.label.startsWith("⭐") ? "bg-amber-50 text-amber-700 border-amber-300 hover:bg-amber-100 hover:border-amber-400" : "bg-white text-muted-foreground border-gray-200 hover:border-primary hover:text-primary"}`}
                  >
                    {p.label}
                  </button>
                ))}
              </div>
            </div>

            {/* Day toggles */}
            <div>
              <p className="text-sm font-medium mb-2">Days of the week</p>
              <div className="flex flex-wrap gap-2">
                {[
                  "Monday",
                  "Tuesday",
                  "Wednesday",
                  "Thursday",
                  "Friday",
                  "Saturday",
                  "Sunday",
                ].map((day) => (
                  <button
                    key={day}
                    type="button"
                    onClick={() =>
                      setRecurringAvailDays((prev) =>
                        prev.includes(day)
                          ? prev.filter((d) => d !== day)
                          : [...prev, day],
                      )
                    }
                    className={`px-3 py-1 rounded-full text-xs font-medium border transition-colors ${recurringAvailDays.includes(day) ? "bg-primary text-white border-primary" : "bg-white text-muted-foreground border-gray-200 hover:border-primary"}`}
                  >
                    {day.substring(0, 3)}
                  </button>
                ))}
              </div>
            </div>

            {/* Time range */}
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-sm font-medium block mb-1">
                  Start Time
                </label>
                <select
                  className="w-full border rounded-lg px-3 py-2 text-sm"
                  value={recurringAvailStart}
                  onChange={(e) => {
                    const v = e.target.value;
                    setRecurringAvailStart(v);
                    if (v >= recurringAvailEnd) {
                      const next = SLOT_TIMES.find((t) => t > v);
                      if (next) setRecurringAvailEnd(next);
                    }
                  }}
                >
                  {SLOT_TIMES.slice(0, -1).map((t) => (
                    <option key={t} value={t}>
                      {fmt12(t)}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="text-sm font-medium block mb-1">
                  End Time
                </label>
                <select
                  className="w-full border rounded-lg px-3 py-2 text-sm"
                  value={recurringAvailEnd}
                  onChange={(e) => {
                    const v = e.target.value;
                    setRecurringAvailEnd(v);
                    if (v <= recurringAvailStart) {
                      const prev = [...SLOT_TIMES].reverse().find((t) => t < v);
                      if (prev) setRecurringAvailStart(prev);
                    }
                  }}
                >
                  {SLOT_TIMES.slice(1).map((t) => (
                    <option key={t} value={t}>
                      {fmt12(t)}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            {/* Weeks */}
            <div>
              <label className="text-sm font-medium block mb-1">
                Number of Weeks
              </label>
              <select
                className="w-full border rounded-lg px-3 py-2 text-sm"
                value={recurringAvailWeeks}
                onChange={(e) => setRecurringAvailWeeks(Number(e.target.value))}
              >
                {[1, 2, 3, 4, 6, 8, 12].map((w) => (
                  <option key={w} value={w}>
                    {w} week{w > 1 ? "s" : ""}
                  </option>
                ))}
              </select>
            </div>

            {recurringAvailMsg && (
              <p
                className={`text-sm ${recurringAvailMsg.startsWith("Done") ? "text-green-600" : "text-red-600"}`}
              >
                {recurringAvailMsg}
              </p>
            )}
          </div>
          <div className="flex gap-2 pt-2">
            <Button
              variant="outline"
              className="flex-1"
              onClick={() => {
                setShowRecurringAvail(false);
                setRecurringAvailMsg(null);
              }}
            >
              Cancel
            </Button>
            <Button
              className="flex-1"
              disabled={
                recurringAvailLoading || recurringAvailDays.length === 0
              }
              onClick={handleRecurringAvailability}
            >
              {recurringAvailLoading ? (
                <Loader2 className="h-4 w-4 animate-spin mr-2" />
              ) : null}
              {recurringAvailMsg?.startsWith("Done") ? "Close" : "Apply"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default TeacherDashboard;
