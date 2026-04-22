import { useState, useEffect } from "react";
import { useParams, useNavigate } from "react-router-dom";
import axios from "axios";
import NavBar from "@/components/Navbar";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import {
  ArrowLeft, User, Package, CalendarDays, Loader2, Plus, FileText, KeyRound, Eye, EyeOff, Pencil, PlusCircle, MinusCircle, History, Users, UserCheck, X, CheckCircle, AlertTriangle,
} from "lucide-react";
import { fmtDate, fmtDateOnly, localToMysql } from "@/utils/timezone";

interface ClassReport {
  id: number;
  teacher_name: string | null;
  appointment_date: string;
  new_words: string | null;
  sentences: string | null;
  notes: string | null;
  remarks: string | null;
}

interface StudentProfile {
  id: number;
  name: string;
  email: string;
  guardian_name: string | null;
  nationality: string | null;
  age: number | null;
  is_active: boolean;
  created_at: string;
}

interface ActivePackage {
  id: number;
  package_name: string;
  sessions_remaining: number;
  unused_sessions: number;
  payment_status: string;
  subject: string | null;
  teacher_id: number | null;
  price: number;
}

interface BookingRecord {
  id: number;
  appointment_date: string;
  status: string;
  class_mode: string | null;
  meeting_link: string | null;
  student_absent: boolean;
  teacher_absent: boolean;
  teacher_id: number | null;
  teacher_name: string | null;
  has_report: boolean;
}

interface Teacher {
  id: number;
  name: string;
}

interface AvailablePackage {
  id: number;
  package_name: string;
  session_limit: number;
  price: number;
  subject: string | null;
  currency: string;
}

// Generate 30-min slots from 7:00 AM to 10:30 PM
const TIME_SLOTS: string[] = [];
for (let h = 7; h <= 22; h++) {
  TIME_SLOTS.push(`${String(h).padStart(2, "0")}:00`);
  if (h < 22) TIME_SLOTS.push(`${String(h).padStart(2, "0")}:30`);
}
TIME_SLOTS.push("22:30");

const DAYS_OF_WEEK = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"];

const statusColors: Record<string, string> = {
  pending: "bg-yellow-100 text-yellow-800",
  confirmed: "bg-green-100 text-green-800",
  done: "bg-blue-100 text-blue-800",
  cancelled: "bg-red-100 text-red-800",
};

const AdminStudentProfilePage = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const token = localStorage.getItem("token");
  const headers = { Authorization: `Bearer ${token}` };
  const base = import.meta.env.VITE_API_URL;

  const [student, setStudent] = useState<StudentProfile | null>(null);
  const [activePackage, setActivePackage] = useState<ActivePackage | null>(null);
  const [bookings, setBookings] = useState<BookingRecord[]>([]);
  const [teachers, setTeachers] = useState<Teacher[]>([]);
  const [loading, setLoading] = useState(true);
  const [cancellingId, setCancellingId] = useState<number | null>(null);

  // Deactivate/reactivate student
  const [deactivateLoading, setDeactivateLoading] = useState(false);

  const handleToggleActive = async () => {
    if (!student) return;
    const action = student.is_active ? 'deactivate' : 'reactivate';
    if (action === 'deactivate' && !confirm(`Are you sure you want to deactivate ${student.name}? They will not be able to log in.`)) return;
    setDeactivateLoading(true);
    try {
      await axios.post(`${base}/api/admin/students/${id}/${action}`, {}, { headers });
      fetchData();
    } catch (err) {
      console.error(`Error ${action}ing student:`, err);
    } finally {
      setDeactivateLoading(false);
    }
  };

  // Assign package dialog
  const [availablePackages, setAvailablePackages] = useState<AvailablePackage[]>([]);
  const [showAssignPkg, setShowAssignPkg] = useState(false);
  const [assignForm, setAssignForm] = useState({ package_id: "", teacher_id: "" });
  const [assignLoading, setAssignLoading] = useState(false);
  const [assignError, setAssignError] = useState<string | null>(null);

  const openAssignPackage = async () => {
    setAssignForm({ package_id: "", teacher_id: "" });
    setAssignError(null);
    try {
      const res = await axios.get(`${base}/api/student/packages`, { headers });
      setAvailablePackages(Array.isArray(res.data) ? res.data.filter((p: AvailablePackage) => p) : []);
    } catch { /* silent */ }
    setShowAssignPkg(true);
  };

  const handleAssignPackage = async () => {
    if (!assignForm.package_id) return;
    setAssignLoading(true);
    setAssignError(null);
    try {
      await axios.post(`${base}/api/admin/students/${id}/assign-package`, {
        package_id: Number(assignForm.package_id),
        teacher_id: assignForm.teacher_id ? Number(assignForm.teacher_id) : null,
      }, { headers });
      setShowAssignPkg(false);
      fetchData();
    } catch (err: unknown) {
      const msg = (err as { response?: { data?: { message?: string } } })?.response?.data?.message || "Failed to assign package";
      setAssignError(msg);
    } finally {
      setAssignLoading(false);
    }
  };

  // Assign teacher to student (package-level + cascade to future bookings)
  const [showAssignTeacher, setShowAssignTeacher] = useState(false);
  const [assignTeacherIdVal, setAssignTeacherIdVal] = useState("");
  const [assignTeacherLoading, setAssignTeacherLoading] = useState(false);
  const [assignTeacherMsg, setAssignTeacherMsg] = useState<string | null>(null);

  const handleAssignStudentTeacher = async (teacherIdVal: string | null) => {
    setAssignTeacherLoading(true);
    setAssignTeacherMsg(null);
    try {
      const res = await axios.put(`${base}/api/admin/students/${id}/assign-teacher`, {
        teacher_id: teacherIdVal ? Number(teacherIdVal) : null,
      }, { headers });
      setAssignTeacherMsg(res.data.message);
      fetchData();
    } catch (err: unknown) {
      const msg = (err as { response?: { data?: { message?: string } } })?.response?.data?.message || "Failed to assign teacher";
      setAssignTeacherMsg(msg);
    } finally {
      setAssignTeacherLoading(false);
    }
  };

  // Teacher assignment (booking-level)
  const [assigningBookingId, setAssigningBookingId] = useState<number | null>(null);
  const [showBulkAssign, setShowBulkAssign] = useState(false);
  const [bulkTeacherId, setBulkTeacherId] = useState("");
  const [bulkLoading, setBulkLoading] = useState(false);
  const [bulkMsg, setBulkMsg] = useState<string | null>(null);

  const handleAssignTeacherToBooking = async (bookingId: number, teacherId: string) => {
    setAssigningBookingId(bookingId);
    try {
      await axios.put(`${base}/api/admin/bookings/${bookingId}/assign-teacher`, {
        teacher_id: teacherId ? Number(teacherId) : null,
      }, { headers });
      fetchData();
    } catch (err) {
      console.error("Error assigning teacher:", err);
    } finally {
      setAssigningBookingId(null);
    }
  };

  const handleBulkAssignTeacher = async () => {
    if (!bulkTeacherId) return;
    setBulkLoading(true);
    setBulkMsg(null);
    try {
      const res = await axios.post(`${base}/api/admin/students/${id}/bulk-assign-teacher`, {
        teacher_id: Number(bulkTeacherId),
      }, { headers });
      setBulkMsg(res.data.message);
      fetchData();
    } catch (err: unknown) {
      const msg = (err as { response?: { data?: { message?: string } } })?.response?.data?.message || "Failed";
      setBulkMsg(msg);
    } finally {
      setBulkLoading(false);
    }
  };

  // Edit student dialog
  const [showEdit, setShowEdit] = useState(false);
  const [editForm, setEditForm] = useState({ name: "", email: "", guardian_name: "", nationality: "", age: "" });
  const [editLoading, setEditLoading] = useState(false);
  const [editError, setEditError] = useState<string | null>(null);
  const [editSuccess, setEditSuccess] = useState(false);

  const openEdit = () => {
    if (!student) return;
    setEditForm({
      name: student.name,
      email: student.email,
      guardian_name: student.guardian_name || "",
      nationality: student.nationality || "",
      age: student.age ? String(student.age) : "",
    });
    setEditError(null);
    setEditSuccess(false);
    setShowEdit(true);
  };

  const handleEditStudent = async () => {
    setEditLoading(true);
    setEditError(null);
    setEditSuccess(false);
    try {
      await axios.put(`${base}/api/admin/students/${id}`, {
        name: editForm.name,
        email: editForm.email,
        guardian_name: editForm.guardian_name || null,
        nationality: editForm.nationality || null,
        age: editForm.age ? Number(editForm.age) : null,
      }, { headers });
      setEditSuccess(true);
      fetchData();
    } catch (err: unknown) {
      const msg = (err as { response?: { data?: { message?: string } } })?.response?.data?.message || "Failed to update student";
      setEditError(msg);
    } finally {
      setEditLoading(false);
    }
  };

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

  // Report view
  const [viewingReport, setViewingReport] = useState<ClassReport | null>(null);
  const [reportLoading, setReportLoading] = useState(false);

  const handleViewReport = async (bookingId: number) => {
    setReportLoading(true);
    try {
      const res = await axios.get<ClassReport>(`${base}/api/reports/booking/${bookingId}`, { headers });
      setViewingReport(res.data);
    } catch (err) {
      console.error("Error fetching report:", err);
    } finally {
      setReportLoading(false);
    }
  };

  // Add class dialog — weekly multi-day scheduler
  const [showAddClass, setShowAddClass] = useState(false);
  const [weekStart, setWeekStart] = useState(() => {
    const d = new Date();
    d.setDate(d.getDate() - d.getDay() + 1); // Monday
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, "0");
    const day = String(d.getDate()).padStart(2, "0");
    return `${y}-${m}-${day}`;
  });
  const [selectedSlots, setSelectedSlots] = useState<Record<string, string>>({}); // { "2026-03-30": "09:00", ... }
  const [addTeacherId, setAddTeacherId] = useState("");
  const [addLoading, setAddLoading] = useState(false);
  const [addError, setAddError] = useState<string | null>(null);
  const [addSuccess, setAddSuccess] = useState<string | null>(null);

  // Add class mode toggle + recurring schedule form
  const [addMode, setAddMode] = useState<"schedule" | "recurring">("schedule");
  const [recurringDays, setRecurringDays] = useState<string[]>([]);
  const [recurringTime, setRecurringTime] = useState("09:00");
  const [recurringWeeks, setRecurringWeeks] = useState("4");
  const [recurringStartDate, setRecurringStartDate] = useState("");
  const [recurringTeacherId, setRecurringTeacherId] = useState("");
  const [recurringResult, setRecurringResult] = useState<{
    error?: boolean; message?: string;
    sessions_booked?: number; sessions_remaining?: number;
    duration_minutes?: number; slots_per_class?: number;
    skipped_dates?: { date: string; reason: string }[];
  } | null>(null);
  const [recurringLoading, setRecurringLoading] = useState(false);
  const [recurringError, setRecurringError] = useState<string | null>(null);

  const toLocalIso = (d: Date) => {
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, "0");
    const day = String(d.getDate()).padStart(2, "0");
    return `${y}-${m}-${day}`;
  };

  const getWeekDays = (start: string) => {
    const days: { date: string; label: string; dayName: string }[] = [];
    const [sy, sm, sd] = start.split("-").map(Number);
    for (let i = 0; i < 7; i++) {
      const current = new Date(sy, sm - 1, sd + i);
      days.push({
        date: toLocalIso(current),
        label: current.toLocaleDateString("en-US", { month: "short", day: "numeric" }),
        dayName: current.toLocaleDateString("en-US", { weekday: "short" }),
      });
    }
    return days;
  };

  const shiftWeek = (dir: number) => {
    const [sy, sm, sd] = weekStart.split("-").map(Number);
    const d = new Date(sy, sm - 1, sd + dir * 7);
    setWeekStart(toLocalIso(d));
  };

  const toggleSlot = (date: string, time: string) => {
    setSelectedSlots((prev) => {
      const copy = { ...prev };
      if (copy[date] === time) {
        delete copy[date];
      } else {
        copy[date] = time;
      }
      return copy;
    });
  };

  const removeSlot = (date: string) => {
    setSelectedSlots((prev) => {
      const copy = { ...prev };
      delete copy[date];
      return copy;
    });
  };

  // Session adjustment dialog
  const [showAdjust, setShowAdjust] = useState<"add" | "deduct" | null>(null);
  const [adjustAmount, setAdjustAmount] = useState("1");
  const [adjustRemarks, setAdjustRemarks] = useState("");
  const [adjustLoading, setAdjustLoading] = useState(false);
  const [adjustError, setAdjustError] = useState<string | null>(null);
  const [adjustSuccess, setAdjustSuccess] = useState<string | null>(null);

  // Session adjustment history
  const [showAdjustHistory, setShowAdjustHistory] = useState(false);
  const [adjustHistory, setAdjustHistory] = useState<{ id: number; adjustment: number; remarks: string; created_at: string; adjusted_by_name: string }[]>([]);
  const [historyLoading, setHistoryLoading] = useState(false);

  const handleAdjustSessions = async () => {
    if (!activePackage || !adjustRemarks.trim()) return;
    setAdjustLoading(true);
    setAdjustError(null);
    setAdjustSuccess(null);
    try {
      const adj = showAdjust === "deduct" ? -Math.abs(Number(adjustAmount)) : Math.abs(Number(adjustAmount));
      const res = await axios.post(
        `${base}/api/admin/student-packages/${activePackage.id}/adjust-sessions`,
        { adjustment: adj, remarks: adjustRemarks.trim() },
        { headers }
      );
      setAdjustSuccess(res.data.message);
      fetchData();
      // Keep the dialog open briefly to show success, then close
      setTimeout(() => {
        setShowAdjust(null);
        setAdjustAmount("1");
        setAdjustRemarks("");
        setAdjustSuccess(null);
      }, 1500);
    } catch (err: unknown) {
      const msg = (err as { response?: { data?: { message?: string } } })?.response?.data?.message || "Failed to adjust sessions";
      setAdjustError(msg);
    } finally {
      setAdjustLoading(false);
    }
  };

  const fetchAdjustmentHistory = async () => {
    if (!activePackage) return;
    setHistoryLoading(true);
    try {
      const res = await axios.get(`${base}/api/admin/student-packages/${activePackage.id}/adjustments`, { headers });
      setAdjustHistory(res.data);
      setShowAdjustHistory(true);
    } catch (err) {
      console.error("Error fetching adjustment history:", err);
    } finally {
      setHistoryLoading(false);
    }
  };

  const fetchData = async () => {
    try {
      const [profileRes, teachersRes] = await Promise.all([
        axios.get(`${base}/api/admin/students/${id}`, { headers }),
        axios.get(`${base}/api/admin/teachers`, { headers }),
      ]);
      setStudent(profileRes.data.student);
      setActivePackage(profileRes.data.activePackage);
      setBookings(profileRes.data.bookings);
      setTeachers(teachersRes.data.map((t: Teacher) => ({ id: t.id, name: t.name })));
    } catch (err) {
      console.error("Error fetching student profile:", err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchData(); }, [id]);

  const handleCancelBooking = async (bookingId: number) => {
    setCancellingId(bookingId);
    try {
      await axios.post(`${base}/api/bookings/cancel/${bookingId}`, {}, { headers });
      fetchData();
    } catch (err) {
      console.error("Error cancelling booking:", err);
    } finally {
      setCancellingId(null);
    }
  };

  const handleAddClasses = async () => {
    if (!activePackage || Object.keys(selectedSlots).length === 0) return;
    setAddLoading(true);
    setAddError(null);
    setAddSuccess(null);
    const entries = Object.entries(selectedSlots).sort(([a], [b]) => a.localeCompare(b));
    let successCount = 0;
    const errors: string[] = [];
    for (const [date, time] of entries) {
      try {
        const appointmentDate = localToMysql(date, time);
        await axios.post(`${base}/api/admin/bookings`, {
          student_package_id: activePackage.id,
          appointment_date: appointmentDate,
          teacher_id: addTeacherId ? Number(addTeacherId) : null,
        }, { headers });
        successCount++;
      } catch (err: unknown) {
        const msg = (err as { response?: { data?: { message?: string } } })?.response?.data?.message || "Failed";
        errors.push(`${date} ${time}: ${msg}`);
      }
    }
    setAddLoading(false);
    if (successCount > 0) {
      setAddSuccess(`${successCount} class${successCount > 1 ? "es" : ""} scheduled successfully.`);
      setSelectedSlots({});
      fetchData();
    }
    if (errors.length > 0) {
      setAddError(errors.join("\n"));
    }
    if (errors.length === 0) {
      setTimeout(() => { setShowAddClass(false); setAddSuccess(null); }, 1200);
    }
  };

  const handleCreateRecurring = async () => {
    if (!activePackage || recurringDays.length === 0 || !recurringTime) return;
    setRecurringLoading(true);
    setRecurringError(null);
    setRecurringResult(null);
    try {
      const res = await axios.post(`${base}/api/recurring`, {
        student_package_id: activePackage.id,
        teacher_id: recurringTeacherId ? Number(recurringTeacherId) : undefined,
        days_of_week: recurringDays,
        start_time: recurringTime,
        num_weeks: parseInt(recurringWeeks) || 4,
        start_date: recurringStartDate || undefined,
      }, { headers });
      setRecurringResult(res.data);
      fetchData();
    } catch (err: unknown) {
      const data = (err as { response?: { data?: { message?: string; skipped_dates?: { date: string; reason: string }[] } } })?.response?.data;
      if (data?.skipped_dates) {
        setRecurringResult({ error: true, message: data.message, skipped_dates: data.skipped_dates });
      } else {
        setRecurringError(data?.message || "Failed to create recurring schedule");
      }
    } finally {
      setRecurringLoading(false);
    }
  };

  const resetAddClassDialog = () => {
    setShowAddClass(false);
    setAddError(null);
    setAddSuccess(null);
    setAddMode("schedule");
    setRecurringDays([]);
    setRecurringTime("09:00");
    setRecurringWeeks("4");
    setRecurringStartDate("");
    setRecurringTeacherId("");
    setRecurringResult(null);
    setRecurringError(null);
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  if (!student) {
    return (
      <>
        <NavBar />
        <div className="max-w-4xl mx-auto px-4 py-8">
          <p className="text-muted-foreground">Student not found.</p>
        </div>
      </>
    );
  }

  return (
    <>
      <NavBar />
      <div className="max-w-5xl mx-auto px-4 py-8 space-y-6 brand-gradient-subtle pattern-dots-light min-h-screen">
        {/* Back button */}
        <Button variant="ghost" className="gap-2 -ml-2" onClick={() => navigate("/students")}>
          <ArrowLeft className="h-4 w-4" /> Back to Students
        </Button>

        {/* Student Info */}
        <Card className="glow-card border-0 rounded-2xl">
          <CardHeader className="flex flex-row items-center justify-between">
            <CardTitle className="flex items-center gap-2">
              <User className="h-5 w-5 text-primary" />
              Student Profile
            </CardTitle>
            <div className="flex gap-2">
              <Button size="sm" variant="outline" className="gap-1" onClick={openEdit}>
                <Pencil className="h-4 w-4" /> Edit
              </Button>
              <Button size="sm" variant="outline" className="gap-1"
                onClick={() => { setShowResetPw(true); setResetPw(""); setResetPwMsg(null); }}>
                <KeyRound className="h-4 w-4" /> Reset Password
              </Button>
              <Button
                size="sm"
                variant={student.is_active ? "destructive" : "default"}
                className="gap-1"
                onClick={handleToggleActive}
                disabled={deactivateLoading}
              >
                {deactivateLoading
                  ? <Loader2 className="h-4 w-4 animate-spin" />
                  : student.is_active ? "Deactivate" : "Reactivate"}
              </Button>
            </div>
          </CardHeader>
          <CardContent className="grid grid-cols-2 sm:grid-cols-3 gap-4 text-sm">
            <div>
              <p className="text-xs text-muted-foreground">Full Name</p>
              <p className="font-semibold">{student.name}</p>
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Email</p>
              <p className="font-medium">{student.email}</p>
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Guardian</p>
              <p className="font-medium">{student.guardian_name || "—"}</p>
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Nationality</p>
              <p className="font-medium">{student.nationality || "—"}</p>
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Age</p>
              <p className="font-medium">{student.age || "—"}</p>
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Enrolled</p>
              <p className="font-medium">{fmtDateOnly(student.created_at)}</p>
            </div>
          </CardContent>
        </Card>

        {/* Active Package */}
        {activePackage ? (
          <Card className="glow-card border-0 rounded-2xl">
            <CardHeader className="flex flex-row items-center justify-between">
              <CardTitle className="flex items-center gap-2">
                <Package className="h-5 w-5 text-primary" />
                Active Package
              </CardTitle>
              <div className="flex gap-2">
                <Button size="sm" variant="outline" className="gap-1 text-xs" onClick={openAssignPackage}>
                  <Plus className="h-3.5 w-3.5" /> Assign New Package
                </Button>
                <Button size="sm" variant="ghost" className="gap-1 text-xs" onClick={fetchAdjustmentHistory} disabled={historyLoading}>
                  <History className="h-3.5 w-3.5" /> Adjustment History
                </Button>
              </div>
            </CardHeader>
            <CardContent className="space-y-4 text-sm">
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
                <div>
                  <p className="text-xs text-muted-foreground">Package</p>
                  <p className="font-semibold">{activePackage.package_name}</p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">Subject</p>
                  <p className="font-medium">{activePackage.subject || "—"}</p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">Sessions</p>
                  <div className="flex items-center gap-2 mt-0.5 flex-wrap">
                    <Badge variant={activePackage.unused_sessions > 0 ? "default" : "destructive"}>
                      {activePackage.unused_sessions} remaining
                    </Badge>
                    {activePackage.sessions_remaining !== activePackage.unused_sessions && (
                      <Badge variant="outline" className="text-muted-foreground">
                        {activePackage.sessions_remaining} available to book
                      </Badge>
                    )}
                    <Button
                      size="icon"
                      variant="ghost"
                      className="h-6 w-6 text-green-600 hover:text-green-700 hover:bg-green-50"
                      title="Add sessions"
                      onClick={() => { setShowAdjust("add"); setAdjustAmount("1"); setAdjustRemarks(""); setAdjustError(null); setAdjustSuccess(null); }}
                    >
                      <PlusCircle className="h-4 w-4" />
                    </Button>
                    <Button
                      size="icon"
                      variant="ghost"
                      className="h-6 w-6 text-red-600 hover:text-red-700 hover:bg-red-50"
                      title="Deduct sessions"
                      onClick={() => { setShowAdjust("deduct"); setAdjustAmount("1"); setAdjustRemarks(""); setAdjustError(null); setAdjustSuccess(null); }}
                    >
                      <MinusCircle className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">Payment</p>
                  <Badge variant={activePackage.payment_status === "paid" ? "secondary" : "outline"}
                    className={activePackage.payment_status === "paid" ? "bg-green-100 text-green-700" : ""}>
                    {activePackage.payment_status}
                  </Badge>
                </div>
              </div>

              {/* Assigned Teacher row */}
              <div className="flex items-center justify-between pt-1 border-t">
                <div className="flex items-center gap-2">
                  <UserCheck className="h-4 w-4 text-muted-foreground" />
                  <span className="text-xs text-muted-foreground">Assigned Teacher:</span>
                  {activePackage.teacher_id ? (
                    <span className="font-semibold text-sm">
                      {teachers.find(t => t.id === activePackage.teacher_id)?.name || `Teacher #${activePackage.teacher_id}`}
                    </span>
                  ) : (
                    <span className="text-muted-foreground italic text-xs">None — student sees general schedule</span>
                  )}
                </div>
                <div className="flex gap-2">
                  <Button
                    size="sm"
                    variant="outline"
                    className="h-7 text-xs gap-1"
                    onClick={() => { setAssignTeacherIdVal(activePackage.teacher_id ? String(activePackage.teacher_id) : ""); setAssignTeacherMsg(null); setShowAssignTeacher(true); }}
                  >
                    <UserCheck className="h-3.5 w-3.5" />
                    {activePackage.teacher_id ? "Change" : "Assign Teacher"}
                  </Button>
                  {activePackage.teacher_id && (
                    <Button
                      size="sm"
                      variant="ghost"
                      className="h-7 text-xs text-muted-foreground gap-1 hover:text-destructive"
                      disabled={assignTeacherLoading}
                      onClick={() => handleAssignStudentTeacher(null)}
                    >
                      {assignTeacherLoading ? <Loader2 className="h-3 w-3 animate-spin" /> : <X className="h-3.5 w-3.5" />}
                      Remove
                    </Button>
                  )}
                </div>
              </div>
            </CardContent>
          </Card>
        ) : (
          <Card className="glow-card border-0 rounded-2xl">
            <CardContent className="py-6 text-center text-sm text-muted-foreground">
              <Package className="h-8 w-8 mx-auto mb-2 text-muted-foreground/50" />
              <p className="mb-3">No active package</p>
              <Button size="sm" className="gap-1" onClick={openAssignPackage}>
                <Plus className="h-4 w-4" /> Assign Package
              </Button>
            </CardContent>
          </Card>
        )}

        {/* Booking History */}
        <Card className="glow-card border-0 rounded-2xl">
          <CardHeader className="flex flex-row items-center justify-between">
            <CardTitle className="flex items-center gap-2">
              <CalendarDays className="h-5 w-5 text-primary" />
              Class History
            </CardTitle>
            {activePackage && (
              <div className="flex gap-2">
                {/* Bulk assign only shown when no package-level teacher is set */}
                {!activePackage.teacher_id && (
                  <Button size="sm" variant="outline" className="gap-1" onClick={() => { setBulkTeacherId(""); setBulkMsg(null); setShowBulkAssign(true); }}>
                    <Users className="h-4 w-4" /> Bulk Assign Classes
                  </Button>
                )}
                <Button size="sm" className="gap-1" onClick={() => { setSelectedSlots({}); resetAddClassDialog(); setShowAddClass(true); }}>
                  <Plus className="h-4 w-4" /> Add Class
                </Button>
              </div>
            )}
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow className="brand-gradient-subtle">
                  <TableHead>Date & Time</TableHead>
                  <TableHead>Teacher</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Attendance</TableHead>
                  <TableHead>Report</TableHead>
                  <TableHead></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {bookings.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={6} className="text-center text-muted-foreground text-sm py-10">
                      No classes found
                    </TableCell>
                  </TableRow>
                ) : (
                  bookings.map((b) => (
                    <TableRow key={b.id}>
                      <TableCell className="text-sm">
                        {fmtDate(b.appointment_date, "MMM d, yyyy h:mm a")}
                      </TableCell>
                      <TableCell className="text-sm">
                        {(b.status === "pending" || b.status === "confirmed") ? (
                          <Select
                            value={b.teacher_id ? String(b.teacher_id) : "unassigned"}
                            onValueChange={(v) => handleAssignTeacherToBooking(b.id, v === "unassigned" ? "" : v)}
                            disabled={assigningBookingId === b.id}
                          >
                            <SelectTrigger className={`h-7 text-xs w-32 ${!b.teacher_name ? "border-amber-300 bg-amber-50" : ""}`}>
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="unassigned">
                                <span className="text-muted-foreground">Unassigned</span>
                              </SelectItem>
                              {teachers.map((t) => (
                                <SelectItem key={t.id} value={String(t.id)}>{t.name}</SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        ) : (
                          b.teacher_name || "—"
                        )}
                      </TableCell>
                      <TableCell>
                        <span className={`text-xs px-2 py-1 rounded-full font-medium ${statusColors[b.status] || "bg-gray-100 text-gray-700"}`}>
                          {b.status}
                        </span>
                      </TableCell>
                      <TableCell>
                        {b.student_absent && (
                          <span className="text-xs px-2 py-1 rounded-full font-medium bg-orange-100 text-orange-700 mr-1">
                            Student Absent
                          </span>
                        )}
                        {b.teacher_absent && (
                          <span className="text-xs px-2 py-1 rounded-full font-medium bg-red-100 text-red-700">
                            Teacher Absent
                          </span>
                        )}
                        {!b.student_absent && !b.teacher_absent && (
                          <span className="text-muted-foreground text-xs">—</span>
                        )}
                      </TableCell>
                      <TableCell>
                        {b.has_report ? (
                          <Button
                            size="sm"
                            variant="ghost"
                            className="h-7 px-2 text-xs text-green-700 hover:text-green-800 hover:bg-green-50"
                            disabled={reportLoading}
                            onClick={() => handleViewReport(b.id)}
                          >
                            <FileText className="h-3 w-3 mr-1" /> View
                          </Button>
                        ) : (
                          <span className="text-xs text-muted-foreground">—</span>
                        )}
                      </TableCell>
                      <TableCell>
                        {(b.status === "pending" || b.status === "confirmed") && (
                          <Button
                            size="sm"
                            variant="ghost"
                            className="text-xs h-7 text-destructive hover:text-destructive"
                            disabled={cancellingId === b.id}
                            onClick={() => handleCancelBooking(b.id)}
                          >
                            {cancellingId === b.id ? <Loader2 className="h-3 w-3 animate-spin" /> : "Cancel"}
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
      </div>

      {/* Edit Student Dialog */}
      <Dialog open={showEdit} onOpenChange={(o) => { if (!o) setShowEdit(false); }}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>Edit Student</DialogTitle>
          </DialogHeader>
          <div className="space-y-3 py-2">
            {editError && <p className="text-sm text-destructive">{editError}</p>}
            {editSuccess && <p className="text-sm text-green-600">Student updated successfully.</p>}
            <div className="space-y-1.5">
              <Label>Full Name <span className="text-destructive">*</span></Label>
              <Input value={editForm.name} onChange={(e) => setEditForm((f) => ({ ...f, name: e.target.value }))} />
            </div>
            <div className="space-y-1.5">
              <Label>Email <span className="text-destructive">*</span></Label>
              <Input type="email" value={editForm.email} onChange={(e) => setEditForm((f) => ({ ...f, email: e.target.value }))} />
            </div>
            <div className="space-y-1.5">
              <Label>Guardian Name</Label>
              <Input value={editForm.guardian_name} onChange={(e) => setEditForm((f) => ({ ...f, guardian_name: e.target.value }))} placeholder="Optional" />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>Nationality</Label>
                <Input value={editForm.nationality} onChange={(e) => setEditForm((f) => ({ ...f, nationality: e.target.value }))} placeholder="Optional" />
              </div>
              <div className="space-y-1.5">
                <Label>Age</Label>
                <Input type="number" min="1" max="100" value={editForm.age} onChange={(e) => setEditForm((f) => ({ ...f, age: e.target.value }))} placeholder="Optional" />
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowEdit(false)}>Cancel</Button>
            <Button onClick={handleEditStudent} disabled={editLoading || !editForm.name || !editForm.email}>
              {editLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : "Save Changes"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Reset Password Dialog */}
      <Dialog open={showResetPw} onOpenChange={(o) => { if (!o) setShowResetPw(false); }}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>Reset Student Password</DialogTitle>
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
            <Button
              onClick={handleResetPassword}
              disabled={resetPwLoading || resetPw.length < 6}
            >
              {resetPwLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : "Reset"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Class Report Dialog */}
      <Dialog open={!!viewingReport} onOpenChange={(o) => { if (!o) setViewingReport(null); }}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Class Report</DialogTitle>
          </DialogHeader>
          {viewingReport && (
            <div className="space-y-3 text-sm py-1">
              <div className="flex justify-between text-xs text-muted-foreground">
                <span>{viewingReport.teacher_name ? `Teacher: ${viewingReport.teacher_name}` : ""}</span>
                <span>{fmtDateOnly(viewingReport.appointment_date)}</span>
              </div>
              {[
                { label: "New Words", value: viewingReport.new_words },
                { label: "Sentences", value: viewingReport.sentences },
                { label: "Notes", value: viewingReport.notes },
                { label: "Remarks", value: viewingReport.remarks },
              ].map(({ label, value }) => (
                <div key={label}>
                  <p className="text-xs font-medium text-muted-foreground mb-0.5">{label}</p>
                  <p className="bg-muted/40 rounded p-2 text-sm">{value || "—"}</p>
                </div>
              ))}
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setViewingReport(null)}>Close</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Add Class Dialog — mode toggle: One by One | Recurring Schedule */}
      <Dialog open={showAddClass} onOpenChange={(o) => { if (!o) resetAddClassDialog(); }}>
        <DialogContent className="sm:max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Schedule Classes</DialogTitle>
          </DialogHeader>

          {/* Mode toggle */}
          <div className="flex gap-1 bg-muted rounded-lg p-1">
            <button
              onClick={() => { setAddMode("schedule"); setRecurringResult(null); setRecurringError(null); }}
              className={`flex-1 py-1.5 text-xs font-medium rounded-md transition-colors ${addMode === "schedule" ? "bg-white shadow-sm text-foreground" : "text-muted-foreground hover:text-foreground"}`}
            >
              One by One
            </button>
            <button
              onClick={() => { setAddMode("recurring"); setAddError(null); setAddSuccess(null); }}
              className={`flex-1 py-1.5 text-xs font-medium rounded-md transition-colors ${addMode === "recurring" ? "bg-white shadow-sm text-foreground" : "text-muted-foreground hover:text-foreground"}`}
            >
              Recurring Schedule
            </button>
          </div>

          {addMode === "schedule" ? (
            <>
              <div className="space-y-4 py-2">
                {addError && <p className="text-sm text-destructive whitespace-pre-line">{addError}</p>}
                {addSuccess && <p className="text-sm text-green-600">{addSuccess}</p>}

                {/* Teacher selector */}
                <div className="space-y-1.5">
                  <Label>Teacher (applies to all)</Label>
                  <Select value={addTeacherId} onValueChange={setAddTeacherId}>
                    <SelectTrigger><SelectValue placeholder="Select teacher (optional)" /></SelectTrigger>
                    <SelectContent>
                      {teachers.map((t) => (
                        <SelectItem key={t.id} value={String(t.id)}>{t.name}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                {/* Week navigation */}
                <div className="flex items-center justify-between">
                  <Button variant="ghost" size="sm" onClick={() => shiftWeek(-1)}>
                    <ArrowLeft className="h-4 w-4" />
                  </Button>
                  <span className="text-sm font-medium">
                    {(() => {
                      const days = getWeekDays(weekStart);
                      return `${days[0].label} — ${days[6].label}`;
                    })()}
                  </span>
                  <Button variant="ghost" size="sm" onClick={() => shiftWeek(1)}>
                    <ArrowLeft className="h-4 w-4 rotate-180" />
                  </Button>
                </div>

                {/* Week grid */}
                <div className="grid grid-cols-7 gap-1.5">
                  {getWeekDays(weekStart).map((day) => {
                    const isSelected = day.date in selectedSlots;
                    const now = new Date();
                    const todayIso = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
                    const isPast = day.date < todayIso;
                    return (
                      <div key={day.date} className="text-center">
                        <p className="text-[10px] text-muted-foreground font-medium">{day.dayName}</p>
                        <button
                          disabled={isPast}
                          onClick={() => {
                            if (isSelected) removeSlot(day.date);
                            else toggleSlot(day.date, "09:00");
                          }}
                          className={`w-full rounded-lg py-2 text-xs font-medium transition-colors ${
                            isPast
                              ? "bg-gray-50 text-gray-300 cursor-not-allowed"
                              : isSelected
                                ? "bg-primary text-white"
                                : "bg-muted/50 hover:bg-primary/10 text-gray-700"
                          }`}
                        >
                          {day.label}
                        </button>
                      </div>
                    );
                  })}
                </div>

                {/* Selected slots with time pickers */}
                {Object.keys(selectedSlots).length > 0 && (
                  <div className="space-y-2 border rounded-lg p-3 bg-muted/30">
                    <p className="text-xs font-medium text-muted-foreground">Selected classes — pick a time for each:</p>
                    {Object.entries(selectedSlots)
                      .sort(([a], [b]) => a.localeCompare(b))
                      .map(([date, time]) => {
                        const [yy, mm, dd] = date.split("-").map(Number);
                        const label = new Date(yy, mm - 1, dd).toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" });
                        return (
                          <div key={date} className="flex items-center gap-2">
                            <span className="text-sm font-medium w-28 shrink-0">{label}</span>
                            <Select value={time} onValueChange={(v) => toggleSlot(date, v)}>
                              <SelectTrigger className="h-8 text-xs flex-1">
                                <SelectValue />
                              </SelectTrigger>
                              <SelectContent className="max-h-60">
                                {TIME_SLOTS.map((t) => {
                                  const [hStr, mStr] = t.split(":");
                                  const h = Number(hStr);
                                  const suffix = h >= 12 ? "PM" : "AM";
                                  const h12 = h % 12 === 0 ? 12 : h % 12;
                                  return <SelectItem key={t} value={t}>{`${h12}:${mStr} ${suffix}`}</SelectItem>;
                                })}
                              </SelectContent>
                            </Select>
                            <Button variant="ghost" size="icon" className="h-7 w-7 text-destructive shrink-0" onClick={() => removeSlot(date)}>
                              ×
                            </Button>
                          </div>
                        );
                      })}
                  </div>
                )}
              </div>
              <DialogFooter>
                <Button variant="outline" onClick={resetAddClassDialog}>Cancel</Button>
                <Button onClick={handleAddClasses} disabled={addLoading || Object.keys(selectedSlots).length === 0}>
                  {addLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : `Schedule ${Object.keys(selectedSlots).length} Class${Object.keys(selectedSlots).length !== 1 ? "es" : ""}`}
                </Button>
              </DialogFooter>
            </>
          ) : (
            <>
              {!recurringResult ? (
                <div className="space-y-4 py-2">
                  {recurringError && <p className="text-sm text-destructive">{recurringError}</p>}

                  {/* Teacher */}
                  <div className="space-y-1.5">
                    <Label>Teacher</Label>
                    <Select value={recurringTeacherId} onValueChange={setRecurringTeacherId}>
                      <SelectTrigger><SelectValue placeholder="Select teacher (optional)" /></SelectTrigger>
                      <SelectContent>
                        {teachers.map((t) => (
                          <SelectItem key={t.id} value={String(t.id)}>{t.name}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <p className="text-xs text-muted-foreground">Leave blank to use the student's assigned teacher.</p>
                  </div>

                  {/* Days of week */}
                  <div className="space-y-1.5">
                    <Label>Days of Week</Label>
                    <div className="flex flex-wrap gap-2 mt-1">
                      {DAYS_OF_WEEK.map((day) => (
                        <button
                          key={day}
                          type="button"
                          onClick={() => setRecurringDays((prev) =>
                            prev.includes(day) ? prev.filter((d) => d !== day) : [...prev, day]
                          )}
                          className={`px-3 py-1.5 text-xs rounded-full border transition-colors ${
                            recurringDays.includes(day)
                              ? "bg-primary text-white border-primary"
                              : "bg-white text-gray-700 border-gray-300 hover:border-primary/50"
                          }`}
                        >
                          {day.substring(0, 3)}
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* Start time & weeks */}
                  <div className="grid grid-cols-2 gap-3">
                    <div className="space-y-1.5">
                      <Label>Start Time</Label>
                      <Input type="time" value={recurringTime} onChange={(e) => setRecurringTime(e.target.value)} />
                    </div>
                    <div className="space-y-1.5">
                      <Label>Weeks (1–12)</Label>
                      <Input type="number" min={1} max={12} value={recurringWeeks} onChange={(e) => setRecurringWeeks(e.target.value)} />
                    </div>
                  </div>

                  {/* Start date */}
                  <div className="space-y-1.5">
                    <Label>Start Date <span className="text-muted-foreground font-normal">(optional — defaults to tomorrow)</span></Label>
                    <Input type="date" value={recurringStartDate} onChange={(e) => setRecurringStartDate(e.target.value)} />
                  </div>

                  {/* Preview */}
                  {activePackage && recurringDays.length > 0 && (
                    <div className="p-3 bg-primary/5 border border-primary/20 rounded-lg text-sm space-y-1">
                      <p><strong>Preview:</strong> ~{recurringDays.length * (parseInt(recurringWeeks) || 4)} classes over {recurringWeeks} weeks</p>
                      <p>Sessions available: <strong>{activePackage.sessions_remaining}</strong></p>
                      {recurringDays.length * (parseInt(recurringWeeks) || 4) > activePackage.sessions_remaining && (
                        <p className="text-amber-600 flex items-center gap-1">
                          <AlertTriangle className="h-3 w-3" /> May not have enough sessions
                        </p>
                      )}
                    </div>
                  )}

                  <DialogFooter>
                    <Button variant="outline" onClick={resetAddClassDialog}>Cancel</Button>
                    <Button
                      onClick={handleCreateRecurring}
                      disabled={recurringLoading || recurringDays.length === 0 || !recurringTime}
                    >
                      {recurringLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : "Create Recurring Schedule"}
                    </Button>
                  </DialogFooter>
                </div>
              ) : (
                <div className="space-y-4 py-2">
                  {recurringResult.error ? (
                    <div className="p-3 bg-red-50 border border-red-200 rounded-lg">
                      <p className="text-red-700 font-medium">{recurringResult.message}</p>
                    </div>
                  ) : (
                    <div className="p-3 bg-green-50 border border-green-200 rounded-lg space-y-1">
                      <p className="text-green-700 font-medium flex items-center gap-1.5">
                        <CheckCircle className="h-4 w-4" /> Recurring schedule created!
                      </p>
                      <p className="text-sm">{recurringResult.sessions_booked} classes booked</p>
                      <p className="text-sm">Sessions remaining: {recurringResult.sessions_remaining}</p>
                    </div>
                  )}
                  {recurringResult.skipped_dates && recurringResult.skipped_dates.length > 0 && (
                    <div>
                      <p className="text-sm font-medium text-amber-600 mb-1 flex items-center gap-1">
                        <AlertTriangle className="h-3.5 w-3.5" /> Skipped dates:
                      </p>
                      <div className="max-h-36 overflow-y-auto space-y-1 border rounded-lg p-2">
                        {recurringResult.skipped_dates.map((s, i) => (
                          <div key={i} className="text-xs flex gap-2">
                            <span className="font-mono text-gray-600">{s.date}</span>
                            <span className="text-amber-600">{s.reason}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                  <DialogFooter>
                    <Button onClick={resetAddClassDialog}>Done</Button>
                  </DialogFooter>
                </div>
              )}
            </>
          )}
        </DialogContent>
      </Dialog>

      {/* Session Adjustment Dialog */}
      <Dialog open={!!showAdjust} onOpenChange={(o) => { if (!o) { setShowAdjust(null); setAdjustSuccess(null); } }}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>
              {showAdjust === "add" ? "Add Sessions" : "Deduct Sessions"}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-3 py-2">
            {adjustError && <p className="text-sm text-destructive">{adjustError}</p>}
            {adjustSuccess && <p className="text-sm text-green-600">{adjustSuccess}</p>}

            <div className="space-y-1.5">
              <Label>
                Number of sessions to {showAdjust === "add" ? "add" : "deduct"} <span className="text-destructive">*</span>
              </Label>
              <Input
                type="number"
                min="1"
                max="100"
                value={adjustAmount}
                onChange={(e) => setAdjustAmount(e.target.value)}
              />
            </div>

            <div className="space-y-1.5">
              <Label>Remarks <span className="text-destructive">*</span></Label>
              <Textarea
                placeholder={showAdjust === "add"
                  ? "e.g. Bonus sessions for referral, compensating for cancelled class..."
                  : "e.g. Penalty for no-show, correction of incorrect session count..."}
                value={adjustRemarks}
                onChange={(e) => setAdjustRemarks(e.target.value)}
                rows={3}
              />
              <p className="text-xs text-muted-foreground">
                This note will be included in the notification sent to the student.
              </p>
            </div>

            {activePackage && (
              <div className="bg-muted/50 rounded-lg p-3 text-sm">
                <p className="text-muted-foreground">Remaining sessions: <strong>{activePackage.unused_sessions}</strong></p>
                <p className="text-muted-foreground">Available to book: <strong>{activePackage.sessions_remaining}</strong></p>
                <p className="text-muted-foreground">
                  After adjustment (available to book): <strong>
                    {showAdjust === "add"
                      ? activePackage.sessions_remaining + Math.abs(Number(adjustAmount) || 0)
                      : Math.max(0, activePackage.sessions_remaining - Math.abs(Number(adjustAmount) || 0))}
                  </strong>
                </p>
              </div>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowAdjust(null)}>Cancel</Button>
            <Button
              onClick={handleAdjustSessions}
              disabled={adjustLoading || !adjustRemarks.trim() || !adjustAmount || Number(adjustAmount) < 1}
              variant={showAdjust === "deduct" ? "destructive" : "default"}
            >
              {adjustLoading ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                showAdjust === "add" ? "Add Sessions" : "Deduct Sessions"
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Assign Teacher to Student (package-level + cascade) */}
      <Dialog open={showAssignTeacher} onOpenChange={(o) => { if (!o) { setShowAssignTeacher(false); setAssignTeacherMsg(null); } }}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <UserCheck className="h-5 w-5" /> Assign Teacher to Student
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-3 py-2">
            <p className="text-sm text-muted-foreground">
              This assigns a teacher permanently to this student. The student will only see that teacher's schedule, and all existing future classes will be reassigned to this teacher (classes where the teacher is unavailable will be skipped).
            </p>
            {assignTeacherMsg && (
              <p className={`text-sm ${assignTeacherMsg.toLowerCase().includes("fail") || assignTeacherMsg.toLowerCase().includes("error") ? "text-destructive" : "text-green-600"}`}>
                {assignTeacherMsg}
              </p>
            )}
            <div className="space-y-1.5">
              <Label>Teacher <span className="text-destructive">*</span></Label>
              <Select value={assignTeacherIdVal} onValueChange={setAssignTeacherIdVal}>
                <SelectTrigger><SelectValue placeholder="Select teacher" /></SelectTrigger>
                <SelectContent>
                  {teachers.map((t) => (
                    <SelectItem key={t.id} value={String(t.id)}>{t.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => { setShowAssignTeacher(false); setAssignTeacherMsg(null); }}>
              {assignTeacherMsg ? "Close" : "Cancel"}
            </Button>
            {!assignTeacherMsg && (
              <Button onClick={() => handleAssignStudentTeacher(assignTeacherIdVal)} disabled={assignTeacherLoading || !assignTeacherIdVal}>
                {assignTeacherLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : "Assign Teacher"}
              </Button>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Bulk Assign Teacher Dialog */}
      <Dialog open={showBulkAssign} onOpenChange={(o) => { if (!o) setShowBulkAssign(false); }}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Users className="h-5 w-5" /> Bulk Assign Teacher to Unassigned Classes
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-3 py-2">
            <p className="text-sm text-muted-foreground">
              Select a teacher to assign to all <strong>unassigned upcoming classes</strong> for this student.
              Classes where the teacher is unavailable (on leave, slot closed, or already booked) will be skipped.
              To assign a teacher to the student permanently, use the <strong>Assign Teacher</strong> option in the package card above.
            </p>
            {bulkMsg && (
              <p className={`text-sm ${bulkMsg.includes("Failed") ? "text-destructive" : "text-green-600"}`}>{bulkMsg}</p>
            )}
            <div className="space-y-1.5">
              <Label>Teacher <span className="text-destructive">*</span></Label>
              <Select value={bulkTeacherId} onValueChange={setBulkTeacherId}>
                <SelectTrigger><SelectValue placeholder="Select teacher" /></SelectTrigger>
                <SelectContent>
                  {teachers.map((t) => (
                    <SelectItem key={t.id} value={String(t.id)}>{t.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowBulkAssign(false)}>Cancel</Button>
            <Button onClick={handleBulkAssignTeacher} disabled={bulkLoading || !bulkTeacherId}>
              {bulkLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : "Assign to All"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Assign Package Dialog */}
      <Dialog open={showAssignPkg} onOpenChange={(o) => { if (!o) setShowAssignPkg(false); }}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>Assign Package to Student</DialogTitle>
          </DialogHeader>
          <div className="space-y-3 py-2">
            {assignError && <p className="text-sm text-destructive">{assignError}</p>}
            <div className="space-y-1.5">
              <Label>Package <span className="text-destructive">*</span></Label>
              <Select value={assignForm.package_id} onValueChange={(v) => setAssignForm((f) => ({ ...f, package_id: v }))}>
                <SelectTrigger><SelectValue placeholder="Select a package" /></SelectTrigger>
                <SelectContent>
                  {availablePackages.map((p) => (
                    <SelectItem key={p.id} value={String(p.id)}>
                      {p.package_name} — {p.session_limit} sessions{p.subject ? ` (${p.subject})` : ""}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Assign Teacher (optional)</Label>
              <Select value={assignForm.teacher_id} onValueChange={(v) => setAssignForm((f) => ({ ...f, teacher_id: v }))}>
                <SelectTrigger><SelectValue placeholder="Select teacher" /></SelectTrigger>
                <SelectContent>
                  {teachers.map((t) => (
                    <SelectItem key={t.id} value={String(t.id)}>{t.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowAssignPkg(false)}>Cancel</Button>
            <Button onClick={handleAssignPackage} disabled={assignLoading || !assignForm.package_id}>
              {assignLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : "Assign Package"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Session Adjustment History Dialog */}
      <Dialog open={showAdjustHistory} onOpenChange={(o) => { if (!o) setShowAdjustHistory(false); }}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <History className="h-5 w-5" /> Session Adjustment History
            </DialogTitle>
          </DialogHeader>
          <div className="max-h-80 overflow-y-auto">
            {adjustHistory.length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-6">No adjustments have been made yet.</p>
            ) : (
              <div className="space-y-3">
                {adjustHistory.map((entry) => (
                  <div key={entry.id} className="border rounded-lg p-3 text-sm">
                    <div className="flex items-center justify-between mb-1">
                      <span className={`font-semibold ${entry.adjustment > 0 ? "text-green-600" : "text-red-600"}`}>
                        {entry.adjustment > 0 ? `+${entry.adjustment}` : entry.adjustment} session(s)
                      </span>
                      <span className="text-xs text-muted-foreground">
                        {fmtDate(entry.created_at, "MMM d, yyyy h:mm a")}
                      </span>
                    </div>
                    <p className="text-muted-foreground text-xs mb-1">By: {entry.adjusted_by_name}</p>
                    <p className="bg-muted/40 rounded p-2 text-sm">{entry.remarks}</p>
                  </div>
                ))}
              </div>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowAdjustHistory(false)}>Close</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
};

export default AdminStudentProfilePage;
