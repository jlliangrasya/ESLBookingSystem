import { useState, useEffect, useContext } from "react";
import axios from "axios";
import { useNavigate } from "react-router-dom";
import AuthContext from "@/context/AuthContext";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  CalendarDays, Users, LogOut, Loader2, FileText, CalendarOff,
  Plus, X, Video, LayoutList, UserCircle, Activity, CheckSquare,
  ChevronLeft, ChevronRight,
} from "lucide-react";
import BrandLogo from "@/components/BrandLogo";
import NotificationBell from "@/components/NotificationBell";
import ReportModal from "@/components/ReportModal";
import { fmtDate, fmtDateOnly, parseUTC, TIMEZONES } from "@/utils/timezone";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import Calendar from "react-calendar";
import "react-calendar/dist/Calendar.css";

type Page = "dashboard" | "classes" | "profile";

interface Teacher { id: number; name: string; email: string; }
interface AssignedStudent {
  id: number; name: string; nationality: string; age: number;
  package_name: string; sessions_remaining: number; subject: string; payment_status: string;
}
interface Booking {
  id: number; appointment_date: string; status: string; student_name: string;
  package_name: string; subject: string; class_mode: string | null; meeting_link: string | null;
  student_absent: boolean;
}
interface CompletedBooking {
  id: number; appointment_date: string; status: string; student_name: string;
  student_id: number; package_name: string; subject: string; has_report: boolean;
  student_absent: boolean; teacher_absent: boolean;
}
interface PendingItem {
  id: number; appointment_date: string; status: string; student_name: string;
  student_id: number; package_name: string; subject: string;
  student_package_id: number; student_absent: boolean;
}
interface TeacherLeave {
  id: number; leave_date: string; reason_type: string; notes: string | null;
  status: string; created_at: string;
}
interface Health { total_done: number; total_absent: number; attended: number; }

const MONTHS = ["January","February","March","April","May","June","July","August","September","October","November","December"];

const SLOT_TIMES: string[] = Array.from({ length: 32 }, (_, i) => {
  const totalMins = 7 * 60 + i * 30;
  const h = Math.floor(totalMins / 60).toString().padStart(2, "0");
  const m = (totalMins % 60).toString().padStart(2, "0");
  return `${h}:${m}`;
});

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
  if (total === 0) return <span className="text-xs text-muted-foreground">No data yet</span>;
  const rate = Math.round((health.attended / total) * 100);
  const { label, cls } = rate >= 90
    ? { label: "Excellent", cls: "bg-green-100 text-green-700" }
    : rate >= 75
    ? { label: "Good", cls: "bg-blue-100 text-blue-700" }
    : rate >= 50
    ? { label: "Fair", cls: "bg-yellow-100 text-yellow-700" }
    : { label: "At Risk", cls: "bg-red-100 text-red-700" };
  return (
    <div className="flex flex-col gap-1">
      <span className={`text-xs px-2 py-0.5 rounded-full font-medium w-fit ${cls}`}>{label} — {rate}% attendance</span>
      <span className="text-xs text-muted-foreground">{health.attended} attended · {health.total_absent} absent · {total} total</span>
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
  const [completedBookings, setCompletedBookings] = useState<CompletedBooking[]>([]);
  const [pendingConfirmation, setPendingConfirmation] = useState<PendingItem[]>([]);
  const [classesThisWeek, setClassesThisWeek] = useState(0);
  const [classesThisMonth, setClassesThisMonth] = useState(0);
  const [health, setHealth] = useState<Health>({ total_done: 0, total_absent: 0, attended: 0 });
  const [leaves, setLeaves] = useState<TeacherLeave[]>([]);
  const [feedback, setFeedback] = useState<{ id: number; student_name: string; message: string; created_at: string }[]>([]);
  const [cancellationHours, setCancellationHours] = useState(1);

  // Calendar
  const [calendarBookings, setCalendarBookings] = useState<Record<string, { student: string; time: string }[]>>({});
  const [selectedDayBookings, setSelectedDayBookings] = useState<Booking[]>([]);
  const [showDayModal, setShowDayModal] = useState(false);

  // Confirm classes
  const [doneLoadingId, setDoneLoadingId] = useState<number | null>(null);
  const [absentLoadingId, setAbsentLoadingId] = useState<number | null>(null);
  const [postDoneReport, setPostDoneReport] = useState<{ bookingId: number; studentId: number; studentName: string } | null>(null);

  // Classes page — completed filter
  const [classesMonth, setClassesMonth] = useState(new Date().getMonth() + 1);
  const [classesYear, setClassesYear] = useState(new Date().getFullYear());
  const [filteredCompleted, setFilteredCompleted] = useState<CompletedBooking[]>([]);
  const [filteredLoading, setFilteredLoading] = useState(false);

  // Class info modal (upcoming)
  const [editingBooking, setEditingBooking] = useState<Booking | null>(null);
  const [classForm, setClassForm] = useState({ class_mode: "", meeting_link: "" });
  const [classInfoLoading, setClassInfoLoading] = useState(false);
  const [classInfoError, setClassInfoError] = useState<string | null>(null);

  // Cancel booking
  const [cancelConfirm, setCancelConfirm] = useState<Booking | null>(null);
  const [cancelLoading, setCancelLoading] = useState(false);
  const [cancelBlocked, setCancelBlocked] = useState(false);

  // Leave modal
  const [showLeaveModal, setShowLeaveModal] = useState(false);
  const [leaveForm, setLeaveForm] = useState({ leave_date: "", reason_type: "personal", notes: "" });
  const [leaveLoading, setLeaveLoading] = useState(false);

  // Profile edit
  const [profileForm, setProfileForm] = useState({ name: "", email: "", password: "", timezone: "UTC" });
  const [profileLoading, setProfileLoading] = useState(false);
  const [profileSuccess, setProfileSuccess] = useState(false);
  const [profileError, setProfileError] = useState<string | null>(null);

  // Weekly availability
  const [weekStart, setWeekStart] = useState<Date>(() => getWeekStart(new Date()));
  const [openSlots, setOpenSlots] = useState<Set<string>>(new Set());
  const [weekSlotsLoading, setWeekSlotsLoading] = useState(false);
  const [togglingSlot, setTogglingSlot] = useState<string | null>(null);

  // Report modal
  const [reportModal, setReportModal] = useState<{ open: boolean; bookingId: number; studentId: number; studentName: string }>({
    open: false, bookingId: 0, studentId: 0, studentName: "",
  });

  const fetchData = async () => {
    try {
      const [dashRes, settingsRes, feedbackRes] = await Promise.all([
        axios.get(`${import.meta.env.VITE_API_URL}/api/teacher/dashboard`, { headers }),
        axios.get(`${import.meta.env.VITE_API_URL}/api/admin/company-settings`, { headers }),
        axios.get(`${import.meta.env.VITE_API_URL}/api/teacher/feedback`, { headers }),
      ]);
      const dash = dashRes.data;
      setTeacher(dash.teacher);
      setStudents(dash.students);
      setBookings(dash.bookings);
      setCompletedBookings(dash.completedBookings || []);
      setClassesThisWeek(dash.classes_this_week ?? 0);
      setClassesThisMonth(dash.classes_this_month ?? 0);
      setHealth(dash.health ?? { total_done: 0, total_absent: 0, attended: 0 });
      setCancellationHours(settingsRes.data.cancellation_hours ?? 1);
      setFeedback(feedbackRes.data || []);

      // Build calendar map
      const calMap: Record<string, { student: string; time: string }[]> = {};
      (dash.bookings as Booking[]).forEach((b) => {
        const key = fmtDate(b.appointment_date, "yyyy-MM-dd");
        if (!calMap[key]) calMap[key] = [];
        calMap[key].push({ student: b.student_name, time: fmtDate(b.appointment_date, "h:mm a") });
      });
      setCalendarBookings(calMap);

      // Profile form seed
      setProfileForm((prev) => ({ ...prev, name: dash.teacher?.name || "", email: dash.teacher?.email || "" }));
    } catch (err) {
      console.error("Error fetching teacher dashboard:", err);
    } finally {
      setLoading(false);
    }
  };

  const fetchPending = async () => {
    try {
      const res = await axios.get(`${import.meta.env.VITE_API_URL}/api/teacher/pending-confirmation`, { headers });
      setPendingConfirmation(res.data || []);
    } catch {
      // non-critical
    }
  };

  const fetchLeaves = async () => {
    try {
      const res = await axios.get(`${import.meta.env.VITE_API_URL}/api/teacher/leaves`, { headers });
      setLeaves(res.data);
    } catch (err) {
      console.error(err);
    }
  };

  const fetchFilteredCompleted = async (month = classesMonth, year = classesYear) => {
    setFilteredLoading(true);
    try {
      const res = await axios.get(
        `${import.meta.env.VITE_API_URL}/api/teacher/completed-classes?month=${month}&year=${year}`,
        { headers }
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
        { headers }
      );
      const slotSet = new Set<string>(
        (res.data as { slot_date: string; slot_time: string }[]).map(
          (s) => `${s.slot_date}|${s.slot_time}`
        )
      );
      setOpenSlots(slotSet);
    } catch {
      // non-critical
    } finally {
      setWeekSlotsLoading(false);
    }
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
        { headers }
      );
      setOpenSlots((prev) => {
        const next = new Set(prev);
        if (isOpen) next.delete(key);
        else next.add(key);
        return next;
      });
    } catch (err: unknown) {
      alert(
        (err as { response?: { data?: { message?: string } } })?.response?.data?.message ||
          "Failed to update slot"
      );
    } finally {
      setTogglingSlot(null);
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
    if (!token) { navigate("/login"); return; }
    fetchData();
    fetchPending();
    fetchLeaves();
  }, []);

  // Fetch profile timezone separately
  useEffect(() => {
    axios.get(`${import.meta.env.VITE_API_URL}/api/teacher/profile`, { headers })
      .then(res => setProfileForm(prev => ({ ...prev, timezone: res.data.timezone || "UTC" })))
      .catch(() => {});
  }, []);

  // Fetch open slots whenever weekStart changes (and on mount)
  useEffect(() => {
    if (token) fetchOpenSlots(weekStart);
  }, [weekStart]);

  // Load filtered completed when navigating to classes page
  useEffect(() => {
    if (page === "classes") fetchFilteredCompleted(classesMonth, classesYear);
  }, [page]);

  // Computed
  const todayStr = new Date().toDateString();
  const todayUpcoming = bookings.filter(b => new Date(b.appointment_date).toDateString() === todayStr).length;
  const todayCompleted = completedBookings.filter(b => new Date(b.appointment_date).toDateString() === todayStr && b.status === "done").length;

  const weekDays = Array.from({ length: 7 }, (_, i) => {
    const d = new Date(weekStart);
    d.setDate(d.getDate() + i);
    return d;
  });

  // Build a Set of "YYYY-MM-DD|HH:mm" keys for all booked upcoming slots
  const bookedSlotKeys = new Set<string>(
    bookings.map(b => {
      const dateKey = fmtDate(b.appointment_date, "yyyy-MM-dd");
      const timeKey = fmtDate(b.appointment_date, "HH:mm");
      return `${dateKey}|${timeKey}`;
    })
  );

  // Handlers
  const handleLogout = () => { authContext?.logout(); navigate("/"); };

  const handleMarkDone = async (item: PendingItem) => {
    setDoneLoadingId(item.id);
    try {
      await axios.post(`${import.meta.env.VITE_API_URL}/api/teacher/bookings/${item.id}/done`, {}, { headers });
      setPendingConfirmation(prev => prev.filter(p => p.id !== item.id));
      fetchData();
      // Open report modal right after marking done
      setPostDoneReport({ bookingId: item.id, studentId: item.student_id, studentName: item.student_name });
    } catch (err: unknown) {
      alert((err as { response?: { data?: { message?: string } } })?.response?.data?.message || "Failed to confirm class");
    } finally {
      setDoneLoadingId(null);
    }
  };

  const handleMarkStudentAbsent = async (bookingId: number) => {
    setAbsentLoadingId(bookingId);
    try {
      await axios.post(`${import.meta.env.VITE_API_URL}/api/teacher/bookings/${bookingId}/mark-student-absent`, {}, { headers });
      setPendingConfirmation(prev => prev.map(p => p.id === bookingId ? { ...p, student_absent: true } : p));
    } catch (err: unknown) {
      alert((err as { response?: { data?: { message?: string } } })?.response?.data?.message || "Failed to mark absent");
    } finally {
      setAbsentLoadingId(null);
    }
  };

  const handleSaveClassInfo = async () => {
    if (!editingBooking) return;
    setClassInfoLoading(true);
    setClassInfoError(null);
    try {
      await axios.put(`${import.meta.env.VITE_API_URL}/api/teacher/bookings/${editingBooking.id}/class-info`, classForm, { headers });
      setEditingBooking(null);
      fetchData();
    } catch (err: unknown) {
      setClassInfoError((err as { response?: { data?: { message?: string } } })?.response?.data?.message || "Failed to update");
    } finally {
      setClassInfoLoading(false);
    }
  };

  const handleCancelBooking = async () => {
    if (!cancelConfirm) return;
    setCancelLoading(true);
    try {
      await axios.post(`${import.meta.env.VITE_API_URL}/api/teacher/bookings/${cancelConfirm.id}/cancel`, {}, { headers });
      setCancelConfirm(null);
      fetchData();
    } catch (err: unknown) {
      alert((err as { response?: { data?: { message?: string } } })?.response?.data?.message || "Failed to cancel");
    } finally {
      setCancelLoading(false);
    }
  };

  const handleSubmitLeave = async () => {
    setLeaveLoading(true);
    try {
      await axios.post(`${import.meta.env.VITE_API_URL}/api/teacher/leaves`, leaveForm, { headers });
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
      await axios.delete(`${import.meta.env.VITE_API_URL}/api/teacher/leaves/${id}`, { headers });
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
      const payload: Record<string, string> = { name: profileForm.name, email: profileForm.email, timezone: profileForm.timezone };
      if (profileForm.password) payload.password = profileForm.password;
      await axios.put(`${import.meta.env.VITE_API_URL}/api/teacher/profile`, payload, { headers });
      setProfileSuccess(true);
      setProfileForm(prev => ({ ...prev, password: "" }));
      fetchData();
    } catch (err: unknown) {
      setProfileError((err as { response?: { data?: { message?: string } } })?.response?.data?.message || "Failed to update profile");
    } finally {
      setProfileLoading(false);
    }
  };

  const openReport = (b: CompletedBooking) =>
    setReportModal({ open: true, bookingId: b.id, studentId: b.student_id, studentName: b.student_name });

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  // --- NAV ---
  const navItems: { key: Page; label: string; icon: React.ReactNode }[] = [
    { key: "dashboard", label: "Dashboard", icon: <CalendarDays className="h-4 w-4" /> },
    { key: "classes", label: "My Classes", icon: <LayoutList className="h-4 w-4" /> },
    { key: "profile", label: "Profile", icon: <UserCircle className="h-4 w-4" /> },
  ];

  return (
    <div className="min-h-screen brand-gradient-subtle pattern-dots-light">
      {/* Header */}
      <div className="brand-gradient shadow-lg sticky top-0 z-50">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <BrandLogo variant="white" />
            <div>
              <p className="text-xs text-white/60 leading-none">Welcome back,</p>
              <p className="font-semibold text-sm leading-tight text-white">{teacher?.name || "Teacher"}</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Badge className="bg-white/15 text-white border-0 text-xs">Teacher</Badge>
            <NotificationBell variant="white" />
            <Button variant="ghost" size="sm" onClick={handleLogout}
              className="text-white/70 hover:text-white hover:bg-white/10 text-xs gap-1">
              <LogOut className="h-4 w-4" /> Logout
            </Button>
          </div>
        </div>
        {/* Nav tabs */}
        <div className="max-w-7xl mx-auto px-4 flex gap-0">
          {navItems.map(item => (
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

        {/* ═══ DASHBOARD PAGE ═══ */}
        {page === "dashboard" && (
          <>
            {/* KPIs + Calendar */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              {/* Left: KPI grid */}
              <div className="space-y-4">
                <h2 className="font-semibold text-sm text-muted-foreground uppercase tracking-wide">Overview</h2>
                <div className="grid grid-cols-2 gap-3">
                  <Card>
                    <CardContent className="pt-4">
                      <p className="text-2xl font-bold">{students.length}</p>
                      <p className="text-xs text-muted-foreground flex items-center gap-1 mt-0.5">
                        <Users className="h-3.5 w-3.5" /> Assigned Students
                      </p>
                    </CardContent>
                  </Card>
                  <Card>
                    <CardContent className="pt-4">
                      <p className="text-2xl font-bold text-orange-600">{todayUpcoming}</p>
                      <p className="text-xs text-muted-foreground flex items-center gap-1 mt-0.5">
                        <CalendarDays className="h-3.5 w-3.5" /> Upcoming Today
                      </p>
                    </CardContent>
                  </Card>
                  <Card>
                    <CardContent className="pt-4">
                      <p className="text-2xl font-bold text-green-600">{todayCompleted}</p>
                      <p className="text-xs text-muted-foreground flex items-center gap-1 mt-0.5">
                        <FileText className="h-3.5 w-3.5" /> Completed Today
                      </p>
                    </CardContent>
                  </Card>
                  <Card>
                    <CardContent className="pt-4">
                      <p className="text-2xl font-bold text-primary">{classesThisMonth}</p>
                      <p className="text-xs text-muted-foreground flex items-center gap-1 mt-0.5">
                        <CalendarDays className="h-3.5 w-3.5" /> This Month
                      </p>
                    </CardContent>
                  </Card>
                </div>
                {/* This week stat */}
                <div className="border rounded-lg p-3 bg-white flex items-center justify-between">
                  <span className="text-sm text-muted-foreground">Classes this week</span>
                  <span className="font-bold text-blue-600 text-lg">{classesThisWeek}</span>
                </div>
                {/* Pending confirmation badge */}
                {pendingConfirmation.length > 0 && (
                  <div className="border border-orange-200 rounded-lg p-3 bg-orange-50 flex items-center justify-between">
                    <span className="text-sm text-orange-700 font-medium">
                      {pendingConfirmation.length} class{pendingConfirmation.length > 1 ? "es" : ""} pending confirmation
                    </span>
                    <span className="text-xs text-orange-500">↓ see below</span>
                  </div>
                )}
                {/* Student feedback preview */}
                {feedback.length > 0 && (
                  <Card>
                    <CardHeader className="pb-2">
                      <CardTitle className="text-sm flex items-center gap-2">
                        <FileText className="h-4 w-4 text-primary" /> Recent Feedback ({feedback.length})
                      </CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-2 max-h-40 overflow-y-auto">
                      {feedback.slice(0, 3).map(f => (
                        <div key={f.id} className="border rounded p-2 text-xs">
                          <div className="flex justify-between mb-0.5">
                            <span className="font-medium">{f.student_name}</span>
                            <span className="text-muted-foreground">{fmtDateOnly(f.created_at)}</span>
                          </div>
                          <p className="text-muted-foreground">{f.message}</p>
                        </div>
                      ))}
                    </CardContent>
                  </Card>
                )}
              </div>

              {/* Right: Calendar */}
              <div>
                <h2 className="font-semibold text-sm text-muted-foreground uppercase tracking-wide mb-4">My Schedule</h2>
                <div className="bg-white rounded-xl border shadow-sm p-4 flex justify-center">
                  <Calendar
                    className="custom-calendar w-full"
                    tileContent={({ date }) => {
                      const key = date.toLocaleDateString("en-CA");
                      return calendarBookings[key] ? (
                        <div className="booking-name">
                          {calendarBookings[key].map((e, i) => (
                            <p key={i} className="m-0">
                              <span style={{ fontWeight: 600 }}>{e.student}</span>
                              <span> {e.time}</span>
                            </p>
                          ))}
                        </div>
                      ) : null;
                    }}
                    onClickDay={(date) => {
                      const key = date.toLocaleDateString("en-CA");
                      const dayBkgs = bookings.filter(b => fmtDate(b.appointment_date, "yyyy-MM-dd") === key);
                      if (dayBkgs.length > 0) { setSelectedDayBookings(dayBkgs); setShowDayModal(true); }
                    }}
                  />
                </div>
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
                      — click a slot to open or close it
                    </span>
                  </CardTitle>
                  <div className="flex items-center gap-2">
                    <Button size="sm" variant="outline" className="h-7 px-2" onClick={prevWeek}>
                      <ChevronLeft className="h-4 w-4" />
                    </Button>
                    <span className="text-xs font-medium">
                      {weekDays[0].toLocaleDateString("en-US", { month: "short", day: "numeric" })}
                      {" – "}
                      {weekDays[6].toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}
                    </span>
                    <Button size="sm" variant="outline" className="h-7 px-2" onClick={nextWeek}>
                      <ChevronRight className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
              </CardHeader>
              <CardContent>
                <div className="flex items-center gap-4 mb-3 text-xs flex-wrap">
                  <span className="flex items-center gap-1.5">
                    <span className="w-3 h-3 rounded-sm bg-green-500 inline-block" /> Booked
                  </span>
                  <span className="flex items-center gap-1.5">
                    <span className="w-3 h-3 rounded-sm bg-green-200 inline-block" /> Open (Available)
                  </span>
                  <span className="flex items-center gap-1.5">
                    <span className="w-3 h-3 rounded-sm bg-gray-200 inline-block" /> Closed
                  </span>
                  <span className="flex items-center gap-1.5">
                    <span className="w-3 h-3 rounded-sm bg-gray-100 inline-block" /> Unavailable (past)
                  </span>
                </div>
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
                            const isToday = day.toDateString() === todayStr;
                            return (
                              <th
                                key={i}
                                className={`border-b border-r p-1.5 text-center min-w-[90px] ${
                                  isToday ? "bg-primary/10" : "bg-white"
                                }`}
                              >
                                <div className="font-semibold">
                                  {["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"][i]}
                                </div>
                                <div className="text-muted-foreground font-normal">
                                  {day.toLocaleDateString("en-US", { month: "short", day: "numeric" })}
                                </div>
                              </th>
                            );
                          })}
                        </tr>
                      </thead>
                      <tbody>
                        {SLOT_TIMES.map((time) => (
                          <tr key={time}>
                            <td className="border-b border-r p-1 text-muted-foreground text-right pr-2 whitespace-nowrap bg-gray-50">
                              {fmt12(time)}
                            </td>
                            {weekDays.map((day, i) => {
                              const dateStr = day.toLocaleDateString("en-CA");
                              const key = `${dateStr}|${time}`;
                              const isPast = new Date(`${dateStr}T${time}:00`) < new Date();
                              const isBooked = bookedSlotKeys.has(key);
                              const isOpen = openSlots.has(key);
                              const isToggling = togglingSlot === key;

                              if (isPast) {
                                return (
                                  <td
                                    key={i}
                                    className="border-b border-r p-1 bg-gray-50 text-center"
                                    title="Unavailable"
                                  >
                                    <span className="text-gray-300 text-[10px] select-none">—</span>
                                  </td>
                                );
                              }

                              if (isBooked) {
                                return (
                                  <td
                                    key={i}
                                    className="border-b border-r p-1 bg-green-500 text-center"
                                    title="Class booked at this slot"
                                  >
                                    <span className="text-[10px] font-semibold text-white select-none">BOOKED</span>
                                  </td>
                                );
                              }

                              return (
                                <td
                                  key={i}
                                  className={`border-b border-r p-1 text-center cursor-pointer transition-colors select-none ${
                                    isOpen
                                      ? "bg-green-100 hover:bg-green-200 text-green-700"
                                      : "bg-white hover:bg-gray-100 text-gray-400"
                                  }`}
                                  onClick={() => !isToggling && toggleSlot(dateStr, time)}
                                  title={isOpen ? "Click to close slot" : "Click to open slot"}
                                >
                                  {isToggling ? (
                                    <Loader2 className="h-3 w-3 animate-spin mx-auto" />
                                  ) : (
                                    <span className="text-[11px]">{isOpen ? "✓" : "+"}</span>
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
                      <TableHead>Package</TableHead>
                      <TableHead>Subject</TableHead>
                      <TableHead>Student Attendance</TableHead>
                      <TableHead>Action</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {pendingConfirmation.length === 0 ? (
                      <TableRow>
                        <TableCell colSpan={6} className="text-center text-muted-foreground text-sm py-8">
                          No classes pending confirmation
                        </TableCell>
                      </TableRow>
                    ) : (
                      pendingConfirmation.map((b) => (
                        <TableRow key={b.id}>
                          <TableCell className="text-sm">{fmtDate(b.appointment_date, "MMM d, h:mm a")}</TableCell>
                          <TableCell className="font-medium">{b.student_name}</TableCell>
                          <TableCell className="text-xs">{b.package_name}</TableCell>
                          <TableCell className="text-xs">{b.subject}</TableCell>
                          <TableCell>
                            {b.student_absent ? (
                              <span className="text-xs px-2 py-1 rounded-full bg-red-100 text-red-700 font-medium">Absent</span>
                            ) : (
                              <Button size="sm" variant="outline"
                                className="text-xs h-7 border-orange-400 text-orange-600 hover:bg-orange-50"
                                disabled={absentLoadingId === b.id}
                                onClick={() => handleMarkStudentAbsent(b.id)}>
                                {absentLoadingId === b.id ? <Loader2 className="h-3 w-3 animate-spin" /> : "Mark Absent"}
                              </Button>
                            )}
                          </TableCell>
                          <TableCell>
                            <Button size="sm"
                              className="h-7 text-xs bg-green-600 hover:bg-green-700"
                              disabled={doneLoadingId === b.id}
                              onClick={() => handleMarkDone(b)}>
                              {doneLoadingId === b.id ? <Loader2 className="h-3 w-3 animate-spin" /> : "Mark as Done"}
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
              <CardHeader>
                <CardTitle className="text-base flex items-center gap-2">
                  <CalendarDays className="h-4 w-4 text-primary" /> Upcoming Classes
                </CardTitle>
              </CardHeader>
              <CardContent>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Date & Time</TableHead>
                      <TableHead>Student</TableHead>
                      <TableHead>Package</TableHead>
                      <TableHead>Subject</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead>Class Info</TableHead>
                      <TableHead>Attendance</TableHead>
                      <TableHead></TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {bookings.length === 0 ? (
                      <TableRow>
                        <TableCell colSpan={8} className="text-center text-muted-foreground text-sm py-8">
                          No upcoming classes
                        </TableCell>
                      </TableRow>
                    ) : (
                      bookings.map((b) => {
                        const classTime = parseUTC(b.appointment_date)?.getTime() ?? 0;
                        const canMarkAbsent = Date.now() >= classTime + 15 * 60 * 1000;
                        return (
                          <TableRow key={b.id}>
                            <TableCell className="text-sm">{fmtDate(b.appointment_date, "MMM d, h:mm a")}</TableCell>
                            <TableCell className="font-medium">{b.student_name}</TableCell>
                            <TableCell className="text-xs">{b.package_name}</TableCell>
                            <TableCell className="text-xs">{b.subject}</TableCell>
                            <TableCell>
                              <span className={`text-xs px-2 py-1 rounded-full font-medium ${statusColors[b.status] || "bg-gray-100"}`}>
                                {b.status}
                              </span>
                            </TableCell>
                            <TableCell>
                              <Button size="sm" variant="outline" className="text-xs h-7 gap-1"
                                onClick={() => { setEditingBooking(b); setClassForm({ class_mode: b.class_mode || "", meeting_link: b.meeting_link || "" }); setClassInfoError(null); }}>
                                <Video className="h-3 w-3" /> {b.class_mode ? "Edit Info" : "Set Info"}
                              </Button>
                            </TableCell>
                            <TableCell>
                              {b.student_absent ? (
                                <span className="text-xs px-2 py-1 rounded-full bg-red-100 text-red-700">Absent</span>
                              ) : canMarkAbsent ? (
                                <Button size="sm" variant="outline"
                                  className="text-xs h-7 border-orange-400 text-orange-600 hover:bg-orange-50"
                                  disabled={absentLoadingId === b.id}
                                  onClick={() => handleMarkStudentAbsent(b.id)}>
                                  {absentLoadingId === b.id ? <Loader2 className="h-3 w-3 animate-spin" /> : "Mark Absent"}
                                </Button>
                              ) : (
                                <span className="text-xs text-muted-foreground">—</span>
                              )}
                            </TableCell>
                            <TableCell>
                              <Button size="sm" variant="ghost" className="text-xs h-7 text-destructive hover:text-destructive"
                                onClick={() => {
                                  const apptTime = parseUTC(b.appointment_date)?.getTime() ?? 0;
                                  const hoursUntil = (apptTime - Date.now()) / (1000 * 60 * 60);
                                  if (cancellationHours > 0 && hoursUntil < cancellationHours) {
                                    axios.post(`${import.meta.env.VITE_API_URL}/api/teacher/bookings/${b.id}/cancel`, {}, { headers }).catch(() => {});
                                    setCancelBlocked(true);
                                  } else {
                                    setCancelConfirm(b);
                                  }
                                }}>
                                Cancel
                              </Button>
                            </TableCell>
                          </TableRow>
                        );
                      })
                    )}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>

            {/* Completed Classes with filter */}
            <Card>
              <CardHeader className="flex flex-row items-center justify-between flex-wrap gap-3">
                <CardTitle className="text-base flex items-center gap-2">
                  <FileText className="h-4 w-4 text-primary" /> Completed Classes
                </CardTitle>
                <div className="flex items-center gap-2">
                  <Select value={String(classesMonth)} onValueChange={(v) => {
                    const m = parseInt(v); setClassesMonth(m); fetchFilteredCompleted(m, classesYear);
                  }}>
                    <SelectTrigger className="h-8 text-sm w-36"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {MONTHS.map((name, i) => <SelectItem key={i+1} value={String(i+1)}>{name}</SelectItem>)}
                    </SelectContent>
                  </Select>
                  <Select value={String(classesYear)} onValueChange={(v) => {
                    const y = parseInt(v); setClassesYear(y); fetchFilteredCompleted(classesMonth, y);
                  }}>
                    <SelectTrigger className="h-8 text-sm w-28"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {Array.from({ length: 4 }, (_, i) => new Date().getFullYear() - i).map(y => (
                        <SelectItem key={y} value={String(y)}>{y}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </CardHeader>
              <CardContent>
                {filteredLoading ? (
                  <div className="flex justify-center py-8"><Loader2 className="h-6 w-6 animate-spin text-primary" /></div>
                ) : (
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Date & Time</TableHead>
                        <TableHead>Student</TableHead>
                        <TableHead>Package</TableHead>
                        <TableHead>Subject</TableHead>
                        <TableHead>Attendance</TableHead>
                        <TableHead>Report</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {filteredCompleted.filter(b => b.status === "done").length === 0 ? (
                        <TableRow>
                          <TableCell colSpan={6} className="text-center text-muted-foreground text-sm py-8">
                            No completed classes in {MONTHS[classesMonth - 1]} {classesYear}
                          </TableCell>
                        </TableRow>
                      ) : (
                        filteredCompleted.filter(b => b.status === "done").map(b => (
                          <TableRow key={b.id}>
                            <TableCell className="text-sm">{fmtDate(b.appointment_date, "MMM d, h:mm a")}</TableCell>
                            <TableCell className="font-medium">{b.student_name}</TableCell>
                            <TableCell className="text-xs">{b.package_name}</TableCell>
                            <TableCell className="text-xs">{b.subject}</TableCell>
                            <TableCell>
                              <div className="flex gap-1 flex-wrap">
                                {b.student_absent && <span className="text-xs px-2 py-0.5 rounded-full bg-orange-100 text-orange-700">Student Absent</span>}
                                {b.teacher_absent && <span className="text-xs px-2 py-0.5 rounded-full bg-red-100 text-red-700">Teacher Absent</span>}
                                {!b.student_absent && !b.teacher_absent && <span className="text-xs text-muted-foreground">Present</span>}
                              </div>
                            </TableCell>
                            <TableCell>
                              {b.has_report ? (
                                <Badge variant="secondary" className="text-xs bg-green-100 text-green-700">✓ Reported</Badge>
                              ) : (
                                <Button size="sm" variant="outline" className="text-xs h-7" onClick={() => openReport(b)}>
                                  Submit Report
                                </Button>
                              )}
                            </TableCell>
                          </TableRow>
                        ))
                      )}
                    </TableBody>
                  </Table>
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
                  {profileError && <p className="text-sm text-destructive">{profileError}</p>}
                  {profileSuccess && <p className="text-sm text-green-600">Profile updated successfully.</p>}
                  <div className="space-y-1.5">
                    <Label>Full Name</Label>
                    <Input value={profileForm.name} onChange={e => setProfileForm(p => ({ ...p, name: e.target.value }))} />
                  </div>
                  <div className="space-y-1.5">
                    <Label>Email</Label>
                    <Input type="email" value={profileForm.email} onChange={e => setProfileForm(p => ({ ...p, email: e.target.value }))} />
                  </div>
                  <div className="space-y-1.5">
                    <Label>Timezone</Label>
                    <Select value={profileForm.timezone} onValueChange={v => setProfileForm(p => ({ ...p, timezone: v }))}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent className="max-h-60">
                        {TIMEZONES.map(tz => <SelectItem key={tz.value} value={tz.value}>{tz.label}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-1.5">
                    <Label>New Password <span className="text-muted-foreground text-xs">(leave blank to keep current)</span></Label>
                    <Input type="password" placeholder="••••••••" value={profileForm.password}
                      onChange={e => setProfileForm(p => ({ ...p, password: e.target.value }))} />
                  </div>
                  <Button onClick={handleSaveProfile} disabled={profileLoading} className="w-full">
                    {profileLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : "Save Changes"}
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
                      <p className="text-xl font-bold text-green-600">{health.attended}</p>
                      <p className="text-xs text-muted-foreground">Attended</p>
                    </div>
                    <div className="text-center p-3 bg-red-50 rounded-lg">
                      <p className="text-xl font-bold text-red-600">{health.total_absent}</p>
                      <p className="text-xs text-muted-foreground">Absent</p>
                    </div>
                    <div className="text-center p-3 bg-blue-50 rounded-lg">
                      <p className="text-xl font-bold text-blue-600">{health.total_done}</p>
                      <p className="text-xs text-muted-foreground">Total Done</p>
                    </div>
                  </div>
                  <div className="border rounded-lg p-3 space-y-1">
                    <p className="text-xs font-medium text-muted-foreground">This period</p>
                    <div className="flex justify-between text-sm">
                      <span>This week</span>
                      <span className="font-semibold text-blue-600">{classesThisWeek}</span>
                    </div>
                    <div className="flex justify-between text-sm">
                      <span>This month</span>
                      <span className="font-semibold text-primary">{classesThisMonth}</span>
                    </div>
                  </div>
                </CardContent>
              </Card>
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
                      <TableHead>Package</TableHead>
                      <TableHead>Subject</TableHead>
                      <TableHead>Sessions Left</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {students.length === 0 ? (
                      <TableRow>
                        <TableCell colSpan={6} className="text-center text-muted-foreground text-sm py-8">
                          No students assigned yet
                        </TableCell>
                      </TableRow>
                    ) : students.map(s => (
                      <TableRow key={s.id}>
                        <TableCell className="font-medium">{s.name}</TableCell>
                        <TableCell>{s.nationality || "—"}</TableCell>
                        <TableCell>{s.age || "—"}</TableCell>
                        <TableCell className="text-xs">{s.package_name}</TableCell>
                        <TableCell className="text-xs">{s.subject}</TableCell>
                        <TableCell><Badge variant="secondary">{s.sessions_remaining}</Badge></TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>

            {/* Leave Requests */}
            <Card>
              <CardHeader className="flex flex-row items-center justify-between">
                <CardTitle className="text-base flex items-center gap-2">
                  <CalendarOff className="h-4 w-4 text-primary" /> My Leave Requests
                </CardTitle>
                <Button size="sm" onClick={() => setShowLeaveModal(true)} className="gap-1 text-xs">
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
                        <TableCell colSpan={5} className="text-center text-muted-foreground text-sm py-8">
                          No leave requests submitted
                        </TableCell>
                      </TableRow>
                    ) : leaves.map(lv => (
                      <TableRow key={lv.id}>
                        <TableCell className="text-sm font-medium">
                          {new Date(`${lv.leave_date}T00:00:00`).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}
                        </TableCell>
                        <TableCell className="text-sm capitalize">{lv.reason_type}</TableCell>
                        <TableCell className="text-xs text-muted-foreground">{lv.notes || "—"}</TableCell>
                        <TableCell>
                          <span className={`text-xs px-2 py-1 rounded-full font-medium ${leaveStatusColors[lv.status] || "bg-gray-100 text-gray-700"}`}>
                            {lv.status}
                          </span>
                        </TableCell>
                        <TableCell>
                          {lv.status === "pending" && (
                            <Button size="sm" variant="ghost" className="h-7 text-xs text-destructive hover:text-destructive"
                              onClick={() => handleCancelLeave(lv.id)}>
                              <X className="h-3 w-3 mr-1" /> Cancel
                            </Button>
                          )}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          </>
        )}
      </div>

      {/* ── Dialogs ── */}

      {/* Day schedule modal */}
      <Dialog open={showDayModal} onOpenChange={setShowDayModal}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>
              {selectedDayBookings[0] ? fmtDate(selectedDayBookings[0].appointment_date, "MMM d, yyyy") : ""} Schedule
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-3 py-2">
            {selectedDayBookings.map(b => (
              <div key={b.id} className="rounded-lg border p-3 space-y-1">
                <div className="flex items-center justify-between">
                  <span className="font-semibold text-sm">{fmtDate(b.appointment_date, "h:mm a")}</span>
                  <span className={`text-xs px-2 py-0.5 rounded-full ${statusColors[b.status] || "bg-gray-100"}`}>{b.status}</span>
                </div>
                <p className="text-sm">{b.student_name} · {b.subject}</p>
                {b.class_mode && <p className="text-xs text-muted-foreground"><Video className="h-3 w-3 inline mr-1" />{b.class_mode}</p>}
              </div>
            ))}
          </div>
        </DialogContent>
      </Dialog>

      {/* Class Info dialog */}
      <Dialog open={!!editingBooking} onOpenChange={o => { if (!o) setEditingBooking(null); }}>
        <DialogContent className="max-w-sm">
          <DialogHeader><DialogTitle>Set Class Info</DialogTitle></DialogHeader>
          <div className="space-y-3 py-2">
            {classInfoError && <p className="text-sm text-destructive">{classInfoError}</p>}
            <div className="space-y-1.5">
              <Label>Mode of Class</Label>
              <Select value={classForm.class_mode} onValueChange={v => setClassForm(p => ({ ...p, class_mode: v }))}>
                <SelectTrigger><SelectValue placeholder="Select platform" /></SelectTrigger>
                <SelectContent>
                  {["Voov","Classin","Google Meet","Zoom","Others"].map(v => <SelectItem key={v} value={v}>{v}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Meeting Link</Label>
              <Input placeholder="https://..." value={classForm.meeting_link}
                onChange={e => setClassForm(p => ({ ...p, meeting_link: e.target.value }))} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditingBooking(null)}>Cancel</Button>
            <Button onClick={handleSaveClassInfo} disabled={classInfoLoading}>
              {classInfoLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : "Save"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Cancel Booking dialog */}
      {cancelConfirm && (
        <Dialog open onOpenChange={o => { if (!o) setCancelConfirm(null); }}>
          <DialogContent className="max-w-sm">
            <DialogHeader><DialogTitle>Cancel Class</DialogTitle></DialogHeader>
            <p className="text-sm text-muted-foreground py-2">Are you sure? The student and admin will be notified.</p>
            <DialogFooter>
              <Button variant="outline" onClick={() => setCancelConfirm(null)}>No, Keep It</Button>
              <Button variant="destructive" onClick={handleCancelBooking} disabled={cancelLoading}>
                {cancelLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : "Yes, Cancel"}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      )}

      {/* Cancel Blocked dialog */}
      {cancelBlocked && (
        <Dialog open onOpenChange={o => { if (!o) setCancelBlocked(false); }}>
          <DialogContent className="max-w-sm">
            <DialogHeader><DialogTitle>Cannot Cancel</DialogTitle></DialogHeader>
            <p className="text-sm text-muted-foreground py-2">
              Cancellation is not allowed within <span className="font-semibold">{cancellationHours} hour(s)</span> of the scheduled class time. Your admin has been notified.
            </p>
            <DialogFooter>
              <Button variant="outline" onClick={() => setCancelBlocked(false)}>Close</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      )}

      {/* Leave Request dialog */}
      <Dialog open={showLeaveModal} onOpenChange={setShowLeaveModal}>
        <DialogContent className="max-w-sm">
          <DialogHeader><DialogTitle>Request Leave</DialogTitle></DialogHeader>
          <div className="space-y-3 py-2">
            <div className="space-y-1.5">
              <Label>Leave Date</Label>
              <Input type="date" value={leaveForm.leave_date}
                onChange={e => setLeaveForm(p => ({ ...p, leave_date: e.target.value }))} />
            </div>
            <div className="space-y-1.5">
              <Label>Reason Type</Label>
              <Select value={leaveForm.reason_type} onValueChange={v => setLeaveForm(p => ({ ...p, reason_type: v }))}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {["sick","personal","vacation","other"].map(v => <SelectItem key={v} value={v} className="capitalize">{v}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Notes (optional)</Label>
              <Input placeholder="Additional details..." value={leaveForm.notes}
                onChange={e => setLeaveForm(p => ({ ...p, notes: e.target.value }))} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowLeaveModal(false)}>Cancel</Button>
            <Button onClick={handleSubmitLeave} disabled={leaveLoading || !leaveForm.leave_date}>
              {leaveLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : "Submit"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Report Modal — triggered after marking done OR from completed list */}
      <ReportModal
        open={reportModal.open || !!postDoneReport}
        onClose={() => {
          setReportModal(prev => ({ ...prev, open: false }));
          setPostDoneReport(null);
          fetchData();
          if (page === "classes") fetchFilteredCompleted(classesMonth, classesYear);
        }}
        bookingId={postDoneReport?.bookingId ?? reportModal.bookingId}
        studentId={postDoneReport?.studentId ?? reportModal.studentId}
        studentName={postDoneReport?.studentName ?? reportModal.studentName}
      />

    </div>
  );
};

export default TeacherDashboard;
