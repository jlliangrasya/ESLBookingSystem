import { useState, useEffect } from "react";
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
import { Users, UserCheck, Eye, MessageSquare, BarChart2, GraduationCap, CalendarCheck, CalendarDays } from "lucide-react";
import {
  BarChart, Bar, LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend,
} from "recharts";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { fmtDate } from "@/utils/timezone";

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
}



const AdminDashboard = () => {
  const [students, setStudents] = useState<Student[]>([]);
  const [bookings, setBookings] = useState<Booking[]>([]);
  const [paidStudentPackages, setPaidStudentPackages] = useState<StudentPackage[]>([]);
  const [studentPackages, setStudentPackages] = useState<StudentPackage[]>([]);
  const navigate = useNavigate();
  const [receiptImage, setReceiptImage] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<Feedback[]>([]);
  const [showFeedback, setShowFeedback] = useState(false);

  interface AnalyticsData {
    sessionsPerMonth: { month: string; sessions: number }[];
    studentGrowth: { month: string; students: number }[];
    packageStats: { package_name: string; total: number }[];
    totals: {
      totalSessions: number;
      totalRevenue: number;
      totalStudents: number;
      teachersCount: number;
      classesToday: number;
      classesThisWeek: number;
      classesThisMonth: number;
    };
  }
  const [analytics, setAnalytics] = useState<AnalyticsData | null>(null);
  const [teacherCount, setTeacherCount] = useState<number | null>(null);

  useEffect(() => {
    fetchDashboardData();
    fetchAnalytics();
  }, []);

  const fetchAnalytics = async () => {
    try {
      const token = localStorage.getItem("token");
      const res = await axios.get(`${import.meta.env.VITE_API_URL}/api/admin/analytics`, {
        headers: { Authorization: `Bearer ${token}` },
      });
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

      const [studentsRes, bookingsRes, pendingRes, paidRes, feedbackRes, teachersRes] =
        await Promise.all([
          axios.get(`${base}/api/student/students`, { headers }),
          axios.get(`${base}/api/student-bookings`, { headers }),
          axios.get(`${base}/api/student/student-packages/pending`, { headers }),
          axios.get(`${base}/api/student/student-packages/paid`, { headers }),
          axios.get<Feedback[]>(`${base}/api/admin/feedback`, { headers }),
          axios.get(`${base}/api/admin/teachers`, { headers }),
        ]);

      setStudents(studentsRes.data);
      setBookings(bookingsRes.data);
      setStudentPackages(pendingRes.data);
      setPaidStudentPackages(paidRes.data);
      setFeedback(feedbackRes.data);
      setTeacherCount(teachersRes.data.length);
    } catch (err) {
      console.error("Error fetching data", err);
    }
  };

  const handleConfirm = async (id: number) => {
    try {
      const token = localStorage.getItem("token");
      await axios.post(
        `${import.meta.env.VITE_API_URL}/api/student/package/confirm/${id}`,
        {},
        { headers: { Authorization: `Bearer ${token}` } }
      );
      fetchDashboardData();
    } catch (error) {
      console.error("Error confirming package:", error);
    }
  };

  const handleReject = async (id: number) => {
    try {
      const token = localStorage.getItem("token");
      await axios.post(
        `${import.meta.env.VITE_API_URL}/api/student/package/reject/${id}`,
        {},
        { headers: { Authorization: `Bearer ${token}` } }
      );
      fetchDashboardData();
    } catch (error) {
      console.error("Error rejecting package:", error);
    }
  };


  const handleCancelBooking = async (bookingId: number) => {
    try {
      const token = localStorage.getItem("token");
      await axios.post(
        `${import.meta.env.VITE_API_URL}/api/bookings/cancel/${bookingId}`,
        {},
        { headers: { Authorization: `Bearer ${token}` } }
      );
      fetchDashboardData();
    } catch (error) {
      console.error("Error cancelling class:", error);
    }
  };


  const enrolledStudents = paidStudentPackages.filter(
    (sp) => sp.payment_status === "paid" && sp.sessions_remaining > 0
  ).length;
  const pendingEnrollees = studentPackages.filter(
    (sp) => sp.payment_status === "unpaid" && sp.sessions_remaining > 0
  );

  const todayStr = new Date().toDateString();
  const todayBookings = bookings.filter(
    (b) => new Date(b.appointment_date).toDateString() === todayStr
  );

  return (
    <>
      <NavBar />
      <div className="max-w-7xl mx-auto px-4 sm:px-6 py-6 space-y-6">
        {/* Stats row */}
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-4">
          <div className="bg-white rounded-xl border shadow-sm p-4 flex items-center gap-3">
            <div className="p-2 bg-primary/10 rounded-lg">
              <Users className="h-5 w-5 text-primary" />
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Students</p>
              <p className="text-2xl font-bold">{analytics?.totals.totalStudents ?? students.length}</p>
            </div>
          </div>
          <div className="bg-white rounded-xl border shadow-sm p-4 flex items-center gap-3">
            <div className="p-2 bg-purple-100 rounded-lg">
              <GraduationCap className="h-5 w-5 text-purple-600" />
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Teachers</p>
              <p className="text-2xl font-bold">{teacherCount ?? "—"}</p>
            </div>
          </div>
          <div className="bg-white rounded-xl border shadow-sm p-4 flex items-center gap-3">
            <div className="p-2 bg-green-100 rounded-lg">
              <UserCheck className="h-5 w-5 text-green-600" />
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Enrolled</p>
              <p className="text-2xl font-bold">{enrolledStudents}</p>
            </div>
          </div>
          <div className="bg-white rounded-xl border shadow-sm p-4 flex items-center gap-3">
            <div className="p-2 bg-orange-100 rounded-lg">
              <CalendarCheck className="h-5 w-5 text-orange-600" />
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Classes Today</p>
              <p className="text-2xl font-bold">{analytics?.totals.classesToday ?? "—"}</p>
            </div>
          </div>
          <div className="bg-white rounded-xl border shadow-sm p-4 flex items-center gap-3">
            <div className="p-2 bg-blue-100 rounded-lg">
              <CalendarDays className="h-5 w-5 text-blue-600" />
            </div>
            <div>
              <p className="text-xs text-muted-foreground">This Month</p>
              <p className="text-2xl font-bold">{analytics?.totals.classesThisMonth ?? "—"}</p>
            </div>
          </div>
          <button
            onClick={() => setShowFeedback(true)}
            className="bg-white rounded-xl border shadow-sm p-4 flex items-center gap-3 text-left hover:bg-muted/30 transition-colors"
          >
            <div className="p-2 bg-primary/10 rounded-lg">
              <MessageSquare className="h-5 w-5 text-primary" />
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Feedback</p>
              <p className="text-2xl font-bold">{feedback.length}</p>
            </div>
          </button>
        </div>

        {/* Pending Enrollees */}
        <div className="bg-white rounded-xl border shadow-sm overflow-hidden">
          <div className="px-4 py-3 border-b bg-muted/40">
            <h2 className="font-semibold text-sm">Pending Enrollees</h2>
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
                  <TableRow>
                    <TableCell colSpan={3} className="text-center text-muted-foreground py-6 text-sm">
                      No pending enrollees
                    </TableCell>
                  </TableRow>
                ) : (
                  pendingEnrollees.map((enrollee) => (
                    <TableRow key={enrollee.id}>
                      <TableCell className="text-sm font-medium">
                        {enrollee.student_name || students.find((s) => s.id === enrollee.student_id)?.name || "Unknown"}
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
                            onClick={() => setReceiptImage(enrollee.receipt_image)}
                          >
                            <Eye className="h-3 w-3 mr-1" /> Receipt
                          </Button>
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
            <div className="bg-white rounded-xl border shadow-sm p-3 text-center">
              <p className="text-xs text-muted-foreground mb-1">Today's Classes</p>
              <p className="text-xl font-bold text-orange-600">{analytics?.totals.classesToday ?? todayBookings.length}</p>
            </div>
            <div className="bg-white rounded-xl border shadow-sm p-3 text-center">
              <p className="text-xs text-muted-foreground mb-1">This Week</p>
              <p className="text-xl font-bold text-blue-600">{analytics?.totals.classesThisWeek ?? "—"}</p>
            </div>
            <div className="bg-white rounded-xl border shadow-sm p-3 text-center">
              <p className="text-xs text-muted-foreground mb-1">This Month</p>
              <p className="text-xl font-bold text-primary">{analytics?.totals.classesThisMonth ?? "—"}</p>
            </div>
            <div className="bg-white rounded-xl border shadow-sm p-3 text-center">
              <p className="text-xs text-muted-foreground mb-1">Total Done</p>
              <p className="text-xl font-bold text-green-600">{analytics?.totals.totalSessions ?? "—"}</p>
            </div>
          </div>

          <div className="bg-white rounded-xl border shadow-sm overflow-hidden">
            <div className="px-4 py-3 border-b bg-muted/40 flex items-center justify-between">
              <h2 className="font-semibold text-sm">Today's Upcoming Classes</h2>
              <span className="text-xs text-muted-foreground">{new Date().toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric" })}</span>
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
                    <TableRow>
                      <TableCell colSpan={5} className="text-center text-muted-foreground py-6 text-sm">
                        No classes scheduled for today
                      </TableCell>
                    </TableRow>
                  ) : (
                    todayBookings.map((b) => (
                      <TableRow key={b.id}>
                        <TableCell className="text-sm font-medium">{b.student_name}</TableCell>
                        <TableCell className="text-sm text-muted-foreground">
                          {fmtDate(b.appointment_date, "h:mm a")}
                        </TableCell>
                        <TableCell className="text-sm">{b.teacher_name || "—"}</TableCell>
                        <TableCell>
                          <Badge variant="secondary" className="text-xs capitalize">{b.status}</Badge>
                        </TableCell>
                        <TableCell className="text-right space-x-1">
                          <Button
                            size="sm"
                            variant="outline"
                            className="h-7 px-2 text-xs"
                            onClick={() => navigate(`/admin/students/${b.student_id}`)}
                          >
                            View Student
                          </Button>
                          <Button
                            size="sm"
                            variant="destructive"
                            className="h-7 px-2 text-xs"
                            onClick={() => handleCancelBooking(b.id)}
                          >
                            Cancel
                          </Button>
                        </TableCell>
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>
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
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div className="bg-white rounded-xl border shadow-sm p-4 flex items-center gap-3">
                <div>
                  <p className="text-xs text-muted-foreground">Total Sessions</p>
                  <p className="text-2xl font-bold">{analytics.totals.totalSessions}</p>
                </div>
              </div>
              <div className="bg-white rounded-xl border shadow-sm p-4 flex items-center gap-3">
                <div>
                  <p className="text-xs text-muted-foreground">Total Students</p>
                  <p className="text-2xl font-bold">{analytics.totals.totalStudents}</p>
                </div>
              </div>
              <div className="bg-white rounded-xl border shadow-sm p-4 flex items-center gap-3">
                <div>
                  <p className="text-xs text-muted-foreground">Est. Revenue</p>
                  <p className="text-2xl font-bold">₱{Number(analytics.totals.totalRevenue || 0).toLocaleString()}</p>
                </div>
              </div>
            </div>
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm font-semibold">Sessions per Month</CardTitle>
                </CardHeader>
                <CardContent>
                  <ResponsiveContainer width="100%" height={200}>
                    <BarChart data={analytics.sessionsPerMonth} margin={{ top: 4, right: 8, left: -10, bottom: 0 }}>
                      <CartesianGrid strokeDasharray="3 3" />
                      <XAxis dataKey="month" tick={{ fontSize: 11 }} />
                      <YAxis tick={{ fontSize: 11 }} allowDecimals={false} />
                      <Tooltip />
                      <Bar dataKey="sessions" fill="#65C3E8" radius={[4, 4, 0, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                </CardContent>
              </Card>
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm font-semibold">Student Growth</CardTitle>
                </CardHeader>
                <CardContent>
                  <ResponsiveContainer width="100%" height={200}>
                    <LineChart data={analytics.studentGrowth} margin={{ top: 4, right: 8, left: -10, bottom: 0 }}>
                      <CartesianGrid strokeDasharray="3 3" />
                      <XAxis dataKey="month" tick={{ fontSize: 11 }} />
                      <YAxis tick={{ fontSize: 11 }} allowDecimals={false} />
                      <Tooltip />
                      <Legend />
                      <Line type="monotone" dataKey="students" stroke="#65C3E8" strokeWidth={2} dot={{ r: 3 }} />
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
        <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Student Feedback</DialogTitle>
          </DialogHeader>
          {feedback.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-8">No feedback yet.</p>
          ) : (
            <div className="space-y-3 py-2">
              {feedback.map((f) => (
                <div key={f.id} className="border rounded-lg p-3 space-y-1">
                  <div className="flex items-center justify-between">
                    <span className="text-sm font-semibold">{f.student_name}</span>
                    <span className="text-xs text-muted-foreground">
                      {new Date(f.created_at).toLocaleDateString("en-US", {
                        month: "short", day: "numeric", year: "numeric",
                      })}
                    </span>
                  </div>
                  {f.teacher_name && (
                    <p className="text-xs text-muted-foreground">To: {f.teacher_name}</p>
                  )}
                  <p className="text-sm mt-1">{f.message}</p>
                </div>
              ))}
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Receipt Image Modal */}
      <Dialog open={!!receiptImage} onOpenChange={() => setReceiptImage(null)}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Payment Receipt</DialogTitle>
          </DialogHeader>
          {receiptImage && (
            <img src={receiptImage} alt="Payment receipt" className="w-full rounded-lg" />
          )}
        </DialogContent>
      </Dialog>
    </>
  );
};

export default AdminDashboard;
