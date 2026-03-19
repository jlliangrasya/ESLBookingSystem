import { useState, useEffect, useContext } from "react";
import axios from "axios";
import { useNavigate } from "react-router-dom";
import AuthContext from "@/context/AuthContext";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { CalendarDays, Users, LogOut, Loader2, FileText, CalendarOff, Plus, X, MessageSquare, Ban, CheckCircle } from "lucide-react";
import logo from "../assets/EuniTalk_Logo.png";
import NotificationBell from "@/components/NotificationBell";
import ReportModal from "@/components/ReportModal";
import { fmtDate, fmtDateOnly, parseUTC } from "@/utils/timezone";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";

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
  package_name: string;
  sessions_remaining: number;
  subject: string;
  payment_status: string;
}

interface Booking {
  id: number;
  appointment_date: string;
  status: string;
  student_name: string;
  package_name: string;
  subject: string;
  class_mode: string | null;
  meeting_link: string | null;
  student_absent: boolean;
}

interface CompletedBooking {
  id: number;
  appointment_date: string;
  status: string;
  student_name: string;
  student_id: number;
  package_name: string;
  subject: string;
  has_report: boolean;
  student_absent: boolean;
  teacher_absent: boolean;
}

interface TeacherLeave {
  id: number;
  leave_date: string;
  reason_type: string;
  notes: string | null;
  status: string;
  created_at: string;
}

const leaveStatusColors: Record<string, string> = {
  pending: "bg-yellow-100 text-yellow-800",
  approved: "bg-green-100 text-green-800",
  rejected: "bg-red-100 text-red-800",
};

const statusColors: Record<string, string> = {
  pending: "bg-yellow-100 text-yellow-800",
  confirmed: "bg-green-100 text-green-800",
  done: "bg-blue-100 text-blue-800",
  cancelled: "bg-red-100 text-red-800",
};

const TeacherDashboard = () => {
  const [teacher, setTeacher] = useState<Teacher | null>(null);
  const [students, setStudents] = useState<AssignedStudent[]>([]);
  const [bookings, setBookings] = useState<Booking[]>([]);
  const [completedBookings, setCompletedBookings] = useState<CompletedBooking[]>([]);
  const [classesThisWeek, setClassesThisWeek] = useState(0);
  const [classesThisMonth, setClassesThisMonth] = useState(0);
  const [pickerMonth, setPickerMonth] = useState(new Date().getMonth() + 1);
  const [pickerYear, setPickerYear] = useState(new Date().getFullYear());
  const [pickerCount, setPickerCount] = useState<number | null>(null);
  const [pickerLoading, setPickerLoading] = useState(false);
  const [loading, setLoading] = useState(true);

  const [reportModal, setReportModal] = useState<{
    open: boolean;
    bookingId: number;
    studentId: number;
    studentName: string;
  }>({ open: false, bookingId: 0, studentId: 0, studentName: "" });

  const [leaves, setLeaves] = useState<TeacherLeave[]>([]);
  const [showLeaveModal, setShowLeaveModal] = useState(false);
  const [leaveForm, setLeaveForm] = useState({ leave_date: "", reason_type: "personal", notes: "" });
  const [leaveLoading, setLeaveLoading] = useState(false);

  const [editingBooking, setEditingBooking] = useState<Booking | null>(null);
  const [classForm, setClassForm] = useState({ class_mode: "", meeting_link: "" });
  const [classInfoLoading, setClassInfoLoading] = useState(false);
  const [classInfoError, setClassInfoError] = useState<string | null>(null);

  const [absentLoadingId, setAbsentLoadingId] = useState<number | null>(null);

  const [feedback, setFeedback] = useState<{ id: number; student_name: string; message: string; created_at: string }[]>([]);

  const [cancellationHours, setCancellationHours] = useState(1);

  const [availability, setAvailability] = useState<{ id: number; date: string; time: string }[]>([]);
  const [availForm, setAvailForm] = useState({ date: "", time: "" });
  const [availLoading, setAvailLoading] = useState(false);
  const [availError, setAvailError] = useState<string | null>(null);
  const [cancelConfirm, setCancelConfirm] = useState<Booking | null>(null);
  const [cancelLoading, setCancelLoading] = useState(false);
  const [cancelBlocked, setCancelBlocked] = useState(false);

  const authContext = useContext(AuthContext);
  const navigate = useNavigate();
  const token = localStorage.getItem("token");

  const fetchData = async () => {
    try {
      const [dashRes, settingsRes, feedbackRes] = await Promise.all([
        axios.get(`${import.meta.env.VITE_API_URL}/api/teacher/dashboard`,
          { headers: { Authorization: `Bearer ${token}` } }),
        axios.get(`${import.meta.env.VITE_API_URL}/api/admin/company-settings`,
          { headers: { Authorization: `Bearer ${token}` } }),
        axios.get(`${import.meta.env.VITE_API_URL}/api/teacher/feedback`,
          { headers: { Authorization: `Bearer ${token}` } }),
      ]);
      setTeacher(dashRes.data.teacher);
      setStudents(dashRes.data.students);
      setBookings(dashRes.data.bookings);
      setCompletedBookings(dashRes.data.completedBookings || []);
      setClassesThisWeek(dashRes.data.classes_this_week ?? 0);
      setClassesThisMonth(dashRes.data.classes_this_month ?? 0);
      setCancellationHours(settingsRes.data.cancellation_hours ?? 1);
      setFeedback(feedbackRes.data || []);
    } catch (err) {
      console.error("Error fetching teacher dashboard:", err);
    } finally {
      setLoading(false);
    }
  };

  const fetchAvailability = async () => {
    try {
      const res = await axios.get(
        `${import.meta.env.VITE_API_URL}/api/teacher/availability`,
        { headers: { Authorization: `Bearer ${token}` } }
      );
      setAvailability(res.data);
    } catch (err) {
      console.error("Error fetching availability:", err);
    }
  };

  const handleCloseSlot = async () => {
    if (!availForm.date || !availForm.time) return;
    setAvailLoading(true);
    setAvailError(null);
    try {
      await axios.post(
        `${import.meta.env.VITE_API_URL}/api/teacher/availability`,
        { date: availForm.date, time: availForm.time, action: "close" },
        { headers: { Authorization: `Bearer ${token}` } }
      );
      setAvailForm({ date: "", time: "" });
      fetchAvailability();
    } catch (err: unknown) {
      const msg = (err as { response?: { data?: { message?: string } } })?.response?.data?.message || "Failed to close slot";
      setAvailError(msg);
    } finally {
      setAvailLoading(false);
    }
  };

  const handleOpenSlot = async (id: number) => {
    try {
      await axios.post(
        `${import.meta.env.VITE_API_URL}/api/teacher/availability`,
        { closed_slot_id: id, action: "open" },
        { headers: { Authorization: `Bearer ${token}` } }
      );
      fetchAvailability();
    } catch (err) {
      console.error("Error opening slot:", err);
    }
  };

  const fetchLeaves = async () => {
    try {
      const res = await axios.get(
        `${import.meta.env.VITE_API_URL}/api/teacher/leaves`,
        { headers: { Authorization: `Bearer ${token}` } }
      );
      setLeaves(res.data);
    } catch (err) {
      console.error("Error fetching leaves:", err);
    }
  };

  const fetchPickerStats = async (month: number, year: number) => {
    setPickerLoading(true);
    try {
      const res = await axios.get(
        `${import.meta.env.VITE_API_URL}/api/teacher/class-stats?month=${month}&year=${year}`,
        { headers: { Authorization: `Bearer ${token}` } }
      );
      setPickerCount(res.data.class_count);
    } catch (err) {
      console.error("Error fetching class stats:", err);
    } finally {
      setPickerLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
    fetchLeaves();
    fetchAvailability();
    fetchPickerStats(pickerMonth, pickerYear);
  }, [token]);

  const handleLogout = () => {
    authContext?.logout();
    navigate("/");
  };

  const handleSubmitLeave = async () => {
    setLeaveLoading(true);
    try {
      await axios.post(
        `${import.meta.env.VITE_API_URL}/api/teacher/leaves`,
        leaveForm,
        { headers: { Authorization: `Bearer ${token}` } }
      );
      setShowLeaveModal(false);
      setLeaveForm({ leave_date: "", reason_type: "personal", notes: "" });
      fetchLeaves();
    } catch (err) {
      console.error("Error submitting leave:", err);
    } finally {
      setLeaveLoading(false);
    }
  };

  const handleCancelLeave = async (id: number) => {
    try {
      await axios.delete(
        `${import.meta.env.VITE_API_URL}/api/teacher/leaves/${id}`,
        { headers: { Authorization: `Bearer ${token}` } }
      );
      fetchLeaves();
    } catch (err) {
      console.error("Error cancelling leave:", err);
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
        { headers: { Authorization: `Bearer ${token}` } }
      );
      setEditingBooking(null);
      fetchData();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Failed to update class info";
      setClassInfoError(msg);
    } finally {
      setClassInfoLoading(false);
    }
  };

  const handleMarkStudentAbsent = async (bookingId: number) => {
    setAbsentLoadingId(bookingId);
    try {
      await axios.post(
        `${import.meta.env.VITE_API_URL}/api/teacher/bookings/${bookingId}/mark-student-absent`,
        {},
        { headers: { Authorization: `Bearer ${token}` } }
      );
      fetchData();
    } catch (err: unknown) {
      const msg = (err as { response?: { data?: { message?: string } } })?.response?.data?.message || "Failed to mark absent";
      alert(msg);
    } finally {
      setAbsentLoadingId(null);
    }
  };

  const handleCancelBooking = async () => {
    if (!cancelConfirm) return;
    setCancelLoading(true);
    try {
      await axios.post(
        `${import.meta.env.VITE_API_URL}/api/teacher/bookings/${cancelConfirm.id}/cancel`,
        {},
        { headers: { Authorization: `Bearer ${token}` } }
      );
      setCancelConfirm(null);
      fetchData();
    } catch (err: unknown) {
      const msg = (err as { response?: { data?: { message?: string } } })?.response?.data?.message || "Failed to cancel class";
      alert(msg);
    } finally {
      setCancelLoading(false);
    }
  };

  const openReport = (b: CompletedBooking) => {
    setReportModal({ open: true, bookingId: b.id, studentId: b.student_id, studentName: b.student_name });
  };

  const handleReportClose = () => {
    setReportModal((prev) => ({ ...prev, open: false }));
    fetchData(); // refresh to update has_report flag
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <div className="bg-primary/20 border-b border-primary/30">
        <div className="max-w-7xl mx-auto px-4 py-3 flex items-center justify-between">
          <img src={logo} alt="EuniTalk Logo" className="h-10 w-auto" />
          <div className="flex items-center gap-2">
            <Badge variant="secondary" className="text-xs">Teacher</Badge>
            <NotificationBell />
            <Button variant="outline" size="sm" onClick={handleLogout}
              className="border-pink-400 text-pink-500 hover:bg-pink-50">
              <LogOut className="h-4 w-4 mr-1" /> Logout
            </Button>
          </div>
        </div>
        <div className="max-w-7xl mx-auto px-4 pb-4">
          <p className="text-sm text-muted-foreground">Welcome back,</p>
          <h1 className="text-3xl font-bold text-gray-800">{teacher?.name || "Teacher"}</h1>
        </div>
      </div>

      <div className="max-w-7xl mx-auto px-4 py-8 space-y-8">
        {/* Stats */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
          <Card>
            <CardContent className="pt-4 flex items-center gap-3">
              <Users className="h-5 w-5 text-primary" />
              <div>
                <p className="text-2xl font-bold">{students.length}</p>
                <p className="text-xs text-muted-foreground">Assigned Students</p>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-4 flex items-center gap-3">
              <CalendarDays className="h-5 w-5 text-primary" />
              <div>
                <p className="text-2xl font-bold">{bookings.length}</p>
                <p className="text-xs text-muted-foreground">Upcoming Classes</p>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-4 flex items-center gap-3">
              <CalendarDays className="h-5 w-5 text-blue-500" />
              <div>
                <p className="text-2xl font-bold">{classesThisWeek}</p>
                <p className="text-xs text-muted-foreground">Classes This Week</p>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-4 flex items-center gap-3">
              <CalendarDays className="h-5 w-5 text-green-500" />
              <div>
                <p className="text-2xl font-bold">{classesThisMonth}</p>
                <p className="text-xs text-muted-foreground">Classes This Month</p>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Monthly Class Count Picker */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <CalendarDays className="h-4 w-4 text-primary" />
              Classes by Month
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex flex-wrap items-end gap-3">
              <div className="space-y-1">
                <p className="text-xs text-muted-foreground">Month</p>
                <Select
                  value={String(pickerMonth)}
                  onValueChange={(v) => {
                    const m = parseInt(v);
                    setPickerMonth(m);
                    fetchPickerStats(m, pickerYear);
                  }}
                >
                  <SelectTrigger className="h-8 text-sm w-36"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {["January","February","March","April","May","June","July","August","September","October","November","December"].map((name, i) => (
                      <SelectItem key={i + 1} value={String(i + 1)}>{name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1">
                <p className="text-xs text-muted-foreground">Year</p>
                <Select
                  value={String(pickerYear)}
                  onValueChange={(v) => {
                    const y = parseInt(v);
                    setPickerYear(y);
                    fetchPickerStats(pickerMonth, y);
                  }}
                >
                  <SelectTrigger className="h-8 text-sm w-28"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {Array.from({ length: 4 }, (_, i) => new Date().getFullYear() - i).map((y) => (
                      <SelectItem key={y} value={String(y)}>{y}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="flex items-center gap-2 pb-0.5">
                {pickerLoading ? (
                  <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
                ) : (
                  <span className="text-2xl font-bold">{pickerCount ?? "—"}</span>
                )}
                <span className="text-sm text-muted-foreground">
                  {pickerLoading ? "Loading…" : `class${pickerCount === 1 ? "" : "es"} in ${["January","February","March","April","May","June","July","August","September","October","November","December"][pickerMonth - 1]} ${pickerYear}`}
                </span>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Upcoming Bookings */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <CalendarDays className="h-4 w-4 text-primary" />
              Upcoming Classes
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
                        <TableCell className="text-sm">
                          {fmtDate(b.appointment_date, "MMM d, h:mm a")}
                        </TableCell>
                        <TableCell className="font-medium">{b.student_name}</TableCell>
                        <TableCell className="text-xs">{b.package_name}</TableCell>
                        <TableCell className="text-xs">{b.subject}</TableCell>
                        <TableCell>
                          <span className={`text-xs px-2 py-1 rounded-full font-medium ${statusColors[b.status] || "bg-gray-100 text-gray-700"}`}>
                            {b.status}
                          </span>
                        </TableCell>
                        <TableCell>
                          <Button size="sm" variant="outline" className="text-xs h-7 gap-1"
                            onClick={() => {
                              setEditingBooking(b);
                              setClassForm({ class_mode: b.class_mode || "", meeting_link: b.meeting_link || "" });
                              setClassInfoError(null);
                            }}>
                            {b.class_mode ? "Edit Info" : "Set Info"}
                          </Button>
                        </TableCell>
                        <TableCell>
                          {b.student_absent ? (
                            <span className="text-xs px-2 py-1 rounded-full font-medium bg-red-100 text-red-700">
                              Absent
                            </span>
                          ) : canMarkAbsent ? (
                            <Button
                              size="sm"
                              variant="outline"
                              className="text-xs h-7 border-orange-400 text-orange-600 hover:bg-orange-50"
                              disabled={absentLoadingId === b.id}
                              onClick={() => handleMarkStudentAbsent(b.id)}
                            >
                              {absentLoadingId === b.id ? <Loader2 className="h-3 w-3 animate-spin" /> : "Mark Absent"}
                            </Button>
                          ) : (
                            <span className="text-xs text-muted-foreground">—</span>
                          )}
                        </TableCell>
                        <TableCell>
                          <Button
                            size="sm"
                            variant="ghost"
                            className="text-xs h-7 text-destructive hover:text-destructive"
                            onClick={() => {
                              const apptTime = parseUTC(b.appointment_date)?.getTime() ?? 0;
                              const hoursUntil = (apptTime - Date.now()) / (1000 * 60 * 60);
                              if (cancellationHours > 0 && hoursUntil < cancellationHours) {
                                // Fire API to trigger admin notification (will return 403)
                                axios.post(
                                  `${import.meta.env.VITE_API_URL}/api/teacher/bookings/${b.id}/cancel`,
                                  {},
                                  { headers: { Authorization: `Bearer ${token}` } }
                                ).catch(() => {});
                                setCancelBlocked(true);
                              } else {
                                setCancelConfirm(b);
                              }
                            }}
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
          </CardContent>
        </Card>

        {/* Completed Classes — with Report button */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <FileText className="h-4 w-4 text-primary" />
              Completed Classes
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
                  <TableHead>Attendance</TableHead>
                  <TableHead>Report</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {completedBookings.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={6} className="text-center text-muted-foreground text-sm py-8">
                      No completed classes yet
                    </TableCell>
                  </TableRow>
                ) : (
                  completedBookings.map((b) => (
                    <TableRow key={b.id}>
                      <TableCell className="text-sm">
                        {fmtDate(b.appointment_date, "MMM d, h:mm a")}
                      </TableCell>
                      <TableCell className="font-medium">{b.student_name}</TableCell>
                      <TableCell className="text-xs">{b.package_name}</TableCell>
                      <TableCell className="text-xs">{b.subject}</TableCell>
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
                          <Badge variant="secondary" className="text-xs bg-green-100 text-green-700">
                            ✓ Reported
                          </Badge>
                        ) : (
                          <Button size="sm" variant="outline" className="text-xs h-7"
                            onClick={() => openReport(b)}>
                            Submit Report
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

        {/* My Availability — close/open slots */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <Ban className="h-4 w-4 text-primary" />
              My Availability
            </CardTitle>
            <p className="text-xs text-muted-foreground mt-1">
              Block specific time slots so students cannot book them. You can only close slots more than {cancellationHours} hour(s) in advance.
            </p>
          </CardHeader>
          <CardContent className="space-y-4">
            {/* Close a slot form */}
            <div className="flex flex-wrap gap-2 items-end">
              <div className="space-y-1">
                <Label className="text-xs">Date</Label>
                <Input type="date" className="h-8 text-sm w-36"
                  value={availForm.date}
                  onChange={(e) => setAvailForm((f) => ({ ...f, date: e.target.value }))} />
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Time</Label>
                <Select value={availForm.time} onValueChange={(v) => setAvailForm((f) => ({ ...f, time: v }))}>
                  <SelectTrigger className="h-8 text-sm w-32"><SelectValue placeholder="Select time" /></SelectTrigger>
                  <SelectContent className="max-h-60">
                    {Array.from({ length: 32 }, (_, i) => {
                      const hour = Math.floor(i / 2) + 7;
                      const min = i % 2 === 0 ? "00" : "30";
                      const h12 = hour > 12 ? hour - 12 : hour === 0 ? 12 : hour;
                      const ampm = hour >= 12 ? "PM" : "AM";
                      const val = `${String(hour).padStart(2, "0")}:${min}:00`;
                      return <SelectItem key={val} value={val}>{`${h12}:${min} ${ampm}`}</SelectItem>;
                    })}
                  </SelectContent>
                </Select>
              </div>
              <Button size="sm" className="h-8 text-xs gap-1" onClick={handleCloseSlot}
                disabled={availLoading || !availForm.date || !availForm.time}>
                {availLoading ? <Loader2 className="h-3 w-3 animate-spin" /> : <><Ban className="h-3 w-3" /> Block Slot</>}
              </Button>
            </div>
            {availError && <p className="text-xs text-destructive">{availError}</p>}
            {/* List of closed slots */}
            {availability.length === 0 ? (
              <p className="text-xs text-muted-foreground">No slots blocked. All hours are available.</p>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="text-xs">Date</TableHead>
                    <TableHead className="text-xs">Time</TableHead>
                    <TableHead></TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {availability.map((slot) => (
                    <TableRow key={slot.id}>
                      <TableCell className="text-sm">
                        {new Date(slot.date + "T00:00:00").toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}
                      </TableCell>
                      <TableCell className="text-sm">
                        {(() => {
                          const [h, m] = slot.time.split(":");
                          const hr = parseInt(h);
                          return `${hr > 12 ? hr - 12 : hr === 0 ? 12 : hr}:${m} ${hr >= 12 ? "PM" : "AM"}`;
                        })()}
                      </TableCell>
                      <TableCell>
                        <Button size="sm" variant="ghost" className="h-7 text-xs gap-1 text-green-600 hover:text-green-700"
                          onClick={() => handleOpenSlot(slot.id)}>
                          <CheckCircle className="h-3 w-3" /> Unblock
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>

        {/* My Leaves */}
        <Card>
          <CardHeader className="flex flex-row items-center justify-between">
            <CardTitle className="text-base flex items-center gap-2">
              <CalendarOff className="h-4 w-4 text-primary" />
              My Leave Requests
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
                ) : (
                  leaves.map((lv) => (
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
                  ))
                )}
              </TableBody>
            </Table>
          </CardContent>
        </Card>

        {/* Student Feedback */}
        {feedback.length > 0 && (
          <Card>
            <CardHeader>
              <CardTitle className="text-base flex items-center gap-2">
                <MessageSquare className="h-4 w-4 text-primary" />
                Student Feedback
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              {feedback.map((f) => (
                <div key={f.id} className="border rounded-lg p-4 space-y-1.5 bg-white">
                  <div className="flex items-center justify-between">
                    <span className="font-medium text-sm">{f.student_name}</span>
                    <span className="text-xs text-muted-foreground">
                      {fmtDateOnly(f.created_at)}
                    </span>
                  </div>
                  <p className="text-sm text-gray-700 whitespace-pre-wrap">{f.message}</p>
                </div>
              ))}
            </CardContent>
          </Card>
        )}

        {/* Assigned Students */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <Users className="h-4 w-4 text-primary" />
              My Students
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
                ) : (
                  students.map((s) => (
                    <TableRow key={s.id}>
                      <TableCell className="font-medium">{s.name}</TableCell>
                      <TableCell>{s.nationality || "—"}</TableCell>
                      <TableCell>{s.age || "—"}</TableCell>
                      <TableCell className="text-xs">{s.package_name}</TableCell>
                      <TableCell className="text-xs">{s.subject}</TableCell>
                      <TableCell>
                        <Badge variant="secondary">{s.sessions_remaining}</Badge>
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      </div>

      {/* Cancel Booking Confirm Dialog */}
      {cancelConfirm && (
        <Dialog open={true} onOpenChange={(o) => { if (!o) setCancelConfirm(null); }}>
          <DialogContent className="max-w-sm">
            <DialogHeader>
              <DialogTitle>Cancel Class</DialogTitle>
            </DialogHeader>
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

      {/* Cancel Blocked Dialog — within policy window */}
      {cancelBlocked && (
        <Dialog open={true} onOpenChange={(o) => { if (!o) setCancelBlocked(false); }}>
          <DialogContent className="max-w-sm">
            <DialogHeader>
              <DialogTitle>Cannot Cancel</DialogTitle>
            </DialogHeader>
            <p className="text-sm text-muted-foreground py-2">
              Cancellation is not allowed within <span className="font-semibold text-foreground">{cancellationHours} hour(s)</span> of the scheduled class time. Your admin has been notified of your request.
            </p>
            <DialogFooter>
              <Button variant="outline" onClick={() => setCancelBlocked(false)}>Close</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      )}

      {/* Class Info Dialog */}
      <Dialog open={!!editingBooking} onOpenChange={(open) => { if (!open) setEditingBooking(null); }}>
        <DialogContent className="max-w-sm">
          <DialogHeader><DialogTitle>Set Class Info</DialogTitle></DialogHeader>
          <div className="space-y-3 py-2">
            {classInfoError && (
              <p className="text-sm text-destructive">{classInfoError}</p>
            )}
            <div className="space-y-1.5">
              <Label>Mode of Class</Label>
              <Select value={classForm.class_mode}
                onValueChange={(v) => setClassForm({ ...classForm, class_mode: v })}>
                <SelectTrigger><SelectValue placeholder="Select platform" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="Voov">Voov</SelectItem>
                  <SelectItem value="Classin">Classin</SelectItem>
                  <SelectItem value="Google Meet">Google Meet</SelectItem>
                  <SelectItem value="Zoom">Zoom</SelectItem>
                  <SelectItem value="Others">Others</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Meeting Link</Label>
              <Input placeholder="https://..." value={classForm.meeting_link}
                onChange={(e) => setClassForm({ ...classForm, meeting_link: e.target.value })} />
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

      {/* Leave Request Modal */}
      <Dialog open={showLeaveModal} onOpenChange={setShowLeaveModal}>
        <DialogContent className="max-w-sm">
          <DialogHeader><DialogTitle>Request Leave</DialogTitle></DialogHeader>
          <div className="space-y-3 py-2">
            <div className="space-y-1.5">
              <Label>Leave Date</Label>
              <Input type="date" value={leaveForm.leave_date}
                onChange={(e) => setLeaveForm({ ...leaveForm, leave_date: e.target.value })} />
            </div>
            <div className="space-y-1.5">
              <Label>Reason Type</Label>
              <Select value={leaveForm.reason_type}
                onValueChange={(v) => setLeaveForm({ ...leaveForm, reason_type: v })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="sick">Sick</SelectItem>
                  <SelectItem value="personal">Personal</SelectItem>
                  <SelectItem value="vacation">Vacation</SelectItem>
                  <SelectItem value="other">Other</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Notes (optional)</Label>
              <Input placeholder="Additional details..." value={leaveForm.notes}
                onChange={(e) => setLeaveForm({ ...leaveForm, notes: e.target.value })} />
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

      <ReportModal
        open={reportModal.open}
        onClose={handleReportClose}
        bookingId={reportModal.bookingId}
        studentId={reportModal.studentId}
        studentName={reportModal.studentName}
      />
    </div>
  );
};

export default TeacherDashboard;
