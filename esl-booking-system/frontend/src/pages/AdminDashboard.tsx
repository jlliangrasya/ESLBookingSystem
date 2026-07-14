import { useState, useEffect, useContext } from "react";
import { useNavigate } from "react-router-dom";
import NavBar from "../components/Navbar";
import axios from "axios";
import "../index.css";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Users,
  UserCheck,
  Eye,
  MessageSquare,
  BarChart2,
  GraduationCap,
  CalendarCheck,
  CalendarDays,
  AlertCircle,
  Clock,
} from "lucide-react";
import {
  BarChart,
  Bar,
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Legend,
} from "recharts";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { fmtDate } from "@/utils/timezone";
import AnnouncementPanel from "@/components/AnnouncementPanel";
import AuthContext from "@/context/AuthContext";
import OnboardingChecklist from "@/components/OnboardingChecklist";
import { AdminTour, useStartTour } from "@/components/AdminTour";
import { Map as MapIcon } from "lucide-react";

interface Feedback {
  id: number;
  student_name: string;
  teacher_name: string | null;
  message: string;
  created_at: string;
}

interface Student {
  id: number;
  name: string;
  email: string;
  guardian_name: string;
  nationality: string;
  age: number;
  created_at: string;
}

interface Booking {
  id: number;
  student_name: string;
  student_id: number;
  package_name: string;
  student_package_id: number;
  appointment_date: string;
  status: "pending" | "confirmed" | "rejected";
  rescheduled_by_admin: boolean;
  teacher_name: string | null;
  created_at: string;
  booking_group_id: string | null;
  recurring_schedule_id: number | null;
  slot_count?: number;
}

function groupMultiSlotBookings(rows: Booking[]): Booking[] {
  const groups = new Map<string, Booking>();
  for (const row of rows) {
    const key = row.booking_group_id || `solo_${row.id}`;
    if (!groups.has(key)) {
      groups.set(key, { ...row, slot_count: 1 });
    } else {
      groups.get(key)!.slot_count = (groups.get(key)!.slot_count ?? 1) + 1;
    }
  }
  return Array.from(groups.values());
}

interface StudentPackage {
  id: number;
  student_id: number;
  package_id: number;
  package_name: string;
  student_name: string;
  subject: string;
  sessions_remaining: number;
  payment_status: "paid" | "unpaid";
  receipt_image: string | null;
  purchased_at: string | null;
}

const AdminDashboard = () => {
  const [students, setStudents] = useState<Student[]>([]);
  const [bookings, setBookings] = useState<Booking[]>([]);
  const [paidStudentPackages, setPaidStudentPackages] = useState<
    StudentPackage[]
  >([]);
  const [studentPackages, setStudentPackages] = useState<StudentPackage[]>([]);
  const navigate = useNavigate();
  const authContext = useContext(AuthContext);
  const currentUser = authContext?.user ?? null;
  const startTour = useStartTour(currentUser?.company_id ?? 0);
  const [receiptImage, setReceiptImage] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<Feedback[]>([]);
  const [showFeedback, setShowFeedback] = useState(false);
  const [todayPage, setTodayPage] = useState(1);
  const todayPerPage = 10;

  interface AnalyticsData {
    sessionsPerMonth: { month: string; sessions: number }[];
    studentGrowth: { month: string; students: number }[];
    packageStats: { package_name: string; total: number }[];
    totals: {
      totalSessions: number;
      totalRevenue: number;
      totalStudents: number;
      teachersCount: number;
      adminsCount: number;
      classesToday: number;
      classesThisWeek: number;
      classesThisMonth: number;
      maxStudents: number;
      maxTeachers: number;
      maxAdmins: number;
      planName: string;
      unassignedBookings: number;
      trialEndsAt: string | null;
    };
    teacherWorkload: { id: number; name: string; today: number; next7days: number }[];
  }
  const [analytics, setAnalytics] = useState<AnalyticsData | null>(null);
  const [teacherCount, setTeacherCount] = useState<number | null>(null);
  const [packageCount, setPackageCount] = useState<number>(0);

  const [recurringCancelBooking, setRecurringCancelBooking] = useState<Booking | null>(null);

  // Teacher conflict dialog (Issue #5)
  const [teacherConflict, setTeacherConflict] = useState<{
    newTeacherId: number;
    existingTeacherId: number;
    existingPackageId: number;
    studentId: number;
  } | null>(null);

  useEffect(() => {
    fetchDashboardData();
    fetchAnalytics();
  }, []);

  const fetchAnalytics = async () => {
    try {
      const token = localStorage.getItem("token");
      const res = await axios.get(
        `${import.meta.env.VITE_API_URL}/api/admin/analytics`,
        {
          headers: { Authorization: `Bearer ${token}` },
        },
      );
      setAnalytics(res.data);
    } catch (err) {
      console.error("Error fetching analytics:", err);
    }
  };

  const fetchDashboardData = async () => {
    try {
      const token = localStorage.getItem("token");
      if (!token) {
        navigate("/login");
        return;
      }
      const headers = { Authorization: `Bearer ${token}` };
      const base = import.meta.env.VITE_API_URL;

      const [
        studentsRes,
        bookingsRes,
        pendingRes,
        paidRes,
        feedbackRes,
        teachersRes,
        packagesRes,
      ] = await Promise.all([
        axios.get(`${base}/api/student/students`, { headers }),
        axios.get(`${base}/api/student-bookings`, { headers }),
        axios.get(`${base}/api/student/student-packages/pending`, { headers }),
        axios.get(`${base}/api/student/student-packages/paid`, { headers }),
        axios.get<Feedback[]>(`${base}/api/admin/feedback`, { headers }),
        axios.get(`${base}/api/admin/teachers`, { headers }),
        axios.get(`${base}/api/student/packages`, { headers }),
      ]);

      const sd = studentsRes.data;
      setStudents(Array.isArray(sd) ? sd : (sd.data ?? []));
      const bd = bookingsRes.data;
      setBookings(Array.isArray(bd) ? bd : (bd.data ?? []));
      setStudentPackages(pendingRes.data);
      setPaidStudentPackages(paidRes.data);
      setFeedback(feedbackRes.data);
      setTeacherCount(teachersRes.data.length);
      setPackageCount(Array.isArray(packagesRes.data) ? packagesRes.data.length : 0);
    } catch (err) {
      console.error("Error fetching data", err);
    }
  };

  const handleConfirm = async (id: number) => {
    try {
      const token = localStorage.getItem("token");
      const res = await axios.post(
        `${import.meta.env.VITE_API_URL}/api/student/package/confirm/${id}`,
        {},
        { headers: { Authorization: `Bearer ${token}` } },
      );
      fetchDashboardData();
      if (res.data.teacherConflict) {
        setTeacherConflict(res.data.teacherConflict);
      }
    } catch (error) {
      console.error("Error confirming package:", error);
    }
  };

  const handleApplyConflictTeacher = async (newTeacherId: number, studentId: number) => {
    try {
      const token = localStorage.getItem("token");
      await axios.put(
        `${import.meta.env.VITE_API_URL}/api/admin/students/${studentId}/assign-teacher`,
        { teacher_id: newTeacherId },
        { headers: { Authorization: `Bearer ${token}` } },
      );
    } catch (error) {
      console.error("Error updating teacher:", error);
    } finally {
      setTeacherConflict(null);
    }
  };

  const handleReject = async (id: number) => {
    try {
      const token = localStorage.getItem("token");
      await axios.post(
        `${import.meta.env.VITE_API_URL}/api/student/package/reject/${id}`,
        {},
        { headers: { Authorization: `Bearer ${token}` } },
      );
      fetchDashboardData();
    } catch (error) {
      console.error("Error rejecting package:", error);
    }
  };

  const handleCancelBooking = (booking: Booking) => {
    if (booking.recurring_schedule_id) {
      setRecurringCancelBooking(booking);
    } else {
      doAdminCancel(booking.id, false);
    }
  };

  const doAdminCancel = async (bookingId: number, cancelAll: boolean) => {
    setRecurringCancelBooking(null);
    try {
      const token = localStorage.getItem("token");
      const url = cancelAll
        ? `${import.meta.env.VITE_API_URL}/api/bookings/cancel/${bookingId}?cancelAll=true`
        : `${import.meta.env.VITE_API_URL}/api/bookings/cancel/${bookingId}`;
      await axios.post(url, {}, { headers: { Authorization: `Bearer ${token}` } });
      fetchDashboardData();
    } catch (error) {
      console.error("Error cancelling class:", error);
    }
  };

  const enrolledStudents = paidStudentPackages.filter(
    (sp) => sp.payment_status === "paid",
  ).length;
  const pendingEnrollees = studentPackages.filter(
    (sp) => sp.payment_status === "unpaid" && sp.sessions_remaining > 0,
  );

  const todayKey = fmtDate(new Date().toISOString(), "yyyy-MM-dd");
  const todayBookings = groupMultiSlotBookings(
    bookings.filter((b) => fmtDate(b.appointment_date, "yyyy-MM-dd") === todayKey),
  );

  return (
    <>
      <NavBar />
      <div className="max-w-7xl mx-auto px-4 sm:px-6 py-6 space-y-6">
        <AnnouncementPanel />

        {currentUser?.role === "company_admin" && currentUser.company_id != null && (
          <>
            <AdminTour segment="A" companyId={currentUser.company_id} autoStart />
            <OnboardingChecklist
              companyId={currentUser.company_id}
              packageCount={packageCount}
              teacherCount={teacherCount}
              studentCount={students.length}
              bookingCount={bookings.length}
            />
          </>
        )}

        {/* Plan badge + Tour button */}
        <div className="flex items-center justify-between gap-2 flex-wrap">
          {analytics?.totals.planName && (
            <div className="flex items-center gap-2">
              <span className="text-xs px-2.5 py-1 rounded-full font-medium bg-primary/10 text-primary border border-primary/20">
                {analytics.totals.planName} Plan
              </span>
              {analytics.totals.totalStudents >= analytics.totals.maxStudents ||
              analytics.totals.teachersCount >= analytics.totals.maxTeachers ? (
                <span className="text-xs text-red-600 font-medium">
                  ⚠ You have reached a plan limit — consider upgrading.
                </span>
              ) : null}
            </div>
          )}
          {currentUser?.role === "company_admin" && (
            <Button
              variant="outline"
              size="sm"
              className="text-xs gap-1.5 h-7"
              onClick={startTour}
            >
              <MapIcon className="h-3.5 w-3.5" /> Take the Tour
            </Button>
          )}
        </div>

        {/* Stats row */}
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-4">
          <div className="stat-card bg-white rounded-xl border shadow-sm p-4 pl-6 flex items-center gap-3">
            <div className="p-2.5 bg-[#D0E8F0] rounded-xl">
              <Users className="h-5 w-5 text-[#2E6B9E]" />
            </div>
            <div className="min-w-0">
              <p className="text-xs text-gray-500 font-medium">Students</p>
              {analytics?.totals.maxStudents != null ? (
                <>
                  <p
                    className={`text-2xl font-bold ${analytics.totals.totalStudents >= analytics.totals.maxStudents ? "text-red-600" : analytics.totals.totalStudents >= analytics.totals.maxStudents * 0.8 ? "text-amber-600" : "text-gray-800"}`}
                  >
                    {analytics.totals.totalStudents}
                    <span className="text-sm font-normal text-gray-400 ml-1">
                      / {analytics.totals.maxStudents}
                    </span>
                  </p>
                  {analytics.totals.totalStudents >=
                    analytics.totals.maxStudents && (
                    <p className="text-[10px] text-red-500 font-medium leading-none mt-0.5">
                      Limit reached
                    </p>
                  )}
                </>
              ) : (
                <p className="text-2xl font-bold text-gray-800">
                  {analytics?.totals.totalStudents ?? students.length}
                </p>
              )}
            </div>
          </div>
          <div className="stat-card bg-white rounded-xl border shadow-sm p-4 pl-6 flex items-center gap-3">
            <div className="p-2.5 bg-purple-100 rounded-xl">
              <GraduationCap className="h-5 w-5 text-purple-600" />
            </div>
            <div className="min-w-0">
              <p className="text-xs text-gray-500 font-medium">Teachers</p>
              {analytics?.totals.maxTeachers != null ? (
                <>
                  <p
                    className={`text-2xl font-bold ${analytics.totals.teachersCount >= analytics.totals.maxTeachers ? "text-red-600" : analytics.totals.teachersCount >= analytics.totals.maxTeachers * 0.8 ? "text-amber-600" : "text-gray-800"}`}
                  >
                    {analytics.totals.teachersCount}
                    <span className="text-sm font-normal text-gray-400 ml-1">
                      / {analytics.totals.maxTeachers}
                    </span>
                  </p>
                  {analytics.totals.teachersCount >=
                    analytics.totals.maxTeachers && (
                    <p className="text-[10px] text-red-500 font-medium leading-none mt-0.5">
                      Limit reached
                    </p>
                  )}
                </>
              ) : (
                <p className="text-2xl font-bold text-gray-800">
                  {teacherCount ?? "—"}
                </p>
              )}
            </div>
          </div>
          <div className="stat-card bg-white rounded-xl border shadow-sm p-4 pl-6 flex items-center gap-3">
            <div className="p-2.5 bg-emerald-100 rounded-xl">
              <UserCheck className="h-5 w-5 text-emerald-600" />
            </div>
            <div>
              <p className="text-xs text-gray-500 font-medium">Enrolled</p>
              <p className="text-2xl font-bold text-gray-800">
                {enrolledStudents}
              </p>
            </div>
          </div>
          <div className="stat-card bg-white rounded-xl border shadow-sm p-4 pl-6 flex items-center gap-3">
            <div className="p-2.5 bg-amber-100 rounded-xl">
              <CalendarCheck className="h-5 w-5 text-amber-600" />
            </div>
            <div>
              <p className="text-xs text-gray-500 font-medium">Classes Today</p>
              <p className="text-2xl font-bold text-gray-800">
                {analytics?.totals.classesToday ?? "—"}
              </p>
            </div>
          </div>
          <div className="stat-card bg-white rounded-xl border shadow-sm p-4 pl-6 flex items-center gap-3">
            <div className="p-2.5 bg-indigo-100 rounded-xl">
              <CalendarDays className="h-5 w-5 text-indigo-600" />
            </div>
            <div>
              <p className="text-xs text-gray-500 font-medium">This Month</p>
              <p className="text-2xl font-bold text-gray-800">
                {analytics?.totals.classesThisMonth ?? "—"}
              </p>
            </div>
          </div>
          <button
            onClick={() => setShowFeedback(true)}
            className="stat-card bg-white rounded-xl border shadow-sm p-4 pl-6 flex items-center gap-3 text-left hover:shadow-md transition-all"
          >
            <div className="p-2.5 bg-rose-100 rounded-xl">
              <MessageSquare className="h-5 w-5 text-rose-500" />
            </div>
            <div>
              <p className="text-xs text-gray-500 font-medium">Feedback</p>
              <p className="text-2xl font-bold text-gray-800">
                {feedback.length}
              </p>
            </div>
          </button>
        </div>

        {/* Trial expiry banner */}
        {(() => {
          const trialEndsAt = analytics?.totals.trialEndsAt;
          if (!trialEndsAt) return null;
          const msLeft = new Date(trialEndsAt).getTime() - Date.now();
          const daysLeft = Math.ceil(msLeft / (1000 * 60 * 60 * 24));
          if (daysLeft > 30 || daysLeft < 0) return null;
          const urgent = daysLeft <= 7;
          return (
            <div id="trial-banner" className={`flex items-center gap-3 rounded-xl px-4 py-3 border ${urgent ? "bg-red-50 border-red-200" : "bg-amber-50 border-amber-200"}`}>
              <Clock className={`h-5 w-5 shrink-0 ${urgent ? "text-red-500" : "text-amber-600"}`} />
              <p className={`text-sm font-medium ${urgent ? "text-red-800" : "text-amber-800"}`}>
                {daysLeft === 0
                  ? "Your free trial expires today."
                  : `Your free trial ends in ${daysLeft} day${daysLeft !== 1 ? "s" : ""}.`}
                {" "}To keep your account active, please contact Brightfolks to upgrade your plan.
              </p>
            </div>
          );
        })()}

        {/* Unassigned Bookings Warning — Issue #6 */}
        {(analytics?.totals.unassignedBookings ?? 0) > 0 && (
          <div className="flex items-center gap-3 bg-amber-50 border border-amber-200 rounded-xl px-4 py-3">
            <AlertCircle className="h-5 w-5 text-amber-600 shrink-0" />
            <p className="text-sm text-amber-800 font-medium">
              {analytics!.totals.unassignedBookings} upcoming class{analytics!.totals.unassignedBookings !== 1 ? "es have" : " has"} no teacher assigned.
              {" "}
              <button className="underline" onClick={() => navigate("/students")}>View Students</button>
            </p>
          </div>
        )}

        {/* Teacher Workload — Issue #10 */}
        {analytics?.teacherWorkload && analytics.teacherWorkload.length > 0 && (
          <div className="bg-white rounded-xl border shadow-sm overflow-hidden glow-card">
            <div className="px-4 py-3 border-b brand-gradient-subtle">
              <h2 className="font-semibold text-sm text-gray-800">Teacher Workload (Next 7 Days)</h2>
            </div>
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Teacher</TableHead>
                    <TableHead className="text-center">Today</TableHead>
                    <TableHead className="text-center">Next 7 Days</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {analytics.teacherWorkload.map((t) => (
                    <TableRow key={t.id} className={t.next7days === 0 ? "bg-amber-50/50" : ""}>
                      <TableCell className="font-medium text-sm">{t.name}</TableCell>
                      <TableCell className="text-center">{t.today}</TableCell>
                      <TableCell className="text-center">
                        {t.next7days === 0
                          ? <span className="text-xs text-amber-600 font-medium">No upcoming classes</span>
                          : <span className="font-semibold">{t.next7days}</span>}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </div>
        )}

        {/* Pending Enrollees */}
        <div id="pending-enrollees-card" className="bg-white rounded-xl border shadow-sm overflow-hidden glow-card">
          <div className="px-4 py-3 border-b brand-gradient-subtle">
            <h2 className="font-semibold text-sm text-gray-800">
              Pending Enrollees
            </h2>
          </div>
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Student</TableHead>
                  <TableHead>Package</TableHead>
                  <TableHead className="text-right">Action</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {pendingEnrollees.length === 0 ? (
                  <>
                    <TableRow className="opacity-40 pointer-events-none select-none">
                      <TableCell className="text-sm font-medium">Sample Student</TableCell>
                      <TableCell>
                        <Badge variant="secondary" className="text-xs">Basic English 10</Badge>
                      </TableCell>
                      <TableCell className="text-right space-x-1">
                        <Button size="sm" variant="default" className="bg-green-600 h-7 px-2 text-xs" disabled>Confirm</Button>
                        <Button size="sm" variant="destructive" className="h-7 px-2 text-xs" disabled>Reject</Button>
                      </TableCell>
                    </TableRow>
                    <TableRow>
                      <TableCell colSpan={3} className="text-center py-2">
                        <p className="text-xs text-muted-foreground italic">
                          When a student enrolls in a package, they appear here — confirm payment to activate their account.
                        </p>
                      </TableCell>
                    </TableRow>
                  </>
                ) : (
                  pendingEnrollees.map((enrollee) => (
                    <TableRow key={enrollee.id}>
                      <TableCell className="text-sm font-medium">
                        {enrollee.student_name ||
                          students.find((s) => s.id === enrollee.student_id)
                            ?.name ||
                          "Unknown"}
                      </TableCell>
                      <TableCell>
                        <Badge variant="secondary" className="text-xs">
                          {enrollee.package_name || `#${enrollee.package_id}`}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-right space-x-1">
                        {enrollee.receipt_image && (
                          <Button
                            size="sm"
                            variant="outline"
                            className="h-7 px-2 text-xs"
                            onClick={() =>
                              setReceiptImage(enrollee.receipt_image)
                            }
                          >
                            <Eye className="h-3 w-3 mr-1" />
                            {enrollee.receipt_image.startsWith("data:")
                              ? "Receipt"
                              : "Details"}
                          </Button>
                        )}
                        {!enrollee.receipt_image && enrollee.purchased_at && (
                          <span className="text-xs text-muted-foreground mr-2">
                            {fmtDate(enrollee.purchased_at, "MMM d, h:mm a")}
                          </span>
                        )}
                        <Button
                          size="sm"
                          variant="default"
                          className="bg-green-600 hover:bg-green-700 h-7 px-2 text-xs"
                          onClick={() => handleConfirm(enrollee.id)}
                        >
                          Confirm
                        </Button>
                        <Button
                          size="sm"
                          variant="destructive"
                          className="h-7 px-2 text-xs"
                          onClick={() => handleReject(enrollee.id)}
                        >
                          Reject
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </div>
        </div>

        {/* Schedule Summary + Today's Upcoming Classes */}
        <div className="space-y-3">
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <div className="stat-card bg-white rounded-xl border shadow-sm p-3 pl-5 text-center">
              <p className="text-xs text-gray-500 font-medium mb-1">
                Today's Classes
              </p>
              <p className="text-xl font-bold text-amber-600">
                {analytics?.totals.classesToday ?? todayBookings.length}
              </p>
            </div>
            <div className="stat-card bg-white rounded-xl border shadow-sm p-3 pl-5 text-center">
              <p className="text-xs text-gray-500 font-medium mb-1">
                This Week
              </p>
              <p className="text-xl font-bold text-blue-600">
                {analytics?.totals.classesThisWeek ?? "—"}
              </p>
            </div>
            <div className="stat-card bg-white rounded-xl border shadow-sm p-3 pl-5 text-center">
              <p className="text-xs text-gray-500 font-medium mb-1">
                This Month
              </p>
              <p className="text-xl font-bold text-indigo-600">
                {analytics?.totals.classesThisMonth ?? "—"}
              </p>
            </div>
            <div className="stat-card bg-white rounded-xl border shadow-sm p-3 pl-5 text-center">
              <p className="text-xs text-gray-500 font-medium mb-1">
                Total Done
              </p>
              <p className="text-xl font-bold text-emerald-600">
                {analytics?.totals.totalSessions ?? "—"}
              </p>
            </div>
          </div>

          <div id="todays-classes-card" className="bg-white rounded-xl border shadow-sm overflow-hidden glow-card">
            <div className="px-4 py-3 border-b brand-gradient-subtle flex items-center justify-between">
              <h2 className="font-semibold text-sm text-gray-800">
                Today's Upcoming Classes
              </h2>
              <span className="text-xs text-muted-foreground">
                {new Date().toLocaleDateString("en-US", {
                  weekday: "long",
                  month: "long",
                  day: "numeric",
                })}
              </span>
            </div>
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Student</TableHead>
                    <TableHead>Time</TableHead>
                    <TableHead>Teacher</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead className="text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {todayBookings.length === 0 ? (
                    <>
                      <TableRow className="opacity-40 pointer-events-none select-none">
                        <TableCell className="text-sm font-medium">Sample Student</TableCell>
                        <TableCell className="text-sm text-muted-foreground">9:00 AM</TableCell>
                        <TableCell className="text-sm">Sample Teacher</TableCell>
                        <TableCell><Badge variant="secondary" className="text-xs">confirmed</Badge></TableCell>
                        <TableCell className="text-right space-x-1">
                          <Button size="sm" variant="outline" className="h-7 px-2 text-xs" disabled>View Student</Button>
                          <Button size="sm" variant="destructive" className="h-7 px-2 text-xs" disabled>Cancel</Button>
                        </TableCell>
                      </TableRow>
                      <TableRow>
                        <TableCell colSpan={5} className="text-center py-2">
                          <p className="text-xs text-muted-foreground italic">
                            Today's booked classes appear here. After a class is done, the teacher marks attendance and writes a class report.
                          </p>
                        </TableCell>
                      </TableRow>
                    </>
                  ) : (
                    todayBookings.slice((todayPage - 1) * todayPerPage, todayPage * todayPerPage).map((b) => (
                      <TableRow key={b.id}>
                        <TableCell className="text-sm font-medium">
                          {b.student_name}
                        </TableCell>
                        <TableCell className="text-sm text-muted-foreground">
                          {fmtDate(b.appointment_date, "h:mm a")}
                          {(b.slot_count ?? 1) > 1 && (
                            <span className="ml-1 text-xs text-muted-foreground">({(b.slot_count ?? 1) * 30}min)</span>
                          )}
                        </TableCell>
                        <TableCell className="text-sm">
                          {b.teacher_name || "—"}
                        </TableCell>
                        <TableCell>
                          <Badge
                            variant="secondary"
                            className="text-xs capitalize"
                          >
                            {b.status}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-right space-x-1">
                          <Button
                            size="sm"
                            variant="outline"
                            className="h-7 px-2 text-xs"
                            onClick={() =>
                              navigate(`/admin/students/${b.student_id}`)
                            }
                          >
                            View Student
                          </Button>
                          <Button
                            size="sm"
                            variant="destructive"
                            className="h-7 px-2 text-xs"
                            onClick={() => handleCancelBooking(b)}
                          >
                            Cancel
                          </Button>
                        </TableCell>
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>
              {todayBookings.length > todayPerPage && (
                <div className="flex items-center justify-between px-4 py-2 border-t">
                  <span className="text-xs text-muted-foreground">
                    Showing {(todayPage - 1) * todayPerPage + 1}–{Math.min(todayPage * todayPerPage, todayBookings.length)} of {todayBookings.length}
                  </span>
                  <div className="flex gap-1">
                    <Button size="sm" variant="outline" className="h-7 px-2 text-xs"
                      disabled={todayPage <= 1} onClick={() => setTodayPage(p => p - 1)}>
                      Previous
                    </Button>
                    <Button size="sm" variant="outline" className="h-7 px-2 text-xs"
                      disabled={todayPage * todayPerPage >= todayBookings.length} onClick={() => setTodayPage(p => p + 1)}>
                      Next
                    </Button>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Analytics Charts */}
        {analytics && (
          <div className="space-y-4">
            <div className="flex items-center gap-2">
              <BarChart2 className="h-5 w-5 text-primary" />
              <h2 className="font-semibold text-sm">Analytics</h2>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="stat-card bg-white rounded-xl border shadow-sm p-4 pl-6 flex items-center gap-3">
                <div>
                  <p className="text-xs text-gray-500 font-medium">
                    Total Sessions (This Month)
                  </p>
                  <p className="text-2xl font-bold text-gray-800">
                    {analytics.totals.totalSessions}
                  </p>
                </div>
              </div>
              <div className="stat-card bg-white rounded-xl border shadow-sm p-4 pl-6 flex items-center gap-3">
                <div>
                  <p className="text-xs text-gray-500 font-medium">
                    Active Students
                  </p>
                  <p className="text-2xl font-bold text-gray-800">
                    {analytics.totals.totalStudents}
                  </p>
                </div>
              </div>
              {/* <div className="stat-card bg-white rounded-xl border shadow-sm p-4 pl-6 flex items-center gap-3">
                <div>
                  <p className="text-xs text-gray-500 font-medium">
                    Est. Revenue
                  </p>
                  <p className="text-2xl font-bold text-gray-800">
                    ₱
                    {Number(
                      analytics.totals.totalRevenue || 0,
                    ).toLocaleString()}
                  </p>
                </div>
              </div> */}
            </div>
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm font-semibold">
                    Sessions per Month
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <ResponsiveContainer width="100%" height={200}>
                    <BarChart
                      data={analytics.sessionsPerMonth}
                      margin={{ top: 4, right: 8, left: -10, bottom: 0 }}
                    >
                      <CartesianGrid strokeDasharray="3 3" />
                      <XAxis dataKey="month" tick={{ fontSize: 11 }} />
                      <YAxis tick={{ fontSize: 11 }} allowDecimals={false} />
                      <Tooltip />
                      <Bar
                        dataKey="sessions"
                        fill="#4A9EAF"
                        radius={[4, 4, 0, 0]}
                      />
                    </BarChart>
                  </ResponsiveContainer>
                </CardContent>
              </Card>
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm font-semibold">
                    Student Growth
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <ResponsiveContainer width="100%" height={200}>
                    <LineChart
                      data={analytics.studentGrowth}
                      margin={{ top: 4, right: 8, left: -10, bottom: 0 }}
                    >
                      <CartesianGrid strokeDasharray="3 3" />
                      <XAxis dataKey="month" tick={{ fontSize: 11 }} />
                      <YAxis tick={{ fontSize: 11 }} allowDecimals={false} />
                      <Tooltip />
                      <Legend />
                      <Line
                        type="monotone"
                        dataKey="students"
                        name="New Students"
                        stroke="#E76F7A"
                        strokeWidth={2}
                        dot={{ r: 3, fill: "#E76F7A" }}
                      />
                    </LineChart>
                  </ResponsiveContainer>
                </CardContent>
              </Card>
            </div>
          </div>
        )}
      </div>

      {/* Feedback Modal */}
      <Dialog open={showFeedback} onOpenChange={setShowFeedback}>
        <DialogContent className="sm:max-w-2xl max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Student Feedback</DialogTitle>
          </DialogHeader>
          {feedback.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-8">
              No feedback yet.
            </p>
          ) : (
            <div className="space-y-3 py-2">
              {feedback.map((f) => (
                <div key={f.id} className="border rounded-lg p-3 space-y-1">
                  <div className="flex items-center justify-between">
                    <span className="text-sm font-semibold">
                      {f.student_name}
                    </span>
                    <span className="text-xs text-muted-foreground">
                      {new Date(f.created_at).toLocaleDateString("en-US", {
                        month: "short",
                        day: "numeric",
                        year: "numeric",
                      })}
                    </span>
                  </div>
                  {f.teacher_name && (
                    <p className="text-xs text-muted-foreground">
                      To: {f.teacher_name}
                    </p>
                  )}
                  <p className="text-sm mt-1">{f.message}</p>
                </div>
              ))}
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Receipt / Reference Number Modal */}
      <Dialog open={!!receiptImage} onOpenChange={() => setReceiptImage(null)}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>
              {receiptImage?.startsWith("data:")
                ? "Payment Receipt"
                : "Payment Details"}
            </DialogTitle>
          </DialogHeader>
          {receiptImage &&
            (receiptImage.startsWith("data:") ? (
              <img
                src={receiptImage}
                alt="Payment receipt"
                className="w-full rounded-lg"
              />
            ) : (
              <div className="space-y-3 py-2">
                <div>
                  <p className="text-xs text-muted-foreground mb-1">
                    Transaction Order Number (Last 5 digits)
                  </p>
                  <p className="text-lg font-semibold bg-muted/50 rounded-lg p-3 font-mono">
                    {receiptImage}
                  </p>
                </div>
              </div>
            ))}
        </DialogContent>
      </Dialog>

      {/* Recurring Cancel Choice Dialog */}
      <Dialog open={!!recurringCancelBooking} onOpenChange={(o) => { if (!o) setRecurringCancelBooking(null); }}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>Cancel Class</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground py-2">
            This class is part of a recurring schedule. What would you like to cancel?
          </p>
          <div className="flex flex-col gap-2 pt-1">
            <Button
              variant="outline"
              className="justify-start"
              onClick={() => recurringCancelBooking && doAdminCancel(recurringCancelBooking.id, false)}
            >
              Cancel this session only
            </Button>
            <Button
              variant="destructive"
              className="justify-start"
              onClick={() => recurringCancelBooking && doAdminCancel(recurringCancelBooking.id, true)}
            >
              Cancel all upcoming sessions in this series
            </Button>
            <Button variant="ghost" onClick={() => setRecurringCancelBooking(null)}>Keep it</Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Teacher Conflict Dialog — Issue #5 */}
      <Dialog open={!!teacherConflict} onOpenChange={(o) => { if (!o) setTeacherConflict(null); }}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <AlertCircle className="h-5 w-5 text-amber-500" /> Teacher Preference Conflict
            </DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">
            This student requested a different teacher than their currently assigned one. Would you like to update their assigned teacher?
          </p>
          <div className="flex flex-col gap-2 pt-2">
            <Button
              onClick={() => teacherConflict && handleApplyConflictTeacher(teacherConflict.newTeacherId, teacherConflict.studentId)}
            >
              Update to Requested Teacher
            </Button>
            <Button variant="outline" onClick={() => setTeacherConflict(null)}>Keep Current Teacher</Button>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
};

export default AdminDashboard;
