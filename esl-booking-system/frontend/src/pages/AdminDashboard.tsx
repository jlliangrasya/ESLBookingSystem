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
  appointment_date: string;
  status: "pending" | "confirmed" | "rejected";
  rescheduled_by_admin: boolean;
  created_at: string;
}

interface StudentPackage {
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

const AdminDashboard = () => {
  const [students, setStudents] = useState<Student[]>([]);
  const [bookings, setBookings] = useState<Booking[]>([]);
  const [studentPackages, setStudentPackages] = useState<StudentPackage[]>([]);
  const [calendarBookings, setCalendarBookings] = useState<
    Record<string, string[]>
  >({});
  const navigate = useNavigate();
  const [closedSlots, setClosedSlots] = useState<ClosedSlot[]>([]);

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

      console.log("Fetched Students:", studentsRes.data);
      console.log("Fetched Bookings:", bookingsRes.data);
      console.log("Fetched Student Packages:", studentPackagesRes.data);

      setStudents(studentsRes.data);
      setBookings(bookingsRes.data);
      setStudentPackages(studentPackagesRes.data);
      organizeCalendarData(bookingsRes.data);
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
      await axios.post(`http://localhost:5000/api/bookings/confirm/${id}`);
      fetchDashboardData();
    } catch (error) {
      console.error("Error confirming booking:", error);
    }
  };

  const handleReject = async (id: number) => {
    try {
      await axios.post(`http://localhost:5000/api/bookings/reject/${id}`);
      fetchDashboardData();
    } catch (error) {
      console.error("Error rejecting booking:", error);
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
  const enrolledStudents = studentPackages.filter(
    (sp) => sp.payment_status === "paid" && sp.sessions_remaining > 0
  ).length;
  // Pending Enrollees: unpaid and sessions_remaining > 0
  const pendingEnrollees = studentPackages.filter(
    (sp) => sp.payment_status === "unpaid" && sp.sessions_remaining > 0
  );
  // New Schedules: bookings with status "pending"
  const newSchedules = bookings.filter((b) => b.status === "pending");

  const fetchClosedSlots = async () => {
    try {
      const token = localStorage.getItem("token");
      const res = await axios.get(
        `${import.meta.env.VITE_API_URL}/api/admin/closed-slots`,
        {
          headers: { Authorization: `Bearer ${token}` },
        }
      );
      console.log("Closed Slots Data:", res.data);

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
                      <Button variant="success" className="ms-2 btn-xs">
                        Confirm
                      </Button>
                      <Button variant="danger" className="ms-2 btn-xs">
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

              <h5 className="mt-4">New Schedules</h5>
              <Table striped bordered hover responsive>
                <thead>
                  <tr>
                    <th>Student Name</th>
                    <th>Date</th>
                    <th>Action</th>
                  </tr>
                </thead>
                <tbody>
                  {newSchedules.map((booking) => (
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
                          onClick={() => handleConfirm(booking.id)}
                        >
                          Confirm
                        </Button>
                        <Button
                          variant="danger"
                          className="ms-2 btn-xs"
                          onClick={() => handleReject(booking.id)}
                        >
                          Resched
                        </Button>
                      </td>
                    </tr>
                  ))}
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
