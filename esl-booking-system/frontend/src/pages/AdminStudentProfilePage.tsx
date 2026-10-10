import { useState, useEffect, useContext } from "react";
import { useParams, useNavigate } from "react-router-dom";
import axios from "axios";
import NavBar from "@/components/Navbar";
import AuthContext from "@/context/AuthContext";
import { usePermissions } from "@/context/PermissionsContext";
import { AdminTour } from "@/components/AdminTour";
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
import {
  ArrowLeft, User, Package, CalendarDays, Loader2, Plus, FileText, KeyRound, Eye, EyeOff, Pencil, PlusCircle, MinusCircle, History, Users, UserCheck, X, CheckCircle, AlertTriangle, TrendingUp, TrendingDown, Download,
} from "lucide-react";
import { fmtDate, fmtDateOnly, localToMysql } from "@/utils/timezone";
import { downloadReportImage } from "@/utils/reportImage";
import TablePagination from "@/components/TablePagination";
import SessionAdjustDialog from "@/components/SessionAdjustDialog";
import { StudentPackagePicker } from "@/components/StudentPackagePicker";

interface PackageHistory {
  id: number;
  package_name: string;
  subject: string | null;
  session_limit: number;
  sessions_remaining: number;
  price: number;
  currency: string;
  duration_minutes: number;
  payment_status: "unpaid" | "paid" | "rejected";
  purchased_at: string;
}

interface SessionAdjustment {
  id: number;
  student_package_id: number;
  adjustment: number;
  remarks: string;
  created_at: string;
  adjusted_by_name: string;
}

type RecordTimelineItem =
  | { kind: "package"; date: string; data: PackageHistory }
  | { kind: "adjustment"; date: string; data: SessionAdjustment };

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
  /** The student who owns the package — differs from this profile when it's a sibling's shared package */
  owner_id: number;
  owner_name: string;
  /** Other students the package is shared with */
  members: { id: number; name: string }[];
}

interface BookingRecord {
  id: number;
  appointment_date: string;
  status: string;
  class_mode: string | null;
  meeting_link: string | null;
  student_absent: boolean;
  teacher_absent: boolean;
  /** Set when the absence was a late notice (half credit) — see utils/halfCredits.js */
  absence_notice_at?: string | null;
  teacher_id: number | null;
  teacher_name: string | null;
  has_report: boolean;
  booking_group_id: string | null;
  recurring_schedule_id: number | null;
  slot_count?: number;
}

function groupBookings(rows: BookingRecord[]): BookingRecord[] {
  // rows arrive ASC so the earliest slot is seen first — that becomes the representative row
  const groups = new Map<string, BookingRecord>();
  for (const row of rows) {
    const key = row.booking_group_id || `solo_${row.id}`;
    if (!groups.has(key)) {
      groups.set(key, { ...row, slot_count: 1 });
    } else {
      groups.get(key)!.slot_count = (groups.get(key)!.slot_count ?? 1) + 1;
    }
  }
  // Keep ASC order so the earliest class of the filtered month is at the top
  // (e.g. July 2 first, July 30 last) instead of starting from the farthest date
  return Array.from(groups.values());
}

interface Teacher {
  id: number;
  name: string;
}

interface HalfCredit {
  id: number;
  student_package_id: number;
  student_id: number;
  status: "open" | "combined" | "paid" | "expired" | "voided";
  value_amount: string | number;
  currency: string | null;
  amount_paid: string | number | null;
  payment_reference: string | null;
  redeemed_at: string | null;
  created_at: string;
  appointment_date: string | null;
  absence_notice_at: string | null;
  package_name: string;
  student_name: string | null;
  redeemed_by_name: string | null;
  created_by_name: string | null;
}

const fmtMoney = (amount: string | number | null, currency: string | null) =>
  `${currency ? currency + " " : ""}${Number(amount || 0).toFixed(2)}`;

const halfCreditStatus: Record<HalfCredit["status"], { label: string; className: string }> = {
  open: { label: "Open", className: "bg-amber-100 text-amber-800" },
  combined: { label: "Combined", className: "bg-green-100 text-green-700" },
  paid: { label: "Paid", className: "bg-blue-100 text-blue-700" },
  expired: { label: "Expired", className: "bg-gray-100 text-gray-600" },
  voided: { label: "Voided", className: "bg-gray-100 text-gray-500 line-through" },
};

/** Current attendance value of a booking, as the attendance endpoint names it. */
const attendanceOf = (b: BookingRecord) =>
  b.teacher_absent ? "teacher_absent"
    : b.student_absent ? (b.absence_notice_at ? "late_notice" : "student_absent")
    : "present";

interface AvailablePackage {
  id: number;
  package_name: string;
  session_limit: number;
  price: number;
  subject: string | null;
  currency: string;
}

// Generate 30-min slots from 7:00 AM to 11:30 PM
const TIME_SLOTS: string[] = [];
for (let h = 7; h <= 23; h++) {
  TIME_SLOTS.push(`${String(h).padStart(2, "0")}:00`);
  TIME_SLOTS.push(`${String(h).padStart(2, "0")}:30`);
}

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
  const authContext = useContext(AuthContext);
  const { can } = usePermissions();
  const currentUser = authContext?.user ?? null;
  const token = localStorage.getItem("token");
  const headers = { Authorization: `Bearer ${token}` };
  const base = import.meta.env.VITE_API_URL;

  const [student, setStudent] = useState<StudentProfile | null>(null);
  const [activePackage, setActivePackage] = useState<ActivePackage | null>(null);
  const [bookings, setBookings] = useState<BookingRecord[]>([]);
  const [teachers, setTeachers] = useState<Teacher[]>([]);
  const [loading, setLoading] = useState(true);

  const now = new Date();
  const [historyMonth, setHistoryMonth] = useState(String(now.getMonth() + 1));
  const [historyYear, setHistoryYear] = useState(String(now.getFullYear()));
  const [historyStatus, setHistoryStatus] = useState("all");
  const [historyAttendance, setHistoryAttendance] = useState("all");
  const [historyPage, setHistoryPage] = useState(1);
  const [historyPageSize, setHistoryPageSize] = useState(10);

  // Student Record panel
  const [packageHistory, setPackageHistory] = useState<PackageHistory[]>([]);
  const [sessionAdjustments, setSessionAdjustments] = useState<SessionAdjustment[]>([]);
  const [recordYear, setRecordYear] = useState("all");
  const [recordMonth, setRecordMonth] = useState("all");
  const [cancellingId, setCancellingId] = useState<number | null>(null);
  const [editingAttendanceId, setEditingAttendanceId] = useState<number | null>(null);

  // Late absence notice → half credits
  const [lateNoticeEnabled, setLateNoticeEnabled] = useState(false);
  const [lateNoticeMinutes, setLateNoticeMinutes] = useState(15);
  const [halfCredits, setHalfCredits] = useState<HalfCredit[]>([]);
  const [lateNoticeBooking, setLateNoticeBooking] = useState<BookingRecord | null>(null);
  const [noticeMinutes, setNoticeMinutes] = useState("0");
  const [lateNoticeError, setLateNoticeError] = useState<string | null>(null);
  const [redeemCredit, setRedeemCredit] = useState<HalfCredit | null>(null);
  const [redeemAmount, setRedeemAmount] = useState("");
  const [redeemReference, setRedeemReference] = useState("");
  const [redeemError, setRedeemError] = useState<string | null>(null);
  const [halfCreditBusy, setHalfCreditBusy] = useState(false);
  const [recurringCancelBooking, setRecurringCancelBooking] = useState<BookingRecord | null>(null);

  // Mini booking calendar
  const [calYear, setCalYear] = useState(now.getFullYear());
  const [calMonth, setCalMonth] = useState(now.getMonth()); // 0-indexed

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

  // ── Shared package (siblings) ──
  const [showShare, setShowShare] = useState(false);
  const [shareCandidates, setShareCandidates] = useState<{ id: number; name: string }[]>([]);
  const [shareStudentId, setShareStudentId] = useState("");
  const [shareLoading, setShareLoading] = useState(false);
  const [shareError, setShareError] = useState<string | null>(null);

  const openShare = async () => {
    setShareStudentId("");
    setShareError(null);
    setShowShare(true);
    try {
      const res = await axios.get(`${base}/api/student/students`, { headers });
      const taken = new Set([activePackage?.owner_id, ...(activePackage?.members ?? []).map(m => m.id)]);
      const rows: { id: number; name: string; is_active: number | boolean }[] = res.data?.data ?? [];
      setShareCandidates(rows.filter(s => s.is_active && !taken.has(s.id)).map(s => ({ id: s.id, name: s.name })));
    } catch {
      setShareError("Failed to load students");
    }
  };

  const handleShare = async () => {
    if (!activePackage || !shareStudentId) return;
    setShareLoading(true);
    setShareError(null);
    try {
      await axios.post(`${base}/api/admin/student-packages/${activePackage.id}/members`, { student_id: Number(shareStudentId) }, { headers });
      setShowShare(false);
      fetchData();
    } catch (err: unknown) {
      setShareError((err as { response?: { data?: { message?: string } } })?.response?.data?.message || "Failed to share package");
    } finally {
      setShareLoading(false);
    }
  };

  const handleUnshare = async (memberId: number, memberName: string) => {
    if (!activePackage) return;
    if (!window.confirm(`Stop sharing this package with ${memberName}?`)) return;
    try {
      await axios.delete(`${base}/api/admin/student-packages/${activePackage.id}/members/${memberId}`, { headers });
      fetchData();
    } catch (err: unknown) {
      alert((err as { response?: { data?: { message?: string } } })?.response?.data?.message || "Failed to remove sharing");
    }
  };

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

  // Session adjustment history
  const [showAdjustHistory, setShowAdjustHistory] = useState(false);
  const [adjustHistory, setAdjustHistory] = useState<{ id: number; adjustment: number; remarks: string; created_at: string; adjusted_by_name: string }[]>([]);
  const [historyLoading, setHistoryLoading] = useState(false);

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
      const [profileRes, teachersRes, pkgHistRes, adjRes] = await Promise.all([
        axios.get(`${base}/api/admin/students/${id}`, { headers }),
        axios.get(`${base}/api/admin/teachers`, { headers }),
        axios.get(`${base}/api/admin/students/${id}/package-history`, { headers }),
        axios.get(`${base}/api/admin/students/${id}/package-adjustments`, { headers }),
      ]);
      setStudent(profileRes.data.student);
      setActivePackage(profileRes.data.activePackage);
      setBookings(groupBookings(profileRes.data.bookings));
      setTeachers(teachersRes.data.map((t: Teacher) => ({ id: t.id, name: t.name })));
      setPackageHistory(pkgHistRes.data);
      setSessionAdjustments(adjRes.data);
    } catch (err) {
      console.error("Error fetching student profile:", err);
    } finally {
      setLoading(false);
    }
    // Half credits fetched separately so a failure (e.g. migration 019 not yet applied) doesn't block the page
    try {
      const [hcRes, settingsRes] = await Promise.all([
        axios.get(`${base}/api/admin/students/${id}/half-credits`, { headers }),
        axios.get(`${base}/api/admin/company-settings`, { headers }),
      ]);
      setHalfCredits(hcRes.data);
      setLateNoticeEnabled(!!settingsRes.data.late_notice_enabled);
      setLateNoticeMinutes(Number(settingsRes.data.late_notice_minutes ?? 15));
    } catch (err) {
      console.error("Error fetching half credits:", err);
    }
  };

  useEffect(() => { fetchData(); }, [id]);

  const handleInitiateCancel = (booking: BookingRecord) => {
    if (booking.recurring_schedule_id) {
      setRecurringCancelBooking(booking);
    } else {
      doCancel(booking.id, false);
    }
  };

  const doCancel = async (bookingId: number, cancelAll: boolean) => {
    setCancellingId(bookingId);
    setRecurringCancelBooking(null);
    try {
      const url = cancelAll
        ? `${base}/api/bookings/cancel/${bookingId}?cancelAll=true`
        : `${base}/api/bookings/cancel/${bookingId}`;
      await axios.post(url, {}, { headers });
      fetchData();
    } catch (err) {
      console.error("Error cancelling booking:", err);
      alert((err as { response?: { data?: { message?: string } } })?.response?.data?.message || "Failed to cancel class");
    } finally {
      setCancellingId(null);
    }
  };

  const handleEditAttendance = async (booking: BookingRecord, attendance: string) => {
    if (attendance === "late_notice") {
      setNoticeMinutes("0");
      setLateNoticeError(null);
      setLateNoticeBooking(booking);
      return;
    }
    const label = { present: "Present", student_absent: "Student Absent", teacher_absent: "Teacher Absent" }[attendance];
    const sessionNote = attendance === "teacher_absent"
      ? "\n\n1 session will be refunded to the student's package."
      : booking.teacher_absent
        ? "\n\nThe session refunded for the teacher absence will be deducted again."
        : booking.absence_notice_at
          ? "\n\nThe half credit from the late notice will be removed."
          : "";
    if (!confirm(`Change attendance for ${fmtDate(booking.appointment_date, "MMM d, yyyy h:mm a")} to "${label}"?${sessionNote}`)) return;
    setEditingAttendanceId(booking.id);
    try {
      await axios.put(`${base}/api/admin/bookings/${booking.id}/attendance`, { attendance }, { headers });
      fetchData();
    } catch (err) {
      alert((err as { response?: { data?: { message?: string } } })?.response?.data?.message || "Failed to update attendance");
    } finally {
      setEditingAttendanceId(null);
    }
  };

  const handleSubmitLateNotice = async () => {
    if (!lateNoticeBooking) return;
    setHalfCreditBusy(true);
    setLateNoticeError(null);
    try {
      const res = await axios.put(`${base}/api/admin/bookings/${lateNoticeBooking.id}/attendance`,
        { attendance: "late_notice", notice_minutes: Number(noticeMinutes) }, { headers });
      setLateNoticeBooking(null);
      alert(res.data.message);
      fetchData();
    } catch (err) {
      setLateNoticeError((err as { response?: { data?: { message?: string } } })?.response?.data?.message || "Failed to record late notice");
    } finally {
      setHalfCreditBusy(false);
    }
  };

  const openRedeem = (credit: HalfCredit) => {
    setRedeemAmount(Number(credit.value_amount).toFixed(2));
    setRedeemReference("");
    setRedeemError(null);
    setRedeemCredit(credit);
  };

  const handleRedeemPayment = async () => {
    if (!redeemCredit) return;
    setHalfCreditBusy(true);
    setRedeemError(null);
    try {
      await axios.post(`${base}/api/admin/half-credits/${redeemCredit.id}/redeem-payment`,
        { amount_paid: redeemAmount, reference: redeemReference }, { headers });
      setRedeemCredit(null);
      fetchData();
    } catch (err) {
      setRedeemError((err as { response?: { data?: { message?: string } } })?.response?.data?.message || "Failed to redeem half credit");
    } finally {
      setHalfCreditBusy(false);
    }
  };

  const handleVoidHalfCredit = async (credit: HalfCredit) => {
    if (!confirm("Void this half credit? Use this only if it was recorded by mistake. No sessions change.")) return;
    try {
      await axios.post(`${base}/api/admin/half-credits/${credit.id}/void`, {}, { headers });
      fetchData();
    } catch (err) {
      alert((err as { response?: { data?: { message?: string } } })?.response?.data?.message || "Failed to void half credit");
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
          student_id: Number(id),
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
        student_id: Number(id),
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

        {/* Student Info + Student Record side by side */}
        {(() => {
          const recordTimeline: RecordTimelineItem[] = [
            ...packageHistory.map((pkg) => ({ kind: "package" as const, date: pkg.purchased_at, data: pkg })),
            ...sessionAdjustments.map((adj) => ({ kind: "adjustment" as const, date: adj.created_at, data: adj })),
          ].sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());

          const recordYearOptions = Array.from(new Set(recordTimeline.map((i) => i.date.slice(0, 4)))).sort((a, b) => b.localeCompare(a));

          const filteredRecordTimeline = recordTimeline.filter((item) => {
            const [y, m] = item.date.slice(0, 7).split("-");
            if (recordYear !== "all" && y !== recordYear) return false;
            if (recordMonth !== "all" && m !== recordMonth.padStart(2, "0")) return false;
            return true;
          });

          const monthName = (num: number) => new Date(2000, num - 1).toLocaleDateString(undefined, { month: "long" });

          return (
            <div className="grid grid-cols-1 lg:grid-cols-[1fr_320px] gap-5 items-stretch">
              {/* LEFT — Student Profile */}
              <Card className="glow-card border-0 rounded-2xl">
                <CardHeader className="flex flex-row items-center justify-between">
                  <CardTitle className="flex items-center gap-2">
                    <User className="h-5 w-5 text-primary" />
                    Student Profile
                  </CardTitle>
                  <div className="flex gap-2">
                    {can("students.edit") && (
                      <Button id="student-btn-edit" size="sm" variant="outline" className="gap-1" onClick={openEdit}>
                        <Pencil className="h-4 w-4" /> Edit
                      </Button>
                    )}
                    {can("students.reset_password") && (
                      <Button id="student-btn-reset-pw" size="sm" variant="outline" className="gap-1"
                        onClick={() => { setShowResetPw(true); setResetPw(""); setResetPwMsg(null); }}>
                        <KeyRound className="h-4 w-4" /> Reset Password
                      </Button>
                    )}
                    {can("students.deactivate") && <Button
                      id="student-btn-deactivate"
                      size="sm"
                      variant={student.is_active ? "destructive" : "default"}
                      className="gap-1"
                      onClick={handleToggleActive}
                      disabled={deactivateLoading}
                    >
                      {deactivateLoading
                        ? <Loader2 className="h-4 w-4 animate-spin" />
                        : student.is_active ? "Deactivate" : "Reactivate"}
                    </Button>}
                  </div>
                </CardHeader>
                <CardContent className="space-y-4 text-sm">
                  <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
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
                  </div>

                  {/* Mini booking calendar — confirmed classes only */}
                  {(() => {
                    const firstDay = new Date(calYear, calMonth, 1).getDay(); // 0=Sun
                    const daysInMonth = new Date(calYear, calMonth + 1, 0).getDate();

                    // Only track confirmed bookings; store formatted times per day.
                    // Slice directly from the stored PHT string — never use new Date()
                    // which would UTC-shift on a UTC server or produce wrong results.
                    const confirmedByDay: Record<number, string[]> = {};
                    bookings.forEach((b) => {
                      if (b.status !== "confirmed") return;
                      const s = String(b.appointment_date);
                      const [y, mo, dd] = s.slice(0, 10).split("-").map(Number);
                      if (y === calYear && mo - 1 === calMonth) {
                        const hh = Number(s.slice(11, 13));
                        const mm = s.slice(14, 16);
                        const ampm = hh >= 12 ? "PM" : "AM";
                        const h12 = hh % 12 === 0 ? 12 : hh % 12;
                        if (!confirmedByDay[dd]) confirmedByDay[dd] = [];
                        confirmedByDay[dd].push(`${h12}:${mm} ${ampm}`);
                      }
                    });

                    const todayDate = now.getDate();
                    const todayMonth = now.getMonth();
                    const todayYear = now.getFullYear();

                    const prevMonth = () => {
                      if (calMonth === 0) { setCalYear(y => y - 1); setCalMonth(11); }
                      else setCalMonth(m => m - 1);
                    };
                    const nextMonth = () => {
                      if (calMonth === 11) { setCalYear(y => y + 1); setCalMonth(0); }
                      else setCalMonth(m => m + 1);
                    };

                    const monthLabel = new Date(calYear, calMonth).toLocaleDateString("en-US", { month: "long", year: "numeric" });
                    const weekdays = ["Su", "Mo", "Tu", "We", "Th", "Fr", "Sa"];

                    const cells: (number | null)[] = [
                      ...Array(firstDay).fill(null),
                      ...Array.from({ length: daysInMonth }, (_, i) => i + 1),
                    ];
                    while (cells.length % 7 !== 0) cells.push(null);

                    return (
                      <div className="border rounded-xl p-3 bg-muted/20 select-none">
                        <div className="flex items-center justify-between mb-2">
                          <button onClick={prevMonth} className="h-6 w-6 flex items-center justify-center rounded hover:bg-muted text-muted-foreground hover:text-foreground transition-colors text-xs">‹</button>
                          <span className="text-xs font-semibold">{monthLabel}</span>
                          <button onClick={nextMonth} className="h-6 w-6 flex items-center justify-center rounded hover:bg-muted text-muted-foreground hover:text-foreground transition-colors text-xs">›</button>
                        </div>
                        <div className="grid grid-cols-7 gap-0.5">
                          {weekdays.map(d => (
                            <div key={d} className="text-center text-[10px] font-medium text-muted-foreground py-0.5">{d}</div>
                          ))}
                          {cells.map((day, i) => {
                            const isToday = day !== null && day === todayDate && calMonth === todayMonth && calYear === todayYear;
                            const times = day !== null ? confirmedByDay[day] : undefined;
                            const hasDot = times && times.length > 0;
                            const tooltip = hasDot ? times!.join("\n") : undefined;
                            return (
                              <div
                                key={i}
                                title={tooltip}
                                className={`relative flex items-center justify-center rounded-md py-1 transition-colors ${day === null ? "" : isToday ? "bg-primary/75 hover:bg-primary/85" : hasDot ? "bg-green-500/25 hover:bg-green-500/35" : "hover:bg-muted/60"}`}
                              >
                                {day !== null && (
                                  <span className={`text-[11px] leading-none ${isToday ? "text-white font-bold" : hasDot ? "text-green-700 font-semibold" : "text-foreground"}`}>{day}</span>
                                )}
                              </div>
                            );
                          })}
                        </div>
                        <div className="flex items-center gap-1.5 mt-2 pt-2 border-t">
                          <span className="h-3 w-3 rounded-sm bg-green-500/25 border border-green-500/40" />
                          <span className="text-[10px] text-muted-foreground">Confirmed class</span>
                        </div>
                      </div>
                    );
                  })()}
                </CardContent>
              </Card>

              {/* RIGHT — Student Record */}
              <Card className="glow-card border-0 rounded-2xl flex flex-col">
                <CardHeader className="pb-2 space-y-2">
                  <CardTitle className="flex items-center gap-2 text-base">
                    <Package className="h-4 w-4 text-primary" />
                    Student Record
                  </CardTitle>
                  {recordTimeline.length > 0 && (
                    <div className="flex gap-2">
                      <Select value={recordYear} onValueChange={(v) => { setRecordYear(v); setRecordMonth("all"); }}>
                        <SelectTrigger className="h-8 text-xs flex-1">
                          <SelectValue placeholder="All Years" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="all">All Years</SelectItem>
                          {recordYearOptions.map((y) => (
                            <SelectItem key={y} value={y}>{y}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <Select value={recordMonth} onValueChange={setRecordMonth}>
                        <SelectTrigger className="h-8 text-xs flex-1">
                          <SelectValue placeholder="All Months" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="all">All Months</SelectItem>
                          {[1,2,3,4,5,6,7,8,9,10,11,12].map((m) => (
                            <SelectItem key={m} value={String(m)}>{monthName(m)}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  )}
                </CardHeader>
                <CardContent className="overflow-y-auto flex-1 max-h-85 pr-1">
                  {filteredRecordTimeline.length === 0 ? (
                    <p className="text-sm text-muted-foreground">
                      {recordTimeline.length === 0 ? "No records yet." : "No records for selected period."}
                    </p>
                  ) : (
                    <div className="space-y-2">
                      {filteredRecordTimeline.map((item) => {
                        if (item.kind === "package") {
                          const pkg = item.data;
                          return (
                            <div key={`pkg-${pkg.id}`} className="flex items-start justify-between gap-3 rounded-xl border px-4 py-3">
                              <div className="space-y-0.5 min-w-0">
                                <p className="font-medium text-sm truncate">{pkg.package_name}</p>
                                {pkg.subject && <p className="text-xs text-muted-foreground">{pkg.subject}</p>}
                                <p className="text-xs text-muted-foreground">
                                  {pkg.session_limit} sessions · {pkg.duration_minutes} min · {pkg.currency} {Number(pkg.price).toLocaleString()}
                                </p>
                                <p className="text-xs text-muted-foreground">
                                  Availed: {new Date(pkg.purchased_at).toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" })}
                                </p>
                              </div>
                              <Badge
                                variant={pkg.payment_status === "paid" ? "default" : pkg.payment_status === "rejected" ? "destructive" : "secondary"}
                                className="shrink-0 capitalize"
                              >
                                {pkg.payment_status}
                              </Badge>
                            </div>
                          );
                        }
                        const adj = item.data;
                        return (
                          <div key={`adj-${adj.id}`} className="flex items-start gap-2.5 rounded-lg border border-dashed px-3 py-2.5">
                            <div className="mt-0.5 shrink-0">
                              {adj.adjustment > 0
                                ? <TrendingUp className="h-3.5 w-3.5 text-green-500" />
                                : <TrendingDown className="h-3.5 w-3.5 text-destructive" />}
                            </div>
                            <div className="space-y-0.5 min-w-0">
                              <p className="text-xs font-medium">
                                {adj.adjustment > 0
                                  ? `+${adj.adjustment} session${adj.adjustment !== 1 ? "s" : ""} added`
                                  : `${Math.abs(adj.adjustment)} session${Math.abs(adj.adjustment) !== 1 ? "s" : ""} deducted`}
                              </p>
                              <p className="text-xs text-muted-foreground wrap-break-word">Reason: {adj.remarks}</p>
                              <p className="text-xs text-muted-foreground">
                                {new Date(adj.created_at).toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" })}
                                {" · "}{adj.adjusted_by_name}
                              </p>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </CardContent>
              </Card>
            </div>
          );
        })()}

        {/* Active Package */}
        {activePackage ? (
          <Card id="student-package-card" className="glow-card border-0 rounded-2xl">
            <CardHeader className="flex flex-row items-center justify-between">
              <CardTitle className="flex items-center gap-2">
                <Package className="h-5 w-5 text-primary" />
                Active Package
              </CardTitle>
              <div className="flex gap-2">
                {can("students.assign_package") && (
                  <Button id="student-btn-assign-package" size="sm" variant="outline" className="gap-1 text-xs" onClick={openAssignPackage}>
                    <Plus className="h-3.5 w-3.5" /> Assign New Package
                  </Button>
                )}
                <Button id="student-btn-adj-history" size="sm" variant="ghost" className="gap-1 text-xs" onClick={fetchAdjustmentHistory} disabled={historyLoading}>
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
                    {can("students.add_sessions") && <Button
                      id="student-btn-add-sessions"
                      size="icon"
                      variant="ghost"
                      className="h-6 w-6 text-green-600 hover:text-green-700 hover:bg-green-50"
                      title="Add sessions"
                      onClick={() => setShowAdjust("add")}
                    >
                      <PlusCircle className="h-4 w-4" />
                    </Button>}
                    {can("students.deduct_sessions") && <Button
                      id="student-btn-deduct-sessions"
                      size="icon"
                      variant="ghost"
                      className="h-6 w-6 text-red-600 hover:text-red-700 hover:bg-red-50"
                      title="Deduct sessions"
                      onClick={() => setShowAdjust("deduct")}
                    >
                      <MinusCircle className="h-4 w-4" />
                    </Button>}
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
                {can("students.edit") && <div className="flex gap-2">
                  <Button
                    id="student-btn-assign-teacher"
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
                </div>}
              </div>

              {/* Shared package row — siblings booking from one package */}
              {activePackage.owner_id === Number(id) ? (
                <div className="flex items-center justify-between gap-2 pt-1 border-t">
                  <div className="flex items-center gap-2 flex-wrap">
                    <Users className="h-4 w-4 text-muted-foreground" />
                    <span className="text-xs text-muted-foreground">Shared with:</span>
                    {activePackage.members.length > 0 ? activePackage.members.map(m => (
                      <Badge key={m.id} variant="outline" className="gap-1">
                        {m.name}
                        {can("students.assign_package") && (
                          <button type="button" title={`Stop sharing with ${m.name}`} className="hover:text-destructive" onClick={() => handleUnshare(m.id, m.name)}>
                            <X className="h-3 w-3" />
                          </button>
                        )}
                      </Badge>
                    )) : (
                      <span className="text-muted-foreground italic text-xs">Not shared</span>
                    )}
                  </div>
                  {can("students.assign_package") && (
                    <Button size="sm" variant="outline" className="h-7 text-xs gap-1" onClick={openShare}>
                      <Plus className="h-3.5 w-3.5" /> Share with sibling
                    </Button>
                  )}
                </div>
              ) : (
                <div className="flex items-center justify-between gap-2 pt-1 border-t">
                  <div className="flex items-center gap-2 flex-wrap">
                    <Users className="h-4 w-4 text-muted-foreground" />
                    <span className="text-xs text-muted-foreground">Shared package owned by</span>
                    <button type="button" className="font-semibold text-sm hover:underline" onClick={() => navigate(`/admin/students/${activePackage.owner_id}`)}>
                      {activePackage.owner_name}
                    </button>
                    {activePackage.members.filter(m => m.id !== Number(id)).map(m => (
                      <Badge key={m.id} variant="outline">{m.name}</Badge>
                    ))}
                  </div>
                  <Button size="sm" variant="ghost" className="h-7 text-xs text-muted-foreground gap-1 hover:text-destructive"
                    onClick={() => handleUnshare(Number(id), student?.name ?? "this student")}>
                    <X className="h-3.5 w-3.5" /> Stop sharing
                  </Button>
                </div>
              )}
            </CardContent>
          </Card>
        ) : (
          <Card className="glow-card border-0 rounded-2xl">
            <CardContent className="py-6 text-center text-sm text-muted-foreground">
              <Package className="h-8 w-8 mx-auto mb-2 text-muted-foreground/50" />
              <p className="mb-3">No active package</p>
              {can("students.assign_package") && (
                <Button size="sm" className="gap-1" onClick={openAssignPackage}>
                  <Plus className="h-4 w-4" /> Assign Package
                </Button>
              )}
            </CardContent>
          </Card>
        )}

        {/* Half credits (late absence notices) */}
        {(lateNoticeEnabled || halfCredits.length > 0) && (
          <Card className="glow-card border-0 rounded-2xl">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <AlertTriangle className="h-5 w-5 text-amber-500" /> Half credits
                {halfCredits.some((c) => c.status === "open") && (
                  <Badge className="bg-amber-100 text-amber-800 hover:bg-amber-100">
                    {halfCredits.filter((c) => c.status === "open").length} open
                  </Badge>
                )}
              </CardTitle>
              <p className="text-xs text-muted-foreground">
                A late absence notice (within {lateNoticeMinutes} min of class start) keeps half a class.
                Two open halves on the same package combine into 1 class automatically, or the
                student pays half the class price to redeem one. Not refundable; open halves
                expire once the package is used up.
              </p>
            </CardHeader>
            <CardContent>
              {halfCredits.length === 0 ? (
                <p className="text-sm text-muted-foreground">No half credits yet.</p>
              ) : (
                <div className="overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Class</TableHead>
                        <TableHead>Notified</TableHead>
                        <TableHead>Package</TableHead>
                        <TableHead>Value</TableHead>
                        <TableHead>Status</TableHead>
                        <TableHead></TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {halfCredits.map((c) => (
                        <TableRow key={c.id}>
                          <TableCell className="text-xs whitespace-nowrap">
                            {c.appointment_date ? fmtDate(c.appointment_date, "MMM d, yyyy h:mm a") : "—"}
                            {c.student_name && c.student_id !== Number(id) && (
                              <span className="block text-muted-foreground">{c.student_name}</span>
                            )}
                          </TableCell>
                          <TableCell className="text-xs whitespace-nowrap">
                            {c.absence_notice_at ? fmtDate(c.absence_notice_at, "h:mm a") : "—"}
                          </TableCell>
                          <TableCell className="text-xs">{c.package_name}</TableCell>
                          <TableCell className="text-xs whitespace-nowrap">{fmtMoney(c.value_amount, c.currency)}</TableCell>
                          <TableCell>
                            <span className={`text-xs px-2 py-1 rounded-full font-medium ${halfCreditStatus[c.status].className}`}>
                              {halfCreditStatus[c.status].label}
                            </span>
                            {c.status === "paid" && (
                              <span className="block text-[11px] text-muted-foreground mt-1">
                                {fmtMoney(c.amount_paid, c.currency)}{c.payment_reference ? ` · ${c.payment_reference}` : ""}
                              </span>
                            )}
                          </TableCell>
                          <TableCell className="text-right whitespace-nowrap">
                            {c.status === "open" && can("students.add_sessions") && (
                              <Button size="sm" variant="outline" className="h-7 text-xs mr-1" onClick={() => openRedeem(c)}>
                                Redeem by payment
                              </Button>
                            )}
                            {c.status === "open" && can("students.deduct_sessions") && (
                              <Button size="sm" variant="ghost" className="h-7 text-xs text-muted-foreground hover:text-destructive"
                                onClick={() => handleVoidHalfCredit(c)}>
                                Void
                              </Button>
                            )}
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              )}
            </CardContent>
          </Card>
        )}

        {/* Booking History */}
        {(() => {
          const filteredBookings = bookings.filter((b) => {
            const dateStr = b.appointment_date.slice(0, 10); // "YYYY-MM-DD"
            const [y, m] = dateStr.split("-");
            if (Number(m) !== Number(historyMonth)) return false;
            if (Number(y) !== Number(historyYear)) return false;
            if (historyStatus !== "all" && b.status !== historyStatus) return false;
            if (historyAttendance === "student_absent" && !b.student_absent) return false;
            if (historyAttendance === "teacher_absent" && !b.teacher_absent) return false;
            if (historyAttendance === "present" && (b.student_absent || b.teacher_absent)) return false;
            return true;
          });
          const totalHistoryPages = Math.max(1, Math.ceil(filteredBookings.length / historyPageSize));
          const pagedBookings = filteredBookings.slice((historyPage - 1) * historyPageSize, historyPage * historyPageSize);
          const yearOptions = Array.from(
            new Set(bookings.map((b) => Number(b.appointment_date.slice(0, 4))))
          ).sort((a, z) => z - a);
          if (!yearOptions.includes(Number(historyYear))) yearOptions.unshift(Number(historyYear));
          yearOptions.sort((a, z) => z - a);

          return (
        <Card id="student-history-card" className="glow-card border-0 rounded-2xl">
          <CardHeader className="flex flex-row items-center justify-between flex-wrap gap-2">
            <CardTitle className="flex items-center gap-2">
              <CalendarDays className="h-5 w-5 text-primary" />
              Class History
            </CardTitle>
            <div className="flex flex-wrap items-center gap-2">
              {/* Month filter */}
              <Select value={historyMonth} onValueChange={(v) => { setHistoryMonth(v); setHistoryPage(1); }}>
                <SelectTrigger className="h-8 text-xs w-32">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {["January","February","March","April","May","June","July","August","September","October","November","December"].map((name, i) => (
                    <SelectItem key={i + 1} value={String(i + 1)}>{name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {/* Year filter */}
              <Select value={historyYear} onValueChange={(v) => { setHistoryYear(v); setHistoryPage(1); }}>
                <SelectTrigger className="h-8 text-xs w-24">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {yearOptions.map((y) => (
                    <SelectItem key={y} value={String(y)}>{y}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {/* Status filter */}
              <Select value={historyStatus} onValueChange={(v) => { setHistoryStatus(v); setHistoryPage(1); }}>
                <SelectTrigger className="h-8 text-xs w-32">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Status</SelectItem>
                  <SelectItem value="pending">Pending</SelectItem>
                  <SelectItem value="confirmed">Confirmed</SelectItem>
                  <SelectItem value="done">Done</SelectItem>
                  <SelectItem value="cancelled">Cancelled</SelectItem>
                </SelectContent>
              </Select>
              {/* Attendance filter */}
              <Select value={historyAttendance} onValueChange={(v) => { setHistoryAttendance(v); setHistoryPage(1); }}>
                <SelectTrigger className="h-8 text-xs w-36">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Attendance</SelectItem>
                  <SelectItem value="present">Present</SelectItem>
                  <SelectItem value="student_absent">Student Absent</SelectItem>
                  <SelectItem value="teacher_absent">Teacher Absent</SelectItem>
                </SelectContent>
              </Select>
              {activePackage && (
                <>
                  {!activePackage.teacher_id && can("students.edit") && (
                    <Button id="student-btn-bulk-assign" size="sm" variant="outline" className="gap-1" onClick={() => { setBulkTeacherId(""); setBulkMsg(null); setShowBulkAssign(true); }}>
                      <Users className="h-4 w-4" /> Bulk Assign Classes
                    </Button>
                  )}
                  {can("students.book_classes") && (
                    <Button id="student-btn-add-class" size="sm" className="gap-1" onClick={() => { setSelectedSlots({}); resetAddClassDialog(); setShowAddClass(true); }}>
                      <Plus className="h-4 w-4" /> Add Class
                    </Button>
                  )}
                </>
              )}
            </div>
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
                {filteredBookings.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={6} className="text-center text-muted-foreground text-sm py-10">
                      No classes found
                    </TableCell>
                  </TableRow>
                ) : (
                  pagedBookings.map((b) => (
                    <TableRow key={b.id}>
                      <TableCell className="text-sm">
                        {fmtDate(b.appointment_date, "MMM d, yyyy h:mm a")}
                        {(b.slot_count ?? 1) > 1 && (
                          <span className="ml-1 text-xs text-muted-foreground">({(b.slot_count ?? 1) * 30}min)</span>
                        )}
                      </TableCell>
                      <TableCell className="text-sm">
                        {(b.status === "pending" || b.status === "confirmed") ? (
                          <Select
                            value={b.teacher_id ? String(b.teacher_id) : "unassigned"}
                            onValueChange={(v) => handleAssignTeacherToBooking(b.id, v === "unassigned" ? "" : v)}
                            disabled={assigningBookingId === b.id || !can("students.edit")}
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
                        {!!b.student_absent && b.absence_notice_at && (
                          <span className="text-xs px-2 py-1 rounded-full font-medium bg-amber-100 text-amber-800 mr-1"
                            title={`Student notified at ${fmtDate(b.absence_notice_at, "h:mm a")}`}>
                            Late notice ½
                          </span>
                        )}
                        {!!b.student_absent && !b.absence_notice_at && (
                          <span className="text-xs px-2 py-1 rounded-full font-medium bg-orange-100 text-orange-700 mr-1">
                            Student Absent
                          </span>
                        )}
                        {!!b.teacher_absent && (
                          <span className="text-xs px-2 py-1 rounded-full font-medium bg-red-100 text-red-700">
                            Teacher Absent
                          </span>
                        )}
                        {!b.student_absent && !b.teacher_absent && b.status === "done" && (
                          <span className="text-xs px-2 py-1 rounded-full font-medium bg-green-100 text-green-700">
                            Present
                          </span>
                        )}
                        {!b.student_absent && !b.teacher_absent && b.status !== "done" && (
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
                        {(b.status === "pending" || b.status === "confirmed") && can("students.cancel_classes") && (
                          <Button
                            size="sm"
                            variant="ghost"
                            className="text-xs h-7 text-destructive hover:text-destructive"
                            disabled={cancellingId === b.id}
                            onClick={() => handleInitiateCancel(b)}
                          >
                            {cancellingId === b.id ? <Loader2 className="h-3 w-3 animate-spin" /> : "Cancel"}
                          </Button>
                        )}
                        {b.status === "done" && can("students.edit") && (
                          editingAttendanceId === b.id ? (
                            <Loader2 className="h-3 w-3 animate-spin text-muted-foreground" />
                          ) : (
                            <Select
                              value=""
                              onValueChange={(v) => handleEditAttendance(b, v)}
                            >
                              <SelectTrigger className="h-7 text-xs w-32">
                                <SelectValue placeholder="Edit attendance" />
                              </SelectTrigger>
                              <SelectContent>
                                {[
                                  { value: "present", label: "Present" },
                                  { value: "student_absent", label: "Student Absent" },
                                  { value: "teacher_absent", label: "Teacher Absent" },
                                  ...(lateNoticeEnabled ? [{ value: "late_notice", label: "Late notice (½ credit)" }] : []),
                                ]
                                  .filter((o) => o.value !== attendanceOf(b))
                                  .map((o) => (
                                    <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
                                  ))}
                              </SelectContent>
                            </Select>
                          )
                        )}
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
            {filteredBookings.length > 0 && (
              <TablePagination
                page={historyPage}
                totalPages={totalHistoryPages}
                pageSize={historyPageSize}
                totalItems={filteredBookings.length}
                onPageChange={setHistoryPage}
                onPageSizeChange={(s) => { setHistoryPageSize(s); setHistoryPage(1); }}
              />
            )}
          </CardContent>
        </Card>
          );
        })()}
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
            {viewingReport && (
              <Button
                variant="outline"
                className="sm:mr-auto"
                onClick={() => downloadReportImage({
                  studentName: student?.name ?? "Student",
                  teacherName: viewingReport.teacher_name,
                  classDate: fmtDateOnly(viewingReport.appointment_date),
                  newWords: viewingReport.new_words,
                  sentences: viewingReport.sentences,
                  notes: viewingReport.notes,
                  remarks: viewingReport.remarks,
                })}
              >
                <Download className="h-4 w-4 mr-2" /> Download
              </Button>
            )}
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
      {/* Late absence notice — record when the student told the team */}
      <Dialog open={!!lateNoticeBooking} onOpenChange={(o) => { if (!o) setLateNoticeBooking(null); }}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Late absence notice</DialogTitle>
          </DialogHeader>
          <div className="space-y-3 text-sm">
            <p className="text-muted-foreground">
              Class: {lateNoticeBooking ? fmtDate(lateNoticeBooking.appointment_date, "MMM d, yyyy h:mm a") : ""}
            </p>
            <div>
              <Label className="text-xs">How many minutes after class start did the student notify you?</Label>
              <Input type="number" min="0" max={lateNoticeMinutes} value={noticeMinutes}
                onChange={(e) => setNoticeMinutes(e.target.value)} className="mt-1" />
              <p className="text-xs text-muted-foreground mt-1">
                Within {lateNoticeMinutes} minutes = half credit (0.5 class). Later than that counts as fully absent.
              </p>
            </div>
            {lateNoticeError && <p className="text-xs text-destructive">{lateNoticeError}</p>}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setLateNoticeBooking(null)}>Cancel</Button>
            <Button onClick={handleSubmitLateNotice} disabled={halfCreditBusy || noticeMinutes === ""}>
              {halfCreditBusy && <Loader2 className="h-4 w-4 mr-1 animate-spin" />} Record late notice
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Redeem a half credit by payment */}
      <Dialog open={!!redeemCredit} onOpenChange={(o) => { if (!o) setRedeemCredit(null); }}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Redeem half credit by payment</DialogTitle>
          </DialogHeader>
          <div className="space-y-3 text-sm">
            <p className="text-muted-foreground">
              Confirm the student paid the other half of the class price. 1 full class will be added
              to <span className="font-medium text-foreground">{redeemCredit?.package_name}</span>.
            </p>
            <div>
              <Label className="text-xs">Amount paid{redeemCredit?.currency ? ` (${redeemCredit.currency})` : ""}</Label>
              <Input type="number" min="0" step="0.01" value={redeemAmount}
                onChange={(e) => setRedeemAmount(e.target.value)} className="mt-1" />
              <p className="text-xs text-muted-foreground mt-1">
                Half the class price: {redeemCredit ? fmtMoney(redeemCredit.value_amount, redeemCredit.currency) : ""}
              </p>
            </div>
            <div>
              <Label className="text-xs">Payment reference (optional)</Label>
              <Input value={redeemReference} onChange={(e) => setRedeemReference(e.target.value)}
                placeholder="e.g. transaction number" className="mt-1" />
            </div>
            {redeemError && <p className="text-xs text-destructive">{redeemError}</p>}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setRedeemCredit(null)}>Cancel</Button>
            <Button onClick={handleRedeemPayment} disabled={halfCreditBusy}>
              {halfCreditBusy && <Loader2 className="h-4 w-4 mr-1 animate-spin" />} Confirm payment
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <SessionAdjustDialog
        mode={showAdjust}
        studentPackageId={activePackage?.id ?? null}
        sessionsRemaining={activePackage?.sessions_remaining ?? 0}
        unusedSessions={activePackage?.unused_sessions ?? 0}
        onClose={() => setShowAdjust(null)}
        onAdjusted={() => fetchData()}
      />

      {/* Assign Teacher to Student (package-level + cascade) */}
      {/* Share Package Dialog */}
      <Dialog open={showShare} onOpenChange={(o) => { if (!o) setShowShare(false); }}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Share package with a sibling</DialogTitle>
          </DialogHeader>
          <div className="space-y-3 text-sm">
            <p className="text-muted-foreground">
              Both students book from the same {activePackage?.sessions_remaining ?? 0} remaining session(s). Each class still shows under the student who attends it.
            </p>
            <div>
              <Label>Student</Label>
              <StudentPackagePicker
                items={shareCandidates.map(s => ({ id: String(s.id), name: s.name }))}
                value={shareStudentId}
                onChange={setShareStudentId}
                placeholder="Select a student"
                emptyMessage="No other active students."
                fixedBelow
              />
            </div>
            {shareError && <p className="text-xs text-destructive">{shareError}</p>}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowShare(false)}>Cancel</Button>
            <Button onClick={handleShare} disabled={!shareStudentId || shareLoading}>
              {shareLoading && <Loader2 className="h-4 w-4 animate-spin mr-1" />} Share
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

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
        <DialogContent className="sm:max-w-2xl">
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
      {/* Recurring Cancel Choice Dialog */}
      {recurringCancelBooking && (
        <Dialog open onOpenChange={o => { if (!o) setRecurringCancelBooking(null); }}>
          <DialogContent className="sm:max-w-sm">
            <DialogHeader><DialogTitle>Cancel Class</DialogTitle></DialogHeader>
            <p className="text-sm text-muted-foreground py-2">
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

      {currentUser?.role === "company_admin" && currentUser.company_id != null && (
        <AdminTour segment="F" companyId={currentUser.company_id} autoStart />
      )}
    </>
  );
};

export default AdminStudentProfilePage;
