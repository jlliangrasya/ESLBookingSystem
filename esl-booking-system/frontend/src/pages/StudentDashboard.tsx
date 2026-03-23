import { useState, useEffect, useContext } from "react";
import { useNavigate } from "react-router-dom";
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
import { LogOut, Package, CalendarDays, User, FileText, Video, UserX, Send, Copy, Check, UserCircle } from "lucide-react";
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
  const [teachers, setTeachers] = useState<{ id: number; name: string }[]>([]);

  const navigate = useNavigate();
  const authContext = useContext(AuthContext);
  const token = authContext?.token ?? null;

  useEffect(() => {
    if (!token) return;

    const fetchStudentData = async () => {
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

    fetchStudentData();
    fetchReports();
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
      setTeachers(pkgRes.data.length > 0 ? teachersRes.data.map((t: { id: number; name: string }) => ({ id: t.id, name: t.name })) : []);
      setShowPackageModal(true);
    } catch (error) {
      console.error("Error fetching packages:", error);
    }
  };

  const confirmPackage = async (receiptImage: string | null, teacherId: number | null) => {
    if (!selectedPackage) return;
    try {
      await axios.post(`${import.meta.env.VITE_API_URL}/api/student/avail`, {
        package_id: selectedPackage,
        receipt_image: receiptImage,
        teacher_id: teacherId || undefined,
      }, { headers: { Authorization: `Bearer ${token}` } });
      setShowPackageModal(false);
    } catch (error) {
      console.error("Error confirming package:", error);
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
      setFeedbackMsg("Feedback submitted! Your teacher and admin have been notified.");
    } catch {
      setFeedbackMsg("Failed to submit feedback. Please try again.");
    } finally {
      setFeedbackLoading(false);
    }
  };

  const handleLogout = () => {
    authContext?.logout();
    navigate("/");
  };

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <div className="bg-white shadow-sm border-b border-border sticky top-0 z-50">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between">
          <BrandLogo />

          <div className="hidden md:flex flex-col items-end">
            <p className="text-xs text-muted-foreground">
              Nationality: {student?.nationality || "N/A"}
            </p>
            <p className="text-xs text-muted-foreground">
              Age: {student?.age || "N/A"}
            </p>
          </div>

          <div className="flex items-center gap-2">
            <LanguageToggle />
            <NotificationBell />
            <Button
              variant="ghost"
              size="sm"
              onClick={() => navigate("/student-profile")}
              className="text-muted-foreground hover:text-primary"
            >
              <UserCircle className="h-5 w-5" />
            </Button>
            <Button
              variant="ghost"
              size="sm"
              onClick={handleLogout}
              className="text-muted-foreground hover:text-destructive"
            >
              <LogOut className="h-4 w-4 mr-1" />
              Logout
            </Button>
          </div>
        </div>

        <div className="max-w-7xl mx-auto px-4 pb-4">
          <p className="text-sm text-muted-foreground">Hi, I am</p>
          <h1 className="text-3xl font-bold text-gray-800">
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
            <span className="text-muted-foreground">Guardian:</span>
            <span className="font-medium">{student?.guardian_name || "N/A"}</span>
          </div>

          <div className="flex items-center gap-2 text-sm">
            <CalendarDays className="h-4 w-4 text-primary" />
            <span className="text-muted-foreground">Date Enrolled:</span>
            <span className="font-medium">
              {student?.created_at
                ? fmtDateOnly(student.created_at)
                : "—"}
            </span>
          </div>

          {packageDetails ? (
            <div className="bg-white rounded-xl p-4 shadow-sm border space-y-2">
              <div className="flex items-center gap-2">
                <Package className="h-4 w-4 text-primary" />
                <span className="font-semibold text-sm">
                  {packageDetails.package_name}
                </span>
              </div>
              <div className="flex items-center gap-2">
                <Badge variant="secondary">
                  {packageDetails.sessions_remaining} sessions remaining
                </Badge>
              </div>
            </div>
          ) : (
            <p className="text-muted-foreground text-sm italic">
              No package availed yet.
            </p>
          )}

          <div className="space-y-1.5">
            <label className="text-sm font-medium">Feedback</label>
            <Textarea
              rows={3}
              placeholder="Leave your feedback here..."
              className="resize-none"
              value={feedbackText}
              onChange={(e) => { setFeedbackText(e.target.value); setFeedbackMsg(null); }}
              disabled={feedbackLoading}
            />
            {feedbackMsg && (
              <p className={`text-xs ${feedbackMsg.startsWith("Failed") ? "text-destructive" : "text-green-600"}`}>
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
              {feedbackLoading ? "Submitting..." : "Submit Feedback"}
            </Button>
          </div>
        </div>

        {/* Right — calendar */}
        <div className="space-y-4">
          <Button
            onClick={handleAvailPackage}
            className="w-full shadow"
          >
            Avail a Package
          </Button>

          <h4 className="font-semibold text-gray-700">Booked Classes</h4>
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
                My Class Reports
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
                        by {r.teacher_name}
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
                          <p className="text-xs font-semibold text-muted-foreground uppercase mb-1">New Words</p>
                          <p className="text-sm whitespace-pre-wrap">{r.new_words}</p>
                        </div>
                      )}
                      {r.sentences && (
                        <div className="pt-3">
                          <p className="text-xs font-semibold text-muted-foreground uppercase mb-1">Sentences</p>
                          <p className="text-sm whitespace-pre-wrap">{r.sentences}</p>
                        </div>
                      )}
                      {r.notes && (
                        <div className="pt-3">
                          <p className="text-xs font-semibold text-muted-foreground uppercase mb-1">Notes</p>
                          <p className="text-sm whitespace-pre-wrap">{r.notes}</p>
                        </div>
                      )}
                      {r.remarks && (
                        <div className="pt-3">
                          <p className="text-xs font-semibold text-muted-foreground uppercase mb-1">Remarks</p>
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
                Absence History
              </CardTitle>
            </CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Date &amp; Time</TableHead>
                    <TableHead>Teacher</TableHead>
                    <TableHead>Reason</TableHead>
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
                            You were absent
                          </span>
                        )}
                        {a.teacher_absent && (
                          <span className="text-xs px-2 py-1 rounded-full font-medium bg-red-100 text-red-700 ml-1">
                            Teacher absent
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

      <PackageSelectionModal
        show={showPackageModal}
        onHide={() => setShowPackageModal(false)}
        availablePackages={availablePackages}
        setSelectedPackage={setSelectedPackage}
        confirmPackage={confirmPackage}
        allowPickTeacher={allowPickTeacher}
        teachers={teachers}
        companyQrImage={companyQrImage}
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
            <DialogTitle>Cancellation Not Allowed</DialogTitle>
          </DialogHeader>
          <div className="py-2 text-sm text-muted-foreground space-y-2">
            <p>
              Cancellation of classes within <span className="font-semibold text-foreground">{cancellationHours} hour(s)</span> of the scheduled time is not allowed.
            </p>
            <p>
              If you cannot attend the class, you will be marked as absent and the session will be deducted accordingly. Your teacher has been notified.
            </p>
          </div>
          <div className="flex justify-end">
            <Button onClick={() => setShowCancelPolicyModal(false)}>Understood</Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Confirm Cancel Modal */}
      <Dialog open={showCancelConfirm !== null} onOpenChange={(o) => { if (!o) setShowCancelConfirm(null); }}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Cancel Class</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground py-2">
            Are you sure you want to cancel this class? Your teacher and admin will be notified.
          </p>
          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={() => setShowCancelConfirm(null)}>No, Keep It</Button>
            <Button variant="destructive" onClick={handleConfirmCancel}>Yes, Cancel</Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Class Info Modal */}
      <Dialog open={showClassModal} onOpenChange={setShowClassModal}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Video className="h-4 w-4 text-primary" />
              Class Details
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
                  {Date.now() < (parseUTC(b.appointment_datetime)?.getTime() ?? 0) && (
                    <div className="pt-1">
                      <Button
                        size="sm"
                        variant="outline"
                        className="text-xs h-7 border-destructive text-destructive hover:bg-red-50"
                        disabled={cancellingId === b.id}
                        onClick={() => handleStudentCancel(b.id, b.appointment_datetime)}
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
  );
};

export default StudentDashboard;
