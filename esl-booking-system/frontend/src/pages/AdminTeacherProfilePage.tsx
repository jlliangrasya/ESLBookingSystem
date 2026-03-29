import { useState, useEffect, useCallback } from "react";
import { useParams, useNavigate } from "react-router-dom";
import axios from "axios";
import NavBar from "@/components/Navbar";
import { format, addDays, startOfWeek } from "date-fns";
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
  ArrowLeft, UserCircle, CalendarDays, Loader2, Pencil, Save, Eye, EyeOff, BookOpen, KeyRound, ChevronLeft, ChevronRight,
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
  [key: string]: unknown;
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
  // Opt-in availability (teacher_available_slots)
  const [weekStart, setWeekStart] = useState<Date>(() => startOfWeek(new Date(), { weekStartsOn: 1 }));
  const [openSlots, setOpenSlots] = useState<Set<string>>(new Set());
  const [togglingSlot, setTogglingSlot] = useState<string | null>(null);

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

  const fetchOpenSlots = useCallback(async (start: Date) => {
    try {
      const startStr = format(start, "yyyy-MM-dd");
      const res = await axios.get(`${base}/api/admin/teachers/${id}/weekly-slots?startDate=${startStr}`, { headers });
      const slotSet = new Set<string>(
        (res.data as { slot_date: string; slot_time: string }[]).map(s => `${s.slot_date}|${s.slot_time}`)
      );
      setOpenSlots(slotSet);
    } catch (err) {
      console.error("Error fetching open slots:", err);
    }
  }, [id]);

  const toggleSlot = async (dateStr: string, time: string) => {
    const key = `${dateStr}|${time}`;
    const isOpen = openSlots.has(key);
    const action = isOpen ? "close" : "open";
    setTogglingSlot(key);
    try {
      await axios.post(`${base}/api/admin/teachers/${id}/weekly-slots`, {
        slot_date: dateStr, slot_time: `${time}:00`, action,
      }, { headers });
      setOpenSlots(prev => {
        const next = new Set(prev);
        if (isOpen) next.delete(key); else next.add(key);
        return next;
      });
    } catch (err) {
      console.error("Error toggling slot:", err);
    } finally {
      setTogglingSlot(null);
    }
  };

  useEffect(() => { fetchData(); }, [id]);
  useEffect(() => { fetchOpenSlots(weekStart); }, [weekStart, fetchOpenSlots]);

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
      <div className="max-w-5xl mx-auto px-4 py-8 space-y-6 brand-gradient-subtle pattern-dots-light min-h-screen">
        {/* Back button */}
        <Button variant="ghost" className="gap-2 -ml-2" onClick={() => navigate("/teachers")}>
          <ArrowLeft className="h-4 w-4" /> Back to Teachers
        </Button>

        {/* Teacher Info */}
        <Card className="glow-card border-0 rounded-2xl">
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
        <Card className="glow-card border-0 rounded-2xl">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <CalendarDays className="h-5 w-5 text-primary" />
              Upcoming Schedule
            </CardTitle>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow className="brand-gradient-subtle">
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

        {/* Weekly Availability (Opt-in) */}
        <Card className="glow-card border-0 rounded-2xl">
          <CardHeader className="flex flex-row items-center justify-between">
            <CardTitle className="flex items-center gap-2">
              <CalendarDays className="h-5 w-5 text-primary" />
              Weekly Availability
            </CardTitle>
            <p className="text-xs text-muted-foreground">Click slots to open/close them for this teacher</p>
          </CardHeader>
          <CardContent>
            <div className="flex items-center justify-between mb-4">
              <Button variant="outline" size="sm" onClick={() => setWeekStart(addDays(weekStart, -7))}>
                <ChevronLeft className="h-4 w-4 mr-1" /> Prev
              </Button>
              <span className="text-sm font-medium">
                {format(weekStart, "MMM d")} – {format(addDays(weekStart, 6), "MMM d, yyyy")}
              </span>
              <Button variant="outline" size="sm" onClick={() => setWeekStart(addDays(weekStart, 7))}>
                Next <ChevronRight className="h-4 w-4 ml-1" />
              </Button>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-xs border-collapse">
                <thead>
                  <tr>
                    <th className="p-1 text-left w-16">Time</th>
                    {[...Array(7)].map((_, i) => (
                      <th key={i} className="p-1 text-center">{format(addDays(weekStart, i), "EEE MM/dd")}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {(() => {
                    const slots: string[] = [];
                    for (let h = 7; h <= 22; h++) {
                      slots.push(`${String(h).padStart(2, "0")}:00`);
                      if (h < 22 || h === 22) slots.push(`${String(h).padStart(2, "0")}:30`);
                    }
                    return slots.map((time) => (
                      <tr key={time}>
                        <td className="p-1 font-medium text-muted-foreground">{(() => {
                          const [hh, mm] = time.split(":");
                          const h = Number(hh);
                          return `${h % 12 === 0 ? 12 : h % 12}:${mm} ${h >= 12 ? "PM" : "AM"}`;
                        })()}</td>
                        {[...Array(7)].map((_, j) => {
                          const day = format(addDays(weekStart, j), "yyyy-MM-dd");
                          const key = `${day}|${time}`;
                          const isOpen = openSlots.has(key);
                          const isPast = new Date(`${day}T${time}:00`) < new Date();
                          const isToggling = togglingSlot === key;
                          // Check if booked
                          const bookedEntry = schedule.find(s => {
                            const d = fmtDate(s.appointment_date, "yyyy-MM-dd");
                            const t = fmtDate(s.appointment_date, "HH:mm");
                            return d === day && t === time;
                          });
                          return (
                            <td
                              key={j}
                              onClick={() => !isPast && !bookedEntry && !isToggling && toggleSlot(day, time)}
                              className={`p-1 text-center border cursor-pointer transition-colors ${
                                isPast ? "bg-gray-50 text-gray-300 cursor-not-allowed"
                                : bookedEntry ? "bg-blue-100 text-blue-700 cursor-default"
                                : isOpen ? "bg-green-100 text-green-700 hover:bg-green-200"
                                : "bg-gray-100 text-gray-400 hover:bg-gray-200"
                              }`}
                            >
                              {isToggling ? "..." : bookedEntry ? "Booked" : isOpen ? "✓" : "+"}
                            </td>
                          );
                        })}
                      </tr>
                    ));
                  })()}
                </tbody>
              </table>
            </div>
            <div className="flex gap-4 mt-3 text-xs text-muted-foreground">
              <span><span className="inline-block w-3 h-3 bg-green-100 border rounded mr-1" />Open (✓)</span>
              <span><span className="inline-block w-3 h-3 bg-gray-100 border rounded mr-1" />Closed (+)</span>
              <span><span className="inline-block w-3 h-3 bg-blue-100 border rounded mr-1" />Booked</span>
            </div>
          </CardContent>
        </Card>

        {/* Leave Requests */}
        <Card className="glow-card border-0 rounded-2xl">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <BookOpen className="h-5 w-5 text-primary" />
              Leave Requests
            </CardTitle>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow className="brand-gradient-subtle">
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
