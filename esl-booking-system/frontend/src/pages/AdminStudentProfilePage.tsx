import { useState, useEffect } from "react";
import { useParams, useNavigate } from "react-router-dom";
import axios from "axios";
import NavBar from "@/components/Navbar";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import {
  ArrowLeft, User, Package, CalendarDays, Loader2, Plus, FileText, KeyRound, Eye, EyeOff, Pencil, PlusCircle, MinusCircle, History,
} from "lucide-react";
import { fmtDate, fmtDateOnly, localToMysql } from "@/utils/timezone";

interface ClassReport {
  id: number;
  teacher_name: string | null;
  appointment_date: string;
  new_words: string | null;
  sentences: string | null;
  notes: string | null;
  remarks: string | null;
}

interface StudentProfile {
  id: number;
  name: string;
  email: string;
  guardian_name: string | null;
  nationality: string | null;
  age: number | null;
  created_at: string;
}

interface ActivePackage {
  id: number;
  package_name: string;
  sessions_remaining: number;
  payment_status: string;
  subject: string | null;
  teacher_id: number | null;
  price: number;
}

interface BookingRecord {
  id: number;
  appointment_date: string;
  status: string;
  class_mode: string | null;
  meeting_link: string | null;
  student_absent: boolean;
  teacher_absent: boolean;
  teacher_name: string | null;
  has_report: boolean;
}

interface Teacher {
  id: number;
  name: string;
}

// Generate 30-min slots from 7:00 AM to 10:30 PM
const TIME_SLOTS: string[] = [];
for (let h = 7; h <= 22; h++) {
  TIME_SLOTS.push(`${String(h).padStart(2, "0")}:00`);
  if (h < 22) TIME_SLOTS.push(`${String(h).padStart(2, "0")}:30`);
}
TIME_SLOTS.push("22:30");

const statusColors: Record<string, string> = {
  pending: "bg-yellow-100 text-yellow-800",
  confirmed: "bg-green-100 text-green-800",
  done: "bg-blue-100 text-blue-800",
  cancelled: "bg-red-100 text-red-800",
};

const AdminStudentProfilePage = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const token = localStorage.getItem("token");
  const headers = { Authorization: `Bearer ${token}` };
  const base = import.meta.env.VITE_API_URL;

  const [student, setStudent] = useState<StudentProfile | null>(null);
  const [activePackage, setActivePackage] = useState<ActivePackage | null>(null);
  const [bookings, setBookings] = useState<BookingRecord[]>([]);
  const [teachers, setTeachers] = useState<Teacher[]>([]);
  const [loading, setLoading] = useState(true);
  const [cancellingId, setCancellingId] = useState<number | null>(null);

  // Edit student dialog
  const [showEdit, setShowEdit] = useState(false);
  const [editForm, setEditForm] = useState({ name: "", email: "", guardian_name: "", nationality: "", age: "" });
  const [editLoading, setEditLoading] = useState(false);
  const [editError, setEditError] = useState<string | null>(null);
  const [editSuccess, setEditSuccess] = useState(false);

  const openEdit = () => {
    if (!student) return;
    setEditForm({
      name: student.name,
      email: student.email,
      guardian_name: student.guardian_name || "",
      nationality: student.nationality || "",
      age: student.age ? String(student.age) : "",
    });
    setEditError(null);
    setEditSuccess(false);
    setShowEdit(true);
  };

  const handleEditStudent = async () => {
    setEditLoading(true);
    setEditError(null);
    setEditSuccess(false);
    try {
      await axios.put(`${base}/api/admin/students/${id}`, {
        name: editForm.name,
        email: editForm.email,
        guardian_name: editForm.guardian_name || null,
        nationality: editForm.nationality || null,
        age: editForm.age ? Number(editForm.age) : null,
      }, { headers });
      setEditSuccess(true);
      fetchData();
    } catch (err: unknown) {
      const msg = (err as { response?: { data?: { message?: string } } })?.response?.data?.message || "Failed to update student";
      setEditError(msg);
    } finally {
      setEditLoading(false);
    }
  };

  // Reset password dialog
  const [showResetPw, setShowResetPw] = useState(false);
  const [resetPw, setResetPw] = useState("");
  const [showResetPwText, setShowResetPwText] = useState(false);
  const [resetPwLoading, setResetPwLoading] = useState(false);
  const [resetPwMsg, setResetPwMsg] = useState<{ type: "success" | "error"; text: string } | null>(null);

  const handleResetPassword = async () => {
    setResetPwLoading(true);
    setResetPwMsg(null);
    try {
      await axios.put(`${base}/api/admin/users/${id}/reset-password`, { password: resetPw }, { headers });
      setResetPwMsg({ type: "success", text: "Password reset successfully." });
      setResetPw("");
    } catch (err: unknown) {
      const msg = (err as { response?: { data?: { message?: string } } })?.response?.data?.message || "Failed to reset password";
      setResetPwMsg({ type: "error", text: msg });
    } finally {
      setResetPwLoading(false);
    }
  };

  // Report view
  const [viewingReport, setViewingReport] = useState<ClassReport | null>(null);
  const [reportLoading, setReportLoading] = useState(false);

  const handleViewReport = async (bookingId: number) => {
    setReportLoading(true);
    try {
      const res = await axios.get<ClassReport>(`${base}/api/reports/booking/${bookingId}`, { headers });
      setViewingReport(res.data);
    } catch (err) {
      console.error("Error fetching report:", err);
    } finally {
      setReportLoading(false);
    }
  };

  // Add class dialog
  const [showAddClass, setShowAddClass] = useState(false);
  const [addForm, setAddForm] = useState({ date: "", time: "", teacher_id: "" });
  const [addLoading, setAddLoading] = useState(false);
  const [addError, setAddError] = useState<string | null>(null);

  // Session adjustment dialog
  const [showAdjust, setShowAdjust] = useState<"add" | "deduct" | null>(null);
  const [adjustAmount, setAdjustAmount] = useState("1");
  const [adjustRemarks, setAdjustRemarks] = useState("");
  const [adjustLoading, setAdjustLoading] = useState(false);
  const [adjustError, setAdjustError] = useState<string | null>(null);
  const [adjustSuccess, setAdjustSuccess] = useState<string | null>(null);

  // Session adjustment history
  const [showAdjustHistory, setShowAdjustHistory] = useState(false);
  const [adjustHistory, setAdjustHistory] = useState<{ id: number; adjustment: number; remarks: string; created_at: string; adjusted_by_name: string }[]>([]);
  const [historyLoading, setHistoryLoading] = useState(false);

  const handleAdjustSessions = async () => {
    if (!activePackage || !adjustRemarks.trim()) return;
    setAdjustLoading(true);
    setAdjustError(null);
    setAdjustSuccess(null);
    try {
      const adj = showAdjust === "deduct" ? -Math.abs(Number(adjustAmount)) : Math.abs(Number(adjustAmount));
      const res = await axios.post(
        `${base}/api/admin/student-packages/${activePackage.id}/adjust-sessions`,
        { adjustment: adj, remarks: adjustRemarks.trim() },
        { headers }
      );
      setAdjustSuccess(res.data.message);
      fetchData();
      // Keep the dialog open briefly to show success, then close
      setTimeout(() => {
        setShowAdjust(null);
        setAdjustAmount("1");
        setAdjustRemarks("");
        setAdjustSuccess(null);
      }, 1500);
    } catch (err: unknown) {
      const msg = (err as { response?: { data?: { message?: string } } })?.response?.data?.message || "Failed to adjust sessions";
      setAdjustError(msg);
    } finally {
      setAdjustLoading(false);
    }
  };

  const fetchAdjustmentHistory = async () => {
    if (!activePackage) return;
    setHistoryLoading(true);
    try {
      const res = await axios.get(`${base}/api/admin/student-packages/${activePackage.id}/adjustments`, { headers });
      setAdjustHistory(res.data);
      setShowAdjustHistory(true);
    } catch (err) {
      console.error("Error fetching adjustment history:", err);
    } finally {
      setHistoryLoading(false);
    }
  };

  const fetchData = async () => {
    try {
      const [profileRes, teachersRes] = await Promise.all([
        axios.get(`${base}/api/admin/students/${id}`, { headers }),
        axios.get(`${base}/api/admin/teachers`, { headers }),
      ]);
      setStudent(profileRes.data.student);
      setActivePackage(profileRes.data.activePackage);
      setBookings(profileRes.data.bookings);
      setTeachers(teachersRes.data.map((t: Teacher) => ({ id: t.id, name: t.name })));
    } catch (err) {
      console.error("Error fetching student profile:", err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchData(); }, [id]);

  const handleCancelBooking = async (bookingId: number) => {
    setCancellingId(bookingId);
    try {
      await axios.post(`${base}/api/bookings/cancel/${bookingId}`, {}, { headers });
      fetchData();
    } catch (err) {
      console.error("Error cancelling booking:", err);
    } finally {
      setCancellingId(null);
    }
  };

  const handleAddClass = async () => {
    if (!activePackage || !addForm.date || !addForm.time) return;
    setAddLoading(true);
    setAddError(null);
    try {
      const appointmentDate = localToMysql(addForm.date, addForm.time);
      await axios.post(`${base}/api/admin/bookings`, {
        student_package_id: activePackage.id,
        appointment_date: appointmentDate,
        teacher_id: addForm.teacher_id ? Number(addForm.teacher_id) : null,
      }, { headers });
      setShowAddClass(false);
      setAddForm({ date: "", time: "", teacher_id: "" });
      fetchData();
    } catch (err: unknown) {
      const msg = (err as { response?: { data?: { message?: string } } })?.response?.data?.message || "Failed to schedule class";
      setAddError(msg);
    } finally {
      setAddLoading(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  if (!student) {
    return (
      <>
        <NavBar />
        <div className="max-w-4xl mx-auto px-4 py-8">
          <p className="text-muted-foreground">Student not found.</p>
        </div>
      </>
    );
  }

  return (
    <>
      <NavBar />
      <div className="max-w-5xl mx-auto px-4 py-8 space-y-6 brand-gradient-subtle pattern-dots-light min-h-screen">
        {/* Back button */}
        <Button variant="ghost" className="gap-2 -ml-2" onClick={() => navigate("/students")}>
          <ArrowLeft className="h-4 w-4" /> Back to Students
        </Button>

        {/* Student Info */}
        <Card className="glow-card border-0 rounded-2xl">
          <CardHeader className="flex flex-row items-center justify-between">
            <CardTitle className="flex items-center gap-2">
              <User className="h-5 w-5 text-primary" />
              Student Profile
            </CardTitle>
            <div className="flex gap-2">
              <Button size="sm" variant="outline" className="gap-1" onClick={openEdit}>
                <Pencil className="h-4 w-4" /> Edit
              </Button>
              <Button size="sm" variant="outline" className="gap-1"
                onClick={() => { setShowResetPw(true); setResetPw(""); setResetPwMsg(null); }}>
                <KeyRound className="h-4 w-4" /> Reset Password
              </Button>
            </div>
          </CardHeader>
          <CardContent className="grid grid-cols-2 sm:grid-cols-3 gap-4 text-sm">
            <div>
              <p className="text-xs text-muted-foreground">Full Name</p>
              <p className="font-semibold">{student.name}</p>
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Email</p>
              <p className="font-medium">{student.email}</p>
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Guardian</p>
              <p className="font-medium">{student.guardian_name || "—"}</p>
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Nationality</p>
              <p className="font-medium">{student.nationality || "—"}</p>
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Age</p>
              <p className="font-medium">{student.age || "—"}</p>
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Enrolled</p>
              <p className="font-medium">{fmtDateOnly(student.created_at)}</p>
            </div>
          </CardContent>
        </Card>

        {/* Active Package */}
        {activePackage ? (
          <Card className="glow-card border-0 rounded-2xl">
            <CardHeader className="flex flex-row items-center justify-between">
              <CardTitle className="flex items-center gap-2">
                <Package className="h-5 w-5 text-primary" />
                Active Package
              </CardTitle>
              <Button size="sm" variant="ghost" className="gap-1 text-xs" onClick={fetchAdjustmentHistory} disabled={historyLoading}>
                <History className="h-3.5 w-3.5" /> Adjustment History
              </Button>
            </CardHeader>
            <CardContent className="grid grid-cols-2 sm:grid-cols-4 gap-4 text-sm">
              <div>
                <p className="text-xs text-muted-foreground">Package</p>
                <p className="font-semibold">{activePackage.package_name}</p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Subject</p>
                <p className="font-medium">{activePackage.subject || "—"}</p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Sessions Remaining</p>
                <div className="flex items-center gap-2 mt-0.5">
                  <Badge variant={activePackage.sessions_remaining > 0 ? "default" : "destructive"}>
                    {activePackage.sessions_remaining}
                  </Badge>
                  <Button
                    size="icon"
                    variant="ghost"
                    className="h-6 w-6 text-green-600 hover:text-green-700 hover:bg-green-50"
                    title="Add sessions"
                    onClick={() => { setShowAdjust("add"); setAdjustAmount("1"); setAdjustRemarks(""); setAdjustError(null); setAdjustSuccess(null); }}
                  >
                    <PlusCircle className="h-4 w-4" />
                  </Button>
                  <Button
                    size="icon"
                    variant="ghost"
                    className="h-6 w-6 text-red-600 hover:text-red-700 hover:bg-red-50"
                    title="Deduct sessions"
                    onClick={() => { setShowAdjust("deduct"); setAdjustAmount("1"); setAdjustRemarks(""); setAdjustError(null); setAdjustSuccess(null); }}
                  >
                    <MinusCircle className="h-4 w-4" />
                  </Button>
                </div>
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Payment</p>
                <Badge variant={activePackage.payment_status === "paid" ? "secondary" : "outline"}
                  className={activePackage.payment_status === "paid" ? "bg-green-100 text-green-700" : ""}>
                  {activePackage.payment_status}
                </Badge>
              </div>
            </CardContent>
          </Card>
        ) : (
          <Card className="glow-card border-0 rounded-2xl">
            <CardContent className="py-6 text-center text-sm text-muted-foreground">
              <Package className="h-8 w-8 mx-auto mb-2 text-muted-foreground/50" />
              No active package
            </CardContent>
          </Card>
        )}

        {/* Booking History */}
        <Card className="glow-card border-0 rounded-2xl">
          <CardHeader className="flex flex-row items-center justify-between">
            <CardTitle className="flex items-center gap-2">
              <CalendarDays className="h-5 w-5 text-primary" />
              Class History
            </CardTitle>
            {activePackage && (
              <Button size="sm" className="gap-1" onClick={() => { setShowAddClass(true); setAddError(null); }}>
                <Plus className="h-4 w-4" /> Add Class
              </Button>
            )}
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow className="brand-gradient-subtle">
                  <TableHead>Date & Time</TableHead>
                  <TableHead>Teacher</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Attendance</TableHead>
                  <TableHead>Report</TableHead>
                  <TableHead></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {bookings.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={6} className="text-center text-muted-foreground text-sm py-10">
                      No classes found
                    </TableCell>
                  </TableRow>
                ) : (
                  bookings.map((b) => (
                    <TableRow key={b.id}>
                      <TableCell className="text-sm">
                        {fmtDate(b.appointment_date, "MMM d, yyyy h:mm a")}
                      </TableCell>
                      <TableCell className="text-sm">{b.teacher_name || "—"}</TableCell>
                      <TableCell>
                        <span className={`text-xs px-2 py-1 rounded-full font-medium ${statusColors[b.status] || "bg-gray-100 text-gray-700"}`}>
                          {b.status}
                        </span>
                      </TableCell>
                      <TableCell>
                        {b.student_absent && (
                          <span className="text-xs px-2 py-1 rounded-full font-medium bg-orange-100 text-orange-700 mr-1">
                            Student Absent
                          </span>
                        )}
                        {b.teacher_absent && (
                          <span className="text-xs px-2 py-1 rounded-full font-medium bg-red-100 text-red-700">
                            Teacher Absent
                          </span>
                        )}
                        {!b.student_absent && !b.teacher_absent && (
                          <span className="text-muted-foreground text-xs">—</span>
                        )}
                      </TableCell>
                      <TableCell>
                        {b.has_report ? (
                          <Button
                            size="sm"
                            variant="ghost"
                            className="h-7 px-2 text-xs text-green-700 hover:text-green-800 hover:bg-green-50"
                            disabled={reportLoading}
                            onClick={() => handleViewReport(b.id)}
                          >
                            <FileText className="h-3 w-3 mr-1" /> View
                          </Button>
                        ) : (
                          <span className="text-xs text-muted-foreground">—</span>
                        )}
                      </TableCell>
                      <TableCell>
                        {(b.status === "pending" || b.status === "confirmed") && (
                          <Button
                            size="sm"
                            variant="ghost"
                            className="text-xs h-7 text-destructive hover:text-destructive"
                            disabled={cancellingId === b.id}
                            onClick={() => handleCancelBooking(b.id)}
                          >
                            {cancellingId === b.id ? <Loader2 className="h-3 w-3 animate-spin" /> : "Cancel"}
                          </Button>
                        )}
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      </div>

      {/* Edit Student Dialog */}
      <Dialog open={showEdit} onOpenChange={(o) => { if (!o) setShowEdit(false); }}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Edit Student</DialogTitle>
          </DialogHeader>
          <div className="space-y-3 py-2">
            {editError && <p className="text-sm text-destructive">{editError}</p>}
            {editSuccess && <p className="text-sm text-green-600">Student updated successfully.</p>}
            <div className="space-y-1.5">
              <Label>Full Name <span className="text-destructive">*</span></Label>
              <Input value={editForm.name} onChange={(e) => setEditForm((f) => ({ ...f, name: e.target.value }))} />
            </div>
            <div className="space-y-1.5">
              <Label>Email <span className="text-destructive">*</span></Label>
              <Input type="email" value={editForm.email} onChange={(e) => setEditForm((f) => ({ ...f, email: e.target.value }))} />
            </div>
            <div className="space-y-1.5">
              <Label>Guardian Name</Label>
              <Input value={editForm.guardian_name} onChange={(e) => setEditForm((f) => ({ ...f, guardian_name: e.target.value }))} placeholder="Optional" />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>Nationality</Label>
                <Input value={editForm.nationality} onChange={(e) => setEditForm((f) => ({ ...f, nationality: e.target.value }))} placeholder="Optional" />
              </div>
              <div className="space-y-1.5">
                <Label>Age</Label>
                <Input type="number" min="1" max="100" value={editForm.age} onChange={(e) => setEditForm((f) => ({ ...f, age: e.target.value }))} placeholder="Optional" />
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowEdit(false)}>Cancel</Button>
            <Button onClick={handleEditStudent} disabled={editLoading || !editForm.name || !editForm.email}>
              {editLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : "Save Changes"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Reset Password Dialog */}
      <Dialog open={showResetPw} onOpenChange={(o) => { if (!o) setShowResetPw(false); }}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Reset Student Password</DialogTitle>
          </DialogHeader>
          <div className="space-y-3 py-2">
            {resetPwMsg && (
              <p className={`text-sm ${resetPwMsg.type === "success" ? "text-green-600" : "text-destructive"}`}>
                {resetPwMsg.text}
              </p>
            )}
            <div className="space-y-1.5">
              <Label>New Password</Label>
              <div className="relative">
                <Input
                  type={showResetPwText ? "text" : "password"}
                  value={resetPw}
                  onChange={(e) => setResetPw(e.target.value)}
                  placeholder="Min. 6 characters"
                  className="pr-10"
                />
                <button
                  type="button"
                  onClick={() => setShowResetPwText((v) => !v)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                  tabIndex={-1}
                >
                  {showResetPwText ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowResetPw(false)}>Cancel</Button>
            <Button
              onClick={handleResetPassword}
              disabled={resetPwLoading || resetPw.length < 6}
            >
              {resetPwLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : "Reset"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Class Report Dialog */}
      <Dialog open={!!viewingReport} onOpenChange={(o) => { if (!o) setViewingReport(null); }}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Class Report</DialogTitle>
          </DialogHeader>
          {viewingReport && (
            <div className="space-y-3 text-sm py-1">
              <div className="flex justify-between text-xs text-muted-foreground">
                <span>{viewingReport.teacher_name ? `Teacher: ${viewingReport.teacher_name}` : ""}</span>
                <span>{fmtDateOnly(viewingReport.appointment_date)}</span>
              </div>
              {[
                { label: "New Words", value: viewingReport.new_words },
                { label: "Sentences", value: viewingReport.sentences },
                { label: "Notes", value: viewingReport.notes },
                { label: "Remarks", value: viewingReport.remarks },
              ].map(({ label, value }) => (
                <div key={label}>
                  <p className="text-xs font-medium text-muted-foreground mb-0.5">{label}</p>
                  <p className="bg-muted/40 rounded p-2 text-sm">{value || "—"}</p>
                </div>
              ))}
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setViewingReport(null)}>Close</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Add Class Dialog */}
      <Dialog open={showAddClass} onOpenChange={(o) => { if (!o) setShowAddClass(false); }}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Schedule a Class</DialogTitle>
          </DialogHeader>
          <div className="space-y-3 py-2">
            {addError && (
              <p className="text-sm text-destructive">{addError}</p>
            )}
            <div className="space-y-1.5">
              <Label>Date <span className="text-destructive">*</span></Label>
              <Input
                type="date"
                value={addForm.date}
                onChange={(e) => setAddForm((f) => ({ ...f, date: e.target.value }))}
                min={new Date().toISOString().split("T")[0]}
              />
            </div>
            <div className="space-y-1.5">
              <Label>Time <span className="text-destructive">*</span></Label>
              <Select value={addForm.time} onValueChange={(v) => setAddForm((f) => ({ ...f, time: v }))}>
                <SelectTrigger><SelectValue placeholder="Select time" /></SelectTrigger>
                <SelectContent className="max-h-60">
                  {TIME_SLOTS.map((t) => {
                    const [hStr, mStr] = t.split(":");
                    const h = Number(hStr);
                    const suffix = h >= 12 ? "PM" : "AM";
                    const h12 = h % 12 === 0 ? 12 : h % 12;
                    const label = `${h12}:${mStr} ${suffix}`;
                    return <SelectItem key={t} value={t}>{label}</SelectItem>;
                  })}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Teacher</Label>
              <Select value={addForm.teacher_id} onValueChange={(v) => setAddForm((f) => ({ ...f, teacher_id: v }))}>
                <SelectTrigger><SelectValue placeholder="Select teacher (optional)" /></SelectTrigger>
                <SelectContent>
                  {teachers.map((t) => (
                    <SelectItem key={t.id} value={String(t.id)}>{t.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowAddClass(false)}>Cancel</Button>
            <Button
              onClick={handleAddClass}
              disabled={addLoading || !addForm.date || !addForm.time}
            >
              {addLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : "Schedule"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Session Adjustment Dialog */}
      <Dialog open={!!showAdjust} onOpenChange={(o) => { if (!o) { setShowAdjust(null); setAdjustSuccess(null); } }}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>
              {showAdjust === "add" ? "Add Sessions" : "Deduct Sessions"}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-3 py-2">
            {adjustError && <p className="text-sm text-destructive">{adjustError}</p>}
            {adjustSuccess && <p className="text-sm text-green-600">{adjustSuccess}</p>}

            <div className="space-y-1.5">
              <Label>
                Number of sessions to {showAdjust === "add" ? "add" : "deduct"} <span className="text-destructive">*</span>
              </Label>
              <Input
                type="number"
                min="1"
                max="100"
                value={adjustAmount}
                onChange={(e) => setAdjustAmount(e.target.value)}
              />
            </div>

            <div className="space-y-1.5">
              <Label>Remarks <span className="text-destructive">*</span></Label>
              <Textarea
                placeholder={showAdjust === "add"
                  ? "e.g. Bonus sessions for referral, compensating for cancelled class..."
                  : "e.g. Penalty for no-show, correction of incorrect session count..."}
                value={adjustRemarks}
                onChange={(e) => setAdjustRemarks(e.target.value)}
                rows={3}
              />
              <p className="text-xs text-muted-foreground">
                This note will be included in the notification sent to the student.
              </p>
            </div>

            {activePackage && (
              <div className="bg-muted/50 rounded-lg p-3 text-sm">
                <p className="text-muted-foreground">Current sessions: <strong>{activePackage.sessions_remaining}</strong></p>
                <p className="text-muted-foreground">
                  After adjustment: <strong>
                    {showAdjust === "add"
                      ? activePackage.sessions_remaining + Math.abs(Number(adjustAmount) || 0)
                      : Math.max(0, activePackage.sessions_remaining - Math.abs(Number(adjustAmount) || 0))}
                  </strong>
                </p>
              </div>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowAdjust(null)}>Cancel</Button>
            <Button
              onClick={handleAdjustSessions}
              disabled={adjustLoading || !adjustRemarks.trim() || !adjustAmount || Number(adjustAmount) < 1}
              variant={showAdjust === "deduct" ? "destructive" : "default"}
            >
              {adjustLoading ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                showAdjust === "add" ? "Add Sessions" : "Deduct Sessions"
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Session Adjustment History Dialog */}
      <Dialog open={showAdjustHistory} onOpenChange={(o) => { if (!o) setShowAdjustHistory(false); }}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <History className="h-5 w-5" /> Session Adjustment History
            </DialogTitle>
          </DialogHeader>
          <div className="max-h-80 overflow-y-auto">
            {adjustHistory.length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-6">No adjustments have been made yet.</p>
            ) : (
              <div className="space-y-3">
                {adjustHistory.map((entry) => (
                  <div key={entry.id} className="border rounded-lg p-3 text-sm">
                    <div className="flex items-center justify-between mb-1">
                      <span className={`font-semibold ${entry.adjustment > 0 ? "text-green-600" : "text-red-600"}`}>
                        {entry.adjustment > 0 ? `+${entry.adjustment}` : entry.adjustment} session(s)
                      </span>
                      <span className="text-xs text-muted-foreground">
                        {fmtDate(entry.created_at, "MMM d, yyyy h:mm a")}
                      </span>
                    </div>
                    <p className="text-muted-foreground text-xs mb-1">By: {entry.adjusted_by_name}</p>
                    <p className="bg-muted/40 rounded p-2 text-sm">{entry.remarks}</p>
                  </div>
                ))}
              </div>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowAdjustHistory(false)}>Close</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
};

export default AdminStudentProfilePage;
