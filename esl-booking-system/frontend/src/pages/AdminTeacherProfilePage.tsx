import { useState, useEffect } from "react";
import { useParams, useNavigate } from "react-router-dom";
import axios from "axios";
import NavBar from "@/components/Navbar";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import {
  ArrowLeft, UserCircle, CalendarDays, Loader2, Pencil, Save, Eye, EyeOff, BookOpen, KeyRound,
} from "lucide-react";
import { fmtDate, fmtDateOnly } from "@/utils/timezone";

interface TeacherProfile {
  id: number;
  name: string;
  email: string;
  created_at: string;
}

interface ScheduleEntry {
  id: number;
  appointment_date: string;
  status: string;
  class_mode: string | null;
  meeting_link: string | null;
  student_name: string;
  package_name: string;
  subject: string | null;
}

interface LeaveEntry {
  id: number;
  leave_date: string;
  reason_type: string;
  notes: string | null;
  status: string;
}

const statusColors: Record<string, string> = {
  pending: "bg-yellow-100 text-yellow-800",
  confirmed: "bg-green-100 text-green-800",
  done: "bg-blue-100 text-blue-800",
  cancelled: "bg-red-100 text-red-800",
};

const leaveStatusColors: Record<string, string> = {
  pending: "bg-yellow-100 text-yellow-800",
  approved: "bg-green-100 text-green-800",
  rejected: "bg-red-100 text-red-800",
};

const AdminTeacherProfilePage = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const token = localStorage.getItem("token");
  const headers = { Authorization: `Bearer ${token}` };
  const base = import.meta.env.VITE_API_URL;

  const [teacher, setTeacher] = useState<TeacherProfile | null>(null);
  const [schedule, setSchedule] = useState<ScheduleEntry[]>([]);
  const [leaves, setLeaves] = useState<LeaveEntry[]>([]);
  const [loading, setLoading] = useState(true);

  // Edit dialog
  const [showEdit, setShowEdit] = useState(false);
  const [editForm, setEditForm] = useState({ name: "", email: "", password: "" });
  const [showPassword, setShowPassword] = useState(false);
  const [editLoading, setEditLoading] = useState(false);
  const [editError, setEditError] = useState<string | null>(null);

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

  const fetchData = async () => {
    try {
      const res = await axios.get(`${base}/api/admin/teachers/${id}`, { headers });
      setTeacher(res.data.teacher);
      setSchedule(res.data.schedule);
      setLeaves(res.data.leaves);
    } catch (err) {
      console.error("Error fetching teacher profile:", err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchData(); }, [id]);

  const openEdit = () => {
    if (!teacher) return;
    setEditForm({ name: teacher.name, email: teacher.email, password: "" });
    setEditError(null);
    setShowEdit(true);
  };

  const handleSave = async () => {
    setEditLoading(true);
    setEditError(null);
    try {
      const payload: Record<string, string> = { name: editForm.name, email: editForm.email };
      if (editForm.password) payload.password = editForm.password;
      await axios.put(`${base}/api/admin/teachers/${id}`, payload, { headers });
      setShowEdit(false);
      fetchData();
    } catch (err: unknown) {
      const msg = (err as { response?: { data?: { message?: string } } })?.response?.data?.message || "Failed to save";
      setEditError(msg);
    } finally {
      setEditLoading(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  if (!teacher) {
    return (
      <>
        <NavBar />
        <div className="max-w-4xl mx-auto px-4 py-8">
          <p className="text-muted-foreground">Teacher not found.</p>
        </div>
      </>
    );
  }

  return (
    <>
      <NavBar />
      <div className="max-w-5xl mx-auto px-4 py-8 space-y-6">
        {/* Back button */}
        <Button variant="ghost" className="gap-2 -ml-2" onClick={() => navigate("/teachers")}>
          <ArrowLeft className="h-4 w-4" /> Back to Teachers
        </Button>

        {/* Teacher Info */}
        <Card>
          <CardHeader className="flex flex-row items-center justify-between">
            <CardTitle className="flex items-center gap-2">
              <UserCircle className="h-5 w-5 text-primary" />
              Teacher Profile
            </CardTitle>
            <div className="flex gap-2">
              <Button size="sm" variant="outline" className="gap-1"
                onClick={() => { setShowResetPw(true); setResetPw(""); setResetPwMsg(null); }}>
                <KeyRound className="h-4 w-4" /> Reset Password
              </Button>
              <Button size="sm" variant="outline" className="gap-1" onClick={openEdit}>
                <Pencil className="h-4 w-4" /> Edit
              </Button>
            </div>
          </CardHeader>
          <CardContent className="grid grid-cols-2 sm:grid-cols-3 gap-4 text-sm">
            <div>
              <p className="text-xs text-muted-foreground">Full Name</p>
              <p className="font-semibold">{teacher.name}</p>
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Email</p>
              <p className="font-medium">{teacher.email}</p>
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Added</p>
              <p className="font-medium">{fmtDateOnly(teacher.created_at)}</p>
            </div>
          </CardContent>
        </Card>

        {/* Upcoming Schedule */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <CalendarDays className="h-5 w-5 text-primary" />
              Upcoming Schedule
            </CardTitle>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Date & Time</TableHead>
                  <TableHead>Student</TableHead>
                  <TableHead>Package / Subject</TableHead>
                  <TableHead>Mode</TableHead>
                  <TableHead>Status</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {schedule.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={5} className="text-center text-muted-foreground text-sm py-10">
                      No upcoming classes
                    </TableCell>
                  </TableRow>
                ) : (
                  schedule.map((s) => (
                    <TableRow key={s.id}>
                      <TableCell className="text-sm">
                        {fmtDate(s.appointment_date, "MMM d, yyyy h:mm a")}
                      </TableCell>
                      <TableCell className="text-sm font-medium">{s.student_name}</TableCell>
                      <TableCell className="text-sm">
                        {s.package_name}{s.subject ? ` · ${s.subject}` : ""}
                      </TableCell>
                      <TableCell className="text-sm text-muted-foreground">
                        {s.class_mode || "—"}
                      </TableCell>
                      <TableCell>
                        <span className={`text-xs px-2 py-1 rounded-full font-medium ${statusColors[s.status] || "bg-gray-100 text-gray-700"}`}>
                          {s.status}
                        </span>
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </CardContent>
        </Card>

        {/* Leave Requests */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <BookOpen className="h-5 w-5 text-primary" />
              Leave Requests
            </CardTitle>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Date</TableHead>
                  <TableHead>Reason</TableHead>
                  <TableHead>Notes</TableHead>
                  <TableHead>Status</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {leaves.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={4} className="text-center text-muted-foreground text-sm py-10">
                      No leave requests
                    </TableCell>
                  </TableRow>
                ) : (
                  leaves.map((l) => (
                    <TableRow key={l.id}>
                      <TableCell className="text-sm">
                        {fmtDateOnly(l.leave_date)}
                      </TableCell>
                      <TableCell className="text-sm capitalize">{l.reason_type.replace(/_/g, " ")}</TableCell>
                      <TableCell className="text-sm text-muted-foreground">{l.notes || "—"}</TableCell>
                      <TableCell>
                        <Badge className={`text-xs ${leaveStatusColors[l.status] || "bg-gray-100 text-gray-700"}`}>
                          {l.status}
                        </Badge>
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      </div>

      {/* Reset Password Dialog */}
      <Dialog open={showResetPw} onOpenChange={(o) => { if (!o) setShowResetPw(false); }}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Reset Teacher Password</DialogTitle>
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

      {/* Edit Dialog */}
      <Dialog open={showEdit} onOpenChange={(o) => { if (!o) setShowEdit(false); }}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Edit Teacher</DialogTitle>
          </DialogHeader>
          <div className="space-y-3 py-2">
            {editError && <p className="text-sm text-destructive">{editError}</p>}
            <div className="space-y-1.5">
              <Label>Name <span className="text-destructive">*</span></Label>
              <Input
                value={editForm.name}
                onChange={(e) => setEditForm((f) => ({ ...f, name: e.target.value }))}
              />
            </div>
            <div className="space-y-1.5">
              <Label>Email <span className="text-destructive">*</span></Label>
              <Input
                type="email"
                value={editForm.email}
                onChange={(e) => setEditForm((f) => ({ ...f, email: e.target.value }))}
              />
            </div>
            <div className="space-y-1.5">
              <Label>New Password <span className="text-muted-foreground text-xs">(optional)</span></Label>
              <div className="relative">
                <Input
                  type={showPassword ? "text" : "password"}
                  value={editForm.password}
                  onChange={(e) => setEditForm((f) => ({ ...f, password: e.target.value }))}
                  placeholder="Leave blank to keep current"
                  className="pr-10"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword((v) => !v)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                  tabIndex={-1}
                >
                  {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowEdit(false)}>Cancel</Button>
            <Button
              onClick={handleSave}
              disabled={editLoading || !editForm.name || !editForm.email}
              className="gap-2"
            >
              {editLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
              Save
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
};

export default AdminTeacherProfilePage;
