import { useState, useEffect, useContext, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import axios from "axios";
import NavBar from "@/components/Navbar";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Loader2, GraduationCap, CalendarDays, CheckCircle, XCircle, Clock, Plus, Pencil, Trash2, AlertCircle, UserCircle, Search, ChevronLeft, ChevronRight } from "lucide-react";
import AuthContext from "@/context/AuthContext";
import { fmtDate, fmtDateOnly } from "@/utils/timezone";

interface Teacher {
  id: number;
  name: string;
  email: string;
  upcoming_classes: number;
  classes_this_week: number;
  classes_this_month: number;
  created_at: string;
}

interface AdminPermissions {
  is_owner: boolean;
  can_add_teacher: boolean;
  can_edit_teacher: boolean;
  can_delete_teacher: boolean;
}

interface ScheduleBooking {
  id: number;
  appointment_date: string;
  status: string;
  student_name: string;
  package_name: string;
}

interface LeaveRequest {
  id: number;
  leave_date: string;
  reason_type: string;
  notes: string;
  status: string;
  created_at: string;
}

const statusColors: Record<string, string> = {
  pending: "bg-yellow-100 text-yellow-800",
  approved: "bg-green-100 text-green-800",
  rejected: "bg-red-100 text-red-800",
};

const TeacherManagementPage = () => {
  const authContext = useContext(AuthContext);
  const navigate = useNavigate();
  const token = localStorage.getItem("token");
  const headers = { Authorization: `Bearer ${token}` };

  const [teachers, setTeachers] = useState<Teacher[]>([]);
  const [teacherSearch, setTeacherSearch] = useState("");
  const [teacherPage, setTeacherPage] = useState(1);
  const [pickerMonth, setPickerMonth] = useState(new Date().getMonth() + 1);
  const [pickerYear, setPickerYear] = useState(new Date().getFullYear());
  const TEACHER_PAGE_SIZE = 10;

  const filteredTeachers = useMemo(() => {
    const q = teacherSearch.toLowerCase();
    return teachers.filter((t) => !q || t.name.toLowerCase().includes(q) || t.email.toLowerCase().includes(q));
  }, [teachers, teacherSearch]);

  const teacherTotalPages = Math.max(1, Math.ceil(filteredTeachers.length / TEACHER_PAGE_SIZE));
  const paginatedTeachers = filteredTeachers.slice((teacherPage - 1) * TEACHER_PAGE_SIZE, teacherPage * TEACHER_PAGE_SIZE);
  const [myPermissions, setMyPermissions] = useState<AdminPermissions>({ is_owner: false, can_add_teacher: false, can_edit_teacher: false, can_delete_teacher: false });
  const [loading, setLoading] = useState(true);

  // Add teacher modal
  const [showAddModal, setShowAddModal] = useState(false);
  const [addForm, setAddForm] = useState({ name: "", email: "", password: "" });
  const [addError, setAddError] = useState<string | null>(null);
  const [addLoading, setAddLoading] = useState(false);

  // Edit teacher modal
  const [editTeacher, setEditTeacher] = useState<Teacher | null>(null);
  const [editForm, setEditForm] = useState({ name: "", email: "" });
  const [editError, setEditError] = useState<string | null>(null);
  const [editLoading, setEditLoading] = useState(false);

  // Delete confirm
  const [deleteTeacher, setDeleteTeacher] = useState<Teacher | null>(null);
  const [deleteLoading, setDeleteLoading] = useState(false);

  // Schedule modal
  const [scheduleTeacher, setScheduleTeacher] = useState<Teacher | null>(null);
  const [schedule, setSchedule] = useState<ScheduleBooking[]>([]);
  const [scheduleLoading, setScheduleLoading] = useState(false);

  // Leave modal
  const [leaveTeacher, setLeaveTeacher] = useState<Teacher | null>(null);
  const [leaves, setLeaves] = useState<LeaveRequest[]>([]);
  const [leaveLoading, setLeaveLoading] = useState(false);

  const fetchTeachers = async (month = pickerMonth, year = pickerYear) => {
    try {
      const res = await axios.get(
        `${import.meta.env.VITE_API_URL}/api/admin/teachers?month=${month}&year=${year}`,
        { headers }
      );
      setTeachers(res.data);
    } catch (err) {
      console.error(err);
    }
  };

  const fetchData = async () => {
    try {
      const [teachersRes, adminsRes] = await Promise.all([
        axios.get(`${import.meta.env.VITE_API_URL}/api/admin/teachers?month=${pickerMonth}&year=${pickerYear}`, { headers }),
        axios.get(`${import.meta.env.VITE_API_URL}/api/admin/admins`, { headers }),
      ]);
      setTeachers(teachersRes.data);
      const me = adminsRes.data.find((a: AdminPermissions & { id: number }) => a.id === authContext?.user?.id);
      if (me) setMyPermissions(me);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchData(); }, []);

  const handleAddTeacher = async () => {
    setAddLoading(true);
    setAddError(null);
    try {
      await axios.post(`${import.meta.env.VITE_API_URL}/api/admin/teachers`, addForm, { headers });
      setShowAddModal(false);
      setAddForm({ name: "", email: "", password: "" });
      fetchData();
    } catch (err) {
      if (axios.isAxiosError(err)) setAddError(err.response?.data?.message || "Failed to add teacher");
    } finally {
      setAddLoading(false);
    }
  };

  const handleEditTeacher = async () => {
    if (!editTeacher) return;
    setEditLoading(true);
    setEditError(null);
    try {
      await axios.put(`${import.meta.env.VITE_API_URL}/api/admin/teachers/${editTeacher.id}`, editForm, { headers });
      setEditTeacher(null);
      fetchData();
    } catch (err) {
      if (axios.isAxiosError(err)) setEditError(err.response?.data?.message || "Failed to update teacher");
    } finally {
      setEditLoading(false);
    }
  };

  const handleDeleteTeacher = async () => {
    if (!deleteTeacher) return;
    setDeleteLoading(true);
    try {
      await axios.delete(`${import.meta.env.VITE_API_URL}/api/admin/teachers/${deleteTeacher.id}`, { headers });
      setDeleteTeacher(null);
      fetchData();
    } catch (err) {
      console.error(err);
    } finally {
      setDeleteLoading(false);
    }
  };

  const openSchedule = async (teacher: Teacher) => {
    setScheduleTeacher(teacher);
    setScheduleLoading(true);
    try {
      const res = await axios.get(`${import.meta.env.VITE_API_URL}/api/admin/teachers/${teacher.id}/schedule`, { headers });
      setSchedule(res.data);
    } finally {
      setScheduleLoading(false);
    }
  };

  const openLeaves = async (teacher: Teacher) => {
    setLeaveTeacher(teacher);
    setLeaveLoading(true);
    try {
      const res = await axios.get(`${import.meta.env.VITE_API_URL}/api/admin/teacher-leaves`, { headers });
      setLeaves(res.data.filter((l: LeaveRequest & { teacher_id: number }) => l.teacher_id === teacher.id));
    } finally {
      setLeaveLoading(false);
    }
  };

  const handleLeaveAction = async (leaveId: number, action: "approve" | "reject") => {
    await axios.post(`${import.meta.env.VITE_API_URL}/api/admin/teacher-leaves/${leaveId}/${action}`, {}, { headers });
    if (leaveTeacher) openLeaves(leaveTeacher);
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <>
      <NavBar />
      <div className="max-w-7xl mx-auto px-4 py-8">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between">
            <CardTitle className="flex items-center gap-2">
              <GraduationCap className="h-5 w-5 text-primary" />
              Teachers
            </CardTitle>
            {(myPermissions.is_owner || myPermissions.can_add_teacher) && (
              <Button size="sm" onClick={() => setShowAddModal(true)} className="gap-1">
                <Plus className="h-4 w-4" /> Add Teacher
              </Button>
            )}
          </CardHeader>
          <CardContent>
            <div className="mb-3 flex flex-wrap items-end gap-3">
              <div className="relative flex-1 min-w-48">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="Search by name or email…"
                  value={teacherSearch}
                  onChange={(e) => { setTeacherSearch(e.target.value); setTeacherPage(1); }}
                  className="pl-9"
                />
              </div>
              <div className="flex items-end gap-2">
                <div className="space-y-1">
                  <p className="text-xs text-muted-foreground">Month</p>
                  <Select
                    value={String(pickerMonth)}
                    onValueChange={(v) => {
                      const m = parseInt(v);
                      setPickerMonth(m);
                      fetchTeachers(m, pickerYear);
                    }}
                  >
                    <SelectTrigger className="h-8 text-sm w-36"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {["January","February","March","April","May","June","July","August","September","October","November","December"].map((name, i) => (
                        <SelectItem key={i + 1} value={String(i + 1)}>{name}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1">
                  <p className="text-xs text-muted-foreground">Year</p>
                  <Select
                    value={String(pickerYear)}
                    onValueChange={(v) => {
                      const y = parseInt(v);
                      setPickerYear(y);
                      fetchTeachers(pickerMonth, y);
                    }}
                  >
                    <SelectTrigger className="h-8 text-sm w-28"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {Array.from({ length: 4 }, (_, i) => new Date().getFullYear() - i).map((y) => (
                        <SelectItem key={y} value={String(y)}>{y}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>
            </div>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Name</TableHead>
                  <TableHead>Email</TableHead>
                  <TableHead>Upcoming</TableHead>
                  <TableHead>This Week</TableHead>
                  <TableHead>{["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"][pickerMonth - 1]} {pickerYear}</TableHead>
                  <TableHead>Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredTeachers.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={6} className="text-center text-muted-foreground py-8">
                      {teacherSearch ? "No teachers match your search" : "No teachers yet"}
                    </TableCell>
                  </TableRow>
                ) : (
                  paginatedTeachers.map((t) => (
                    <TableRow key={t.id}>
                      <TableCell className="font-medium">{t.name}</TableCell>
                      <TableCell className="text-sm">{t.email}</TableCell>
                      <TableCell>
                        <Badge variant="secondary">{t.upcoming_classes}</Badge>
                      </TableCell>
                      <TableCell>
                        <Badge variant="secondary" className="bg-blue-100 text-blue-700">{t.classes_this_week}</Badge>
                      </TableCell>
                      <TableCell>
                        <Badge variant="secondary" className="bg-green-100 text-green-700">{t.classes_this_month}</Badge>
                      </TableCell>
                      <TableCell>
                        <div className="flex gap-1 flex-wrap">
                          <Button size="sm" variant="outline" className="text-xs h-7"
                            onClick={() => navigate(`/admin/teachers/${t.id}`)}>
                            <UserCircle className="h-3 w-3 mr-1" /> Profile
                          </Button>
                          <Button size="sm" variant="outline" className="text-xs h-7"
                            onClick={() => openSchedule(t)}>
                            <CalendarDays className="h-3 w-3 mr-1" /> Schedule
                          </Button>
                          <Button size="sm" variant="outline" className="text-xs h-7"
                            onClick={() => openLeaves(t)}>
                            <Clock className="h-3 w-3 mr-1" /> Leaves
                          </Button>
                          {(myPermissions.is_owner || myPermissions.can_edit_teacher) && (
                            <Button size="sm" variant="outline" className="text-xs h-7"
                              onClick={() => { setEditTeacher(t); setEditForm({ name: t.name, email: t.email }); }}>
                              <Pencil className="h-3 w-3 mr-1" /> Edit
                            </Button>
                          )}
                          {(myPermissions.is_owner || myPermissions.can_delete_teacher) && (
                            <Button size="sm" variant="destructive" className="text-xs h-7"
                              onClick={() => setDeleteTeacher(t)}>
                              <Trash2 className="h-3 w-3 mr-1" /> Delete
                            </Button>
                          )}
                        </div>
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
            {teacherTotalPages > 1 && (
              <div className="flex items-center justify-between mt-4 text-sm text-muted-foreground">
                <span>Page {teacherPage} of {teacherTotalPages}</span>
                <div className="flex gap-1">
                  <Button size="sm" variant="outline" className="h-7 w-7 p-0"
                    disabled={teacherPage === 1} onClick={() => setTeacherPage((p) => p - 1)}>
                    <ChevronLeft className="h-4 w-4" />
                  </Button>
                  <Button size="sm" variant="outline" className="h-7 w-7 p-0"
                    disabled={teacherPage === teacherTotalPages} onClick={() => setTeacherPage((p) => p + 1)}>
                    <ChevronRight className="h-4 w-4" />
                  </Button>
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Add Teacher Modal */}
      <Dialog open={showAddModal} onOpenChange={setShowAddModal}>
        <DialogContent className="max-w-md">
          <DialogHeader><DialogTitle>Add Teacher</DialogTitle></DialogHeader>
          <div className="space-y-3 py-2">
            {addError && <Alert variant="destructive"><AlertCircle className="h-4 w-4" /><AlertDescription>{addError}</AlertDescription></Alert>}
            <div className="space-y-1.5"><Label>Full Name</Label><Input placeholder="Jane Doe" value={addForm.name} onChange={(e) => setAddForm({ ...addForm, name: e.target.value })} /></div>
            <div className="space-y-1.5"><Label>Email</Label><Input type="email" placeholder="jane@example.com" value={addForm.email} onChange={(e) => setAddForm({ ...addForm, email: e.target.value })} /></div>
            <div className="space-y-1.5"><Label>Password</Label><Input type="password" placeholder="Minimum 8 characters" value={addForm.password} onChange={(e) => setAddForm({ ...addForm, password: e.target.value })} /></div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowAddModal(false)}>Cancel</Button>
            <Button onClick={handleAddTeacher} disabled={addLoading || !addForm.name || !addForm.email || !addForm.password}>
              {addLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : "Add Teacher"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Edit Teacher Modal */}
      <Dialog open={!!editTeacher} onOpenChange={(o) => !o && setEditTeacher(null)}>
        <DialogContent className="max-w-md">
          <DialogHeader><DialogTitle>Edit Teacher</DialogTitle></DialogHeader>
          <div className="space-y-3 py-2">
            {editError && <Alert variant="destructive"><AlertCircle className="h-4 w-4" /><AlertDescription>{editError}</AlertDescription></Alert>}
            <div className="space-y-1.5"><Label>Full Name</Label><Input value={editForm.name} onChange={(e) => setEditForm({ ...editForm, name: e.target.value })} /></div>
            <div className="space-y-1.5"><Label>Email</Label><Input type="email" value={editForm.email} onChange={(e) => setEditForm({ ...editForm, email: e.target.value })} /></div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditTeacher(null)}>Cancel</Button>
            <Button onClick={handleEditTeacher} disabled={editLoading}>
              {editLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : "Save Changes"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Confirm Modal */}
      <Dialog open={!!deleteTeacher} onOpenChange={(o) => !o && setDeleteTeacher(null)}>
        <DialogContent className="max-w-sm">
          <DialogHeader><DialogTitle>Remove Teacher</DialogTitle></DialogHeader>
          <p className="text-sm text-muted-foreground py-2">
            Are you sure you want to remove <span className="font-medium">{deleteTeacher?.name}</span>? This cannot be undone.
          </p>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteTeacher(null)}>Cancel</Button>
            <Button variant="destructive" onClick={handleDeleteTeacher} disabled={deleteLoading}>
              {deleteLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : "Remove"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Schedule Modal */}
      <Dialog open={!!scheduleTeacher} onOpenChange={(o) => !o && setScheduleTeacher(null)}>
        <DialogContent className="max-w-lg">
          <DialogHeader><DialogTitle>{scheduleTeacher?.name} — Upcoming Schedule</DialogTitle></DialogHeader>
          {scheduleLoading ? (
            <div className="flex justify-center py-6"><Loader2 className="h-6 w-6 animate-spin text-primary" /></div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Date & Time</TableHead>
                  <TableHead>Student</TableHead>
                  <TableHead>Package</TableHead>
                  <TableHead>Status</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {schedule.length === 0 ? (
                  <TableRow><TableCell colSpan={4} className="text-center text-muted-foreground py-6">No upcoming classes</TableCell></TableRow>
                ) : schedule.map((b) => (
                  <TableRow key={b.id}>
                    <TableCell className="text-sm">{fmtDate(b.appointment_date, "MMM d, h:mm a")}</TableCell>
                    <TableCell>{b.student_name}</TableCell>
                    <TableCell className="text-xs">{b.package_name}</TableCell>
                    <TableCell><span className={`text-xs px-2 py-0.5 rounded-full ${statusColors[b.status] || "bg-gray-100"}`}>{b.status}</span></TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </DialogContent>
      </Dialog>

      {/* Leaves Modal */}
      <Dialog open={!!leaveTeacher} onOpenChange={(o) => !o && setLeaveTeacher(null)}>
        <DialogContent className="max-w-lg">
          <DialogHeader><DialogTitle>{leaveTeacher?.name} — Leave Requests</DialogTitle></DialogHeader>
          {leaveLoading ? (
            <div className="flex justify-center py-6"><Loader2 className="h-6 w-6 animate-spin text-primary" /></div>
          ) : (
            <div className="space-y-2 max-h-96 overflow-y-auto">
              {leaves.length === 0 ? (
                <p className="text-center text-muted-foreground py-6 text-sm">No leave requests</p>
              ) : leaves.map((l) => (
                <div key={l.id} className="border rounded-lg p-3 space-y-1">
                  <div className="flex items-center justify-between">
                    <span className="font-medium text-sm">{fmtDateOnly(l.leave_date)}</span>
                    <span className={`text-xs px-2 py-0.5 rounded-full ${statusColors[l.status]}`}>{l.status}</span>
                  </div>
                  <p className="text-xs text-muted-foreground capitalize">Reason: {l.reason_type}</p>
                  {l.notes && <p className="text-xs text-muted-foreground">{l.notes}</p>}
                  {l.status === "pending" && (
                    <div className="flex gap-2 pt-1">
                      <Button size="sm" className="h-7 text-xs gap-1 bg-green-600 hover:bg-green-700"
                        onClick={() => handleLeaveAction(l.id, "approve")}>
                        <CheckCircle className="h-3 w-3" /> Approve
                      </Button>
                      <Button size="sm" variant="destructive" className="h-7 text-xs gap-1"
                        onClick={() => handleLeaveAction(l.id, "reject")}>
                        <XCircle className="h-3 w-3" /> Reject
                      </Button>
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
};

export default TeacherManagementPage;
