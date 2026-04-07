import { useState, useEffect, useContext } from "react";
import { useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import axios from "axios";
import Calendar from "react-calendar";
import "react-calendar/dist/Calendar.css";
import BrandLogo from "@/components/BrandLogo";
import "../index.css";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { LogOut, Package, CalendarDays, User, FileText, Video, UserX, Send, Copy, Check, UserCircle, Clock, Trash2, Plus } from "lucide-react";
import PackageSelectionModal from "../components/PackageSelectionModal";
import BookingConfirmationModal from "../components/BookingConfirmationModal";
import AuthContext from "@/context/AuthContext";
import NotificationBell from "@/components/NotificationBell";
import LanguageToggle from "@/components/LanguageToggle";
import { fmtDate, fmtDateOnly, fmtTime, parseUTC } from "@/utils/timezone";

interface Student {
  id: number;
  name: string;
  guardian_name: string;
  nationality: string;
  age: number;
  created_at: string;
}

interface PackageDetails {
  id: number;
  package_name: string;
  sessions_remaining: number;
  unused_sessions: number;
  session_limit: number;
  price: number;
}

interface AvailablePackage {
  id: number;
  package_name: string;
  session_limit: number;
  price: number;
  subject: string | null;
  duration_minutes: number;
  description: string | null;
  currency: string;
}

interface Booking {
  id: number;
  appointment_date: string;
  appointment_datetime: string;
  timeslot: string;
  status: string;
  teacher_name: string | null;
  class_mode: string | null;
  meeting_link: string | null;
  teacher_absent: boolean;
  student_absent: boolean;
}

interface Absence {
  id: number;
  appointment_date: string;
  student_absent: boolean;
  teacher_absent: boolean;
  teacher_name: string | null;
}

interface WaitlistEntry {
  id: number;
  desired_date: string;
  desired_time: string;
  status: "waiting" | "notified" | "expired";
  teacher_name: string | null;
  created_at: string;
}

interface Report {
  id: number;
  booking_id: number;
  appointment_date: string;
  teacher_name: string;
  new_words: string;
  sentences: string;
  notes: string;
  remarks: string;
  created_at: string;
}

const StudentDashboard = () => {
  const [student, setStudent] = useState<Student | null>(null);
  const [packageDetails, setPackageDetails] = useState<PackageDetails | null>(null);
  const [calendarBookings, setCalendarBookings] = useState<Record<string, string[]>>({});
  const [, setRawBookings] = useState<Booking[]>([]);
  const [selectedDateBookings, setSelectedDateBookings] = useState<Booking[]>([]);
  const [showClassModal, setShowClassModal] = useState(false);
  const [availablePackages, setAvailablePackages] = useState<AvailablePackage[]>([]);
  const [selectedPackage, setSelectedPackage] = useState<number | null>(null);
  const [showPackageModal, setShowPackageModal] = useState(false);
  const [showBookingModal, setShowBookingModal] = useState(false);
  const [reports, setReports] = useState<Report[]>([]);
  const [expandedReport, setExpandedReport] = useState<number | null>(null);
  const [absentLoadingId, setAbsentLoadingId] = useState<number | null>(null);
  const [absences, setAbsences] = useState<Absence[]>([]);

  // Waitlist
  const [waitlistEntries, setWaitlistEntries] = useState<WaitlistEntry[]>([]);
  const [waitlistTeachers, setWaitlistTeachers] = useState<{ id: number; name: string }[]>([]);
  const [showWaitlistForm, setShowWaitlistForm] = useState(false);
  const [waitlistForm, setWaitlistForm] = useState({ teacher_id: "", desired_date: "", desired_time: "" });
  const [waitlistSubmitting, setWaitlistSubmitting] = useState(false);
  const [waitlistMsg, setWaitlistMsg] = useState<string | null>(null);
  const [removingWaitlistId, setRemovingWaitlistId] = useState<number | null>(null);

  // Feedback
  const [feedbackText, setFeedbackText] = useState("");
  const [feedbackLoading, setFeedbackLoading] = useState(false);
  const [feedbackMsg, setFeedbackMsg] = useState<string | null>(null);

  // Cancellation policy
  const [cancellationHours, setCancellationHours] = useState(1);
  const [cancellingId, setCancellingId] = useState<number | null>(null);
  const [showCancelPolicyModal, setShowCancelPolicyModal] = useState(false);
  const [showCancelConfirm, setShowCancelConfirm] = useState<number | null>(null);
  const [copiedLinkId, setCopiedLinkId] = useState<number | null>(null);

  // Company settings for enrollment
  const [allowPickTeacher, setAllowPickTeacher] = useState(true);
  const [companyQrImage, setCompanyQrImage] = useState<string | null>(null);
  const [paymentMethod, setPaymentMethod] = useState<"encasher" | "communication_platform" | null>(null);
  const [teachers, setTeachers] = useState<{ id: number; name: string }[]>([]);

  const navigate = useNavigate();
  const { t } = useTranslation();
  const authContext = useContext(AuthContext);
  const token = authContext?.token ?? null;

  const fetchStudentData = async () => {
    if (!token) return;
    try {
      const [dashRes, settingsRes] = await Promise.all([
        axios.get(`${import.meta.env.VITE_API_URL}/api/student/dashboard`,
          { headers: { Authorization: `Bearer ${token}` } }),
        axios.get(`${import.meta.env.VITE_API_URL}/api/admin/company-settings`,
          { headers: { Authorization: `Bearer ${token}` } }),
      ]);

      setStudent(dashRes.data.student);
      setPackageDetails(dashRes.data.package || null);
      setAbsences(dashRes.data.absences || []);
      setCancellationHours(settingsRes.data.cancellation_hours ?? 1);

      const today = new Date();
      today.setHours(0, 0, 0, 0);
      const processedBookings: Record<string, string[]> = {};
      const todayAndFutureBookings: Booking[] = [];

      const normalizedBookings = (dashRes.data.bookings as Booking[]).map((booking) => {
        const localDate = fmtDate(booking.appointment_datetime, "yyyy-MM-dd");
        const localTime = fmtTime(booking.appointment_datetime).toUpperCase();
        return { ...booking, appointment_date: localDate, timeslot: localTime };
      });

      normalizedBookings.forEach((booking: Booking) => {
        const appointmentDateTime = parseUTC(booking.appointment_datetime) ?? new Date(booking.appointment_datetime);
        // Include all of today's classes (even past ones) plus future classes
        if (appointmentDateTime >= today) {
          const dateKey = booking.appointment_date;
          if (!processedBookings[dateKey]) processedBookings[dateKey] = [];
          processedBookings[dateKey].push(booking.timeslot);
          todayAndFutureBookings.push(booking);
        }
      });

      setCalendarBookings(processedBookings);
      setRawBookings(todayAndFutureBookings);
    } catch (error) {
      console.error("Error fetching student data:", error);
    }
  };

  useEffect(() => {
    if (!token) return;

    const fetchReports = async () => {
      try {
        const res = await axios.get(
          `${import.meta.env.VITE_API_URL}/api/reports/student`,
          { headers: { Authorization: `Bearer ${token}` } }
        );
        setReports(res.data);
      } catch (error) {
        console.error("Error fetching reports:", error);
      }
    };

    const fetchWaitlist = async () => {
      try {
        const [waitlistRes, teachersRes] = await Promise.all([
          axios.get(`${import.meta.env.VITE_API_URL}/api/waitlist`, { headers: { Authorization: `Bearer ${token}` } }),
          axios.get(`${import.meta.env.VITE_API_URL}/api/student/teachers`, { headers: { Authorization: `Bearer ${token}` } }),
        ]);
        setWaitlistEntries(waitlistRes.data);
        setWaitlistTeachers(teachersRes.data);
      } catch (error) {
        console.error("Error fetching waitlist:", error);
      }
    };

    fetchStudentData();
    fetchReports();
    fetchWaitlist();
  }, [token]);

  const handleAvailPackage = async () => {
    try {
      const base = import.meta.env.VITE_API_URL;
      const headers = { Authorization: `Bearer ${token}` };
      const [pkgRes, settingsRes, teachersRes] = await Promise.all([
        axios.get(`${base}/api/student/packages`, { headers }),
        axios.get(`${base}/api/admin/company-settings`, { headers }),
        axios.get(`${base}/api/student/teachers`, { headers }),
      ]);
      setAvailablePackages(pkgRes.data);
      setAllowPickTeacher(settingsRes.data.allow_student_pick_teacher);
      setCompanyQrImage(settingsRes.data.payment_qr_image || null);
      setPaymentMethod(settingsRes.data.payment_method || null);
      setTeachers(pkgRes.data.length > 0 ? teachersRes.data.map((t: { id: number; name: string }) => ({ id: t.id, name: t.name })) : []);
      setShowPackageModal(true);
    } catch (error) {
      console.error("Error fetching packages:", error);
    }
  };

  const confirmPackage = async (transactionOrderNumber: string | null, teacherId: number | null) => {
    if (!selectedPackage) return;
    try {
      await axios.post(`${import.meta.env.VITE_API_URL}/api/student/avail`, {
        package_id: selectedPackage,
        transaction_order_number: transactionOrderNumber,
        teacher_id: teacherId || undefined,
      }, { headers: { Authorization: `Bearer ${token}` } });
      setShowPackageModal(false);
      // Refresh dashboard to show updated package info
      fetchStudentData();
    } catch (error: unknown) {
      const msg = (error as { response?: { data?: { message?: string } } })?.response?.data?.message || "Failed to avail package. Please try again.";
      alert(msg);
    }
  };

  const handleMarkTeacherAbsent = async (bookingId: number) => {
    setAbsentLoadingId(bookingId);
    try {
      await axios.post(
        `${import.meta.env.VITE_API_URL}/api/student/bookings/${bookingId}/mark-teacher-absent`,
        {},
        { headers: { Authorization: `Bearer ${token}` } }
      );
      // Refresh dashboard data so the modal reflects the change
      const response = await axios.get(
        `${import.meta.env.VITE_API_URL}/api/student/dashboard`,
        { headers: { Authorization: `Bearer ${token}` } }
      );
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      const updated = (response.data.bookings as Booking[])
        .map((booking) => {
          const localDate = fmtDate(booking.appointment_datetime, "yyyy-MM-dd");
          const localTime = fmtTime(booking.appointment_datetime).toUpperCase();
          return { ...booking, appointment_date: localDate, timeslot: localTime };
        })
        .filter((b) => (parseUTC(b.appointment_datetime) ?? new Date(b.appointment_datetime)) >= today);
      setRawBookings(updated);
      // Update the modal's selected bookings too
      setSelectedDateBookings((prev) =>
        prev.map((b) => b.id === bookingId ? { ...b, teacher_absent: true } : b)
      );
    } catch (err: unknown) {
      const msg = (err as { response?: { data?: { message?: string } } })?.response?.data?.message || "Failed to mark teacher absent";
      alert(msg);
    } finally {
      setAbsentLoadingId(null);
    }
  };

  const handleStudentCancel = (bookingId: number, appointmentDatetime: string) => {
    const apptTime = parseUTC(appointmentDatetime)?.getTime() ?? 0;
    const hoursUntil = (apptTime - Date.now()) / (1000 * 60 * 60);
    if (cancellationHours > 0 && hoursUntil < cancellationHours) {
      // Within window — notify teacher via backend (fire-and-forget), show policy modal
      axios.delete(`${import.meta.env.VITE_API_URL}/api/bookings/${bookingId}`, {
        headers: { Authorization: `Bearer ${token}` },
      }).catch(() => {});
      setShowCancelPolicyModal(true);
    } else {
      setShowCancelConfirm(bookingId);
    }
  };

  const handleConfirmCancel = async () => {
    if (!showCancelConfirm) return;
    const id = showCancelConfirm;
    setCancellingId(id);
    setShowCancelConfirm(null);
    try {
      await axios.delete(`${import.meta.env.VITE_API_URL}/api/bookings/${id}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      setShowClassModal(false);
      // Refresh dashboard
      const [dashRes, settingsRes] = await Promise.all([
        axios.get(`${import.meta.env.VITE_API_URL}/api/student/dashboard`,
          { headers: { Authorization: `Bearer ${token}` } }),
        axios.get(`${import.meta.env.VITE_API_URL}/api/admin/company-settings`,
          { headers: { Authorization: `Bearer ${token}` } }),
      ]);
      setPackageDetails(dashRes.data.package || null);
      setAbsences(dashRes.data.absences || []);
      setCancellationHours(settingsRes.data.cancellation_hours ?? 1);
      const today = new Date(); today.setHours(0, 0, 0, 0);
      const processedBookings: Record<string, string[]> = {};
      const todayAndFutureBookings: Booking[] = [];
      (dashRes.data.bookings as Booking[])
        .map((booking) => {
          const localDate = fmtDate(booking.appointment_datetime, "yyyy-MM-dd");
          const localTime = fmtTime(booking.appointment_datetime).toUpperCase();
          return { ...booking, appointment_date: localDate, timeslot: localTime };
        })
        .forEach((booking: Booking) => {
          const dt = parseUTC(booking.appointment_datetime) ?? new Date(booking.appointment_datetime);
          if (dt >= today) {
            const dk = booking.appointment_date;
            if (!processedBookings[dk]) processedBookings[dk] = [];
            processedBookings[dk].push(booking.timeslot);
            todayAndFutureBookings.push(booking);
          }
        });
      setCalendarBookings(processedBookings);
      setRawBookings(todayAndFutureBookings);
    } catch (err: unknown) {
      const msg = (err as { response?: { data?: { message?: string } } })?.response?.data?.message || "Failed to cancel class";
      alert(msg);
    } finally {
      setCancellingId(null);
    }
  };

  const handleDateClick = (date: Date) => {
    const localDate = new Date(date.getTime() - date.getTimezoneOffset() * 60000)
      .toISOString()
      .split("T")[0];
    navigate(`/timeslots/${localDate}`);
  };

  const confirmBooking = async () => {
    setShowBookingModal(false);
  };

  const handleSubmitFeedback = async () => {
    if (!feedbackText.trim()) return;
    setFeedbackLoading(true);
    setFeedbackMsg(null);
    try {
      await axios.post(
        `${import.meta.env.VITE_API_URL}/api/student/feedback`,
        { message: feedbackText.trim() },
        { headers: { Authorization: `Bearer ${token}` } }
      );
      setFeedbackText("");
      setFeedbackMsg(t("student.feedbackSuccess"));
    } catch {
      setFeedbackMsg(t("student.feedbackFailed"));
    } finally {
      setFeedbackLoading(false);
    }
  };

  const handleJoinWaitlist = async () => {
    const { teacher_id, desired_date, desired_time } = waitlistForm;
    if (!teacher_id || !desired_date || !desired_time) return;
    setWaitlistSubmitting(true);
    setWaitlistMsg(null);
    try {
      await axios.post(`${import.meta.env.VITE_API_URL}/api/waitlist`,
        { teacher_id: Number(teacher_id), desired_date, desired_time },
        { headers: { Authorization: `Bearer ${token}` } }
      );
      setWaitlistForm({ teacher_id: "", desired_date: "", desired_time: "" });
      setShowWaitlistForm(false);
      setWaitlistMsg(t("student.waitlistSuccess"));
      const res = await axios.get(`${import.meta.env.VITE_API_URL}/api/waitlist`, { headers: { Authorization: `Bearer ${token}` } });
      setWaitlistEntries(res.data);
    } catch (err: unknown) {
      const msg = (err as { response?: { data?: { message?: string } } })?.response?.data?.message || "Failed to join waitlist";
      setWaitlistMsg(msg);
    } finally {
      setWaitlistSubmitting(false);
    }
  };

  const handleRemoveWaitlist = async (id: number) => {
    setRemovingWaitlistId(id);
    try {
      await axios.delete(`${import.meta.env.VITE_API_URL}/api/waitlist/${id}`, { headers: { Authorization: `Bearer ${token}` } });
      setWaitlistEntries(prev => prev.filter(e => e.id !== id));
    } catch (err: unknown) {
      const msg = (err as { response?: { data?: { message?: string } } })?.response?.data?.message || "Failed to remove";
      alert(msg);
    } finally {
      setRemovingWaitlistId(null);
    }
  };

  const handleLogout = () => {
    authContext?.logout();
    navigate("/");
  };

  return (
    <div className="min-h-screen brand-gradient-subtle pattern-dots-light">
      {/* Header */}
      <div className="brand-gradient shadow-lg sticky top-0 z-50">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between">
          <BrandLogo variant="white" />

          <div className="hidden md:flex flex-col items-end">
            <p className="text-xs text-white/60">
              {t("student.nationality")} {student?.nationality || "N/A"}
            </p>
            <p className="text-xs text-white/60">
              {t("student.age")} {student?.age || "N/A"}
            </p>
          </div>

          <div className="flex items-center gap-2">
            <LanguageToggle variant="white" />
            <NotificationBell variant="white" />
            <Button
              variant="ghost"
              size="sm"
              onClick={() => navigate("/student-profile")}
              className="text-white/70 hover:text-white hover:bg-white/10"
            >
              <UserCircle className="h-5 w-5" />
            </Button>
            <Button
              variant="ghost"
              size="sm"
              onClick={handleLogout}
              className="text-white/70 hover:text-white hover:bg-white/10"
            >
              <LogOut className="h-4 w-4 mr-1" />
              {t("student.logout")}
            </Button>
          </div>
        </div>

        <div className="max-w-7xl mx-auto px-4 pb-5">
          <p className="text-sm text-white/60">{t("student.hiIAm")}</p>
          <h1 className="text-3xl font-bold text-white">
            {student?.name || "Student"}
          </h1>
        </div>
      </div>

      {/* Main content */}
      <div className="max-w-7xl mx-auto px-4 py-8 grid grid-cols-1 md:grid-cols-2 gap-8">
        {/* Left — profile info */}
        <div className="space-y-5">
          <div className="flex items-center gap-2 text-sm">
            <User className="h-4 w-4 text-primary" />
            <span className="text-muted-foreground">{t("student.guardian")}</span>
            <span className="font-medium">{student?.guardian_name || "N/A"}</span>
          </div>

          <div className="flex items-center gap-2 text-sm">
            <CalendarDays className="h-4 w-4 text-primary" />
            <span className="text-muted-foreground">{t("student.dateEnrolled")}</span>
            <span className="font-medium">
              {student?.created_at
                ? fmtDateOnly(student.created_at)
                : "—"}
            </span>
          </div>

          {packageDetails ? (
            <div className="stat-card bg-white rounded-xl p-4 pl-6 shadow-sm border space-y-2">
              <div className="flex items-center gap-2">
                <Package className="h-4 w-4 text-blue-600" />
                <span className="font-semibold text-sm text-gray-800">
                  {packageDetails.package_name}
                </span>
              </div>
              <div className="flex items-center gap-2 flex-wrap">
                <Badge className="bg-[#D0E8F0] text-[#2E6B9E] border-0">
                  {t("student.sessionsRemaining", { count: packageDetails.unused_sessions })}
                </Badge>
                {packageDetails.sessions_remaining !== packageDetails.unused_sessions && (
                  <Badge variant="outline" className="text-muted-foreground">
                    {t("student.sessionsAvailableToBook", { count: packageDetails.sessions_remaining })}
                  </Badge>
                )}
              </div>
            </div>
          ) : (
            <p className="text-muted-foreground text-sm italic">
              {t("student.noPackage")}
            </p>
          )}

          <div className="space-y-1.5">
            <label className="text-sm font-medium">{t("student.feedback")}</label>
            <Textarea
              rows={3}
              placeholder={t("student.feedbackPlaceholder")}
              className="resize-none"
              value={feedbackText}
              onChange={(e) => { setFeedbackText(e.target.value); setFeedbackMsg(null); }}
              disabled={feedbackLoading}
            />
            {feedbackMsg && (
              <p className={`text-xs ${feedbackMsg === t("student.feedbackFailed") ? "text-destructive" : "text-green-600"}`}>
                {feedbackMsg}
              </p>
            )}
            <Button
              size="sm"
              className="gap-1.5 mt-1"
              onClick={handleSubmitFeedback}
              disabled={feedbackLoading || !feedbackText.trim()}
            >
              <Send className="h-3.5 w-3.5" />
              {feedbackLoading ? t("student.submitting") : t("student.submitFeedback")}
            </Button>
          </div>
        </div>

        {/* Right — calendar */}
        <div className="space-y-4">
          <Button
            onClick={handleAvailPackage}
            className="w-full accent-gradient text-white shadow-md hover:shadow-lg transition-shadow border-0"
          >
            {t("student.availPackage")}
          </Button>

          <h4 className="font-semibold text-gray-700">{t("student.bookedClasses")}</h4>
          <Calendar
            className="custom-calendar"
            onClickDay={handleDateClick}
            tileContent={({ date }) => {
              const dateString = date.toLocaleDateString("en-CA");
              return calendarBookings[dateString] ? (
                <div className="booking-name">
                  {calendarBookings[dateString].map((slot, i) => (
                    <p key={i} className="m-0">
                      {slot}
                    </p>
                  ))}
                </div>
              ) : null;
            }}
          />
        </div>
      </div>

      {/* My Reports */}
      {reports.length > 0 && (
        <div className="max-w-7xl mx-auto px-4 pb-10">
          <Card>
            <CardHeader>
              <CardTitle className="text-base flex items-center gap-2">
                <FileText className="h-4 w-4 text-primary" />
                {t("student.myReports")}
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              {reports.map((r) => (
                <div key={r.id} className="border rounded-lg overflow-hidden">
                  <button
                    className="w-full px-4 py-3 flex items-center justify-between text-left hover:bg-gray-50 transition-colors"
                    onClick={() => setExpandedReport(expandedReport === r.id ? null : r.id)}
                  >
                    <div>
                      <span className="font-medium text-sm">
                        {fmtDateOnly(r.appointment_date)}
                      </span>
                      <span className="text-xs text-muted-foreground ml-2">
                        {t("student.by")} {r.teacher_name}
                      </span>
                    </div>
                    <span className="text-xs text-muted-foreground">
                      {expandedReport === r.id ? "▲" : "▼"}
                    </span>
                  </button>
                  {expandedReport === r.id && (
                    <div className="px-4 pb-4 grid grid-cols-1 md:grid-cols-2 gap-4 bg-gray-50 border-t">
                      {r.new_words && (
                        <div className="pt-3">
                          <p className="text-xs font-semibold text-muted-foreground uppercase mb-1">{t("student.newWords")}</p>
                          <p className="text-sm whitespace-pre-wrap">{r.new_words}</p>
                        </div>
                      )}
                      {r.sentences && (
                        <div className="pt-3">
                          <p className="text-xs font-semibold text-muted-foreground uppercase mb-1">{t("student.sentences")}</p>
                          <p className="text-sm whitespace-pre-wrap">{r.sentences}</p>
                        </div>
                      )}
                      {r.notes && (
                        <div className="pt-3">
                          <p className="text-xs font-semibold text-muted-foreground uppercase mb-1">{t("student.notes")}</p>
                          <p className="text-sm whitespace-pre-wrap">{r.notes}</p>
                        </div>
                      )}
                      {r.remarks && (
                        <div className="pt-3">
                          <p className="text-xs font-semibold text-muted-foreground uppercase mb-1">{t("student.remarks")}</p>
                          <p className="text-sm whitespace-pre-wrap">{r.remarks}</p>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              ))}
            </CardContent>
          </Card>
        </div>
      )}

      {/* Absence History */}
      {absences.length > 0 && (
        <div className="max-w-7xl mx-auto px-4 pb-10">
          <Card>
            <CardHeader>
              <CardTitle className="text-base flex items-center gap-2">
                <UserX className="h-4 w-4 text-primary" />
                {t("student.absenceHistory")}
              </CardTitle>
            </CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>{t("student.dateTime")}</TableHead>
                    <TableHead>{t("student.teacher")}</TableHead>
                    <TableHead>{t("student.reason")}</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {absences.map((a) => (
                    <TableRow key={a.id}>
                      <TableCell className="text-sm">
                        {fmtDate(a.appointment_date, "MMM d, yyyy h:mm a")}
                      </TableCell>
                      <TableCell className="text-sm">{a.teacher_name || "—"}</TableCell>
                      <TableCell>
                        {a.student_absent && (
                          <span className="text-xs px-2 py-1 rounded-full font-medium bg-orange-100 text-orange-700">
                            {t("student.youAbsent")}
                          </span>
                        )}
                        {a.teacher_absent && (
                          <span className="text-xs px-2 py-1 rounded-full font-medium bg-red-100 text-red-700 ml-1">
                            {t("student.teacherAbsent")}
                          </span>
                        )}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </div>
      )}

      {/* My Waitlist */}
      <div className="max-w-7xl mx-auto px-4 pb-10">
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <CardTitle className="text-base flex items-center gap-2">
                <Clock className="h-4 w-4 text-primary" />
                {t("student.myWaitlist")}
              </CardTitle>
              <Button size="sm" variant="outline" className="gap-1.5"
                onClick={() => { setShowWaitlistForm(v => !v); setWaitlistMsg(null); }}>
                <Plus className="h-3.5 w-3.5" />
                {showWaitlistForm ? t("student.cancel") : t("student.joinWaitlist")}
              </Button>
            </div>
          </CardHeader>
          <CardContent className="space-y-4">
            {/* Add form */}
            {showWaitlistForm && (
              <div className="rounded-lg border p-4 space-y-3 bg-gray-50">
                <p className="text-xs text-muted-foreground">
                  {t("student.waitlistHint")}
                </p>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  <div className="space-y-1">
                    <label className="text-xs font-medium">{t("student.teacher")}</label>
                    <select
                      value={waitlistForm.teacher_id}
                      onChange={e => setWaitlistForm(f => ({ ...f, teacher_id: e.target.value }))}
                      className="w-full h-9 rounded-md border border-input bg-background px-3 py-1 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                    >
                      <option value="">{t("student.selectTeacher")}</option>
                      {waitlistTeachers.map(t => (
                        <option key={t.id} value={t.id}>{t.name}</option>
                      ))}
                    </select>
                  </div>
                  <div className="space-y-1">
                    <label className="text-xs font-medium">{t("student.date")}</label>
                    <input
                      type="date"
                      value={waitlistForm.desired_date}
                      min={new Date().toISOString().split("T")[0]}
                      onChange={e => setWaitlistForm(f => ({ ...f, desired_date: e.target.value }))}
                      className="w-full h-9 rounded-md border border-input bg-background px-3 py-1 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                    />
                  </div>
                  <div className="space-y-1">
                    <label className="text-xs font-medium">{t("student.time")}</label>
                    <input
                      type="time"
                      value={waitlistForm.desired_time}
                      onChange={e => setWaitlistForm(f => ({ ...f, desired_time: e.target.value }))}
                      className="w-full h-9 rounded-md border border-input bg-background px-3 py-1 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                    />
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <Button size="sm" onClick={handleJoinWaitlist}
                    disabled={waitlistSubmitting || !waitlistForm.teacher_id || !waitlistForm.desired_date || !waitlistForm.desired_time}>
                    {waitlistSubmitting ? t("student.joining") : t("student.joinWaitlist")}
                  </Button>
                </div>
              </div>
            )}

            {waitlistMsg && (
              <p className={`text-xs ${waitlistMsg === t("student.waitlistSuccess") ? "text-green-600" : "text-destructive"}`}>
                {waitlistMsg}
              </p>
            )}

            {/* Entries table */}
            {waitlistEntries.length === 0 ? (
              <p className="text-sm text-muted-foreground italic">
                {t("student.noWaitlist")}
              </p>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>{t("student.date")}</TableHead>
                    <TableHead>{t("student.time")}</TableHead>
                    <TableHead>{t("student.teacher")}</TableHead>
                    <TableHead>{t("student.status")}</TableHead>
                    <TableHead></TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {waitlistEntries.map(entry => (
                    <TableRow key={entry.id}>
                      <TableCell className="text-sm">
                        {new Date(entry.desired_date).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}
                      </TableCell>
                      <TableCell className="text-sm">{entry.desired_time}</TableCell>
                      <TableCell className="text-sm">{entry.teacher_name || "—"}</TableCell>
                      <TableCell>
                        <span className={`text-xs px-2 py-1 rounded-full font-medium ${
                          entry.status === "waiting" ? "bg-yellow-100 text-yellow-700"
                          : entry.status === "notified" ? "bg-green-100 text-green-700"
                          : "bg-gray-100 text-gray-600"
                        }`}>
                          {t(`student.status${entry.status.charAt(0).toUpperCase() + entry.status.slice(1)}`)}
                        </span>
                      </TableCell>
                      <TableCell>
                        {entry.status === "waiting" && (
                          <Button size="sm" variant="ghost"
                            className="h-7 w-7 p-0 text-muted-foreground hover:text-destructive"
                            disabled={removingWaitlistId === entry.id}
                            onClick={() => handleRemoveWaitlist(entry.id)}
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </Button>
                        )}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>
      </div>

      <PackageSelectionModal
        show={showPackageModal}
        onHide={() => setShowPackageModal(false)}
        availablePackages={availablePackages}
        setSelectedPackage={setSelectedPackage}
        confirmPackage={confirmPackage}
        allowPickTeacher={allowPickTeacher}
        teachers={teachers}
        companyQrImage={companyQrImage}
        paymentMethod={paymentMethod}
      />

      <BookingConfirmationModal
        show={showBookingModal}
        onHide={() => setShowBookingModal(false)}
        confirmBooking={confirmBooking}
      />

      {/* Cancellation Policy Modal */}
      <Dialog open={showCancelPolicyModal} onOpenChange={setShowCancelPolicyModal}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>{t("student.cancelNotAllowed")}</DialogTitle>
          </DialogHeader>
          <div className="py-2 text-sm text-muted-foreground space-y-2">
            <p>
              {t("student.cancelPolicyMsg", { hours: cancellationHours })}
            </p>
            <p>
              {t("student.cancelPolicyNote")}
            </p>
          </div>
          <div className="flex justify-end">
            <Button onClick={() => setShowCancelPolicyModal(false)}>{t("student.understood")}</Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Confirm Cancel Modal */}
      <Dialog open={showCancelConfirm !== null} onOpenChange={(o) => { if (!o) setShowCancelConfirm(null); }}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>{t("student.cancelClass")}</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground py-2">
            {t("student.cancelConfirm")}
          </p>
          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={() => setShowCancelConfirm(null)}>{t("student.noKeepIt")}</Button>
            <Button variant="destructive" onClick={handleConfirmCancel}>{t("student.yesCancel")}</Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Class Info Modal */}
      <Dialog open={showClassModal} onOpenChange={setShowClassModal}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Video className="h-4 w-4 text-primary" />
              {t("student.classDetails")}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            {selectedDateBookings.map((b) => {
              const classTime = parseUTC(b.appointment_datetime)?.getTime() ?? 0;
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
                      {t(`student.status${b.status.charAt(0).toUpperCase() + b.status.slice(1)}`)}
                    </span>
                  </div>
                  <div className="text-sm text-muted-foreground space-y-1.5">
                    <div className="flex items-center gap-1.5">
                      <User className="h-3.5 w-3.5" />
                      <span>{t("student.teacher")}: <span className="text-foreground font-medium">{b.teacher_name || t("student.tba")}</span></span>
                    </div>
                    <div className="flex items-center gap-1.5">
                      <Video className="h-3.5 w-3.5" />
                      <span>{t("student.mode")} <span className="text-foreground font-medium">{b.class_mode || t("student.notSet")}</span></span>
                    </div>
                    {b.meeting_link ? (
                      <div className="flex items-start gap-1.5">
                        <CalendarDays className="h-3.5 w-3.5 mt-0.5" />
                        <span className="flex items-center gap-1.5 flex-wrap">{t("student.link")} <a href={b.meeting_link} target="_blank" rel="noopener noreferrer"
                          className="text-primary underline break-all font-medium">{b.meeting_link}</a>
                          <button
                            onClick={() => {
                              navigator.clipboard.writeText(b.meeting_link!);
                              setCopiedLinkId(b.id);
                              setTimeout(() => setCopiedLinkId(null), 2000);
                            }}
                            className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-xs font-medium bg-primary/10 text-primary hover:bg-primary/20 transition-colors"
                            title={t("student.copyLink")}
                          >
                            {copiedLinkId === b.id ? <><Check className="h-3 w-3" /> {t("student.copied")}</> : <><Copy className="h-3 w-3" /> {t("student.copy")}</>}
                          </button>
                        </span>
                      </div>
                    ) : (
                      <div className="flex items-center gap-1.5">
                        <CalendarDays className="h-3.5 w-3.5" />
                        <span>{t("student.link")} <span className="text-foreground font-medium">{t("student.notSet")}</span></span>
                      </div>
                    )}
                  </div>
                  {/* Absence indicators / action */}
                  {b.student_absent && (
                    <div className="pt-1">
                      <span className="text-xs px-2 py-1 rounded-full font-medium bg-orange-100 text-orange-700">
                        {t("student.youMarkedAbsent")}
                      </span>
                    </div>
                  )}
                  {b.teacher_absent ? (
                    <div className="pt-1">
                      <span className="text-xs px-2 py-1 rounded-full font-medium bg-red-100 text-red-700">
                        {t("student.teacherMarkedAbsent")}
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
                        {absentLoadingId === b.id ? t("student.marking") : t("student.markTeacherAbsent")}
                      </Button>
                    </div>
                  ) : null}
                  {/* Cancel button — only shown for future classes */}
                  {Date.now() < (parseUTC(b.appointment_datetime)?.getTime() ?? 0) && (
                    <div className="pt-1">
                      <Button
                        size="sm"
                        variant="outline"
                        className="text-xs h-7 border-destructive text-destructive hover:bg-red-50"
                        disabled={cancellingId === b.id}
                        onClick={() => handleStudentCancel(b.id, b.appointment_datetime)}
                      >
                        {cancellingId === b.id ? t("student.cancelling") : t("student.cancelClass")}
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
  );
};

export default StudentDashboard;
