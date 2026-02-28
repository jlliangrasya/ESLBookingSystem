import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import NavBar from "../components/Navbar";
import axios from "axios";
import "../index.css";
import WeeklyCalendar from "../components/WeeklyCalendar";
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
import { Users, UserCheck } from "lucide-react";

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
  package_name: string;
  student_package_id: number;
  appointment_date: string;
  status: "pending" | "confirmed" | "rejected";
  rescheduled_by_admin: boolean;
  created_at: string;
}

interface StudentPackage {
  id: number;
  student_id: number;
  package_id: number;
  subject: string;
  sessions_remaining: number;
  payment_status: "paid" | "unpaid";
}

type ClosedSlot = {
  id: number;
  date: string;
  time: string;
  created_at?: string;
};

interface CompletedBooking {
  id: number;
  student_name: string;
  package_name: string;
  appointment_date: string;
  status: string;
  student_package_id: number;
  created_at: string;
}

const AdminDashboard = () => {
  const [students, setStudents] = useState<Student[]>([]);
  const [bookings, setBookings] = useState<Booking[]>([]);
  const [paidStudentPackages, setPaidStudentPackages] = useState<StudentPackage[]>([]);
  const [studentPackages, setStudentPackages] = useState<StudentPackage[]>([]);
  const navigate = useNavigate();
  const [closedSlots, setClosedSlots] = useState<ClosedSlot[]>([]);
  const [completedBookings, setCompletedBookings] = useState<CompletedBooking[]>([]);

  useEffect(() => {
    fetchDashboardData();
    fetchClosedSlots();
  }, []);

  const fetchDashboardData = async () => {
    try {
      const token = localStorage.getItem("token");
      if (!token) {
        navigate("/login");
        return;
      }
      const headers = { Authorization: `Bearer ${token}` };
      const base = import.meta.env.VITE_API_URL;

      const [studentsRes, bookingsRes, pendingRes, paidRes, completedRes] =
        await Promise.all([
          axios.get(`${base}/api/student/students`, { headers }),
          axios.get(`${base}/api/student-bookings`, { headers }),
          axios.get(`${base}/api/student/student-packages/pending`, { headers }),
          axios.get(`${base}/api/student/student-packages/paid`, { headers }),
          axios.get<CompletedBooking[]>(`${base}/api/completed-bookings`, { headers }),
        ]);

      setStudents(studentsRes.data);
      setBookings(bookingsRes.data);
      setStudentPackages(pendingRes.data);
      setPaidStudentPackages(paidRes.data);
      setCompletedBookings(completedRes.data);
    } catch (err) {
      console.error("Error fetching data", err);
    }
  };

  const handleConfirm = async (id: number) => {
    try {
      await axios.post(
        `${import.meta.env.VITE_API_URL}/api/student/package/confirm/${id}`
      );
      fetchDashboardData();
    } catch (error) {
      console.error("Error confirming package:", error);
    }
  };

  const handleReject = async (id: number) => {
    try {
      await axios.post(
        `${import.meta.env.VITE_API_URL}/api/student/package/reject/${id}`
      );
      fetchDashboardData();
    } catch (error) {
      console.error("Error rejecting package:", error);
    }
  };

  const handleMarkAsDone = async (bookingId: number, studentPackageId: number) => {
    try {
      await axios.post(
        `${import.meta.env.VITE_API_URL}/api/bookings/done/${bookingId}`,
        { student_package_id: studentPackageId }
      );
      fetchDashboardData();
    } catch (error) {
      console.error("Error marking class as done:", error);
    }
  };

  const handleCancelBooking = async (bookingId: number) => {
    try {
      await axios.post(
        `${import.meta.env.VITE_API_URL}/api/bookings/cancel/${bookingId}`
      );
      fetchDashboardData();
    } catch (error) {
      console.error("Error cancelling class:", error);
    }
  };

  const fetchClosedSlots = async () => {
    try {
      const token = localStorage.getItem("token");
      const res = await axios.get(
        `${import.meta.env.VITE_API_URL}/api/admin/closed-slots`,
        { headers: { Authorization: `Bearer ${token}` } }
      );
      const formattedSlots = res.data.map((slot: ClosedSlot) => ({
        date: new Date(slot.date).toLocaleDateString("en-CA"),
        time: slot.time,
      }));
      setClosedSlots(formattedSlots);
    } catch (err) {
      console.error("Error fetching closed slots", err);
    }
  };

  const totalStudents = students.length;
  const enrolledStudents = paidStudentPackages.filter(
    (sp) => sp.payment_status === "paid" && sp.sessions_remaining > 0
  ).length;
  const pendingEnrollees = studentPackages.filter(
    (sp) => sp.payment_status === "unpaid" && sp.sessions_remaining > 0
  );

  return (
    <>
      <NavBar />
      <div className="max-w-7xl mx-auto px-4 sm:px-6 py-6 space-y-6">
        {/* Stats row */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
          <div className="bg-white rounded-xl border shadow-sm p-4 flex items-center gap-3">
            <div className="p-2 bg-primary/10 rounded-lg">
              <Users className="h-5 w-5 text-primary" />
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Total Students</p>
              <p className="text-2xl font-bold">{totalStudents}</p>
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
        </div>

        {/* Two-column layout */}
        <div className="grid grid-cols-1 lg:grid-cols-5 gap-6">
          {/* Pending Enrollees */}
          <div className="lg:col-span-2 bg-white rounded-xl border shadow-sm overflow-hidden">
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
                        <TableCell className="text-sm">
                          {students.find((s) => s.id === enrollee.student_id)
                            ?.name || "Unknown"}
                        </TableCell>
                        <TableCell>
                          <Badge variant="secondary">{enrollee.package_id}</Badge>
                        </TableCell>
                        <TableCell className="text-right space-x-1">
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

          {/* Confirm Classes */}
          <div className="lg:col-span-3 bg-white rounded-xl border shadow-sm overflow-hidden">
            <div className="px-4 py-3 border-b bg-muted/40">
              <h2 className="font-semibold text-sm">Confirm Classes</h2>
            </div>
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Student</TableHead>
                    <TableHead>Date</TableHead>
                    <TableHead className="text-right">Action</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {completedBookings.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={3} className="text-center text-muted-foreground py-6 text-sm">
                        No completed bookings
                      </TableCell>
                    </TableRow>
                  ) : (
                    completedBookings.map((booking) => (
                      <TableRow key={booking.id}>
                        <TableCell className="text-sm font-medium">
                          {booking.student_name}
                        </TableCell>
                        <TableCell className="text-sm text-muted-foreground">
                          {new Date(booking.appointment_date).toLocaleString(
                            "en-US",
                            {
                              month: "short",
                              day: "numeric",
                              year: "numeric",
                              hour: "2-digit",
                              minute: "2-digit",
                              hour12: true,
                            }
                          )}
                        </TableCell>
                        <TableCell className="text-right space-x-1">
                          <Button
                            size="sm"
                            className="bg-green-600 hover:bg-green-700 h-7 px-2 text-xs"
                            onClick={() =>
                              handleMarkAsDone(booking.id, booking.student_package_id)
                            }
                          >
                            Done
                          </Button>
                          <Button
                            size="sm"
                            variant="destructive"
                            className="h-7 px-2 text-xs"
                            onClick={() => handleCancelBooking(booking.id)}
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

        {/* Weekly Calendar */}
        <WeeklyCalendar
          bookings={bookings}
          closedSlots={closedSlots}
          fetchClosedSlots={fetchClosedSlots}
        />
      </div>
    </>
  );
};

export default AdminDashboard;
