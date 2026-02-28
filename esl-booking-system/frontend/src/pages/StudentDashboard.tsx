import { useState, useEffect, useContext } from "react";
import { useNavigate } from "react-router-dom";
import axios from "axios";
import Calendar from "react-calendar";
import "react-calendar/dist/Calendar.css";
import logo from "../assets/EuniTalk_Logo.png";
import "../index.css";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { LogOut, Package, CalendarDays, User } from "lucide-react";
import PackageSelectionModal from "../components/PackageSelectionModal";
import BookingConfirmationModal from "../components/BookingConfirmationModal";
import AuthContext from "@/context/AuthContext";

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

interface Booking {
  id: number;
  appointment_date: string;
  timeslot: string;
  status: string;
}

const StudentDashboard = () => {
  const [student, setStudent] = useState<Student | null>(null);
  const [packageDetails, setPackageDetails] = useState<PackageDetails | null>(null);
  const [calendarBookings, setCalendarBookings] = useState<Record<string, string[]>>({});
  const [availablePackages, setAvailablePackages] = useState<PackageDetails[]>([]);
  const [selectedPackage, setSelectedPackage] = useState<number | null>(null);
  const [showPackageModal, setShowPackageModal] = useState(false);
  const [showBookingModal, setShowBookingModal] = useState(false);

  const navigate = useNavigate();
  const authContext = useContext(AuthContext);
  const token = localStorage.getItem("token");

  useEffect(() => {
    if (!token) return;

    const fetchStudentData = async () => {
      try {
        const response = await axios.get(
          `${import.meta.env.VITE_API_URL}/api/student/dashboard`,
          { headers: { Authorization: `Bearer ${token}` } }
        );

        setStudent(response.data.student);
        setPackageDetails(response.data.package || null);

        const now = new Date();
        const processedBookings: Record<string, string[]> = {};

        response.data.bookings.forEach((booking: Booking) => {
          const appointmentDateTime = new Date(
            `${booking.appointment_date} ${booking.timeslot}`
          );
          if (appointmentDateTime >= now) {
            const dateKey = booking.appointment_date;
            if (!processedBookings[dateKey]) processedBookings[dateKey] = [];
            processedBookings[dateKey].push(booking.timeslot);
          }
        });

        setCalendarBookings(processedBookings);
      } catch (error) {
        console.error("Error fetching student data:", error);
      }
    };

    fetchStudentData();
  }, [token]);

  const handleAvailPackage = async () => {
    try {
      const res = await axios.get(
        `${import.meta.env.VITE_API_URL}/api/student/packages`
      );
      setAvailablePackages(res.data);
      setShowPackageModal(true);
    } catch (error) {
      console.error("Error fetching packages:", error);
    }
  };

  const confirmPackage = async (selectedSubject: string) => {
    if (!student || !selectedPackage) return;
    try {
      await axios.post(`${import.meta.env.VITE_API_URL}/api/student/avail`, {
        student_id: student.id,
        package_id: selectedPackage,
        subject: selectedSubject,
      });
      alert("Package confirmed!");
    } catch (error) {
      console.error("Error confirming package:", error);
      alert("Error confirming package. Please try again.");
    }
  };

  const handleDateClick = (date: Date) => {
    const localDate = new Date(date.getTime() - date.getTimezoneOffset() * 60000)
      .toISOString()
      .split("T")[0];
    navigate(`/timeslots/${localDate}`);
  };

  const confirmBooking = async () => {
    // Booking is handled directly from TimeslotPage; this modal is a placeholder
    setShowBookingModal(false);
  };

  const handleLogout = () => {
    authContext?.logout();
    navigate("/");
  };

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <div className="bg-primary/20 border-b border-primary/30">
        <div className="max-w-7xl mx-auto px-4 py-3 flex items-center justify-between">
          <img src={logo} alt="EuniTalk Logo" className="h-10 w-auto" />

          <div className="hidden md:flex flex-col items-end">
            <p className="text-xs text-muted-foreground">
              Nationality: {student?.nationality || "N/A"}
            </p>
            <p className="text-xs text-muted-foreground">
              Age: {student?.age || "N/A"}
            </p>
          </div>

          <Button
            variant="outline"
            size="sm"
            onClick={handleLogout}
            className="border-pink-400 text-pink-500 hover:bg-pink-50"
          >
            <LogOut className="h-4 w-4 mr-1" />
            Logout
          </Button>
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
                ? new Date(student.created_at).toLocaleDateString("en-US")
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
            />
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

      <PackageSelectionModal
        show={showPackageModal}
        onHide={() => setShowPackageModal(false)}
        availablePackages={availablePackages}
        setSelectedPackage={setSelectedPackage}
        confirmPackage={confirmPackage}
      />

      <BookingConfirmationModal
        show={showBookingModal}
        onHide={() => setShowBookingModal(false)}
        confirmBooking={confirmBooking}
      />
    </div>
  );
};

export default StudentDashboard;
