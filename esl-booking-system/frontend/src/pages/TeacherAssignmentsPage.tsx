import { useState, useEffect, useContext, useCallback } from "react";
import axios from "axios";
import { FileText, Plus, Loader2, ExternalLink } from "lucide-react";
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

interface Assignment {
  id: number;
  title: string;
  instructions: string;
  due_date: string;
  max_score: number | null;
  resource_links: string[] | null;
  status: string;
  student_name: string;
  student_id: number;
  submission_count: number;
  graded_count: number;
  created_at: string;
}

interface AssignedStudent {
  student_id: number;
  student_name: string;
}

interface Submission {
  id: number;
  response_text: string;
  reference_links: string[] | null;
  is_late: boolean;
  submitted_at: string;
  score: number | null;
  feedback: string | null;
  graded_at: string | null;
}

interface AssignmentDetail extends Assignment {
  submission: Submission | null;
}

const TeacherAssignmentsPage: React.FC = () => {
  const authContext = useContext(AuthContext);
  const token = authContext?.token ?? null;
  const API = import.meta.env.VITE_API_URL;
  const headers = { Authorization: `Bearer ${token}` };

  const [assignments, setAssignments] = useState<Assignment[]>([]);
  const [students, setStudents] = useState<AssignedStudent[]>([]);
  const [loading, setLoading] = useState(true);
  const [createOpen, setCreateOpen] = useState(false);
  const [detailOpen, setDetailOpen] = useState(false);
  const [gradeOpen, setGradeOpen] = useState(false);
  const [selectedDetail, setSelectedDetail] = useState<AssignmentDetail | null>(null);
  const [saving, setSaving] = useState(false);

  // Create form
  const [studentId, setStudentId] = useState("");
  const [title, setTitle] = useState("");
  const [instructions, setInstructions] = useState("");
  const [dueDate, setDueDate] = useState("");
  const [maxScore, setMaxScore] = useState("");
  const [resourceLinks, setResourceLinks] = useState("");

  // Grade form
  const [gradeScore, setGradeScore] = useState("");
  const [gradeFeedback, setGradeFeedback] = useState("");

  const fetchAssignments = useCallback(async () => {
    if (!token) return;
    try {
      const res = await axios.get(`${API}/api/assignments/teacher`, { headers });
      setAssignments(Array.isArray(res.data) ? res.data : []);
    } catch { /* */ } finally { setLoading(false); }
  }, [token]);

  const fetchStudents = useCallback(async () => {
    if (!token) return;
    try {
      const res = await axios.get(`${API}/api/teacher/dashboard`, { headers });
      const data = res.data;
      if (data.assignedStudents) {
        setStudents(data.assignedStudents.map((s: any) => ({ student_id: s.id, student_name: s.name })));
      }
    } catch { /* */ }
  }, [token]);

  useEffect(() => { fetchAssignments(); fetchStudents(); }, [fetchAssignments, fetchStudents]);

  const handleCreate = async () => {
    if (!studentId || !title.trim() || !instructions.trim() || !dueDate) return;
    setSaving(true);
    try {
      const links = resourceLinks.trim()
        ? resourceLinks.split('\n').map(l => l.trim()).filter(Boolean)
        : null;
      await axios.post(`${API}/api/assignments`, {
        student_id: parseInt(studentId),
        title, instructions, due_date: dueDate,
        max_score: maxScore ? parseInt(maxScore) : null,
        resource_links: links,
      }, { headers });
      setCreateOpen(false);
      setStudentId(""); setTitle(""); setInstructions(""); setDueDate(""); setMaxScore(""); setResourceLinks("");
      fetchAssignments();
    } catch (err: any) {
      alert(err.response?.data?.message || "Failed to create assignment");
    } finally { setSaving(false); }
  };

  const openDetail = async (id: number) => {
    try {
      const res = await axios.get(`${API}/api/assignments/${id}`, { headers });
      setSelectedDetail(res.data);
      setDetailOpen(true);
    } catch { alert("Failed to load assignment"); }
  };

  const openGrade = () => {
    if (!selectedDetail?.submission) return;
    setGradeScore(selectedDetail.submission.score?.toString() || "");
    setGradeFeedback(selectedDetail.submission.feedback || "");
    setGradeOpen(true);
  };

  const handleGrade = async () => {
    if (!selectedDetail || gradeScore === "") return;
    setSaving(true);
    try {
      await axios.post(`${API}/api/assignments/${selectedDetail.id}/grade`, {
        score: parseInt(gradeScore),
        feedback: gradeFeedback || null,
      }, { headers });
      setGradeOpen(false);
      setDetailOpen(false);
      fetchAssignments();
    } catch (err: any) {
      alert(err.response?.data?.message || "Failed to grade");
    } finally { setSaving(false); }
  };

  const fmtDate = (d: string) => new Date(d).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
  const isPastDue = (d: string) => new Date() > new Date(d);

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900">
      <NavBar />
      <div className="max-w-5xl mx-auto p-4 sm:p-6">
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center gap-2">
            <FileText className="h-6 w-6 text-blue-600" />
            <h1 className="text-2xl font-bold text-gray-900 dark:text-white">Assignments</h1>
          </div>
          <Button onClick={() => setCreateOpen(true)} className="gap-1">
            <Plus className="h-4 w-4" /> New Assignment
          </Button>
        </div>

        <Card>
          <CardContent className="p-0">
            {loading ? (
              <div className="flex justify-center py-12"><Loader2 className="h-6 w-6 animate-spin text-gray-400" /></div>
            ) : assignments.length === 0 ? (
              <div className="text-center py-12 text-gray-500">No assignments yet. Create one to get started.</div>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Title</TableHead>
                    <TableHead>Student</TableHead>
                    <TableHead>Due Date</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {assignments.map(a => (
                    <TableRow key={a.id}>
                      <TableCell className="font-medium">{a.title}</TableCell>
                      <TableCell>{a.student_name}</TableCell>
                      <TableCell>
                        <span className={isPastDue(a.due_date) ? "text-red-500" : ""}>{fmtDate(a.due_date)}</span>
                      </TableCell>
                      <TableCell>
                        {a.graded_count > 0 ? (
                          <Badge className="bg-green-100 text-green-700">Graded</Badge>
                        ) : a.submission_count > 0 ? (
                          <Badge className="bg-amber-100 text-amber-700">Submitted</Badge>
                        ) : isPastDue(a.due_date) ? (
                          <Badge className="bg-red-100 text-red-700">Overdue</Badge>
                        ) : (
                          <Badge className="bg-blue-100 text-blue-700">Pending</Badge>
                        )}
                      </TableCell>
                      <TableCell>
                        <Button variant="ghost" size="sm" onClick={() => openDetail(a.id)}>View</Button>
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
      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader><DialogTitle>New Assignment</DialogTitle></DialogHeader>
          <div className="space-y-4">
            <div>
              <Label>Student</Label>
              <Select value={studentId} onValueChange={setStudentId}>
                <SelectTrigger><SelectValue placeholder="Select student" /></SelectTrigger>
                <SelectContent>
                  {students.map(s => (
                    <SelectItem key={s.student_id} value={s.student_id.toString()}>{s.student_name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div><Label>Title</Label><Input value={title} onChange={e => setTitle(e.target.value)} /></div>
            <div>
              <Label>Instructions</Label>
              <textarea className="w-full min-h-[80px] rounded-md border border-input bg-background px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring" value={instructions} onChange={e => setInstructions(e.target.value)} />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div><Label>Due Date</Label><Input type="datetime-local" value={dueDate} onChange={e => setDueDate(e.target.value)} /></div>
              <div><Label>Max Score (optional)</Label><Input type="number" value={maxScore} onChange={e => setMaxScore(e.target.value)} /></div>
            </div>
            <div>
              <Label>Resource Links (one per line, optional)</Label>
              <textarea className="w-full min-h-[60px] rounded-md border border-input bg-background px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring" value={resourceLinks} onChange={e => setResourceLinks(e.target.value)} placeholder="https://drive.google.com/..." />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setCreateOpen(false)}>Cancel</Button>
            <Button onClick={handleCreate} disabled={saving || !studentId || !title.trim() || !instructions.trim() || !dueDate}>
              {saving && <Loader2 className="h-4 w-4 mr-1 animate-spin" />} Create
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Detail Dialog */}
      <Dialog open={detailOpen} onOpenChange={setDetailOpen}>
        <DialogContent className="sm:max-w-2xl max-h-[85vh] overflow-y-auto">
          {selectedDetail && (
            <>
              <DialogHeader><DialogTitle>{selectedDetail.title}</DialogTitle></DialogHeader>
              <div className="space-y-4">
                <div className="text-sm text-gray-500">
                  Student: <strong>{selectedDetail.student_name}</strong> &middot;
                  Due: <strong>{fmtDate(selectedDetail.due_date)}</strong>
                  {selectedDetail.max_score && <> &middot; Max Score: <strong>{selectedDetail.max_score}</strong></>}
                </div>
                <div>
                  <Label className="text-xs text-gray-500">Instructions</Label>
                  <p className="text-sm whitespace-pre-wrap mt-1">{selectedDetail.instructions}</p>
                </div>
                {selectedDetail.resource_links && selectedDetail.resource_links.length > 0 && (
                  <div>
                    <Label className="text-xs text-gray-500">Resource Links</Label>
                    <div className="space-y-1 mt-1">
                      {(typeof selectedDetail.resource_links === 'string' ? JSON.parse(selectedDetail.resource_links) : selectedDetail.resource_links).map((link: string, i: number) => (
                        <a key={i} href={link} target="_blank" rel="noopener noreferrer" className="flex items-center gap-1 text-sm text-blue-600 hover:underline">
                          <ExternalLink className="h-3 w-3" /> {link}
                        </a>
                      ))}
                    </div>
                  </div>
                )}

                {selectedDetail.submission ? (
                  <Card className="bg-gray-50 dark:bg-gray-800">
                    <CardHeader className="pb-2">
                      <CardTitle className="text-sm flex items-center gap-2">
                        Student Submission
                        {selectedDetail.submission.is_late && <Badge className="bg-red-100 text-red-700 text-xs">Late</Badge>}
                      </CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-2">
                      <p className="text-sm whitespace-pre-wrap">{selectedDetail.submission.response_text}</p>
                      {selectedDetail.submission.reference_links && (
                        <div className="space-y-1">
                          {(typeof selectedDetail.submission.reference_links === 'string' ? JSON.parse(selectedDetail.submission.reference_links) : selectedDetail.submission.reference_links).map((link: string, i: number) => (
                            <a key={i} href={link} target="_blank" rel="noopener noreferrer" className="flex items-center gap-1 text-sm text-blue-600 hover:underline">
                              <ExternalLink className="h-3 w-3" /> {link}
                            </a>
                          ))}
                        </div>
                      )}
                      <p className="text-xs text-gray-500">Submitted: {fmtDate(selectedDetail.submission.submitted_at)}</p>
                      {selectedDetail.submission.score !== null ? (
                        <div className="p-2 bg-green-50 rounded text-sm">
                          <strong>Score: {selectedDetail.submission.score}{selectedDetail.max_score ? `/${selectedDetail.max_score}` : ''}</strong>
                          {selectedDetail.submission.feedback && <p className="mt-1 text-gray-600">{selectedDetail.submission.feedback}</p>}
                        </div>
                      ) : (
                        <Button size="sm" onClick={openGrade}>Grade Submission</Button>
                      )}
                    </CardContent>
                  </Card>
                ) : (
                  <div className="text-sm text-gray-400 italic">No submission yet</div>
                )}
              </div>
            </>
          )}
        </DialogContent>
      </Dialog>

      {/* Grade Dialog */}
      <Dialog open={gradeOpen} onOpenChange={setGradeOpen}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader><DialogTitle>Grade Submission</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div>
              <Label>Score{selectedDetail?.max_score ? ` (max ${selectedDetail.max_score})` : ''}</Label>
              <Input type="number" value={gradeScore} onChange={e => setGradeScore(e.target.value)} min={0} max={selectedDetail?.max_score || undefined} />
            </div>
            <div>
              <Label>Feedback (optional)</Label>
              <textarea className="w-full min-h-[60px] rounded-md border border-input bg-background px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring" value={gradeFeedback} onChange={e => setGradeFeedback(e.target.value)} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setGradeOpen(false)}>Cancel</Button>
            <Button onClick={handleGrade} disabled={saving || gradeScore === ""}>
              {saving && <Loader2 className="h-4 w-4 mr-1 animate-spin" />} Submit Grade
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default TeacherAssignmentsPage;
