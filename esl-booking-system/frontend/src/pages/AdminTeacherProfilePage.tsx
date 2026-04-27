import { useState, useEffect, useCallback } from "react";
import { useParams, useNavigate } from "react-router-dom";
import axios from "axios";
import NavBar from "@/components/Navbar";
import { format, addDays, startOfWeek } from "date-fns";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import {
  ArrowLeft, UserCircle, CalendarDays, Loader2, Pencil, Save, Eye, EyeOff,
  BookOpen, KeyRound, ChevronLeft, ChevronRight, Timer, CheckCircle2,
  UserX, Users, FileText, Heart,
} from "lucide-react";
import { fmtDate, fmtDateOnly } from "@/utils/timezone";

interface TeacherProfile {
  id: number;
  name: string;
  email: string;
  created_at: string;
}

interface ScheduleEntry {
  id: number;
  appointment_date: string;
  status: string;
  class_mode: string | null;
  meeting_link: string | null;
  [key: string]: unknown;
  student_name: string;
  package_name: string;
  subject: string | null;
}

interface CompletedBooking {
  id: number;
  appointment_date: string;
  student_name: string;
  duration_minutes: number;
  subject: string | null;
  student_absent: boolean;
  teacher_absent: boolean;
  has_report: boolean;
}

interface LeaveEntry {
  id: number;
  leave_date: string;
  reason_type: string;
  notes: string | null;
  status: string;
}

interface Kpi {
  fifty_min_this_week: number;
  twenty_five_min_this_week: number;
  total_completed: number;
  total_absences: number;
  total_present: number;
  classes_this_month: number;
}

interface Health {
  total_done: number;
  total_absent: number;
  attended: number;
  rate: number;
}

type DrilldownKey =
  | "fifty_min_this_week"
  | "twenty_five_min_this_week"
  | "total_completed"
  | "total_absences"
  | "total_present"
  | "classes_this_month";

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

const UPCOMING_PAGE_SIZE = 10;

const AdminTeacherProfilePage = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const token = localStorage.getItem("token");
  const headers = { Authorization: `Bearer ${token}` };
  const base = import.meta.env.VITE_API_URL;

  const [teacher, setTeacher] = useState<TeacherProfile | null>(null);
  const [schedule, setSchedule] = useState<ScheduleEntry[]>([]);
  const [completedBookings, setCompletedBookings] = useState<CompletedBooking[]>([]);
  const [leaves, setLeaves] = useState<LeaveEntry[]>([]);
  const [kpi, setKpi] = useState<Kpi | null>(null);
  const [health, setHealth] = useState<Health | null>(null);
  const [loading, setLoading] = useState(true);

  // Upcoming pagination
  const [upcomingPage, setUpcomingPage] = useState(1);

  // Weekly availability
  const [weekStart, setWeekStart] = useState<Date>(() => startOfWeek(new Date(), { weekStartsOn: 1 }));
  const [openSlots, setOpenSlots] = useState<Set<string>>(new Set());
  const [togglingSlot, setTogglingSlot] = useState<string | null>(null);

  // Drilldown dialog
  const [drillKey, setDrillKey] = useState<DrilldownKey | null>(null);

  // Edit dialog
  const [showEdit, setShowEdit] = useState(false);
  const [editForm, setEditForm] = useState({ name: "", email: "", password: "" });
  const [showPassword, setShowPassword] = useState(false);
  const [editLoading, setEditLoading] = useState(false);
  const [editError, setEditError] = useState<string | null>(null);

  // Reset password dialog
  const [showResetPw, setShowResetPw] = useState(false);
  const [resetPw, setResetPw] = useState("");
  const [showResetPwText, setShowResetPwText] = useState(false);
  const [resetPwLoading, setResetPwLoading] = useState(false);
  const [resetPwMsg, setResetPwMsg] = useState<{ type: "success" | "error"; text: string } | null>(null);

  const handleResetPassword = async () => {
    setResetPwLoading(true);
    setResetPwMsg(null);
    try {
      await axios.put(`${base}/api/admin/users/${id}/reset-password`, { password: resetPw }, { headers });
      setResetPwMsg({ type: "success", text: "Password reset successfully." });
      setResetPw("");
    } catch (err: unknown) {
      const msg = (err as { response?: { data?: { message?: string } } })?.response?.data?.message || "Failed to reset password";
      setResetPwMsg({ type: "error", text: msg });
    } finally {
      setResetPwLoading(false);
    }
  };

  const fetchData = async () => {
    try {
      const res = await axios.get(`${base}/api/admin/teachers/${id}`, { headers });
      setTeacher(res.data.teacher);
      setSchedule(res.data.schedule);
      setLeaves(res.data.leaves);
      setCompletedBookings(res.data.completedBookings || []);
      setKpi(res.data.kpi || null);
      setHealth(res.data.health || null);
    } catch (err) {
      console.error("Error fetching teacher profile:", err);
    } finally {
      setLoading(false);
    }
  };

  const fetchOpenSlots = useCallback(async (start: Date) => {
    try {
      const startStr = format(start, "yyyy-MM-dd");
      const res = await axios.get(`${base}/api/admin/teachers/${id}/weekly-slots?startDate=${startStr}`, { headers });
      const slotSet = new Set<string>(
        (res.data as { slot_date: string; slot_time: string }[]).map(s => `${s.slot_date}|${s.slot_time}`)
      );
      setOpenSlots(slotSet);
    } catch (err) {
      console.error("Error fetching open slots:", err);
    }
  }, [id]);

  const toggleSlot = async (dateStr: string, time: string) => {
    const key = `${dateStr}|${time}`;
    const isOpen = openSlots.has(key);
    const action = isOpen ? "close" : "open";
    setTogglingSlot(key);
    try {
      await axios.post(`${base}/api/admin/teachers/${id}/weekly-slots`, {
        slot_date: dateStr, slot_time: `${time}:00`, action,
      }, { headers });
      setOpenSlots(prev => {
        const next = new Set(prev);
        if (isOpen) next.delete(key); else next.add(key);
        return next;
      });
    } catch (err) {
      console.error("Error toggling slot:", err);
    } finally {
      setTogglingSlot(null);
    }
  };

  useEffect(() => { fetchData(); }, [id]);
  useEffect(() => { fetchOpenSlots(weekStart); }, [weekStart, fetchOpenSlots]);

  const openEdit = () => {
    if (!teacher) return;
    setEditForm({ name: teacher.name, email: teacher.email, password: "" });
    setEditError(null);
    setShowEdit(true);
  };

  const handleSave = async () => {
    setEditLoading(true);
    setEditError(null);
    try {
      const payload: Record<string, string> = { name: editForm.name, email: editForm.email };
      if (editForm.password) payload.password = editForm.password;
      await axios.put(`${base}/api/admin/teachers/${id}`, payload, { headers });
      setShowEdit(false);
      fetchData();
    } catch (err: unknown) {
      const msg = (err as { response?: { data?: { message?: string } } })?.response?.data?.message || "Failed to save";
      setEditError(msg);
    } finally {
      setEditLoading(false);
    }
  };

  // Drilldown filtering
  const getDrillList = (key: DrilldownKey): CompletedBooking[] => {
    const today = new Date();
    const weekStart = new Date(today);
    weekStart.setDate(today.getDate() - ((today.getDay() + 6) % 7)); // Mon
    weekStart.setHours(0, 0, 0, 0);
    const weekEnd = new Date(weekStart);
    weekEnd.setDate(weekStart.getDate() + 7);

    const thisMonth = today.getMonth();
    const thisYear = today.getFullYear();

    switch (key) {
      case "fifty_min_this_week":
        return completedBookings.filter(b => {
          const d = new Date(b.appointment_date);
          return !b.student_absent && b.duration_minutes === 50 && d >= weekStart && d < weekEnd;
        });
      case "twenty_five_min_this_week":
        return completedBookings.filter(b => {
          const d = new Date(b.appointment_date);
          return !b.student_absent && b.duration_minutes === 25 && d >= weekStart && d < weekEnd;
        });
      case "total_completed":
        return completedBookings;
      case "total_absences":
        return completedBookings.filter(b => b.student_absent);
      case "total_present":
        return completedBookings.filter(b => !b.student_absent);
      case "classes_this_month":
        return completedBookings.filter(b => {
          const d = new Date(b.appointment_date);
          return d.getMonth() === thisMonth && d.getFullYear() === thisYear;
        });
    }
  };

  const drillTitles: Record<DrilldownKey, string> = {
    fifty_min_this_week: "50-min Completed Classes This Week",
    twenty_five_min_this_week: "25-min Completed Classes This Week",
    total_completed: "All Completed Classes",
    total_absences: "Classes with Student Absent",
    total_present: "Classes with Student Present",
    classes_this_month: "Completed Classes This Month",
  };

  const upcomingTotal = schedule.length;
  const upcomingTotalPages = Math.max(1, Math.ceil(upcomingTotal / UPCOMING_PAGE_SIZE));
  const upcomingPaged = schedule.slice((upcomingPage - 1) * UPCOMING_PAGE_SIZE, upcomingPage * UPCOMING_PAGE_SIZE);

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  if (!teacher) {
    return (
      <>
        <NavBar />
        <div className="max-w-4xl mx-auto px-4 py-8">
          <p className="text-muted-foreground">Teacher not found.</p>
        </div>
      </>
    );
  }

  const drillList = drillKey ? getDrillList(drillKey) : [];

  return (
    <>
      <NavBar />
      <div className="max-w-5xl mx-auto px-4 py-8 space-y-6 brand-gradient-subtle pattern-dots-light min-h-screen">
        {/* Back button */}
        <Button variant="ghost" className="gap-2 -ml-2" onClick={() => navigate("/teachers")}>
          <ArrowLeft className="h-4 w-4" /> Back to Teachers
        </Button>

        {/* Teacher Info */}
        <Card className="glow-card border-0 rounded-2xl">
          <CardHeader className="flex flex-row items-center justify-between">
            <CardTitle className="flex items-center gap-2">
              <UserCircle className="h-5 w-5 text-primary" />
              Teacher Profile
            </CardTitle>
            <div className="flex gap-2">
              <Button size="sm" variant="outline" className="gap-1"
                onClick={() => { setShowResetPw(true); setResetPw(""); setResetPwMsg(null); }}>
                <KeyRound className="h-4 w-4" /> Reset Password
              </Button>
              <Button size="sm" variant="outline" className="gap-1" onClick={openEdit}>
                <Pencil className="h-4 w-4" /> Edit
              </Button>
            </div>
          </CardHeader>
          <CardContent className="grid grid-cols-2 sm:grid-cols-3 gap-4 text-sm">
            <div>
              <p className="text-xs text-muted-foreground">Full Name</p>
              <p className="font-semibold">{teacher.name}</p>
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Email</p>
              <p className="font-medium">{teacher.email}</p>
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Added</p>
              <p className="font-medium">{fmtDateOnly(teacher.created_at)}</p>
            </div>
          </CardContent>
        </Card>

        {/* KPIs */}
        {kpi && (
          <Card className="glow-card border-0 rounded-2xl">
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-base">
                <FileText className="h-5 w-5 text-primary" /> Performance Overview
              </CardTitle>
              <p className="text-xs text-muted-foreground">Click any card to see the class list</p>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                {/* 50-min this week */}
                <button
                  onClick={() => setDrillKey("fifty_min_this_week")}
                  className="text-left border rounded-xl p-3 bg-white hover:bg-indigo-50 hover:border-indigo-300 transition-colors cursor-pointer"
                >
                  <p className="text-xl font-bold text-indigo-600">{kpi.fifty_min_this_week}</p>
                  <p className="text-xs text-muted-foreground flex items-center gap-1 mt-0.5">
                    <Timer className="h-3.5 w-3.5" /> 50-min Completed (This Week)
                  </p>
                  <p className="text-[10px] text-muted-foreground mt-0.5">Student present</p>
                </button>

                {/* 25-min this week */}
                <button
                  onClick={() => setDrillKey("twenty_five_min_this_week")}
                  className="text-left border rounded-xl p-3 bg-white hover:bg-violet-50 hover:border-violet-300 transition-colors cursor-pointer"
                >
                  <p className="text-xl font-bold text-violet-600">{kpi.twenty_five_min_this_week}</p>
                  <p className="text-xs text-muted-foreground flex items-center gap-1 mt-0.5">
                    <Timer className="h-3.5 w-3.5" /> 25-min Completed (This Week)
                  </p>
                  <p className="text-[10px] text-muted-foreground mt-0.5">Student present</p>
                </button>

                {/* Total completed */}
                <button
                  onClick={() => setDrillKey("total_completed")}
                  className="text-left border rounded-xl p-3 bg-white hover:bg-blue-50 hover:border-blue-300 transition-colors cursor-pointer"
                >
                  <p className="text-xl font-bold text-blue-600">{kpi.total_completed}</p>
                  <p className="text-xs text-muted-foreground flex items-center gap-1 mt-0.5">
                    <CheckCircle2 className="h-3.5 w-3.5" /> Total Completed Classes
                  </p>
                </button>

                {/* Total absences */}
                <button
                  onClick={() => setDrillKey("total_absences")}
                  className="text-left border rounded-xl p-3 bg-white hover:bg-red-50 hover:border-red-300 transition-colors cursor-pointer"
                >
                  <p className="text-xl font-bold text-red-500">{kpi.total_absences}</p>
                  <p className="text-xs text-muted-foreground flex items-center gap-1 mt-0.5">
                    <UserX className="h-3.5 w-3.5" /> Total Student Absences
                  </p>
                </button>

                {/* Total present */}
                <button
                  onClick={() => setDrillKey("total_present")}
                  className="text-left border rounded-xl p-3 bg-white hover:bg-green-50 hover:border-green-300 transition-colors cursor-pointer"
                >
                  <p className="text-xl font-bold text-green-600">{kpi.total_present}</p>
                  <p className="text-xs text-muted-foreground flex items-center gap-1 mt-0.5">
                    <Users className="h-3.5 w-3.5" /> Classes — Student Present
                  </p>
                </button>

                {/* This month */}
                <button
                  onClick={() => setDrillKey("classes_this_month")}
                  className="text-left border rounded-xl p-3 bg-white hover:bg-orange-50 hover:border-orange-300 transition-colors cursor-pointer"
                >
                  <p className="text-xl font-bold text-orange-500">{kpi.classes_this_month}</p>
                  <p className="text-xs text-muted-foreground flex items-center gap-1 mt-0.5">
                    <CalendarDays className="h-3.5 w-3.5" /> Classes This Month
                  </p>
                </button>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Health */}
        {health && (
          <Card className="glow-card border-0 rounded-2xl">
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-base">
                <Heart className="h-5 w-5 text-rose-500" /> Attendance Health
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="flex items-center justify-between text-sm">
                <span className="text-muted-foreground">Attendance Rate</span>
                <span className={`font-bold text-lg ${health.rate >= 80 ? "text-green-600" : health.rate >= 60 ? "text-orange-500" : "text-red-500"}`}>
                  {health.rate}%
                </span>
              </div>
              <div className="w-full bg-gray-100 rounded-full h-3 overflow-hidden">
                <div
                  className={`h-3 rounded-full transition-all ${health.rate >= 80 ? "bg-green-500" : health.rate >= 60 ? "bg-orange-400" : "bg-red-500"}`}
                  style={{ width: `${health.rate}%` }}
                />
              </div>
              <div className="grid grid-cols-3 gap-3 text-center mt-1">
                <div className="border rounded-lg p-2">
                  <p className="text-base font-bold text-blue-600">{health.total_done}</p>
                  <p className="text-xs text-muted-foreground">Total Classes</p>
                </div>
                <div className="border rounded-lg p-2">
                  <p className="text-base font-bold text-green-600">{health.attended}</p>
                  <p className="text-xs text-muted-foreground">Student Attended</p>
                </div>
                <div className="border rounded-lg p-2">
                  <p className="text-base font-bold text-red-500">{health.total_absent}</p>
                  <p className="text-xs text-muted-foreground">Student Absent</p>
                </div>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Upcoming Schedule */}
        <Card className="glow-card border-0 rounded-2xl">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <CalendarDays className="h-5 w-5 text-primary" />
              Upcoming Schedule
              {upcomingTotal > 0 && (
                <span className="text-xs font-normal text-muted-foreground ml-1">({upcomingTotal})</span>
              )}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow className="brand-gradient-subtle">
                  <TableHead>Date & Time</TableHead>
                  <TableHead>Student</TableHead>
                  <TableHead>Package / Subject</TableHead>
                  <TableHead>Mode</TableHead>
                  <TableHead>Status</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {schedule.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={5} className="text-center text-muted-foreground text-sm py-10">
                      No upcoming classes
                    </TableCell>
                  </TableRow>
                ) : (
                  upcomingPaged.map((s) => (
                    <TableRow key={s.id}>
                      <TableCell className="text-sm">
                        {fmtDate(s.appointment_date, "MMM d, yyyy h:mm a")}
                      </TableCell>
                      <TableCell className="text-sm font-medium">{s.student_name}</TableCell>
                      <TableCell className="text-sm">
                        {s.package_name}{s.subject ? ` · ${s.subject}` : ""}
                      </TableCell>
                      <TableCell className="text-sm text-muted-foreground">
                        {s.class_mode || "—"}
                      </TableCell>
                      <TableCell>
                        <span className={`text-xs px-2 py-1 rounded-full font-medium ${statusColors[s.status] || "bg-gray-100 text-gray-700"}`}>
                          {s.status}
                        </span>
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
            {/* Pagination */}
            {upcomingTotal > UPCOMING_PAGE_SIZE && (
              <div className="flex items-center justify-between mt-4 text-sm">
                <span className="text-muted-foreground text-xs">
                  Page {upcomingPage} of {upcomingTotalPages} · {upcomingTotal} total
                </span>
                <div className="flex gap-2">
                  <Button size="sm" variant="outline" onClick={() => setUpcomingPage(p => Math.max(1, p - 1))} disabled={upcomingPage === 1}>
                    <ChevronLeft className="h-4 w-4" />
                  </Button>
                  <Button size="sm" variant="outline" onClick={() => setUpcomingPage(p => Math.min(upcomingTotalPages, p + 1))} disabled={upcomingPage === upcomingTotalPages}>
                    <ChevronRight className="h-4 w-4" />
                  </Button>
                </div>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Weekly Availability (Opt-in) */}
        <Card className="glow-card border-0 rounded-2xl">
          <CardHeader className="flex flex-row items-center justify-between">
            <CardTitle className="flex items-center gap-2">
              <CalendarDays className="h-5 w-5 text-primary" />
              Weekly Availability
            </CardTitle>
            <p className="text-xs text-muted-foreground">Click slots to open/close them for this teacher</p>
          </CardHeader>
          <CardContent>
            <div className="flex items-center justify-between mb-4">
              <Button variant="outline" size="sm" onClick={() => setWeekStart(addDays(weekStart, -7))}>
                <ChevronLeft className="h-4 w-4 mr-1" /> Prev
              </Button>
              <span className="text-sm font-medium">
                {format(weekStart, "MMM d")} – {format(addDays(weekStart, 6), "MMM d, yyyy")}
              </span>
              <Button variant="outline" size="sm" onClick={() => setWeekStart(addDays(weekStart, 7))}>
                Next <ChevronRight className="h-4 w-4 ml-1" />
              </Button>
            </div>
            <div className="overflow-x-auto">
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
                  {(() => {
                    const slots: string[] = [];
                    for (let h = 7; h <= 22; h++) {
                      slots.push(`${String(h).padStart(2, "0")}:00`);
                      if (h < 22 || h === 22) slots.push(`${String(h).padStart(2, "0")}:30`);
                    }
                    return slots.map((time) => (
                      <tr key={time} className="group">
                        <td className="p-1 font-medium text-muted-foreground group-hover:bg-primary/10 group-hover:text-primary group-hover:font-semibold transition-colors rounded">{(() => {
                          const [hh, mm] = time.split(":");
                          const h = Number(hh);
                          return `${h % 12 === 0 ? 12 : h % 12}:${mm} ${h >= 12 ? "PM" : "AM"}`;
                        })()}</td>
                        {[...Array(7)].map((_, j) => {
                          const day = format(addDays(weekStart, j), "yyyy-MM-dd");
                          const key = `${day}|${time}`;
                          const isOpen = openSlots.has(key);
                          const isPast = new Date(`${day}T${time}:00`) < new Date();
                          const isToggling = togglingSlot === key;
                          const bookedEntry = schedule.find(s => {
                            const d = fmtDate(s.appointment_date, "yyyy-MM-dd");
                            const t = fmtDate(s.appointment_date, "HH:mm");
                            return d === day && t === time;
                          });
                          return (
                            <td
                              key={j}
                              onClick={() => !isPast && !bookedEntry && !isToggling && toggleSlot(day, time)}
                              className={`p-1 text-center border cursor-pointer transition-colors ${
                                isPast ? "bg-gray-50 text-gray-300 cursor-not-allowed"
                                : bookedEntry ? "bg-blue-100 text-blue-700 cursor-default"
                                : isOpen ? "bg-green-100 text-green-700 hover:bg-green-200"
                                : "bg-gray-100 text-gray-400 hover:bg-gray-200"
                              }`}
                            >
                              {isToggling ? "..." : bookedEntry ? "Booked" : isOpen ? "✓" : "+"}
                            </td>
                          );
                        })}
                      </tr>
                    ));
                  })()}
                </tbody>
              </table>
            </div>
            <div className="flex gap-4 mt-3 text-xs text-muted-foreground">
              <span><span className="inline-block w-3 h-3 bg-green-100 border rounded mr-1" />Open (✓)</span>
              <span><span className="inline-block w-3 h-3 bg-gray-100 border rounded mr-1" />Closed (+)</span>
              <span><span className="inline-block w-3 h-3 bg-blue-100 border rounded mr-1" />Booked</span>
            </div>
          </CardContent>
        </Card>

        {/* Leave Requests */}
        <Card className="glow-card border-0 rounded-2xl">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <BookOpen className="h-5 w-5 text-primary" />
              Leave Requests
            </CardTitle>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow className="brand-gradient-subtle">
                  <TableHead>Date</TableHead>
                  <TableHead>Reason</TableHead>
                  <TableHead>Notes</TableHead>
                  <TableHead>Status</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {leaves.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={4} className="text-center text-muted-foreground text-sm py-10">
                      No leave requests
                    </TableCell>
                  </TableRow>
                ) : (
                  leaves.map((l) => (
                    <TableRow key={l.id}>
                      <TableCell className="text-sm">{fmtDateOnly(l.leave_date)}</TableCell>
                      <TableCell className="text-sm capitalize">{l.reason_type.replace(/_/g, " ")}</TableCell>
                      <TableCell className="text-sm text-muted-foreground">{l.notes || "—"}</TableCell>
                      <TableCell>
                        <Badge className={`text-xs ${leaveStatusColors[l.status] || "bg-gray-100 text-gray-700"}`}>
                          {l.status}
                        </Badge>
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      </div>

      {/* KPI Drilldown Dialog */}
      <Dialog open={!!drillKey} onOpenChange={(o) => { if (!o) setDrillKey(null); }}>
        <DialogContent className="sm:max-w-2xl max-h-[80vh] flex flex-col">
          <DialogHeader>
            <DialogTitle>{drillKey ? drillTitles[drillKey] : ""}</DialogTitle>
          </DialogHeader>
          <div className="overflow-y-auto flex-1">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Date & Time</TableHead>
                  <TableHead>Student</TableHead>
                  <TableHead>Duration</TableHead>
                  <TableHead>Attendance</TableHead>
                  <TableHead>Report</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {drillList.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={5} className="text-center text-muted-foreground text-sm py-8">
                      No records found
                    </TableCell>
                  </TableRow>
                ) : (
                  drillList.map(b => (
                    <TableRow key={b.id}>
                      <TableCell className="text-sm">{fmtDate(b.appointment_date, "MMM d, yyyy h:mm a")}</TableCell>
                      <TableCell className="text-sm font-medium">{b.student_name}</TableCell>
                      <TableCell className="text-sm">{b.duration_minutes} min{b.subject ? ` · ${b.subject}` : ""}</TableCell>
                      <TableCell>
                        {b.student_absent
                          ? <span className="text-xs px-2 py-0.5 rounded-full bg-red-100 text-red-700">Student Absent</span>
                          : b.teacher_absent
                          ? <span className="text-xs px-2 py-0.5 rounded-full bg-orange-100 text-orange-700">Teacher Absent</span>
                          : <span className="text-xs text-green-700">Present</span>}
                      </TableCell>
                      <TableCell>
                        {b.has_report
                          ? <Badge className="bg-green-100 text-green-700 text-xs">✓ Reported</Badge>
                          : <span className="text-xs text-muted-foreground">No report</span>}
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </div>
          <DialogFooter className="pt-2 border-t">
            <span className="text-xs text-muted-foreground mr-auto">{drillList.length} record{drillList.length !== 1 ? "s" : ""}</span>
            <Button variant="outline" onClick={() => setDrillKey(null)}>Close</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Reset Password Dialog */}
      <Dialog open={showResetPw} onOpenChange={(o) => { if (!o) setShowResetPw(false); }}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>Reset Teacher Password</DialogTitle>
          </DialogHeader>
          <div className="space-y-3 py-2">
            {resetPwMsg && (
              <p className={`text-sm ${resetPwMsg.type === "success" ? "text-green-600" : "text-destructive"}`}>
                {resetPwMsg.text}
              </p>
            )}
            <div className="space-y-1.5">
              <Label>New Password</Label>
              <div className="relative">
                <Input
                  type={showResetPwText ? "text" : "password"}
                  value={resetPw}
                  onChange={(e) => setResetPw(e.target.value)}
                  placeholder="Min. 6 characters"
                  className="pr-10"
                />
                <button
                  type="button"
                  onClick={() => setShowResetPwText((v) => !v)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                  tabIndex={-1}
                >
                  {showResetPwText ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowResetPw(false)}>Cancel</Button>
            <Button onClick={handleResetPassword} disabled={resetPwLoading || resetPw.length < 6}>
              {resetPwLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : "Reset"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Edit Dialog */}
      <Dialog open={showEdit} onOpenChange={(o) => { if (!o) setShowEdit(false); }}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>Edit Teacher</DialogTitle>
          </DialogHeader>
          <div className="space-y-3 py-2">
            {editError && <p className="text-sm text-destructive">{editError}</p>}
            <div className="space-y-1.5">
              <Label>Name <span className="text-destructive">*</span></Label>
              <Input
                value={editForm.name}
                onChange={(e) => setEditForm((f) => ({ ...f, name: e.target.value }))}
              />
            </div>
            <div className="space-y-1.5">
              <Label>Email <span className="text-destructive">*</span></Label>
              <Input
                type="email"
                value={editForm.email}
                onChange={(e) => setEditForm((f) => ({ ...f, email: e.target.value }))}
              />
            </div>
            <div className="space-y-1.5">
              <Label>New Password <span className="text-muted-foreground text-xs">(optional)</span></Label>
              <div className="relative">
                <Input
                  type={showPassword ? "text" : "password"}
                  value={editForm.password}
                  onChange={(e) => setEditForm((f) => ({ ...f, password: e.target.value }))}
                  placeholder="Leave blank to keep current"
                  className="pr-10"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword((v) => !v)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                  tabIndex={-1}
                >
                  {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowEdit(false)}>Cancel</Button>
            <Button
              onClick={handleSave}
              disabled={editLoading || !editForm.name || !editForm.email}
              className="gap-2"
            >
              {editLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
              Save
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
};

export default AdminTeacherProfilePage;
