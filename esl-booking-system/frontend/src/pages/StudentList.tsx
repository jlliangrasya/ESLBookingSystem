import React, { useEffect, useState } from "react";
import axios from "axios";
import { Table } from "react-bootstrap";
import NavBar from "../components/Navbar";

interface Student {
  id: number;
  student_name: string;
  package_name: string;
  subject: string;
  sessions_remaining: number;
  nationality: string;
}

const StudentListPage: React.FC = () => {
  const [students, setStudents] = useState<Student[]>([]);

  useEffect(() => {
    const fetchStudents = async () => {
      try {
        const response = await axios.get(
          `${import.meta.env.VITE_API_URL}/api/student/students`
        );
        setStudents(response.data);
      } catch (error) {
        console.error("Error fetching students:", error);
      }
    };

    fetchStudents();
  }, []);

  return (
    <>
      <NavBar />
      <div className="container mt-4">
        <h2>Students List</h2>
        <Table striped bordered hover responsive>
          <thead>
            <tr>
              <th>Student Name</th>
              <th>Package</th>
              <th>Subject</th>
              <th>Sessions Remaining</th>
              <th>Nationality</th>
            </tr>
          </thead>
          <tbody>
            {students.length === 0 ? (
              <tr>
                <td colSpan={5} className="text-center">
                  No students found.
                </td>
              </tr>
            ) : (
              students.map((student) => (
                <tr key={student.id}>
                  <td>{student.student_name}</td>
                  <td>{student.package_name}</td>
                  <td>{student.subject}</td>
                  <td>{student.sessions_remaining}</td>
                  <td>{student.nationality}</td>
                </tr>
              ))
            )}
          </tbody>
        </Table>
      </div>
    </>
  );
};

export default StudentListPage;
