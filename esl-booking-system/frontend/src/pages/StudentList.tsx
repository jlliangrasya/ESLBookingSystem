import { useEffect, useState } from "react";
import axios from "axios";
import NavBar from "../components/Navbar";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Loader2 } from "lucide-react";

interface Student {
  id: number;
  name: string;
  package_name: string;
  subject: string;
  sessions_remaining: number;
  nationality: string;
}

const StudentListPage: React.FC = () => {
  const [students, setStudents] = useState<Student[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    const fetchStudents = async () => {
      try {
        const token = localStorage.getItem("token");
        const response = await axios.get(
          `${import.meta.env.VITE_API_URL}/api/student/students`,
          { headers: { Authorization: `Bearer ${token}` } }
        );
        setStudents(response.data);
      } catch (error) {
        console.error("Error fetching students:", error);
      } finally {
        setIsLoading(false);
      }
    };

    fetchStudents();
  }, []);

  return (
    <>
      <NavBar />
      <div className="max-w-6xl mx-auto px-4 sm:px-6 py-8">
        <h1 className="text-2xl font-bold mb-6">Students List</h1>

        <div className="bg-white rounded-xl border shadow-sm overflow-hidden">
          {isLoading ? (
            <div className="flex justify-center items-center py-16">
              <Loader2 className="h-6 w-6 animate-spin text-primary" />
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow className="bg-primary/10">
                  <TableHead>Student Name</TableHead>
                  <TableHead>Package</TableHead>
                  <TableHead>Subject</TableHead>
                  <TableHead>Sessions Remaining</TableHead>
                  <TableHead>Nationality</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {students.length === 0 ? (
                  <TableRow>
                    <TableCell
                      colSpan={5}
                      className="text-center text-muted-foreground py-10"
                    >
                      No students found.
                    </TableCell>
                  </TableRow>
                ) : (
                  students.map((student) => (
                    <TableRow key={student.id} className="hover:bg-muted/30 transition-colors">
                      <TableCell className="font-medium">
                        {student.name}
                      </TableCell>
                      <TableCell>{student.package_name || "—"}</TableCell>
                      <TableCell>
                        {student.subject ? (
                          <Badge variant="secondary">{student.subject}</Badge>
                        ) : (
                          "—"
                        )}
                      </TableCell>
                      <TableCell>
                        <Badge
                          variant={
                            student.sessions_remaining > 0
                              ? "default"
                              : "destructive"
                          }
                        >
                          {student.sessions_remaining ?? "—"}
                        </Badge>
                      </TableCell>
                      <TableCell>{student.nationality || "—"}</TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          )}
        </div>
      </div>
    </>
  );
};

export default StudentListPage;
