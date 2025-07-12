import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import axios from "axios";
import Calendar from "react-calendar";
import "react-calendar/dist/Calendar.css";
import { Button, Row, Col, Navbar } from "react-bootstrap";
import logo from "../assets/EuniTalk_Logo.png";
import "../index.css";
import Form from "react-bootstrap/Form";
import PackageSelectionModal from "../components/PackageSelectionModal";
import BookingConfirmationModal from "../components/BookingConfirmationModal";

interface Student {
  id: number;
  student_name: string;
  guardian_name: string;
  nationality: string;
  age: number;
  created_at: string;
}

interface Package {
  id: number;
  package_name: string;
  sessions_remaining: number;
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
  const [packageDetails, setPackageDetails] = useState<Package | null>(null);
  const [calendarBookings, setCalendarBookings] = useState<
    Record<string, string[]>
  >({});
  const [availablePackages, setAvailablePackages] = useState<Package[]>([]);
  const [selectedPackage, setSelectedPackage] = useState<number | null>(null);

  const [selectedSlot, setSelectedSlot] = useState<string | null>(null);
  const [showPackageModal, setShowPackageModal] = useState(false);
  const [showBookingModal, setShowBookingModal] = useState(false);

  const navigate = useNavigate();
  const token = localStorage.getItem("token"); // Retrieve token from local storage

  useEffect(() => {
    if (!token) {
      console.error("No token found in localStorage");
      return;
    }

    const fetchStudentData = async () => {
      try {
        console.log("Sending token:", token);

        const response = await axios.get(
          `${import.meta.env.VITE_API_URL}/api/student/dashboard`,
          {
            headers: { Authorization: `Bearer ${token}` },
          }
        );

        console.log("API Response:", response.data);

        setStudent(response.data.student);
        setPackageDetails(response.data.package || null);

        // Get current date & time in the same format as bookings
        const now = new Date();

        // Process bookings to match calendar format
        const processedBookings: Record<string, string[]> = {};

        response.data.bookings.forEach((booking: Booking) => {
          // Combine date and time for accurate comparison
          const appointmentDateTime = new Date(
            `${booking.appointment_date} ${booking.timeslot}`
          );

          // 🔥 Remove past appointments
          if (appointmentDateTime >= now) {
            const dateKey = booking.appointment_date;

            if (!processedBookings[dateKey]) {
              processedBookings[dateKey] = [];
            }
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
    if (!student || !selectedPackage) {
      alert("Student or package not selected.");
      return;
    }

    try {
      const response = await axios.post(
        `${import.meta.env.VITE_API_URL}/api/student/avail`,
        {
          student_id: student.id,
          package_id: selectedPackage,
          subject: selectedSubject,
        }
      );

      console.log("Response:", response.data);
      alert("Package confirmed!");
    } catch (error) {
      console.error("Error confirming package:", error);
      alert("Error confirming package. Please try again.");
    }
  };

  const handleDateClick = (date: Date) => {
    const localDate = new Date(
      date.getTime() - date.getTimezoneOffset() * 60000
    )
      .toISOString()
      .split("T")[0]; // Ensures local time zone

    navigate(`/timeslots/${localDate}`);
  };

  const confirmBooking = async () => {
    if (!selectedSlot) {
      alert("Please select a time slot.");
      return;
    }

    try {
      const token = localStorage.getItem("token");
      if (!token) {
        console.error("No token found!");
        navigate("/login");
        return;
      }

      // Fetch student package ID using GET request
      const studentPackageResponse = await axios.get(
        `${import.meta.env.VITE_API_URL}/api/student/avail`,
        { headers: { Authorization: `Bearer ${token}` } }
      );
      console.log(import.meta.env.VITE_API_URL);

      const studentPackageId = studentPackageResponse.data?.student_package_id; // Ensure correct key
      if (!studentPackageId) {
        alert("No active package found. Please purchase a package.");
        return;
      }

      // Send booking request to backend
      const response = await axios.post(
        `${import.meta.env.VITE_API_URL}/api/student/book`,
        {
          student_package_id: studentPackageId,
          appointment_date: `${Date} ${selectedSlot}`, // Combine date and time
          status: "pending",
          rescheduled_by_admin: false,
        },
        { headers: { Authorization: `Bearer ${token}` } }
      );

      console.log("Booking saved:", response.data);
      alert("Booking confirmed successfully!");
      setShowBookingModal(false);
    } catch (error) {
      console.error("Error confirming booking:", error);
      alert("Failed to confirm booking. Please try again.");
    }
  };

  const handleLogout = () => {
    localStorage.removeItem("token"); // Remove auth token
    navigate("/home"); // Redirect to login page
  };

  return (
    <div className="container mt-4">
      <div className="header-section">
        <Navbar expand="lg" className="align-items-center px-3 py-2">
          <div className="container-fluid position-relative">
            {/* Centered Logo */}
            <Navbar.Brand className="position-absolute top-50 start-50 translate-middle">
              <img src={logo} alt="Logo" height="40" />
            </Navbar.Brand>

            {/* Logout Button aligned to the right */}
            <div className="ms-auto">
              <button
                className="btn btn-sm btn-outline-pink custom-logout-btn"
                onClick={handleLogout}
              >
                Logout
              </button>
            </div>
          </div>
        </Navbar>

        <div>
          {/* Header Section */}
          <Row className="px-5">
            {/* Left Section - 50% of the screen */}
            <Col md={10}>
              <h4 className="m-0">Hi, I am</h4>
              <h1>{student?.student_name || "Student"}</h1>
            </Col>

            {/* Right Section - 50% of the screen */}
            <Col md={2}>
              <p className="m-0">
                Nationality: {student?.nationality || "N/A"}
              </p>
              <p className="m-0">Age: {student?.age || "N/A"}</p>
              {/* <p className="m-0">Level: Beginner</p> */}
            </Col>
          </Row>
        </div>
      </div>
      <div className="main-content pb-5">
        {/* Main Content */}
        <Row>
          {/* Left Section - 50% of the screen */}
          <Col md={6}>
            <h5>Guardian: {student?.guardian_name || "N/A"}</h5>
            <h5 className="mt-4">
              Date Enrolled:{" "}
              {student?.created_at
                ? new Date(student.created_at).toLocaleDateString("en-US")
                : "//"}
            </h5>

            {packageDetails ? (
              <div>
                <h5 className="mt-4">
                  Availed Package:
                  <span className="ms-1"> {packageDetails.package_name}</span>
                </h5>
                <h5 className="mt-4">
                  Remaining Sessions:
                  <span className="ms-1">
                    {packageDetails.sessions_remaining}
                  </span>{" "}
                </h5>
              </div>
            ) : (
              <h5 className="mt-4">No package availed</h5>
            )}

            <h5 className="mt-4">Feedback:</h5>

            <Form.Control
              as="textarea"
              rows={3}
              placeholder="Enter your feedback here..."
            />
          </Col>

          {/* Right Section - 50% of the screen */}
          <Col md={6} className="px-5">
            <Button onClick={handleAvailPackage} className="custom-button">
              AVAIL A PACKAGE
            </Button>

            <h4 className="mt-4">Booked Classes</h4>
            <Calendar
              className="custom-calendar "
              onClickDay={handleDateClick}
              tileContent={({ date }) => {
                const dateString = date.toLocaleDateString("en-CA"); // "YYYY-MM-DD"
                return calendarBookings[dateString] ? (
                  <div className="booking-name">
                    {calendarBookings[dateString].map((slot, index) => (
                      <p key={index} className="m-0">
                        {slot}
                      </p>
                    ))}
                  </div>
                ) : null;
              }}
            />
          </Col>
        </Row>
      </div>

      {/* Package Selection Modal */}
      <PackageSelectionModal
        show={showPackageModal}
        onHide={() => setShowPackageModal(false)}
        availablePackages={availablePackages}
        setSelectedPackage={setSelectedPackage}
        confirmPackage={confirmPackage}
      />

      {/* Booking Confirmation Modal */}
      <BookingConfirmationModal
        show={showBookingModal}
        onHide={() => setShowBookingModal(false)}
        confirmBooking={confirmBooking}
      />
    </div>
  );
};

export default StudentDashboard;
