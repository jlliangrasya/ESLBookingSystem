import { useState, useEffect, useContext } from "react";
import axios from "axios";
import AuthContext from "@/context/AuthContext";
import NavBar from "@/components/Navbar";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Loader2, PackagePlus, Pencil, AlertCircle, Building2 } from "lucide-react";

interface Plan {
  id: number;
  name: string;
  max_students: number;
  max_teachers: number;
  max_admins: number;
  price_monthly: number;
  description: string | null;
  is_active: boolean;
  company_count: number;
}

const emptyForm = { name: "", max_students: "", max_teachers: "", max_admins: "", price_monthly: "", description: "" };

const SubscriptionPlansPage = () => {
  const authContext = useContext(AuthContext);
  const token = localStorage.getItem("token");
  const headers = { Authorization: `Bearer ${token}` };

  const [plans, setPlans] = useState<Plan[]>([]);
  const [loading, setLoading] = useState(true);

  const [showModal, setShowModal] = useState(false);
  const [editPlan, setEditPlan] = useState<Plan | null>(null);
  const [form, setForm] = useState(emptyForm);
  const [formError, setFormError] = useState<string | null>(null);
  const [saveLoading, setSaveLoading] = useState(false);
  const [toggleLoading, setToggleLoading] = useState<number | null>(null);

  const fetchPlans = async () => {
    try {
      const res = await axios.get(`${import.meta.env.VITE_API_URL}/api/super-admin/plans`, { headers });
      setPlans(res.data);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchPlans(); }, []);

  const openAdd = () => {
    setEditPlan(null);
    setForm(emptyForm);
    setFormError(null);
    setShowModal(true);
  };

  const openEdit = (plan: Plan) => {
    setEditPlan(plan);
    setForm({
      name: plan.name,
      max_students: String(plan.max_students),
      max_teachers: String(plan.max_teachers),
      max_admins: String(plan.max_admins ?? 5),
      price_monthly: String(plan.price_monthly),
      description: plan.description ?? "",
    });
    setFormError(null);
    setShowModal(true);
  };

  const handleSave = async () => {
    setSaveLoading(true);
    setFormError(null);
    try {
      const payload = {
        name: form.name.trim(),
        max_students: Number(form.max_students),
        max_teachers: Number(form.max_teachers),
        max_admins: Number(form.max_admins) || 5,
        price_monthly: Number(form.price_monthly),
        description: form.description.trim() || null,
      };
      if (editPlan) {
        await axios.put(`${import.meta.env.VITE_API_URL}/api/super-admin/plans/${editPlan.id}`, payload, { headers });
      } else {
        await axios.post(`${import.meta.env.VITE_API_URL}/api/super-admin/plans`, payload, { headers });
      }
      setShowModal(false);
      fetchPlans();
    } catch (err) {
      if (axios.isAxiosError(err)) setFormError(err.response?.data?.message || "Failed to save plan");
    } finally {
      setSaveLoading(false);
    }
  };

  const handleToggle = async (plan: Plan) => {
    setToggleLoading(plan.id);
    try {
      const action = plan.is_active ? "disable" : "enable";
      await axios.post(`${import.meta.env.VITE_API_URL}/api/super-admin/plans/${plan.id}/${action}`, {}, { headers });
      fetchPlans();
    } catch (err) {
      console.error(err);
    } finally {
      setToggleLoading(null);
    }
  };

  const isFormValid = form.name.trim() && form.max_students && form.max_teachers && form.price_monthly !== "";

  if (!authContext?.user) return null;

  return (
    <>
      <NavBar />
      <div className="max-w-5xl mx-auto px-4 py-8 space-y-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-800">Subscription Plans</h1>
          <p className="text-sm text-muted-foreground mt-1">Manage all available plans offered to ESL centers.</p>
        </div>

        {/* Summary cards */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
          <Card>
            <CardContent className="pt-4">
              <p className="text-2xl font-bold">{plans.length}</p>
              <p className="text-xs text-muted-foreground">Total Plans</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-4">
              <p className="text-2xl font-bold text-green-600">{plans.filter(p => p.is_active).length}</p>
              <p className="text-xs text-muted-foreground">Active</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-4">
              <p className="text-2xl font-bold text-gray-400">{plans.filter(p => !p.is_active).length}</p>
              <p className="text-xs text-muted-foreground">Disabled</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-4 flex items-center gap-2">
              <Building2 className="h-5 w-5 text-primary shrink-0" />
              <div>
                <p className="text-2xl font-bold">{plans.reduce((s, p) => s + (p.company_count ?? 0), 0)}</p>
                <p className="text-xs text-muted-foreground">Companies subscribed</p>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Plans table */}
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-3">
            <CardTitle className="text-base flex items-center gap-2">
              <PackagePlus className="h-4 w-4 text-primary" />
              All Plans
            </CardTitle>
            <Button size="sm" onClick={openAdd}>
              <PackagePlus className="h-4 w-4 mr-1" /> Add Plan
            </Button>
          </CardHeader>
          <CardContent>
            {loading ? (
              <div className="flex justify-center py-10">
                <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
              </div>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Plan Name</TableHead>
                    <TableHead>Max Students</TableHead>
                    <TableHead>Max Teachers</TableHead>
                    <TableHead>Max Admins</TableHead>
                    <TableHead>Price / mo</TableHead>
                    <TableHead>Companies</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Description</TableHead>
                    <TableHead>Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {plans.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={9} className="text-center text-muted-foreground py-10">
                        No plans yet. Click "Add Plan" to create one.
                      </TableCell>
                    </TableRow>
                  ) : (
                    plans.map((plan) => (
                      <TableRow key={plan.id}>
                        <TableCell className="font-medium">{plan.name}</TableCell>
                        <TableCell>{plan.max_students}</TableCell>
                        <TableCell>{plan.max_teachers}</TableCell>
                        <TableCell>{plan.max_admins ?? 5}</TableCell>
                        <TableCell>₱{Number(plan.price_monthly).toLocaleString()}</TableCell>
                        <TableCell>
                          <span className="flex items-center gap-1">
                            <Building2 className="h-3.5 w-3.5 text-muted-foreground" />
                            {plan.company_count ?? 0}
                          </span>
                        </TableCell>
                        <TableCell>
                          <Badge
                            variant={plan.is_active ? "default" : "secondary"}
                            className={plan.is_active ? "bg-green-100 text-green-800 hover:bg-green-100" : ""}
                          >
                            {plan.is_active ? "Active" : "Disabled"}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-xs text-muted-foreground max-w-40 truncate">
                          {plan.description || "—"}
                        </TableCell>
                        <TableCell>
                          <div className="flex gap-2">
                            <Button size="sm" variant="outline" className="text-xs h-7" onClick={() => openEdit(plan)}>
                              <Pencil className="h-3 w-3 mr-1" /> Edit
                            </Button>
                            <Button
                              size="sm"
                              variant={plan.is_active ? "outline" : "default"}
                              className="text-xs h-7"
                              disabled={toggleLoading === plan.id}
                              onClick={() => handleToggle(plan)}
                            >
                              {toggleLoading === plan.id
                                ? <Loader2 className="h-3 w-3 animate-spin" />
                                : plan.is_active ? "Disable" : "Enable"}
                            </Button>
                          </div>
                        </TableCell>
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Add / Edit Modal */}
      <Dialog open={showModal} onOpenChange={setShowModal}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>{editPlan ? "Edit Plan" : "Add Subscription Plan"}</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            {formError && (
              <Alert variant="destructive">
                <AlertCircle className="h-4 w-4" />
                <AlertDescription>{formError}</AlertDescription>
              </Alert>
            )}
            <div>
              <Label>Plan Name</Label>
              <Input
                placeholder="e.g. Basic"
                value={form.name}
                onChange={(e) => setForm(f => ({ ...f, name: e.target.value }))}
              />
            </div>
            <div className="grid grid-cols-3 gap-3">
              <div>
                <Label>Max Students</Label>
                <Input type="number" min="1" value={form.max_students} onChange={(e) => setForm(f => ({ ...f, max_students: e.target.value }))} />
              </div>
              <div>
                <Label>Max Teachers</Label>
                <Input type="number" min="1" value={form.max_teachers} onChange={(e) => setForm(f => ({ ...f, max_teachers: e.target.value }))} />
              </div>
              <div>
                <Label>Max Admins</Label>
                <Input type="number" min="1" value={form.max_admins} placeholder="5" onChange={(e) => setForm(f => ({ ...f, max_admins: e.target.value }))} />
              </div>
            </div>
            <div>
              <Label>Price / month (₱)</Label>
              <Input type="number" min="0" value={form.price_monthly} onChange={(e) => setForm(f => ({ ...f, price_monthly: e.target.value }))} />
            </div>
            <div>
              <Label>Description (optional)</Label>
              <Input value={form.description} placeholder="Brief description" onChange={(e) => setForm(f => ({ ...f, description: e.target.value }))} />
            </div>
          </div>
          <DialogFooter className="mt-4">
            <Button variant="outline" onClick={() => setShowModal(false)}>Cancel</Button>
            <Button onClick={handleSave} disabled={saveLoading || !isFormValid}>
              {saveLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : editPlan ? "Save Changes" : "Create Plan"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
};

export default SubscriptionPlansPage;
