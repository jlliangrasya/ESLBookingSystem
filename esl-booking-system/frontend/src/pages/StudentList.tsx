import { useEffect, useState, useMemo, useContext } from "react";
import { useNavigate } from "react-router-dom";
import axios from "axios";
import NavBar from "../components/Navbar";
import AuthContext from "@/context/AuthContext";
import { AdminTour } from "@/components/AdminTour";
import { useOnboarding } from "@/context/OnboardingContext";
import BulkImportDialog from "@/components/BulkImportDialog";
import SessionAdjustDialog, { type AdjustMode } from "@/components/SessionAdjustDialog";
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
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Loader2,
  UserPlus,
  FileSpreadsheet,
  Eye,
  EyeOff,
  Search,
  ChevronLeft,
  ChevronRight,
  Copy,
  Check,
  ShieldCheck,
  Trash2,
  AlertTriangle,
  Plus,
  Minus,
  Columns3,
} from "lucide-react";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";

const PAGE_SIZE = 10;

interface Student {
  id: number;
  name: string;
  email: string;
  age: number | null;
  guardian_name: string | null;
  package_name: string;
  subject: string;
  sessions_remaining: number;
  unused_sessions: number;
  nationality: string;
  password: string;
  teacher_id: number | null;
  teacher_name: string | null;
  enrolled: boolean;
  is_active?: boolean | number;
  student_package_id: number | null;
}

const emptyForm = {
  name: "",
  email: "",
  password: "",
  guardian_name: "",
  nationality: "",
  age: "",
};

// MySQL hands back is_active as 0/1; treat a missing value as active so the row
// never disappears if an older API response omits the column.
const isActive = (s: Student) => s.is_active === undefined || !!s.is_active;

// The count the "N remaining" badge shows. The badge turns red at or below
// LOW_SESSIONS, and the "3 or Fewer Left" filter uses the same rule, so the
// filter returns exactly the rows with red badges.
const LOW_SESSIONS = 3;
const remainingCount = (s: Student) => s.unused_sessions ?? s.sessions_remaining ?? 0;

// Columns the admin can hide. The choice is a per-browser preference, so it
// lives in localStorage; storage can throw (private mode, blocked site data),
// in which case both columns simply show.
type OptionalColumn = "package" | "subject";
const HIDDEN_COLUMNS_KEY = "studentList.hiddenColumns";
const loadHiddenColumns = (): OptionalColumn[] => {
  try {
    const raw = localStorage.getItem(HIDDEN_COLUMNS_KEY);
    const parsed = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed)
      ? parsed.filter((c): c is OptionalColumn => c === "package" || c === "subject")
      : [];
  } catch {
    return [];
  }
};

const StudentListPage: React.FC = () => {
  const navigate = useNavigate();
  const authContext = useContext(AuthContext);
  const currentUser = authContext?.user ?? null;
  const { status: onboarding } = useOnboarding();
  const [students, setStudents] = useState<Student[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [showAddModal, setShowAddModal] = useState(false);
  const [addForm, setAddForm] = useState(emptyForm);
  const [addError, setAddError] = useState<string | null>(null);
  const [addLoading, setAddLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [showBulkImport, setShowBulkImport] = useState(false);
  const [search, setSearch] = useState("");
  const [sessionFilter, setSessionFilter] = useState("all");
  const [teacherFilter, setTeacherFilter] = useState("all");
  const [page, setPage] = useState(1);
  const [copiedId, setCopiedId] = useState<number | null>(null);
  const [credStudent, setCredStudent] = useState<{ name: string; email: string; password: string; age: string; guardian_name: string } | null>(null);
  const [credCopied, setCredCopied] = useState(false);
  const [statusFilter, setStatusFilter] = useState("active");
  // The student the admin is about to delete, held until they confirm by name.
  const [deleteTarget, setDeleteTarget] = useState<Student | null>(null);
  const [deleteConfirmText, setDeleteConfirmText] = useState("");
  const [deleteLoading, setDeleteLoading] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  // Student whose sessions are being added/deducted via the +/- buttons.
  const [adjustTarget, setAdjustTarget] = useState<{ student: Student; mode: AdjustMode } | null>(null);
  const [hiddenColumns, setHiddenColumns] = useState<OptionalColumn[]>(loadHiddenColumns);
  const showPackage = !hiddenColumns.includes("package");
  const showSubject = !hiddenColumns.includes("subject");
  const columnCount = 5 + (showPackage ? 1 : 0) + (showSubject ? 1 : 0);

  const toggleColumn = (col: OptionalColumn, visible: boolean) => {
    setHiddenColumns((prev) => {
      const next = visible ? prev.filter((c) => c !== col) : [...prev, col];
      try {
        localStorage.setItem(HIDDEN_COLUMNS_KEY, JSON.stringify(next));
      } catch {
        // Not saved; the choice still applies until the page reloads.
      }
      return next;
    });
  };

  // The server checks this too — this only decides when the button lights up.
  const deleteConfirmed =
    !!deleteTarget &&
    deleteConfirmText.trim().toLowerCase() ===
      deleteTarget.name.trim().toLowerCase();

  const closeDeleteDialog = () => {
    setDeleteTarget(null);
    setDeleteConfirmText("");
    setDeleteError(null);
  };

  const handleCopyInfo = (student: Student) => {
    const text = `Name: ${student.name}
Age: ${student.age ?? ""}
Guardian: ${student.guardian_name ?? ""}
Email: ${student.email}
Password: ${student.password}

Please use the email and password to login to https://brightfolks.pages.dev`;
    navigator.clipboard.writeText(text);
    setCopiedId(student.id);
    setTimeout(() => setCopiedId(null), 2000);
  };

  // Permanent: the account and every record attached to it are destroyed
  // server-side in one transaction. There is no undo, which is why the dialog
  // makes the admin type the student's name first.
  const handleConfirmDelete = async () => {
    if (!deleteTarget || !deleteConfirmed) return;
    setDeleteLoading(true);
    setDeleteError(null);
    try {
      const token = localStorage.getItem("token");
      await axios.delete(
        `${import.meta.env.VITE_API_URL}/api/admin/students/${deleteTarget.id}`,
        {
          headers: { Authorization: `Bearer ${token}` },
          data: { confirm_name: deleteConfirmText.trim() },
        },
      );
      closeDeleteDialog();
      fetchStudents();
    } catch (err: unknown) {
      if (axios.isAxiosError(err) && err.response) {
        setDeleteError(err.response.data?.message || "Failed to delete student");
      } else {
        setDeleteError("An unexpected error occurred");
      }
    } finally {
      setDeleteLoading(false);
    }
  };

  // Patch the row in place rather than refetching, so the table doesn't
  // flash or lose its page while the dialog shows its success message.
  const handleAdjusted = (studentId: number, adjustment: number, newRemaining: number) => {
    setStudents((prev) =>
      prev.map((s) =>
        s.id === studentId
          ? {
              ...s,
              sessions_remaining: newRemaining,
              unused_sessions: (s.unused_sessions ?? s.sessions_remaining ?? 0) + adjustment,
            }
          : s,
      ),
    );
  };

  const filtered = useMemo(() => {
    return students.filter((s) => {
      const q = search.toLowerCase();
      const matchSearch =
        !q ||
        s.name.toLowerCase().includes(q) ||
        (s.nationality || "").toLowerCase().includes(q);
      const matchSession =
        sessionFilter === "all" ||
        (sessionFilter === "active" && remainingCount(s) > 0) ||
        (sessionFilter === "low" && remainingCount(s) <= LOW_SESSIONS) ||
        (sessionFilter === "empty" && remainingCount(s) === 0);
      const matchTeacher =
        teacherFilter === "all" ||
        (teacherFilter === "assigned" && !!s.teacher_id) ||
        (teacherFilter === "unassigned" && !s.teacher_id && s.enrolled);
      const matchStatus =
        statusFilter === "all" ||
        (statusFilter === "active" && isActive(s)) ||
        (statusFilter === "archived" && !isActive(s));
      return matchSearch && matchSession && matchTeacher && matchStatus;
    });
  }, [students, search, sessionFilter, teacherFilter, statusFilter]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const paginated = filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  // Archiving the last student on the last page shrinks the list out from under
  // the current page. The pager hides itself at one page, so without this the
  // admin is stranded on an empty "No students found" view with no way back.
  useEffect(() => {
    if (page > totalPages) setPage(totalPages);
  }, [page, totalPages]);

  const fetchStudents = async () => {
    try {
      const token = localStorage.getItem("token");
      const response = await axios.get(
        `${import.meta.env.VITE_API_URL}/api/student/students`,
        { headers: { Authorization: `Bearer ${token}` } },
      );
      const d = response.data;
      setStudents(Array.isArray(d) ? d : (d.data ?? []));
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
      // Note: a 403 with code APPROVAL_REQUIRED is handled in the catch below —
      // that's the approval gate, and it deserves the explanation screen rather
      // than an inline error the owner can't act on.
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
        { headers: { Authorization: `Bearer ${token}` } },
      );
      setShowAddModal(false);
      setCredStudent({
        name: addForm.name,
        email: addForm.email,
        password: addForm.password,
        age: addForm.age,
        guardian_name: addForm.guardian_name,
      });
      setCredCopied(false);
      setAddForm(emptyForm);
      fetchStudents();
    } catch (err: unknown) {
      if (axios.isAxiosError(err) && err.response) {
        // The approval gate. Send them to the screen that explains why and gives
        // them something useful to do while they wait, instead of a dead-end error.
        if (err.response.status === 403 && err.response.data?.code === "APPROVAL_REQUIRED") {
          setShowAddModal(false);
          navigate("/onboarding/approval");
          return;
        }
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
      <div className="max-w-screen-2xl mx-auto px-4 sm:px-6 py-8">
        <div className="flex items-center justify-between mb-6">
          <h1 className="text-2xl font-bold text-gray-800">Students List</h1>
          <div className="flex gap-2">
            <Button
              id="btn-bulk-import-students"
              variant="outline"
              onClick={() => setShowBulkImport(true)}
            >
              <FileSpreadsheet className="h-4 w-4 mr-2" /> Bulk Add
            </Button>
            <Button
              id="btn-add-student"
              onClick={() => {
                setAddForm(emptyForm);
                setAddError(null);
                setShowAddModal(true);
              }}
            >
              <UserPlus className="h-4 w-4 mr-2" /> Add Student
            </Button>
          </div>
        </div>

        {/* Explain the gate up front rather than letting them fill in a whole form
            and hit a 403. Submitting anyway still routes to the same screen. */}
        {onboarding?.student_invites_gated && (
          <Alert className="mb-4 border-amber-200 bg-amber-50">
            <ShieldCheck className="h-4 w-4 text-amber-600" />
            <AlertDescription className="text-sm">
              <span className="font-medium text-gray-800">
                To protect student data, we manually review accounts before
                inviting real students.
              </span>{" "}
              This usually takes under 24 hours.{" "}
              <button
                onClick={() => navigate("/onboarding/approval")}
                className="font-medium text-primary hover:underline"
              >
                Prepare your roster while you wait →
              </button>
            </AlertDescription>
          </Alert>
        )}

        {/* Search & Filter */}
        <div className="flex flex-col sm:flex-row gap-3 mb-4">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Search by name or nationality…"
              value={search}
              onChange={(e) => {
                setSearch(e.target.value);
                setPage(1);
              }}
              className="pl-9"
            />
          </div>
          <Select
            value={sessionFilter}
            onValueChange={(v) => {
              setSessionFilter(v);
              setPage(1);
            }}
          >
            <SelectTrigger className="w-48">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Students</SelectItem>
              <SelectItem value="active">Has Sessions</SelectItem>
              <SelectItem value="low">{LOW_SESSIONS} or Fewer Left</SelectItem>
              <SelectItem value="empty">No Sessions</SelectItem>
            </SelectContent>
          </Select>
          <Select
            value={teacherFilter}
            onValueChange={(v) => {
              setTeacherFilter(v);
              setPage(1);
            }}
          >
            <SelectTrigger className="w-52">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Teachers</SelectItem>
              <SelectItem value="assigned">Has Teacher</SelectItem>
              <SelectItem value="unassigned">No Teacher Assigned</SelectItem>
            </SelectContent>
          </Select>
          <Select
            value={statusFilter}
            onValueChange={(v) => {
              setStatusFilter(v);
              setPage(1);
            }}
          >
            <SelectTrigger className="w-40">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="active">Active</SelectItem>
              <SelectItem value="archived">Archived</SelectItem>
              <SelectItem value="all">Active + Archived</SelectItem>
            </SelectContent>
          </Select>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="outline" className="shrink-0">
                <Columns3 className="h-4 w-4 mr-2" /> Columns
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuLabel>Show columns</DropdownMenuLabel>
              <DropdownMenuSeparator />
              <DropdownMenuCheckboxItem
                checked={showPackage}
                onCheckedChange={(v) => toggleColumn("package", !!v)}
                onSelect={(e) => e.preventDefault()}
              >
                Package
              </DropdownMenuCheckboxItem>
              <DropdownMenuCheckboxItem
                checked={showSubject}
                onCheckedChange={(v) => toggleColumn("subject", !!v)}
                onSelect={(e) => e.preventDefault()}
              >
                Subject
              </DropdownMenuCheckboxItem>
            </DropdownMenuContent>
          </DropdownMenu>
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
                    {showPackage && <TableHead>Package</TableHead>}
                    {showSubject && <TableHead>Subject</TableHead>}
                    <TableHead>Sessions</TableHead>
                    <TableHead>Assigned Teacher</TableHead>
                    <TableHead>Nationality</TableHead>
                    <TableHead></TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {paginated.length === 0 ? (
                    <TableRow>
                      <TableCell
                        colSpan={columnCount}
                        className="text-center text-muted-foreground py-10"
                      >
                        No students found.
                      </TableCell>
                    </TableRow>
                  ) : (
                    paginated.map((student) => (
                      <TableRow
                        key={student.id}
                        className={`hover:bg-muted/30 transition-colors ${
                          isActive(student) ? "" : "opacity-60"
                        }`}
                      >
                        <TableCell className="font-medium">
                          <div className="flex items-center gap-2">
                            {student.name}
                            {!isActive(student) && (
                              <Badge
                                variant="outline"
                                className="text-[10px] text-muted-foreground"
                              >
                                Archived
                              </Badge>
                            )}
                          </div>
                        </TableCell>
                        {showPackage && (
                          <TableCell>{student.package_name || "—"}</TableCell>
                        )}
                        {showSubject && (
                          <TableCell>
                            {student.subject ? (
                              <Badge variant="secondary">{student.subject}</Badge>
                            ) : (
                              "—"
                            )}
                          </TableCell>
                        )}
                        <TableCell>
                          <div className="flex items-center gap-1.5">
                            <Button
                              size="sm"
                              variant="outline"
                              aria-label={`Deduct sessions from ${student.name}`}
                              title={student.student_package_id ? "Deduct sessions" : "No package assigned"}
                              className="h-6 w-6 p-0 shrink-0 text-red-600 hover:text-red-700 hover:bg-red-50"
                              disabled={
                                !student.student_package_id ||
                                (student.sessions_remaining ?? 0) <= 0
                              }
                              onClick={() => setAdjustTarget({ student, mode: "deduct" })}
                            >
                              <Minus className="h-3 w-3" />
                            </Button>
                            {/* Fixed width so the + lines up down the column
                                whether the row shows one badge or two. */}
                            <div className="w-60 shrink-0 flex gap-1 flex-wrap items-center">
                            <Badge
                              variant={
                                remainingCount(student) <= LOW_SESSIONS
                                  ? "destructive"
                                  : "default"
                              }
                            >
                              {remainingCount(student)} remaining
                            </Badge>
                            {student.sessions_remaining !== student.unused_sessions && (
                              <Badge variant="outline" className="text-muted-foreground text-[10px]">
                                {student.sessions_remaining ?? 0} available to book
                              </Badge>
                            )}
                            </div>
                            <Button
                              size="sm"
                              variant="outline"
                              aria-label={`Add sessions to ${student.name}`}
                              title={student.student_package_id ? "Add sessions" : "No package assigned"}
                              className="h-6 w-6 p-0 shrink-0 text-green-600 hover:text-green-700 hover:bg-green-50"
                              disabled={!student.student_package_id}
                              onClick={() => setAdjustTarget({ student, mode: "add" })}
                            >
                              <Plus className="h-3 w-3" />
                            </Button>
                          </div>
                        </TableCell>
                        <TableCell>
                          {student.teacher_name ? (
                            <span className="text-sm">{student.teacher_name}</span>
                          ) : student.enrolled ? (
                            <span className="text-xs text-amber-600 font-medium">Not assigned</span>
                          ) : (
                            <span className="text-muted-foreground">—</span>
                          )}
                        </TableCell>
                        <TableCell>{student.nationality || "—"}</TableCell>
                        <TableCell className="text-right flex items-center justify-end gap-1">
                          <TooltipProvider>
                            <Tooltip>
                              <TooltipTrigger asChild>
                                <Button
                                  size="sm"
                                  variant="ghost"
                                  className="h-7 w-7 p-0 student-copy-btn"
                                  onClick={() => handleCopyInfo(student)}
                                >
                                  {copiedId === student.id ? (
                                    <Check className="h-3.5 w-3.5 text-green-500" />
                                  ) : (
                                    <Copy className="h-3.5 w-3.5" />
                                  )}
                                </Button>
                              </TooltipTrigger>
                              <TooltipContent>
                                <p>
                                  {copiedId === student.id
                                    ? "Copied!"
                                    : "Copy Student's Information"}
                                </p>
                              </TooltipContent>
                            </Tooltip>
                          </TooltipProvider>
                          <Button
                            size="sm"
                            variant="ghost"
                            className="h-7 text-xs student-profile-btn"
                            onClick={() =>
                              navigate(`/admin/students/${student.id}`)
                            }
                          >
                            View
                          </Button>
                          <TooltipProvider>
                            <Tooltip>
                              <TooltipTrigger asChild>
                                <Button
                                  size="sm"
                                  variant="ghost"
                                  aria-label={`Delete ${student.name}`}
                                  className="h-7 w-7 p-0 student-delete-btn text-destructive hover:text-destructive hover:bg-destructive/10"
                                  onClick={() => {
                                    setDeleteTarget(student);
                                    setDeleteConfirmText("");
                                    setDeleteError(null);
                                  }}
                                >
                                  <Trash2 className="h-3.5 w-3.5" />
                                </Button>
                              </TooltipTrigger>
                              <TooltipContent>
                                <p>Delete Student</p>
                              </TooltipContent>
                            </Tooltip>
                          </TooltipProvider>
                        </TableCell>
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>

              {/* Pagination */}
              {totalPages > 1 && (
                <div className="flex items-center justify-between px-4 py-3 border-t text-sm text-muted-foreground">
                  <span>
                    {filtered.length} student{filtered.length !== 1 ? "s" : ""}{" "}
                    · Page {page} of {totalPages}
                  </span>
                  <div className="flex gap-1">
                    <Button
                      size="sm"
                      variant="outline"
                      className="h-7 w-7 p-0"
                      disabled={page === 1}
                      onClick={() => setPage((p) => p - 1)}
                    >
                      <ChevronLeft className="h-4 w-4" />
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      className="h-7 w-7 p-0"
                      disabled={page === totalPages}
                      onClick={() => setPage((p) => p + 1)}
                    >
                      <ChevronRight className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
              )}
            </>
          )}
        </div>
      </div>

      {/* Delete confirmation. Permanent and unrecoverable, so it spells out what
          goes and asks the admin to type the name — a click alone is too cheap
          for an action with no undo. */}
      <Dialog
        open={!!deleteTarget}
        onOpenChange={(open) => {
          if (!open && !deleteLoading) closeDeleteDialog();
        }}
      >
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-start gap-2 text-left">
              <AlertTriangle className="h-5 w-5 shrink-0 text-destructive mt-0.5" />
              <span>
                Are you sure you want to delete {deleteTarget?.name}?
              </span>
            </DialogTitle>
            <DialogDescription>
              Deletion will permanently remove their account and all of their
              data. This cannot be undone.
            </DialogDescription>
          </DialogHeader>

          <div className="rounded-lg border border-destructive/30 bg-destructive/5 p-3">
            <p className="text-xs font-medium text-foreground mb-1.5">
              What will be deleted:
            </p>
            <ul className="text-xs text-muted-foreground space-y-0.5 list-disc pl-4">
              <li>Their login account and profile details</li>
              <li>All packages, remaining sessions and payment records</li>
              <li>Every booking, past and upcoming, and its class reports</li>
              <li>Homework, submissions, feedback and notifications</li>
            </ul>
          </div>

          <div>
            <Label className="text-xs">
              Type <span className="font-semibold">{deleteTarget?.name}</span> to
              confirm
            </Label>
            <Input
              value={deleteConfirmText}
              onChange={(e) => setDeleteConfirmText(e.target.value)}
              placeholder={deleteTarget?.name}
              autoComplete="off"
              disabled={deleteLoading}
              onKeyDown={(e) => {
                if (e.key === "Enter" && deleteConfirmed && !deleteLoading) {
                  handleConfirmDelete();
                }
              }}
            />
          </div>

          {deleteError && (
            <Alert variant="destructive">
              <AlertDescription>{deleteError}</AlertDescription>
            </Alert>
          )}

          <DialogFooter className="mt-2">
            <Button
              variant="outline"
              disabled={deleteLoading}
              onClick={closeDeleteDialog}
            >
              Cancel
            </Button>
            <Button
              variant="destructive"
              disabled={deleteLoading || !deleteConfirmed}
              onClick={handleConfirmDelete}
            >
              {deleteLoading ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <>
                  <Trash2 className="h-4 w-4 mr-2" /> Delete Permanently
                </>
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Send Credentials prompt — shown after a student is successfully created */}
      <Dialog open={!!credStudent} onOpenChange={(open) => { if (!open) { setCredStudent(null); setCredCopied(false); } }}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Student Added!</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <p className="text-sm text-muted-foreground">
              Share these login credentials with your student. Use the{" "}
              <span className="inline-flex items-center gap-1 font-medium text-foreground">
                <Copy className="h-3.5 w-3.5" /> Copy
              </span>{" "}
              button below and send it to them via chat or message.
            </p>
            {credStudent && (() => {
              const credText = `Name: ${credStudent.name}
Age: ${credStudent.age ?? ""}
Guardian: ${credStudent.guardian_name ?? ""}
Email: ${credStudent.email}
Password: ${credStudent.password}

Please use the email and password to login to https://esl-booking-system.pages.dev`;
              return (
                <div className="relative rounded-lg border bg-muted/50 p-4">
                  <pre className="text-xs whitespace-pre-wrap break-all font-mono text-foreground leading-relaxed">
                    {credText}
                  </pre>
                  <Button
                    size="sm"
                    variant="secondary"
                    className="mt-3 w-full gap-2"
                    onClick={() => {
                      navigator.clipboard.writeText(credText);
                      setCredCopied(true);
                      setTimeout(() => setCredCopied(false), 2000);
                    }}
                  >
                    {credCopied ? (
                      <><Check className="h-3.5 w-3.5 text-green-500" /> Copied!</>
                    ) : (
                      <><Copy className="h-3.5 w-3.5" /> Copy Credentials</>
                    )}
                  </Button>
                </div>
              );
            })()}
          </div>
          <DialogFooter className="mt-2">
            <Button variant="outline" onClick={() => { setCredStudent(null); setCredCopied(false); }}>
              Done
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <SessionAdjustDialog
        mode={adjustTarget?.mode ?? null}
        studentPackageId={adjustTarget?.student.student_package_id ?? null}
        studentName={adjustTarget?.student.name}
        sessionsRemaining={adjustTarget?.student.sessions_remaining ?? 0}
        unusedSessions={
          adjustTarget?.student.unused_sessions ?? adjustTarget?.student.sessions_remaining ?? 0
        }
        onClose={() => setAdjustTarget(null)}
        onAdjusted={(adjustment, newRemaining) => {
          if (adjustTarget) handleAdjusted(adjustTarget.student.id, adjustment, newRemaining);
        }}
      />

      <BulkImportDialog
        open={showBulkImport}
        onOpenChange={setShowBulkImport}
        type="students"
        onImported={fetchStudents}
      />

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
              <Label>
                Full Name <span className="text-destructive">*</span>
              </Label>
              <Input
                value={addForm.name}
                onChange={(e) =>
                  setAddForm((f) => ({ ...f, name: e.target.value }))
                }
                placeholder="Student's full name"
              />
            </div>
            <div>
              <Label>
                Email <span className="text-destructive">*</span>
              </Label>
              <Input
                type="email"
                value={addForm.email}
                onChange={(e) =>
                  setAddForm((f) => ({ ...f, email: e.target.value }))
                }
                placeholder="student@email.com"
              />
            </div>
            <div>
              <Label>
                Password <span className="text-destructive">*</span>
              </Label>
              <div className="relative">
                <Input
                  type={showPassword ? "text" : "password"}
                  value={addForm.password}
                  onChange={(e) =>
                    setAddForm((f) => ({ ...f, password: e.target.value }))
                  }
                  placeholder="Set a login password"
                  className="pr-10"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword((v) => !v)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                  tabIndex={-1}
                >
                  {showPassword ? (
                    <EyeOff className="h-4 w-4" />
                  ) : (
                    <Eye className="h-4 w-4" />
                  )}
                </button>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>Guardian Name</Label>
                <Input
                  value={addForm.guardian_name}
                  onChange={(e) =>
                    setAddForm((f) => ({ ...f, guardian_name: e.target.value }))
                  }
                  placeholder="Optional"
                />
              </div>
              <div>
                <Label>Age</Label>
                <Input
                  type="number"
                  min="1"
                  value={addForm.age}
                  onChange={(e) =>
                    setAddForm((f) => ({ ...f, age: e.target.value }))
                  }
                  placeholder="Optional"
                />
              </div>
            </div>
            <div>
              <Label>Nationality</Label>
              <Input
                value={addForm.nationality}
                onChange={(e) =>
                  setAddForm((f) => ({ ...f, nationality: e.target.value }))
                }
                placeholder="Optional"
              />
            </div>
          </div>
          <DialogFooter className="mt-4">
            <Button variant="outline" onClick={() => setShowAddModal(false)}>
              Cancel
            </Button>
            <Button
              onClick={handleAddStudent}
              disabled={
                addLoading ||
                !addForm.name ||
                !addForm.email ||
                !addForm.password
              }
            >
              {addLoading ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                "Create Student"
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Credentials popup after adding a student */}
      <Dialog open={!!credStudent} onOpenChange={(open) => { if (!open) setCredStudent(null); }}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Check className="h-5 w-5 text-green-500" />
              Student Added Successfully
            </DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">
            Copy these credentials and send them to your student so they can log in.
          </p>
          <div className="rounded-md bg-muted p-4 font-mono text-sm whitespace-pre-wrap select-all">
{[
  `Name: ${credStudent?.name}`,
  credStudent?.age ? `Age: ${credStudent.age}` : null,
  credStudent?.guardian_name ? `Guardian: ${credStudent.guardian_name}` : null,
  `Email: ${credStudent?.email}`,
  `Password: ${credStudent?.password}`,
  ``,
  `Login at: https://brightfolks.pages.dev`,
].filter(l => l !== null).join("\n")}
          </div>
          <DialogFooter className="gap-2 sm:gap-0">
            <Button
              className="student-copy-btn w-full gap-2"
              onClick={() => {
                const lines = [
                  `Name: ${credStudent?.name}`,
                  credStudent?.age ? `Age: ${credStudent.age}` : null,
                  credStudent?.guardian_name ? `Guardian: ${credStudent.guardian_name}` : null,
                  `Email: ${credStudent?.email}`,
                  `Password: ${credStudent?.password}`,
                  ``,
                  `Please use the email and password to login to https://brightfolks.pages.dev`,
                ].filter(l => l !== null).join("\n");
                navigator.clipboard.writeText(lines);
                setCredCopied(true);
              }}
            >
              {credCopied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
              {credCopied ? "Copied!" : "Copy Credentials"}
            </Button>
            <Button variant="outline" className="w-full" onClick={() => setCredStudent(null)}>
              Done
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {currentUser?.role === "company_admin" && currentUser.company_id != null && (
        <AdminTour segment="D" companyId={currentUser.company_id} autoStart />
      )}
    </>
  );
};

export default StudentListPage;
