import { useState, useEffect, useContext, useCallback } from "react";
import axios from "axios";
import { Megaphone, Plus, Pencil, Trash2, Pin, Loader2 } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
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

interface Announcement {
  id: number;
  title: string;
  content: string;
  audience: string;
  is_pinned: boolean;
  author_name: string;
  created_at: string;
  expires_at: string | null;
}

const AnnouncementManagementPage: React.FC = () => {
  const authContext = useContext(AuthContext);
  const token = authContext?.token ?? null;
  const user = authContext?.user ?? null;
  const API = import.meta.env.VITE_API_URL;
  const headers = { Authorization: `Bearer ${token}` };

  const [announcements, setAnnouncements] = useState<Announcement[]>([]);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editId, setEditId] = useState<number | null>(null);
  const [saving, setSaving] = useState(false);
  const [deleteId, setDeleteId] = useState<number | null>(null);

  // Form fields
  const [title, setTitle] = useState("");
  const [content, setContent] = useState("");
  const [audience, setAudience] = useState("all");
  const [isPinned, setIsPinned] = useState(false);
  const [expiresAt, setExpiresAt] = useState("");

  const fetchAnnouncements = useCallback(async () => {
    if (!token) return;
    try {
      const res = await axios.get(`${API}/api/announcements?limit=50`, { headers });
      setAnnouncements(Array.isArray(res.data?.data) ? res.data.data : []);
    } catch {
      // silently fail
    } finally {
      setLoading(false);
    }
  }, [token]);

  useEffect(() => { fetchAnnouncements(); }, [fetchAnnouncements]);

  const resetForm = () => {
    setTitle(""); setContent(""); setAudience("all"); setIsPinned(false); setExpiresAt(""); setEditId(null);
  };

  const openCreate = () => {
    resetForm();
    setDialogOpen(true);
  };

  const openEdit = (a: Announcement) => {
    setEditId(a.id);
    setTitle(a.title);
    setContent(a.content);
    setAudience(a.audience);
    setIsPinned(a.is_pinned);
    setExpiresAt(a.expires_at ? a.expires_at.split("T")[0] : "");
    setDialogOpen(true);
  };

  const handleSave = async () => {
    if (!title.trim() || !content.trim()) return;
    setSaving(true);
    try {
      const payload = { title, content, audience, is_pinned: isPinned, expires_at: expiresAt || null };
      if (editId) {
        await axios.put(`${API}/api/announcements/${editId}`, payload, { headers });
      } else {
        await axios.post(`${API}/api/announcements`, payload, { headers });
      }
      setDialogOpen(false);
      resetForm();
      fetchAnnouncements();
    } catch (err: any) {
      alert(err.response?.data?.message || "Failed to save announcement");
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!deleteId) return;
    try {
      await axios.delete(`${API}/api/announcements/${deleteId}`, { headers });
      setDeleteId(null);
      fetchAnnouncements();
    } catch {
      alert("Failed to delete announcement");
    }
  };

  const audienceLabel = (a: string) => {
    switch (a) {
      case "teachers": return "Teachers";
      case "students": return "Students";
      case "all": return "Everyone";
      case "company_admin": return "All Admins";
      default: return a;
    }
  };

  const audienceBadgeColor = (a: string) => {
    switch (a) {
      case "teachers": return "bg-purple-100 text-purple-700";
      case "students": return "bg-green-100 text-green-700";
      case "all": return "bg-blue-100 text-blue-700";
      default: return "bg-gray-100 text-gray-700";
    }
  };

  const formatDate = (dateStr: string) =>
    new Date(dateStr).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900">
      <NavBar />
      <div className="max-w-5xl mx-auto p-4 sm:p-6">
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center gap-2">
            <Megaphone className="h-6 w-6 text-blue-600" />
            <h1 className="text-2xl font-bold text-gray-900 dark:text-white">Announcements</h1>
          </div>
          <Button onClick={openCreate} className="gap-1">
            <Plus className="h-4 w-4" /> New Announcement
          </Button>
        </div>

        <Card>
          <CardContent className="p-0">
            {loading ? (
              <div className="flex justify-center py-12"><Loader2 className="h-6 w-6 animate-spin text-gray-400" /></div>
            ) : announcements.length === 0 ? (
              <div className="text-center py-12 text-gray-500">No announcements yet</div>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Title</TableHead>
                    <TableHead>Audience</TableHead>
                    <TableHead>Date</TableHead>
                    <TableHead>Expires</TableHead>
                    <TableHead className="w-24">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {announcements.map(a => (
                    <TableRow key={a.id}>
                      <TableCell>
                        <div className="flex items-center gap-2">
                          {a.is_pinned && <Pin className="h-3 w-3 text-amber-500" />}
                          <span className="font-medium">{a.title}</span>
                        </div>
                        <p className="text-xs text-gray-500 mt-0.5 truncate max-w-sm">{a.content}</p>
                      </TableCell>
                      <TableCell>
                        <span className={`text-xs font-medium px-2 py-0.5 rounded ${audienceBadgeColor(a.audience)}`}>
                          {audienceLabel(a.audience)}
                        </span>
                      </TableCell>
                      <TableCell className="text-sm text-gray-600">{formatDate(a.created_at)}</TableCell>
                      <TableCell className="text-sm text-gray-500">
                        {a.expires_at ? formatDate(a.expires_at) : "—"}
                      </TableCell>
                      <TableCell>
                        <div className="flex gap-1">
                          <Button variant="ghost" size="sm" className="h-8 w-8 p-0" onClick={() => openEdit(a)}>
                            <Pencil className="h-3.5 w-3.5" />
                          </Button>
                          <Button variant="ghost" size="sm" className="h-8 w-8 p-0 text-red-500 hover:text-red-700" onClick={() => setDeleteId(a.id)}>
                            <Trash2 className="h-3.5 w-3.5" />
                          </Button>
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

      {/* Create/Edit Dialog */}
      <Dialog open={dialogOpen} onOpenChange={(open) => { if (!open) { setDialogOpen(false); resetForm(); } }}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>{editId ? "Edit Announcement" : "New Announcement"}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label>Title</Label>
              <Input value={title} onChange={e => setTitle(e.target.value)} placeholder="Announcement title" />
            </div>
            <div>
              <Label>Content</Label>
              <textarea
                className="w-full min-h-[100px] rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                value={content}
                onChange={e => setContent(e.target.value)}
                placeholder="Write your announcement..."
              />
            </div>
            {user?.role === "company_admin" && (
              <div>
                <Label>Audience</Label>
                <Select value={audience} onValueChange={setAudience}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">Everyone (Teachers + Students)</SelectItem>
                    <SelectItem value="teachers">Teachers Only</SelectItem>
                    <SelectItem value="students">Students Only</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            )}
            <div className="flex items-center gap-4">
              <label className="flex items-center gap-2 text-sm cursor-pointer">
                <input type="checkbox" checked={isPinned} onChange={e => setIsPinned(e.target.checked)} className="rounded" />
                Pin to top
              </label>
            </div>
            <div>
              <Label>Expires on (optional)</Label>
              <Input type="date" value={expiresAt} onChange={e => setExpiresAt(e.target.value)} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => { setDialogOpen(false); resetForm(); }}>Cancel</Button>
            <Button onClick={handleSave} disabled={saving || !title.trim() || !content.trim()}>
              {saving && <Loader2 className="h-4 w-4 mr-1 animate-spin" />}
              {editId ? "Update" : "Create"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation Dialog */}
      <Dialog open={!!deleteId} onOpenChange={() => setDeleteId(null)}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>Delete Announcement</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-gray-600">Are you sure you want to delete this announcement? This action cannot be undone.</p>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteId(null)}>Cancel</Button>
            <Button variant="destructive" onClick={handleDelete}>Delete</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default AnnouncementManagementPage;
