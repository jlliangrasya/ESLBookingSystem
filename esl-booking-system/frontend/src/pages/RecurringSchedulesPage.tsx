import { useState, useEffect, useContext, useCallback } from "react";
import axios from "axios";
import {
  CalendarDays, Plus, Loader2, ChevronDown, ChevronUp, XCircle, CheckCircle, AlertTriangle, Clock,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import AuthContext from "@/context/AuthContext";
import NavBar from "@/components/Navbar";

interface Schedule {
  id: number;
  student_name: string;
  teacher_name: string;
  package_name: string;
  days_of_week: string[];
  start_time: string;
  duration_minutes: number;
  slots_per_class: number;
  num_weeks: number;
  start_date: string;
  end_date: string;
  total_possible: number;
  sessions_booked: number;
  skipped_dates: { date: string; reason: string }[] | null;
  completed_classes: number;
  remaining_classes: number;
  status: string;
  created_at: string;
}

interface ScheduleBooking {
  id: number;
  appointment_date: string;
  status: string;
  slot_count: number;
  student_absent: boolean;
  teacher_absent: boolean;
}

interface ScheduleDetail extends Schedule {
  bookings: ScheduleBooking[];
}

interface StudentPackage {
  id: number;
  student_name: string;
  package_name: string;
  sessions_remaining: number;
  duration_minutes: number;
  teacher_id: number | null;
  teacher_name: string | null;
}

const DAYS = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"];

const RecurringSchedulesPage: React.FC = () => {
  const authContext = useContext(AuthContext);
  const token = authContext?.token ?? null;
  const user = authContext?.user ?? null;
  const API = import.meta.env.VITE_API_URL;
  const headers = { Authorization: `Bearer ${token}` };

  const [schedules, setSchedules] = useState<Schedule[]>([]);
  const [loading, setLoading] = useState(true);
  const [createOpen, setCreateOpen] = useState(false);
  const [detailOpen, setDetailOpen] = useState(false);
  const [cancelSeriesId, setCancelSeriesId] = useState<number | null>(null);
  const [selectedDetail, setSelectedDetail] = useState<ScheduleDetail | null>(null);
  const [packages, setPackages] = useState<StudentPackage[]>([]);
  const [saving, setSaving] = useState(false);
  const [expandedId, setExpandedId] = useState<number | null>(null);

  // Create form
  const [selectedPkgId, setSelectedPkgId] = useState("");
  const [selectedDays, setSelectedDays] = useState<string[]>([]);
  const [startTime, setStartTime] = useState("09:00");
  const [numWeeks, setNumWeeks] = useState("4");
  const [startDate, setStartDate] = useState("");
  const [createResult, setCreateResult] = useState<any>(null);

  const fetchSchedules = useCallback(async () => {
    if (!token) return;
    try {
      const res = await axios.get(`${API}/api/recurring`, { headers });
      setSchedules(Array.isArray(res.data) ? res.data : []);
    } catch { /* */ } finally { setLoading(false); }
  }, [token]);

  const fetchPackages = useCallback(async () => {
    if (!token) return;
    try {
      if (user?.role === "student") {
        const res = await axios.get(`${API}/api/student/dashboard`, { headers });
        const pkg = res.data?.package;
        if (pkg) {
          setPackages([{
            id: pkg.id,
            student_name: user?.name || "Me",
            package_name: pkg.package_name || "Package",
            sessions_remaining: pkg.sessions_remaining || 0,
            duration_minutes: pkg.duration_minutes || 25,
            teacher_id: null,
            teacher_name: null,
          }]);
        }
      } else if (user?.role === "company_admin") {
        // Admin fetches all student packages in the company
        const res = await axios.get(`${API}/api/admin/students?limit=200`, { headers });
        const students = Array.isArray(res.data?.data) ? res.data.data : (Array.isArray(res.data) ? res.data : []);
        const pkgs: StudentPackage[] = [];
        for (const s of students) {
          if (s.student_package_id && s.payment_status === "paid" && (s.sessions_remaining > 0 || s.unused_sessions > 0)) {
            pkgs.push({
              id: s.student_package_id,
              student_name: s.name,
              package_name: s.package_name || s.subject || "Package",
              sessions_remaining: s.sessions_remaining || s.unused_sessions || 0,
              duration_minutes: s.duration_minutes || 25,
              teacher_id: s.teacher_id || null,
              teacher_name: s.teacher_name || null,
            });
          }
        }
        setPackages(pkgs);
      }
    } catch { /* */ }
  }, [token, user?.role]);

  useEffect(() => { fetchSchedules(); fetchPackages(); }, [fetchSchedules, fetchPackages]);

  const toggleDay = (day: string) => {
    setSelectedDays(prev => prev.includes(day) ? prev.filter(d => d !== day) : [...prev, day]);
  };

  const handleCreate = async () => {
    if (!selectedPkgId || selectedDays.length === 0 || !startTime) return;
    setSaving(true);
    setCreateResult(null);
    try {
      const res = await axios.post(`${API}/api/recurring`, {
        student_package_id: parseInt(selectedPkgId),
        days_of_week: selectedDays,
        start_time: startTime,
        num_weeks: parseInt(numWeeks) || 4,
        start_date: startDate || undefined,
      }, { headers });
      setCreateResult(res.data);
      fetchSchedules();
    } catch (err: any) {
      const data = err.response?.data;
      if (data?.skipped_dates) {
        setCreateResult({ error: true, message: data.message, skipped_dates: data.skipped_dates });
      } else {
        alert(data?.message || "Failed to create schedule");
      }
    } finally { setSaving(false); }
  };

  const openDetail = async (id: number) => {
    try {
      const res = await axios.get(`${API}/api/recurring/${id}`, { headers });
      setSelectedDetail(res.data);
      setDetailOpen(true);
    } catch { alert("Failed to load schedule details"); }
  };

  const handleCancelSeries = async () => {
    if (!cancelSeriesId) return;
    try {
      const res = await axios.post(`${API}/api/recurring/${cancelSeriesId}/cancel`, {}, { headers });
      alert(`${res.data.cancelled_classes} classes cancelled, ${res.data.sessions_refunded} sessions refunded.`);
      setCancelSeriesId(null);
      fetchSchedules();
      if (detailOpen) setDetailOpen(false);
    } catch (err: any) {
      alert(err.response?.data?.message || "Failed to cancel");
    }
  };

  const handleCancelBooking = async (scheduleId: number, bookingId: number) => {
    if (!confirm("Cancel this class? 1 session will be refunded.")) return;
    try {
      await axios.post(`${API}/api/recurring/${scheduleId}/bookings/${bookingId}/cancel`, {}, { headers });
      openDetail(scheduleId); // refresh
      fetchSchedules();
    } catch (err: any) {
      alert(err.response?.data?.message || "Failed to cancel");
    }
  };

  const fmtDate = (d: string) => new Date(d).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
  const fmtTime = (t: string) => {
    const [h, m] = t.split(':').map(Number);
    const ampm = h >= 12 ? "PM" : "AM";
    const h12 = h % 12 === 0 ? 12 : h % 12;
    return `${h12}:${String(m).padStart(2, '0')} ${ampm}`;
  };

  const statusBadge = (s: string) => {
    if (s === "active") return <Badge className="bg-green-100 text-green-700">Active</Badge>;
    if (s === "cancelled") return <Badge className="bg-red-100 text-red-700">Cancelled</Badge>;
    return <Badge className="bg-gray-100 text-gray-700">Completed</Badge>;
  };

  const bookingStatusBadge = (s: string) => {
    if (s === "confirmed") return <Badge className="bg-blue-100 text-blue-700 text-xs">Upcoming</Badge>;
    if (s === "done") return <Badge className="bg-green-100 text-green-700 text-xs">Done</Badge>;
    if (s === "cancelled") return <Badge className="bg-red-100 text-red-700 text-xs">Cancelled</Badge>;
    return <Badge className="bg-gray-100 text-gray-700 text-xs">{s}</Badge>;
  };

  const selectedPkg = packages.find(p => p.id.toString() === selectedPkgId);
  const estimatedClasses = selectedDays.length * (parseInt(numWeeks) || 4);

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900">
      <NavBar />
      <div className="max-w-5xl mx-auto p-4 sm:p-6">
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center gap-2">
            <CalendarDays className="h-6 w-6 text-blue-600" />
            <h1 className="text-2xl font-bold text-gray-900 dark:text-white">Recurring Schedules</h1>
          </div>
          {user?.role !== "teacher" && (
            <Button onClick={() => { setCreateOpen(true); setCreateResult(null); }} className="gap-1">
              <Plus className="h-4 w-4" /> New Schedule
            </Button>
          )}
        </div>

        <Card>
          <CardContent className="p-0">
            {loading ? (
              <div className="flex justify-center py-12"><Loader2 className="h-6 w-6 animate-spin text-gray-400" /></div>
            ) : schedules.length === 0 ? (
              <div className="text-center py-12 text-gray-500">No recurring schedules yet.</div>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Student</TableHead>
                    <TableHead>Days & Time</TableHead>
                    <TableHead>Duration</TableHead>
                    <TableHead>Classes</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {schedules.map(s => (
                    <TableRow key={s.id}>
                      <TableCell>
                        <div className="font-medium">{s.student_name}</div>
                        <div className="text-xs text-gray-500">{s.package_name}</div>
                      </TableCell>
                      <TableCell>
                        <div className="text-sm">{(typeof s.days_of_week === 'string' ? JSON.parse(s.days_of_week) : s.days_of_week).map((d: string) => d.substring(0, 3)).join(", ")}</div>
                        <div className="text-xs text-gray-500">{fmtTime(s.start_time)}</div>
                      </TableCell>
                      <TableCell className="text-sm">{s.duration_minutes} min</TableCell>
                      <TableCell>
                        <div className="text-sm">{s.completed_classes}/{s.sessions_booked} done</div>
                        <div className="text-xs text-gray-500">{s.remaining_classes} remaining</div>
                      </TableCell>
                      <TableCell>{statusBadge(s.status)}</TableCell>
                      <TableCell>
                        <div className="flex gap-1">
                          <Button variant="ghost" size="sm" onClick={() => openDetail(s.id)}>Details</Button>
                          {s.status === "active" && user?.role !== "teacher" && (
                            <Button variant="ghost" size="sm" className="text-red-500" onClick={() => setCancelSeriesId(s.id)}>Cancel</Button>
                          )}
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Create Dialog */}
      <Dialog open={createOpen} onOpenChange={(open) => { if (!open) setCreateOpen(false); }}>
        <DialogContent className="sm:max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader><DialogTitle>New Recurring Schedule</DialogTitle></DialogHeader>
          {!createResult ? (
            <div className="space-y-4">
              {packages.length > 0 && (
                <div>
                  <Label>Student Package</Label>
                  <Select value={selectedPkgId} onValueChange={setSelectedPkgId}>
                    <SelectTrigger><SelectValue placeholder="Select student" /></SelectTrigger>
                    <SelectContent>
                      {packages.map(p => (
                        <SelectItem key={p.id} value={p.id.toString()}>
                          {p.student_name} — {p.package_name} ({p.sessions_remaining} sessions, {p.duration_minutes}min)
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              )}
              {packages.length === 0 && (
                <div className="text-sm text-amber-600">No assigned students with paid packages found.</div>
              )}

              <div>
                <Label>Days of Week</Label>
                <div className="flex flex-wrap gap-2 mt-1">
                  {DAYS.map(day => (
                    <button
                      key={day}
                      type="button"
                      onClick={() => toggleDay(day)}
                      className={`px-3 py-1.5 text-xs rounded-full border transition-colors ${
                        selectedDays.includes(day)
                          ? "bg-blue-600 text-white border-blue-600"
                          : "bg-white text-gray-700 border-gray-300 hover:border-blue-400"
                      }`}
                    >
                      {day.substring(0, 3)}
                    </button>
                  ))}
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div><Label>Start Time</Label><Input type="time" value={startTime} onChange={e => setStartTime(e.target.value)} /></div>
                <div><Label>Weeks (1-12)</Label><Input type="number" min={1} max={12} value={numWeeks} onChange={e => setNumWeeks(e.target.value)} /></div>
              </div>

              <div>
                <Label>Start Date (optional, defaults to tomorrow)</Label>
                <Input type="date" value={startDate} onChange={e => setStartDate(e.target.value)} />
              </div>

              {selectedPkg && selectedDays.length > 0 && (
                <div className="p-3 bg-blue-50 dark:bg-blue-950 rounded text-sm space-y-1">
                  <p><strong>Preview:</strong> ~{estimatedClasses} classes over {numWeeks} weeks</p>
                  <p>Duration: {selectedPkg.duration_minutes} min ({Math.max(1, Math.ceil(selectedPkg.duration_minutes / 30))} slot{Math.ceil(selectedPkg.duration_minutes / 30) > 1 ? 's' : ''} per class)</p>
                  <p>Sessions available: <strong>{selectedPkg.sessions_remaining}</strong></p>
                  {estimatedClasses > selectedPkg.sessions_remaining && (
                    <p className="text-red-600"><AlertTriangle className="h-3 w-3 inline mr-1" />
                      May not have enough sessions ({selectedPkg.sessions_remaining} available, ~{estimatedClasses} needed)
                    </p>
                  )}
                </div>
              )}

              <DialogFooter>
                <Button variant="outline" onClick={() => setCreateOpen(false)}>Cancel</Button>
                <Button onClick={handleCreate} disabled={saving || !selectedPkgId || selectedDays.length === 0}>
                  {saving && <Loader2 className="h-4 w-4 mr-1 animate-spin" />} Create Schedule
                </Button>
              </DialogFooter>
            </div>
          ) : (
            <div className="space-y-4">
              {createResult.error ? (
                <div className="p-3 bg-red-50 rounded">
                  <p className="text-red-700 font-medium">{createResult.message}</p>
                </div>
              ) : (
                <div className="p-3 bg-green-50 rounded space-y-2">
                  <p className="text-green-700 font-medium flex items-center gap-1">
                    <CheckCircle className="h-4 w-4" /> Schedule created!
                  </p>
                  <p className="text-sm">{createResult.sessions_booked} classes booked ({createResult.duration_minutes}min, {createResult.slots_per_class} slot{createResult.slots_per_class > 1 ? 's' : ''} each)</p>
                  <p className="text-sm">Sessions remaining: {createResult.sessions_remaining}</p>
                </div>
              )}
              {createResult.skipped_dates && createResult.skipped_dates.length > 0 && (
                <div>
                  <p className="text-sm font-medium text-amber-600 mb-1">Skipped dates:</p>
                  <div className="max-h-40 overflow-y-auto space-y-1">
                    {createResult.skipped_dates.map((s: any, i: number) => (
                      <div key={i} className="text-xs text-gray-600 flex gap-2">
                        <span className="font-mono">{s.date}</span>
                        <span className="text-amber-600">{s.reason}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
              <DialogFooter>
                <Button onClick={() => { setCreateOpen(false); setCreateResult(null); setSelectedPkgId(""); setSelectedDays([]); }}>
                  Done
                </Button>
              </DialogFooter>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Detail Dialog */}
      <Dialog open={detailOpen} onOpenChange={setDetailOpen}>
        <DialogContent className="sm:max-w-2xl max-h-[85vh] overflow-y-auto">
          {selectedDetail && (
            <>
              <DialogHeader>
                <DialogTitle className="flex items-center gap-2">
                  Schedule Details {statusBadge(selectedDetail.status)}
                </DialogTitle>
              </DialogHeader>
              <div className="space-y-4">
                <div className="grid grid-cols-2 gap-4 text-sm">
                  <div><span className="text-gray-500">Student:</span> <strong>{selectedDetail.student_name}</strong></div>
                  <div><span className="text-gray-500">Teacher:</span> <strong>{selectedDetail.teacher_name}</strong></div>
                  <div><span className="text-gray-500">Days:</span> {(typeof selectedDetail.days_of_week === 'string' ? JSON.parse(selectedDetail.days_of_week) : selectedDetail.days_of_week).join(", ")}</div>
                  <div><span className="text-gray-500">Time:</span> {fmtTime(selectedDetail.start_time)}</div>
                  <div><span className="text-gray-500">Duration:</span> {selectedDetail.duration_minutes} min</div>
                  <div><span className="text-gray-500">Classes:</span> {selectedDetail.sessions_booked} booked / {selectedDetail.total_possible} possible</div>
                </div>

                <div>
                  <h3 className="text-sm font-medium mb-2">Bookings</h3>
                  <div className="max-h-60 overflow-y-auto border rounded">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Date</TableHead>
                          <TableHead>Slots</TableHead>
                          <TableHead>Status</TableHead>
                          <TableHead>Actions</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {selectedDetail.bookings.map(b => (
                          <TableRow key={b.id}>
                            <TableCell className="text-sm">{fmtDate(b.appointment_date)}</TableCell>
                            <TableCell className="text-sm">{b.slot_count}</TableCell>
                            <TableCell>{bookingStatusBadge(b.status)}</TableCell>
                            <TableCell>
                              {b.status !== 'done' && b.status !== 'cancelled' && user?.role !== "teacher" && (
                                <Button variant="ghost" size="sm" className="text-red-500 text-xs h-7"
                                  onClick={() => handleCancelBooking(selectedDetail.id, b.id)}>
                                  Cancel
                                </Button>
                              )}
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>
                </div>

                {selectedDetail.status === "active" && user?.role !== "teacher" && (
                  <Button variant="destructive" onClick={() => setCancelSeriesId(selectedDetail.id)} className="w-full">
                    <XCircle className="h-4 w-4 mr-1" /> Cancel Entire Series
                  </Button>
                )}
              </div>
            </>
          )}
        </DialogContent>
      </Dialog>

      {/* Cancel Series Confirmation */}
      <Dialog open={!!cancelSeriesId} onOpenChange={() => setCancelSeriesId(null)}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader><DialogTitle>Cancel Recurring Schedule</DialogTitle></DialogHeader>
          <p className="text-sm text-gray-600">
            Are you sure? All future upcoming classes will be cancelled and sessions will be refunded to the student.
          </p>
          <DialogFooter>
            <Button variant="outline" onClick={() => setCancelSeriesId(null)}>Keep</Button>
            <Button variant="destructive" onClick={handleCancelSeries}>Cancel Series</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default RecurringSchedulesPage;
