import { useEffect, useState, useMemo } from "react";
import { useNavigate } from "react-router-dom";
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
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Loader2, UserPlus, Eye, EyeOff, Search, ChevronLeft, ChevronRight } from "lucide-react";

const PAGE_SIZE = 10;

interface Student {
  id: number;
  name: string;
  package_name: string;
  subject: string;
  sessions_remaining: number;
  nationality: string;
}

const emptyForm = { name: '', email: '', password: '', guardian_name: '', nationality: '', age: '' };

const StudentListPage: React.FC = () => {
  const navigate = useNavigate();
  const [students, setStudents] = useState<Student[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [showAddModal, setShowAddModal] = useState(false);
  const [addForm, setAddForm] = useState(emptyForm);
  const [addError, setAddError] = useState<string | null>(null);
  const [addLoading, setAddLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [search, setSearch] = useState("");
  const [sessionFilter, setSessionFilter] = useState("all");
  const [page, setPage] = useState(1);

  const filtered = useMemo(() => {
    return students.filter((s) => {
      const q = search.toLowerCase();
      const matchSearch = !q || s.name.toLowerCase().includes(q) || (s.nationality || "").toLowerCase().includes(q);
      const matchSession =
        sessionFilter === "all" ||
        (sessionFilter === "active" && s.sessions_remaining > 0) ||
        (sessionFilter === "empty" && s.sessions_remaining === 0);
      return matchSearch && matchSession;
    });
  }, [students, search, sessionFilter]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const paginated = filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  const fetchStudents = async () => {
    try {
      const token = localStorage.getItem("token");
      const response = await axios.get(
        `${import.meta.env.VITE_API_URL}/api/student/students`,
        { headers: { Authorization: `Bearer ${token}` } }
      );
      const d = response.data;
      setStudents(Array.isArray(d) ? d : d.data ?? []);
    } catch (error) {
      console.error("Error fetching students:", error);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchStudents();
  }, []);

  const handleAddStudent = async () => {
    setAddLoading(true);
    setAddError(null);
    try {
      const token = localStorage.getItem("token");
      await axios.post(
        `${import.meta.env.VITE_API_URL}/api/admin/students`,
        {
          name: addForm.name,
          email: addForm.email,
          password: addForm.password,
          guardian_name: addForm.guardian_name || undefined,
          nationality: addForm.nationality || undefined,
          age: addForm.age ? Number(addForm.age) : undefined,
        },
        { headers: { Authorization: `Bearer ${token}` } }
      );
      setShowAddModal(false);
      setAddForm(emptyForm);
      fetchStudents();
    } catch (err: unknown) {
      if (axios.isAxiosError(err) && err.response) {
        setAddError(err.response.data.message || "Failed to add student");
      } else {
        setAddError("An unexpected error occurred");
      }
    } finally {
      setAddLoading(false);
    }
  };

  return (
    <>
      <NavBar />
      <div className="max-w-6xl mx-auto px-4 sm:px-6 py-8">
        <div className="flex items-center justify-between mb-6">
          <h1 className="text-2xl font-bold text-gray-800">Students List</h1>
          <Button onClick={() => { setAddForm(emptyForm); setAddError(null); setShowAddModal(true); }}>
            <UserPlus className="h-4 w-4 mr-2" /> Add Student
          </Button>
        </div>

        {/* Search & Filter */}
        <div className="flex flex-col sm:flex-row gap-3 mb-4">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Search by name or nationality…"
              value={search}
              onChange={(e) => { setSearch(e.target.value); setPage(1); }}
              className="pl-9"
            />
          </div>
          <Select value={sessionFilter} onValueChange={(v) => { setSessionFilter(v); setPage(1); }}>
            <SelectTrigger className="w-44"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Students</SelectItem>
              <SelectItem value="active">Has Sessions</SelectItem>
              <SelectItem value="empty">No Sessions</SelectItem>
            </SelectContent>
          </Select>
        </div>

        <div className="bg-white rounded-xl border shadow-sm overflow-hidden glow-card">
          {isLoading ? (
            <div className="flex justify-center items-center py-16">
              <Loader2 className="h-6 w-6 animate-spin text-primary" />
            </div>
          ) : (
            <>
              <Table>
                <TableHeader>
                  <TableRow className="brand-gradient-subtle">
                    <TableHead>Student Name</TableHead>
                    <TableHead>Package</TableHead>
                    <TableHead>Subject</TableHead>
                    <TableHead>Sessions Remaining</TableHead>
                    <TableHead>Nationality</TableHead>
                    <TableHead></TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {paginated.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={6} className="text-center text-muted-foreground py-10">
                        No students found.
                      </TableCell>
                    </TableRow>
                  ) : (
                    paginated.map((student) => (
                      <TableRow key={student.id} className="hover:bg-muted/30 transition-colors">
                        <TableCell className="font-medium">{student.name}</TableCell>
                        <TableCell>{student.package_name || "—"}</TableCell>
                        <TableCell>
                          {student.subject ? <Badge variant="secondary">{student.subject}</Badge> : "—"}
                        </TableCell>
                        <TableCell>
                          <Badge variant={student.sessions_remaining > 0 ? "default" : "destructive"}>
                            {student.sessions_remaining ?? "—"}
                          </Badge>
                        </TableCell>
                        <TableCell>{student.nationality || "—"}</TableCell>
                        <TableCell className="text-right">
                          <Button size="sm" variant="ghost" className="h-7 text-xs"
                            onClick={() => navigate(`/admin/students/${student.id}`)}>
                            View
                          </Button>
                        </TableCell>
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>

              {/* Pagination */}
              {totalPages > 1 && (
                <div className="flex items-center justify-between px-4 py-3 border-t text-sm text-muted-foreground">
                  <span>{filtered.length} student{filtered.length !== 1 ? "s" : ""} · Page {page} of {totalPages}</span>
                  <div className="flex gap-1">
                    <Button size="sm" variant="outline" className="h-7 w-7 p-0"
                      disabled={page === 1} onClick={() => setPage((p) => p - 1)}>
                      <ChevronLeft className="h-4 w-4" />
                    </Button>
                    <Button size="sm" variant="outline" className="h-7 w-7 p-0"
                      disabled={page === totalPages} onClick={() => setPage((p) => p + 1)}>
                      <ChevronRight className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
              )}
            </>
          )}
        </div>
      </div>

      {/* Add Student Modal */}
      <Dialog open={showAddModal} onOpenChange={setShowAddModal}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Add New Student</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            {addError && (
              <Alert variant="destructive">
                <AlertDescription>{addError}</AlertDescription>
              </Alert>
            )}
            <div>
              <Label>Full Name <span className="text-destructive">*</span></Label>
              <Input value={addForm.name} onChange={e => setAddForm(f => ({ ...f, name: e.target.value }))} placeholder="Student's full name" />
            </div>
            <div>
              <Label>Email <span className="text-destructive">*</span></Label>
              <Input type="email" value={addForm.email} onChange={e => setAddForm(f => ({ ...f, email: e.target.value }))} placeholder="student@email.com" />
            </div>
            <div>
              <Label>Password <span className="text-destructive">*</span></Label>
              <div className="relative">
                <Input
                  type={showPassword ? "text" : "password"}
                  value={addForm.password}
                  onChange={e => setAddForm(f => ({ ...f, password: e.target.value }))}
                  placeholder="Set a login password"
                  className="pr-10"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(v => !v)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                  tabIndex={-1}
                >
                  {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>Guardian Name</Label>
                <Input value={addForm.guardian_name} onChange={e => setAddForm(f => ({ ...f, guardian_name: e.target.value }))} placeholder="Optional" />
              </div>
              <div>
                <Label>Age</Label>
                <Input type="number" min="1" value={addForm.age} onChange={e => setAddForm(f => ({ ...f, age: e.target.value }))} placeholder="Optional" />
              </div>
            </div>
            <div>
              <Label>Nationality</Label>
              <Input value={addForm.nationality} onChange={e => setAddForm(f => ({ ...f, nationality: e.target.value }))} placeholder="Optional" />
            </div>
          </div>
          <DialogFooter className="mt-4">
            <Button variant="outline" onClick={() => setShowAddModal(false)}>Cancel</Button>
            <Button
              onClick={handleAddStudent}
              disabled={addLoading || !addForm.name || !addForm.email || !addForm.password}
            >
              {addLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : "Create Student"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
};

export default StudentListPage;
