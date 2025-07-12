import { useState, useEffect } from "react";
import { Row, Col, Table, Button } from "react-bootstrap";
//import Calendar from "react-calendar";
import "react-calendar/dist/Calendar.css";
import { useNavigate } from "react-router-dom";
import NavBar from "../components/Navbar";
import axios from "axios";
import "../index.css";
import WeeklyCalendar from "../components/WeeklyCalendar";

interface Student {
  id: number;
  student_name: string;
  email: string;
  guardian_name: string;
  nationality: string;
  age: number;
  created_at: string;
  is_admin: boolean;
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
  date: string; // or Date if you want to store it as a Date object
  time: string;
  created_at?: string; // Optional
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
  const [paidStudentPackages, setPaidStudentPackages] = useState<
    StudentPackage[]
  >([]);
  const [studentPackages, setStudentPackages] = useState<StudentPackage[]>([]);
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const [calendarBookings, setCalendarBookings] = useState<
    Record<string, string[]>
  >({});
  const navigate = useNavigate();
  const [closedSlots, setClosedSlots] = useState<ClosedSlot[]>([]);
  const [completedBookings, setCompletedBookings] = useState<
    CompletedBooking[]
  >([]);

  useEffect(() => {
    fetchDashboardData();
  }, []);

  const fetchDashboardData = async () => {
    try {
      const token = localStorage.getItem("token");
      if (!token) {
        console.error("No token found. Redirecting to login...");
        navigate("/login");
        return;
      }

      const studentsRes = await axios.get(
        `${import.meta.env.VITE_API_URL}/api/student/students`,
        {
          headers: { Authorization: `Bearer ${token}` },
        }
      );
      const bookingsRes = await axios.get(
        `${import.meta.env.VITE_API_URL}/api/student-bookings`,
        {
          headers: { Authorization: `Bearer ${token}` },
        }
      );
      const studentPackagesRes = await axios.get(
        `${import.meta.env.VITE_API_URL}/api/student/student-packages/pending`,
        {
          headers: { Authorization: `Bearer ${token}` },
        }
      );
      const studentPackagesPaidRes = await axios.get(
        `${import.meta.env.VITE_API_URL}/api/student/student-packages/paid`,
        {
          headers: { Authorization: `Bearer ${token}` },
        }
      );
      const completedBookingsRes = await axios.get<CompletedBooking[]>(
        `${import.meta.env.VITE_API_URL}/api/completed-bookings`,
        { headers: { Authorization: `Bearer ${token}` } }
      );

      console.log("Fetched Students:", studentsRes.data);
      console.log("Fetched Bookings:", bookingsRes.data);
      console.log("Fetched Student Packages:", studentPackagesRes.data);
      console.log(
        "Fetched Paid Student Packages:",
        studentPackagesPaidRes.data
      );
      console.log("Fetched Completed Bookings:", completedBookingsRes.data);

      setStudents(studentsRes.data);
      setBookings(bookingsRes.data);
      setStudentPackages(studentPackagesRes.data);
      setPaidStudentPackages(studentPackagesPaidRes.data);
      organizeCalendarData(bookingsRes.data);
      setCompletedBookings(completedBookingsRes.data);
    } catch (err) {
      console.error("Error fetching data", err);
    }
  };

  const organizeCalendarData = (bookings: Booking[]) => {
    const formattedBookings: Record<string, string[]> = {};

    bookings.forEach((booking) => {
      const localDate = new Date(booking.appointment_date); // Convert to Date object
      const dateKey = new Date(
        localDate.getTime() - localDate.getTimezoneOffset() * 60000
      )
        .toISOString()
        .split("T")[0]; // Ensure it's in local time

      if (!formattedBookings[dateKey]) formattedBookings[dateKey] = [];
      formattedBookings[dateKey].push(booking.student_name);
    });

    setCalendarBookings(formattedBookings);
  };

  const handleConfirm = async (id: number) => {
    try {
      await axios.post(
        `http://localhost:5000/api/student/package/confirm/${id}`
      );
      fetchDashboardData();
    } catch (error) {
      console.error("Error confirming booking:", error);
    }
  };

  const handleReject = async (id: number) => {
    try {
      await axios.post(
        `http://localhost:5000/api/student/package/reject/${id}`
      );
      fetchDashboardData();
    } catch (error) {
      console.error("Error rejecting booking:", error);
    }
  };

  const handleMarkAsDone = async (
    bookingId: number,
    studentPackageId: number
  ) => {
    try {
      await axios.post(`http://localhost:5000/api/bookings/done/${bookingId}`, {
        student_package_id: studentPackageId,
      });
      fetchDashboardData(); // Refresh data
    } catch (error) {
      console.error("Error marking class as done:", error);
    }
  };

  const handleCancelBooking = async (bookingId: number) => {
    try {
      await axios.post(
        `http://localhost:5000/api/bookings/cancel/${bookingId}`
      );
      fetchDashboardData(); // Refresh data
    } catch (error) {
      console.error("Error cancelling class:", error);
    }
  };

  // const handleDateClick = (date: Date) => {
  //   const localDate = new Date(
  //     date.getTime() - date.getTimezoneOffset() * 60000
  //   )
  //     .toISOString()
  //     .split("T")[0]; // Ensures local time zone

  //   navigate(`/timeslots/${localDate}`);
  // };

  // **Filter Logic**
  // Total Students (only non-admin users)
  const totalStudents = students.filter((s) => !s.is_admin).length;
  // Enrolled Students: paid and sessions_remaining > 0

  const enrolledStudents = paidStudentPackages.filter(
    (sp) => sp.payment_status === "paid" && sp.sessions_remaining > 0
  ).length;
  // Pending Enrollees: unpaid and sessions_remaining > 0
  const pendingEnrollees = studentPackages.filter(
    (sp) => sp.payment_status === "unpaid" && sp.sessions_remaining > 0
  );
  // New Schedules: bookings with status "pending"
  const newSchedules = bookings.filter((b) => b.status === "pending");
  //Past apoointments
  const confirmSchedules = newSchedules.filter(
    (booking) => new Date(booking.appointment_date) < new Date()
  );
  console.log("All bookings:", newSchedules); // Log all fetched schedules
  console.log("Filtered past schedules:", confirmSchedules); // Log only past schedules
  console.log("Current date:", new Date()); // Log current time for comparison

  const fetchClosedSlots = async () => {
    try {
      const token = localStorage.getItem("token");
      const res = await axios.get(
        `${import.meta.env.VITE_API_URL}/api/admin/closed-slots`,
        {
          headers: { Authorization: `Bearer ${token}` },
        }
      );
      //  console.log("Closed Slots Data:", res.data);

      // Convert the data to the format expected by your calendar
      const formattedSlots = res.data.map((slot: ClosedSlot) => ({
        date: new Date(slot.date).toLocaleDateString("en-CA"), // YYYY-MM-DD format without timezone shift
        time: slot.time,
      }));

      console.log("Formatted Closed Slots:", formattedSlots);

      setClosedSlots(formattedSlots);
    } catch (err) {
      console.error("Error fetching closed slots", err);
    }
  };

  useEffect(() => {
    fetchClosedSlots();
  }, []);

  return (
    <>
      <NavBar />
      {/* Full-width layout, but with padding for spacing */}
      <div className="px-5 pt-4">
        {/* Main Layout Row */}
        <Row>
          {/* Left Section (40% width) */}
          <Col md={5}>
            <h5 className="mt-4">Total Students: {totalStudents}</h5>
            <h5 className="mt-4">Enrolled Students: {enrolledStudents}</h5>

            <h5 className="mt-4">Pending Enrollees</h5>
            <Table striped bordered hover responsive>
              <thead>
                <tr>
                  <th>Student Name</th>
                  <th>Package</th>
                  <th>Action</th>
                </tr>
              </thead>
              <tbody>
                {pendingEnrollees.map((enrollee, index) => (
                  <tr key={index}>
                    <td>
                      {students.find((s) => s.id === enrollee.student_id)
                        ?.student_name || "Unknown"}
                    </td>
                    <td>{enrollee.package_id}</td>
                    <td>
                      <Button
                        variant="success"
                        className="ms-2 btn-xs"
                        onClick={() => handleConfirm(enrollee.id)}
                      >
                        Confirm
                      </Button>
                      <Button
                        variant="danger"
                        className="ms-2 btn-xs"
                        onClick={() => handleReject(enrollee.id)}
                      >
                        Reject
                      </Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </Table>
          </Col>

          {/* Right Section (60% width) */}
          <Col md={7} className="ml-4">
            <div className="pl-4">
              {/* <h4 className="">CALENDAR</h4> */}
              {/* <Calendar
                className="custom-calendar" // Apply custom styles
                onClickDay={handleDateClick}
                tileContent={({ date }) => {
                  // Convert to local date before formatting
                  const localDate = new Date(
                    date.getTime() - date.getTimezoneOffset() * 60000
                  )
                    .toISOString()
                    .split("T")[0];

                  return calendarBookings[localDate] ? (
                    <div className="booking-names">
                      {calendarBookings[localDate].map((name, index) => (
                        <div key={index} className="booking-name">
                          {name}
                        </div>
                      ))}
                    </div>
                  ) : null;
                }}
              /> */}

              <h5 className="mt-4">Confirm Classes</h5>
              <Table striped bordered hover responsive>
                <thead>
                  <tr>
                    <th>Student Name</th>
                    <th>Date</th>
                    <th>Action</th>
                  </tr>
                </thead>
                <tbody>
                  {completedBookings.length === 0 ? (
                    <tr>
                      <td colSpan={3}>No completed bookings</td>
                    </tr>
                  ) : (
                    completedBookings.map((booking) => (
                      <tr key={booking.id}>
                        <td>{booking.student_name}</td>
                        <td>
                          {new Date(booking.appointment_date).toLocaleString(
                            "en-US",
                            {
                              year: "numeric",
                              month: "long",
                              day: "numeric",
                              hour: "2-digit",
                              minute: "2-digit",
                              hour12: true,
                            }
                          )}
                        </td>
                        <td>
                          <Button
                            variant="success"
                            className="ms-2 btn-xs"
                            onClick={() =>
                              handleMarkAsDone(
                                booking.id,
                                booking.student_package_id
                              )
                            }
                          >
                            Done
                          </Button>
                          <Button
                            variant="danger"
                            className="ms-2 btn-xs"
                            onClick={() => handleCancelBooking(booking.id)}
                          >
                            Cancelled
                          </Button>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </Table>
            </div>
          </Col>
        </Row>
        {/* 📅 Weekly Calendar */}
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
