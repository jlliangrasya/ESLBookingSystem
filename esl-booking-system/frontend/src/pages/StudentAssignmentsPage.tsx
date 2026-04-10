import { useState, useEffect, useContext, useCallback } from "react";
import axios from "axios";
import { FileText, Loader2, ExternalLink, Send } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
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
  teacher_name: string;
  submission_id: number | null;
  submitted_at: string | null;
  is_late: boolean;
  score: number | null;
  feedback: string | null;
  graded_at: string | null;
  created_at: string;
}

const StudentAssignmentsPage: React.FC = () => {
  const authContext = useContext(AuthContext);
  const token = authContext?.token ?? null;
  const API = import.meta.env.VITE_API_URL;
  const headers = { Authorization: `Bearer ${token}` };

  const [assignments, setAssignments] = useState<Assignment[]>([]);
  const [loading, setLoading] = useState(true);
  const [detailOpen, setDetailOpen] = useState(false);
  const [submitOpen, setSubmitOpen] = useState(false);
  const [selected, setSelected] = useState<Assignment | null>(null);
  const [saving, setSaving] = useState(false);

  // Submit form
  const [responseText, setResponseText] = useState("");
  const [referenceLinks, setReferenceLinks] = useState("");

  const fetchAssignments = useCallback(async () => {
    if (!token) return;
    try {
      const res = await axios.get(`${API}/api/assignments/student`, { headers });
      setAssignments(Array.isArray(res.data) ? res.data : []);
    } catch { /* */ } finally { setLoading(false); }
  }, [token]);

  useEffect(() => { fetchAssignments(); }, [fetchAssignments]);

  const openDetail = (a: Assignment) => {
    setSelected(a);
    setDetailOpen(true);
  };

  const openSubmit = (a: Assignment) => {
    setSelected(a);
    setResponseText("");
    setReferenceLinks("");
    setSubmitOpen(true);
  };

  const handleSubmit = async () => {
    if (!selected || !responseText.trim()) return;
    setSaving(true);
    try {
      const links = referenceLinks.trim()
        ? referenceLinks.split('\n').map(l => l.trim()).filter(Boolean)
        : null;
      await axios.post(`${API}/api/assignments/${selected.id}/submit`, {
        response_text: responseText,
        reference_links: links,
      }, { headers });
      setSubmitOpen(false);
      fetchAssignments();
    } catch (err: any) {
      alert(err.response?.data?.message || "Failed to submit");
    } finally { setSaving(false); }
  };

  const fmtDate = (d: string) => new Date(d).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
  const isPastDue = (d: string) => new Date() > new Date(d);

  const getStatusBadge = (a: Assignment) => {
    if (a.score !== null) return <Badge className="bg-green-100 text-green-700">Graded: {a.score}{a.max_score ? `/${a.max_score}` : ''}</Badge>;
    if (a.submission_id) return <Badge className="bg-amber-100 text-amber-700">{a.is_late ? "Submitted (Late)" : "Submitted"}</Badge>;
    if (isPastDue(a.due_date)) return <Badge className="bg-red-100 text-red-700">Overdue</Badge>;
    return <Badge className="bg-blue-100 text-blue-700">Pending</Badge>;
  };

  const parseLinks = (links: any): string[] => {
    if (!links) return [];
    if (typeof links === 'string') { try { return JSON.parse(links); } catch { return []; } }
    return Array.isArray(links) ? links : [];
  };

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900">
      <NavBar />
      <div className="max-w-5xl mx-auto p-4 sm:p-6">
        <div className="flex items-center gap-2 mb-6">
          <FileText className="h-6 w-6 text-blue-600" />
          <h1 className="text-2xl font-bold text-gray-900 dark:text-white">My Assignments</h1>
        </div>

        <Card>
          <CardContent className="p-0">
            {loading ? (
              <div className="flex justify-center py-12"><Loader2 className="h-6 w-6 animate-spin text-gray-400" /></div>
            ) : assignments.length === 0 ? (
              <div className="text-center py-12 text-gray-500">No assignments yet.</div>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Title</TableHead>
                    <TableHead>Teacher</TableHead>
                    <TableHead>Due Date</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {assignments.map(a => (
                    <TableRow key={a.id}>
                      <TableCell className="font-medium">{a.title}</TableCell>
                      <TableCell>{a.teacher_name}</TableCell>
                      <TableCell>
                        <span className={isPastDue(a.due_date) && !a.submission_id ? "text-red-500" : ""}>{fmtDate(a.due_date)}</span>
                      </TableCell>
                      <TableCell>{getStatusBadge(a)}</TableCell>
                      <TableCell>
                        <div className="flex gap-1">
                          <Button variant="ghost" size="sm" onClick={() => openDetail(a)}>View</Button>
                          {a.status === 'active' && a.score === null && (
                            <Button variant="ghost" size="sm" className="text-blue-600" onClick={() => openSubmit(a)}>
                              <Send className="h-3.5 w-3.5 mr-1" /> {a.submission_id ? "Resubmit" : "Submit"}
                            </Button>
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

      {/* Detail Dialog */}
      <Dialog open={detailOpen} onOpenChange={setDetailOpen}>
        <DialogContent className="sm:max-w-2xl max-h-[85vh] overflow-y-auto">
          {selected && (
            <>
              <DialogHeader><DialogTitle>{selected.title}</DialogTitle></DialogHeader>
              <div className="space-y-4">
                <div className="text-sm text-gray-500">
                  Teacher: <strong>{selected.teacher_name}</strong> &middot;
                  Due: <strong className={isPastDue(selected.due_date) ? "text-red-500" : ""}>{fmtDate(selected.due_date)}</strong>
                  {selected.max_score && <> &middot; Max Score: <strong>{selected.max_score}</strong></>}
                </div>
                <div>
                  <Label className="text-xs text-gray-500">Instructions</Label>
                  <p className="text-sm whitespace-pre-wrap mt-1">{selected.instructions}</p>
                </div>
                {parseLinks(selected.resource_links).length > 0 && (
                  <div>
                    <Label className="text-xs text-gray-500">Resource Links</Label>
                    <div className="space-y-1 mt-1">
                      {parseLinks(selected.resource_links).map((link, i) => (
                        <a key={i} href={link} target="_blank" rel="noopener noreferrer" className="flex items-center gap-1 text-sm text-blue-600 hover:underline">
                          <ExternalLink className="h-3 w-3" /> {link}
                        </a>
                      ))}
                    </div>
                  </div>
                )}

                {selected.submission_id && (
                  <Card className="bg-gray-50 dark:bg-gray-800">
                    <CardHeader className="pb-2">
                      <CardTitle className="text-sm">Your Submission</CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-2">
                      <p className="text-xs text-gray-500">
                        Submitted: {fmtDate(selected.submitted_at!)}
                        {selected.is_late && <Badge className="ml-2 bg-red-100 text-red-700 text-xs">Late</Badge>}
                      </p>
                      {selected.score !== null && (
                        <div className="p-3 bg-green-50 dark:bg-green-950 rounded">
                          <p className="font-semibold text-green-700 dark:text-green-300">
                            Score: {selected.score}{selected.max_score ? `/${selected.max_score}` : ''}
                          </p>
                          {selected.feedback && <p className="text-sm text-gray-600 dark:text-gray-400 mt-1">{selected.feedback}</p>}
                        </div>
                      )}
                    </CardContent>
                  </Card>
                )}
              </div>
            </>
          )}
        </DialogContent>
      </Dialog>

      {/* Submit Dialog */}
      <Dialog open={submitOpen} onOpenChange={setSubmitOpen}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader><DialogTitle>Submit Assignment: {selected?.title}</DialogTitle></DialogHeader>
          <div className="space-y-4">
            <div>
              <Label>Your Response</Label>
              <textarea
                className="w-full min-h-[120px] rounded-md border border-input bg-background px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                value={responseText}
                onChange={e => setResponseText(e.target.value)}
                placeholder="Write your answer here..."
              />
            </div>
            <div>
              <Label>Reference Links (one per line, optional)</Label>
              <textarea
                className="w-full min-h-[60px] rounded-md border border-input bg-background px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                value={referenceLinks}
                onChange={e => setReferenceLinks(e.target.value)}
                placeholder="https://docs.google.com/..."
              />
            </div>
            {selected && isPastDue(selected.due_date) && (
              <p className="text-sm text-amber-600">Note: This submission will be marked as late.</p>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setSubmitOpen(false)}>Cancel</Button>
            <Button onClick={handleSubmit} disabled={saving || !responseText.trim()}>
              {saving && <Loader2 className="h-4 w-4 mr-1 animate-spin" />}
              <Send className="h-4 w-4 mr-1" /> Submit
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default StudentAssignmentsPage;
