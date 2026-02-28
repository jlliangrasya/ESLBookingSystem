import { useState, useEffect, useContext } from "react";
import axios from "axios";
import { useNavigate } from "react-router-dom";
import AuthContext from "@/context/AuthContext";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { CalendarDays, Users, LogOut, Loader2 } from "lucide-react";
import logo from "../assets/EuniTalk_Logo.png";

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
}

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
  const [loading, setLoading] = useState(true);

  const authContext = useContext(AuthContext);
  const navigate = useNavigate();
  const token = localStorage.getItem("token");

  useEffect(() => {
    const fetchData = async () => {
      try {
        const res = await axios.get(
          `${import.meta.env.VITE_API_URL}/api/teacher/dashboard`,
          { headers: { Authorization: `Bearer ${token}` } }
        );
        setTeacher(res.data.teacher);
        setStudents(res.data.students);
        setBookings(res.data.bookings);
      } catch (err) {
        console.error("Error fetching teacher dashboard:", err);
      } finally {
        setLoading(false);
      }
    };
    fetchData();
  }, [token]);

  const handleLogout = () => {
    authContext?.logout();
    navigate("/");
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
          <Badge variant="secondary" className="text-xs">Teacher</Badge>
          <Button variant="outline" size="sm" onClick={handleLogout}
            className="border-pink-400 text-pink-500 hover:bg-pink-50">
            <LogOut className="h-4 w-4 mr-1" /> Logout
          </Button>
        </div>
        <div className="max-w-7xl mx-auto px-4 pb-4">
          <p className="text-sm text-muted-foreground">Welcome back,</p>
          <h1 className="text-3xl font-bold text-gray-800">{teacher?.name || "Teacher"}</h1>
        </div>
      </div>

      <div className="max-w-7xl mx-auto px-4 py-8 space-y-8">
        {/* Stats */}
        <div className="grid grid-cols-2 gap-4">
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
        </div>

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
                </TableRow>
              </TableHeader>
              <TableBody>
                {bookings.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={5} className="text-center text-muted-foreground text-sm py-8">
                      No upcoming classes
                    </TableCell>
                  </TableRow>
                ) : (
                  bookings.map((b) => (
                    <TableRow key={b.id}>
                      <TableCell className="text-sm">
                        {new Date(b.appointment_date).toLocaleString("en-US", {
                          month: "short", day: "numeric",
                          hour: "2-digit", minute: "2-digit", hour12: true,
                        })}
                      </TableCell>
                      <TableCell className="font-medium">{b.student_name}</TableCell>
                      <TableCell className="text-xs">{b.package_name}</TableCell>
                      <TableCell className="text-xs">{b.subject}</TableCell>
                      <TableCell>
                        <span className={`text-xs px-2 py-1 rounded-full font-medium ${statusColors[b.status] || "bg-gray-100 text-gray-700"}`}>
                          {b.status}
                        </span>
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </CardContent>
        </Card>

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
    </div>
  );
};

export default TeacherDashboard;
