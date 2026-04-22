import { useState, useEffect, useContext } from "react";
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
import { Loader2, UserCog, Plus, Pencil, Trash2, AlertCircle, ShieldCheck } from "lucide-react";
import AuthContext from "@/context/AuthContext";
import TablePagination from "@/components/TablePagination";

interface AdminUser {
  id: number;
  name: string;
  email: string;
  is_owner: boolean;
  can_add_teacher: boolean;
  can_edit_teacher: boolean;
  can_delete_teacher: boolean;
}

const AdminManagementPage = () => {
  const authContext = useContext(AuthContext);
  const token = localStorage.getItem("token");
  const headers = { Authorization: `Bearer ${token}` };

  const [admins, setAdmins] = useState<AdminUser[]>([]);
  const [adminPage, setAdminPage] = useState(1);
  const [adminPageSize, setAdminPageSize] = useState(20);
  const [loading, setLoading] = useState(true);
  const [isOwner, setIsOwner] = useState(false);

  // Add admin modal
  const [showAddModal, setShowAddModal] = useState(false);
  const [addForm, setAddForm] = useState({
    name: "", email: "", password: "",
    can_add_teacher: false, can_edit_teacher: false, can_delete_teacher: false,
  });
  const [addError, setAddError] = useState<string | null>(null);
  const [addLoading, setAddLoading] = useState(false);

  // Edit permissions modal
  const [editAdmin, setEditAdmin] = useState<AdminUser | null>(null);
  const [editPerms, setEditPerms] = useState({ can_add_teacher: false, can_edit_teacher: false, can_delete_teacher: false });
  const [editLoading, setEditLoading] = useState(false);

  // Delete confirm
  const [deleteAdmin, setDeleteAdmin] = useState<AdminUser | null>(null);
  const [deleteLoading, setDeleteLoading] = useState(false);

  const fetchAdmins = async () => {
    try {
      const res = await axios.get(`${import.meta.env.VITE_API_URL}/api/admin/admins`, { headers });
      setAdmins(res.data);
      const me = res.data.find((a: AdminUser) => a.id === authContext?.user?.id);
      setIsOwner(me?.is_owner ?? false);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchAdmins(); }, []);

  const handleAddAdmin = async () => {
    setAddLoading(true);
    setAddError(null);
    try {
      await axios.post(`${import.meta.env.VITE_API_URL}/api/admin/admins`, addForm, { headers });
      setShowAddModal(false);
      setAddForm({ name: "", email: "", password: "", can_add_teacher: false, can_edit_teacher: false, can_delete_teacher: false });
      fetchAdmins();
    } catch (err) {
      if (axios.isAxiosError(err)) setAddError(err.response?.data?.message || "Failed to add admin");
    } finally {
      setAddLoading(false);
    }
  };

  const handleEditPerms = async () => {
    if (!editAdmin) return;
    setEditLoading(true);
    try {
      await axios.put(`${import.meta.env.VITE_API_URL}/api/admin/admins/${editAdmin.id}/permissions`, editPerms, { headers });
      setEditAdmin(null);
      fetchAdmins();
    } finally {
      setEditLoading(false);
    }
  };

  const handleDeleteAdmin = async () => {
    if (!deleteAdmin) return;
    setDeleteLoading(true);
    try {
      await axios.delete(`${import.meta.env.VITE_API_URL}/api/admin/admins/${deleteAdmin.id}`, { headers });
      setDeleteAdmin(null);
      fetchAdmins();
    } finally {
      setDeleteLoading(false);
    }
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
      <div className="max-w-7xl mx-auto px-4 py-8 brand-gradient-subtle pattern-dots-light min-h-screen">
        {!isOwner && (
          <Alert className="mb-4">
            <ShieldCheck className="h-4 w-4" />
            <AlertDescription>Only the company owner can add, edit, or delete admin accounts.</AlertDescription>
          </Alert>
        )}
        <Card className="glow-card border-0 rounded-2xl">
          <CardHeader className="flex flex-row items-center justify-between">
            <CardTitle className="flex items-center gap-2">
              <UserCog className="h-5 w-5 text-primary" />
              Admin Accounts
            </CardTitle>
            {isOwner && (
              <Button size="sm" onClick={() => setShowAddModal(true)} className="gap-1">
                <Plus className="h-4 w-4" /> Add Admin
              </Button>
            )}
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow className="brand-gradient-subtle">
                  <TableHead>Name</TableHead>
                  <TableHead>Email</TableHead>
                  <TableHead>Role</TableHead>
                  <TableHead>Permissions</TableHead>
                  {isOwner && <TableHead>Actions</TableHead>}
                </TableRow>
              </TableHeader>
              <TableBody>
                {admins.slice((adminPage - 1) * adminPageSize, adminPage * adminPageSize).map((admin) => (
                  <TableRow key={admin.id}>
                    <TableCell className="font-medium">{admin.name}</TableCell>
                    <TableCell className="text-sm">{admin.email}</TableCell>
                    <TableCell>
                      {admin.is_owner
                        ? <Badge className="bg-primary text-white text-xs">Owner</Badge>
                        : <Badge variant="secondary" className="text-xs">Admin</Badge>}
                    </TableCell>
                    <TableCell>
                      <div className="flex gap-1 flex-wrap">
                        {admin.is_owner ? (
                          <Badge variant="outline" className="text-xs text-green-600 border-green-300">All Permissions</Badge>
                        ) : (
                          <>
                            {admin.can_add_teacher && <Badge variant="outline" className="text-xs">Add Teacher</Badge>}
                            {admin.can_edit_teacher && <Badge variant="outline" className="text-xs">Edit Teacher</Badge>}
                            {admin.can_delete_teacher && <Badge variant="outline" className="text-xs">Delete Teacher</Badge>}
                            {!admin.can_add_teacher && !admin.can_edit_teacher && !admin.can_delete_teacher && (
                              <span className="text-xs text-muted-foreground">View only</span>
                            )}
                          </>
                        )}
                      </div>
                    </TableCell>
                    {isOwner && (
                      <TableCell>
                        {!admin.is_owner && (
                          <div className="flex gap-1">
                            <Button size="sm" variant="outline" className="h-7 text-xs"
                              onClick={() => { setEditAdmin(admin); setEditPerms({ can_add_teacher: admin.can_add_teacher, can_edit_teacher: admin.can_edit_teacher, can_delete_teacher: admin.can_delete_teacher }); }}>
                              <Pencil className="h-3 w-3 mr-1" /> Permissions
                            </Button>
                            <Button size="sm" variant="destructive" className="h-7 text-xs"
                              onClick={() => setDeleteAdmin(admin)}>
                              <Trash2 className="h-3 w-3 mr-1" /> Delete
                            </Button>
                          </div>
                        )}
                      </TableCell>
                    )}
                  </TableRow>
                ))}
              </TableBody>
            </Table>
            {admins.length > 0 && (
              <TablePagination page={adminPage} totalPages={Math.max(1, Math.ceil(admins.length / adminPageSize))}
                pageSize={adminPageSize} totalItems={admins.length}
                onPageChange={setAdminPage} onPageSizeChange={setAdminPageSize} />
            )}
          </CardContent>
        </Card>
      </div>

      {/* Add Admin Modal */}
      <Dialog open={showAddModal} onOpenChange={setShowAddModal}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader><DialogTitle>Add Admin Account</DialogTitle></DialogHeader>
          <div className="space-y-3 py-2">
            {addError && <Alert variant="destructive"><AlertCircle className="h-4 w-4" /><AlertDescription>{addError}</AlertDescription></Alert>}
            <div className="space-y-1.5"><Label>Full Name</Label><Input placeholder="Juan Dela Cruz" value={addForm.name} onChange={(e) => setAddForm({ ...addForm, name: e.target.value })} /></div>
            <div className="space-y-1.5"><Label>Email</Label><Input type="email" placeholder="admin@example.com" value={addForm.email} onChange={(e) => setAddForm({ ...addForm, email: e.target.value })} /></div>
            <div className="space-y-1.5"><Label>Password</Label><Input type="password" placeholder="Minimum 8 characters" value={addForm.password} onChange={(e) => setAddForm({ ...addForm, password: e.target.value })} /></div>
            <div className="space-y-2 border rounded-lg p-3">
              <p className="text-sm font-medium">Teacher Permissions</p>
              {(["can_add_teacher", "can_edit_teacher", "can_delete_teacher"] as const).map((perm) => (
                <label key={perm} className="flex items-center gap-2 text-sm cursor-pointer">
                  <input type="checkbox" checked={addForm[perm]} onChange={(e) => setAddForm({ ...addForm, [perm]: e.target.checked })} className="accent-primary" />
                  {perm === "can_add_teacher" ? "Can add teachers" : perm === "can_edit_teacher" ? "Can edit teachers" : "Can delete teachers"}
                </label>
              ))}
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowAddModal(false)}>Cancel</Button>
            <Button onClick={handleAddAdmin} disabled={addLoading || !addForm.name || !addForm.email || !addForm.password}>
              {addLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : "Create Admin"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Edit Permissions Modal */}
      <Dialog open={!!editAdmin} onOpenChange={(o) => !o && setEditAdmin(null)}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader><DialogTitle>Edit Permissions — {editAdmin?.name}</DialogTitle></DialogHeader>
          <div className="space-y-2 py-2 border rounded-lg p-3">
            <p className="text-sm font-medium">Teacher Permissions</p>
            {(["can_add_teacher", "can_edit_teacher", "can_delete_teacher"] as const).map((perm) => (
              <label key={perm} className="flex items-center gap-2 text-sm cursor-pointer">
                <input type="checkbox" checked={editPerms[perm]} onChange={(e) => setEditPerms({ ...editPerms, [perm]: e.target.checked })} className="accent-primary" />
                {perm === "can_add_teacher" ? "Can add teachers" : perm === "can_edit_teacher" ? "Can edit teachers" : "Can delete teachers"}
              </label>
            ))}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditAdmin(null)}>Cancel</Button>
            <Button onClick={handleEditPerms} disabled={editLoading}>
              {editLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : "Save"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Confirm Modal */}
      <Dialog open={!!deleteAdmin} onOpenChange={(o) => !o && setDeleteAdmin(null)}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader><DialogTitle>Delete Admin</DialogTitle></DialogHeader>
          <p className="text-sm text-muted-foreground py-2">
            Are you sure you want to delete <span className="font-medium">{deleteAdmin?.name}</span>?
          </p>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteAdmin(null)}>Cancel</Button>
            <Button variant="destructive" onClick={handleDeleteAdmin} disabled={deleteLoading}>
              {deleteLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : "Delete"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
};

export default AdminManagementPage;
