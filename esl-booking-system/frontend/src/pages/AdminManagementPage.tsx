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
import { usePermissions } from "@/context/PermissionsContext";
import TablePagination from "@/components/TablePagination";
import PermissionEditor from "@/components/PermissionEditor";
import { PERMISSION_GROUPS, pageAccessLevel, viewKey } from "@/lib/permissions";

interface AdminUser {
  id: number;
  name: string;
  email: string;
  is_owner: boolean;
  // null for the owner, who implicitly has every permission
  permissions: string[] | null;
}

// Sensible starting point for a new admin: can see every page, change nothing
const DEFAULT_NEW_PERMISSIONS = PERMISSION_GROUPS.filter((g) => g.page !== "admins").map((g) => viewKey(g.page));

const LEVEL_LABEL = { full: "Full", view: "View only", custom: "Custom" } as const;

const AccessSummary = ({ perms }: { perms: string[] }) => {
  const visible = PERMISSION_GROUPS
    .map((g) => ({ g, level: pageAccessLevel(g, perms) }))
    .filter(({ level }) => level !== "none");
  if (visible.length === 0) return <span className="text-xs text-muted-foreground">No access</span>;
  return (
    <>
      {visible.map(({ g, level }) => (
        <Badge
          key={g.page}
          variant="outline"
          className={`text-xs ${level === "full" ? "text-green-600 border-green-300" : level === "view" ? "text-muted-foreground" : ""}`}
        >
          {g.label}: {LEVEL_LABEL[level as keyof typeof LEVEL_LABEL]}
        </Badge>
      ))}
    </>
  );
};

const AdminManagementPage = () => {
  const authContext = useContext(AuthContext);
  const myId = authContext?.user?.id;
  const { can, isOwner, permissions: myPermissions } = usePermissions();
  const token = localStorage.getItem("token");
  const headers = { Authorization: `Bearer ${token}` };
  // The owner can grant anything; a sub-admin only what they hold themselves
  const grantable = isOwner ? undefined : myPermissions;

  const [admins, setAdmins] = useState<AdminUser[]>([]);
  const [adminPage, setAdminPage] = useState(1);
  const [adminPageSize, setAdminPageSize] = useState(20);
  const [loading, setLoading] = useState(true);

  // Add admin modal
  const [showAddModal, setShowAddModal] = useState(false);
  const emptyAddForm = () => ({
    name: "", email: "", password: "",
    permissions: DEFAULT_NEW_PERMISSIONS.filter((k) => !grantable || grantable.includes(k)),
  });
  const [addForm, setAddForm] = useState(emptyAddForm);
  const [addError, setAddError] = useState<string | null>(null);
  const [addLoading, setAddLoading] = useState(false);

  // Edit permissions modal
  const [editAdmin, setEditAdmin] = useState<AdminUser | null>(null);
  const [editPerms, setEditPerms] = useState<string[]>([]);
  const [editError, setEditError] = useState<string | null>(null);
  const [editLoading, setEditLoading] = useState(false);

  // Delete confirm
  const [deleteAdmin, setDeleteAdmin] = useState<AdminUser | null>(null);
  const [deleteLoading, setDeleteLoading] = useState(false);

  const fetchAdmins = async () => {
    try {
      const res = await axios.get(`${import.meta.env.VITE_API_URL}/api/admin/admins`, { headers });
      setAdmins(res.data);
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
      setAddForm(emptyAddForm());
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
    setEditError(null);
    try {
      await axios.put(
        `${import.meta.env.VITE_API_URL}/api/admin/admins/${editAdmin.id}/permissions`,
        { permissions: editPerms },
        { headers },
      );
      setEditAdmin(null);
      fetchAdmins();
    } catch (err) {
      if (axios.isAxiosError(err)) setEditError(err.response?.data?.message || "Failed to save permissions");
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

  const canAdd = can("admins.add");
  const canEdit = can("admins.edit_permissions");
  const canDelete = can("admins.delete");
  const showActions = canEdit || canDelete;

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
        {!canAdd && !showActions && (
          <Alert className="mb-4">
            <ShieldCheck className="h-4 w-4" />
            <AlertDescription>You have view-only access to admin accounts.</AlertDescription>
          </Alert>
        )}
        <Card className="glow-card border-0 rounded-2xl">
          <CardHeader className="flex flex-row items-center justify-between">
            <CardTitle className="flex items-center gap-2">
              <UserCog className="h-5 w-5 text-primary" />
              Admin Accounts
            </CardTitle>
            {canAdd && (
              <Button size="sm" onClick={() => { setAddForm(emptyAddForm()); setShowAddModal(true); }} className="gap-1">
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
                  <TableHead>Access</TableHead>
                  {showActions && <TableHead>Actions</TableHead>}
                </TableRow>
              </TableHeader>
              <TableBody>
                {admins.slice((adminPage - 1) * adminPageSize, adminPage * adminPageSize).map((admin) => {
                  const manageable = !admin.is_owner && admin.id !== myId;
                  return (
                    <TableRow key={admin.id}>
                      <TableCell className="font-medium">{admin.name}</TableCell>
                      <TableCell className="text-sm">{admin.email}</TableCell>
                      <TableCell>
                        {admin.is_owner
                          ? <Badge className="bg-primary text-white text-xs">Owner</Badge>
                          : <Badge variant="secondary" className="text-xs">Admin</Badge>}
                      </TableCell>
                      <TableCell>
                        <div className="flex gap-1 flex-wrap max-w-md">
                          {admin.is_owner ? (
                            <Badge variant="outline" className="text-xs text-green-600 border-green-300">All Permissions</Badge>
                          ) : (
                            <AccessSummary perms={admin.permissions ?? []} />
                          )}
                        </div>
                      </TableCell>
                      {showActions && (
                        <TableCell>
                          {manageable && (
                            <div className="flex gap-1">
                              {canEdit && (
                                <Button size="sm" variant="outline" className="h-7 text-xs"
                                  onClick={() => { setEditError(null); setEditAdmin(admin); setEditPerms(admin.permissions ?? []); }}>
                                  <Pencil className="h-3 w-3 mr-1" /> Permissions
                                </Button>
                              )}
                              {canDelete && (
                                <Button size="sm" variant="destructive" className="h-7 text-xs"
                                  onClick={() => setDeleteAdmin(admin)}>
                                  <Trash2 className="h-3 w-3 mr-1" /> Delete
                                </Button>
                              )}
                            </div>
                          )}
                        </TableCell>
                      )}
                    </TableRow>
                  );
                })}
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
        <DialogContent className="sm:max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader><DialogTitle>Add Admin Account</DialogTitle></DialogHeader>
          <div className="space-y-3 py-2">
            {addError && <Alert variant="destructive"><AlertCircle className="h-4 w-4" /><AlertDescription>{addError}</AlertDescription></Alert>}
            <div className="space-y-1.5"><Label>Full Name</Label><Input placeholder="Juan Dela Cruz" value={addForm.name} onChange={(e) => setAddForm({ ...addForm, name: e.target.value })} /></div>
            <div className="space-y-1.5"><Label>Email</Label><Input type="email" placeholder="admin@example.com" value={addForm.email} onChange={(e) => setAddForm({ ...addForm, email: e.target.value })} /></div>
            <div className="space-y-1.5"><Label>Password</Label><Input type="password" placeholder="Minimum 8 characters" value={addForm.password} onChange={(e) => setAddForm({ ...addForm, password: e.target.value })} /></div>
            <div className="space-y-2">
              <p className="text-sm font-medium">Access Permissions</p>
              <PermissionEditor
                value={addForm.permissions}
                onChange={(permissions) => setAddForm({ ...addForm, permissions })}
                grantable={grantable}
              />
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
        <DialogContent className="sm:max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader><DialogTitle>Edit Permissions — {editAdmin?.name}</DialogTitle></DialogHeader>
          <div className="space-y-3 py-2">
            {editError && <Alert variant="destructive"><AlertCircle className="h-4 w-4" /><AlertDescription>{editError}</AlertDescription></Alert>}
            <PermissionEditor value={editPerms} onChange={setEditPerms} grantable={grantable} />
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
