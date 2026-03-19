import { useState, useEffect, useContext } from "react";
import axios from "axios";
import { useNavigate } from "react-router-dom";
import AuthContext from "@/context/AuthContext";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Building2, Users, Clock, CheckCircle, LogOut, Loader2, ArrowUpCircle, PackagePlus, Pencil, BarChart2 } from "lucide-react";
import {
  BarChart, Bar, LineChart, Line, PieChart, Pie, Cell, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend,
} from "recharts";
import logo from "../assets/Brightfolks_Logo.png";
import NotificationBell from "@/components/NotificationBell";

interface Stats {
  total_companies: number;
  active_companies: number;
  pending_companies: number;
  total_students: number;
  total_teachers: number;
}

interface Company {
  id: number;
  name: string;
  email: string;
  phone: string;
  address: string;
  status: string;
  plan_name: string;
  max_students: number;
  max_teachers: number;
  price_monthly: number;
  created_at: string;
  approved_at: string | null;
  approved_by_name: string | null;
  trial_ends_at: string | null;
  next_due_date: string | null;
  last_paid_at: string | null;
  student_count: number;
  teacher_count: number;
  weekly_classes: number;
}

interface Plan {
  id: number;
  name: string;
  max_students: number;
  max_teachers: number;
  max_admins: number;
  price_monthly: number;
  description: string | null;
  is_active: boolean;
}

interface UpgradeRequest {
  id: number;
  company_name: string;
  company_email: string;
  current_plan: string | null;
  requested_plan: string;
  price_monthly: number;
  status: string;
  created_at: string;
  notes: string | null;
}

const statusColors: Record<string, string> = {
  pending: "bg-yellow-100 text-yellow-800",
  active: "bg-green-100 text-green-800",
  rejected: "bg-red-100 text-red-800",
  suspended: "bg-gray-100 text-gray-800",
  locked: "bg-red-100 text-red-700",
};

function getPaymentStatus(company: Company): { label: string; cls: string } {
  if (company.status === 'locked') return { label: 'Locked', cls: 'bg-red-100 text-red-700' };
  if (!company.next_due_date) return { label: 'N/A', cls: 'bg-gray-100 text-gray-500' };
  const today = new Date();
  const due = new Date(company.next_due_date);
  const diffDays = Math.ceil((due.getTime() - today.getTime()) / 86400000);
  if (diffDays < 0) return { label: 'Overdue', cls: 'bg-red-100 text-red-700' };
  if (diffDays <= 5) return { label: 'Due Soon', cls: 'bg-yellow-100 text-yellow-700' };
  return { label: 'Paid', cls: 'bg-green-100 text-green-700' };
}

const emptyPlanForm = { name: '', max_students: '', max_teachers: '', max_admins: '', price_monthly: '', description: '' };

const SuperAdminDashboard = () => {
  const [stats, setStats] = useState<Stats | null>(null);
  const [companies, setCompanies] = useState<Company[]>([]);
  const [upgradeRequests, setUpgradeRequests] = useState<UpgradeRequest[]>([]);
  const [plans, setPlans] = useState<Plan[]>([]);
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState<number | null>(null);
  const [upgradeActionLoading, setUpgradeActionLoading] = useState<number | null>(null);
  const [showPlanModal, setShowPlanModal] = useState(false);
  const [editPlan, setEditPlan] = useState<Plan | null>(null);
  const [planForm, setPlanForm] = useState(emptyPlanForm);
  const [planLoading, setPlanLoading] = useState(false);
  const [planToggleLoading, setPlanToggleLoading] = useState<number | null>(null);
  const [selectedCompany, setSelectedCompany] = useState<Company | null>(null);
  const [lockLoading, setLockLoading] = useState<number | null>(null);
  const [markPaidLoading, setMarkPaidLoading] = useState<number | null>(null);

  interface SAAnalytics {
    companyGrowth: { month: string; companies: number }[];
    byPlan: { plan_name: string; count: number }[];
    sessionsOverall: { month: string; sessions: number }[];
    totals: { totalCompanies: number; totalSessions: number; totalRevenue: number };
  }
  const [saAnalytics, setSaAnalytics] = useState<SAAnalytics | null>(null);

  const authContext = useContext(AuthContext);
  const navigate = useNavigate();
  const token = localStorage.getItem("token");

  const fetchData = async () => {
    try {
      const headers = { Authorization: `Bearer ${token}` };
      const [statsRes, companiesRes, upgradeRes, plansRes, analyticsRes] = await Promise.all([
        axios.get(`${import.meta.env.VITE_API_URL}/api/super-admin/dashboard`, { headers }),
        axios.get(`${import.meta.env.VITE_API_URL}/api/companies`, { headers }),
        axios.get(`${import.meta.env.VITE_API_URL}/api/super-admin/upgrade-requests`, { headers }),
        axios.get(`${import.meta.env.VITE_API_URL}/api/super-admin/plans`, { headers }),
        axios.get(`${import.meta.env.VITE_API_URL}/api/super-admin/analytics`, { headers }).catch(() => ({ data: null })),
      ]);
      setStats(statsRes.data);
      setCompanies(companiesRes.data);
      setUpgradeRequests(upgradeRes.data);
      setPlans(plansRes.data);
      if (analyticsRes.data) setSaAnalytics(analyticsRes.data);
    } catch (err) {
      console.error("Error fetching super admin data:", err);
    } finally {
      setLoading(false);
    }
  };

  const openAddPlan = () => {
    setEditPlan(null);
    setPlanForm(emptyPlanForm);
    setShowPlanModal(true);
  };

  const openEditPlan = (plan: Plan) => {
    setEditPlan(plan);
    setPlanForm({
      name: plan.name,
      max_students: String(plan.max_students),
      max_teachers: String(plan.max_teachers),
      max_admins: String(plan.max_admins ?? 5),
      price_monthly: String(plan.price_monthly),
      description: plan.description || '',
    });
    setShowPlanModal(true);
  };

  const handlePlanSubmit = async () => {
    setPlanLoading(true);
    try {
      const headers = { Authorization: `Bearer ${token}` };
      const payload = {
        name: planForm.name,
        max_students: Number(planForm.max_students),
        max_teachers: Number(planForm.max_teachers),
        max_admins: Number(planForm.max_admins) || 5,
        price_monthly: Number(planForm.price_monthly),
        description: planForm.description || null,
      };
      if (editPlan) {
        await axios.put(`${import.meta.env.VITE_API_URL}/api/super-admin/plans/${editPlan.id}`, payload, { headers });
      } else {
        await axios.post(`${import.meta.env.VITE_API_URL}/api/super-admin/plans`, payload, { headers });
      }
      setShowPlanModal(false);
      fetchData();
    } catch (err) {
      console.error("Error saving plan:", err);
    } finally {
      setPlanLoading(false);
    }
  };

  const handleTogglePlan = async (plan: Plan) => {
    setPlanToggleLoading(plan.id);
    try {
      const headers = { Authorization: `Bearer ${token}` };
      const action = plan.is_active ? 'disable' : 'enable';
      await axios.post(`${import.meta.env.VITE_API_URL}/api/super-admin/plans/${plan.id}/${action}`, {}, { headers });
      fetchData();
    } catch (err) {
      console.error("Error toggling plan:", err);
    } finally {
      setPlanToggleLoading(null);
    }
  };

  const handleLock = async (id: number) => {
    setLockLoading(id);
    try {
      await axios.post(`${import.meta.env.VITE_API_URL}/api/companies/${id}/lock`, {}, { headers: { Authorization: `Bearer ${token}` } });
      fetchData();
    } catch (err) { console.error(err); } finally { setLockLoading(null); }
  };

  const handleUnlock = async (id: number) => {
    setLockLoading(id);
    try {
      await axios.post(`${import.meta.env.VITE_API_URL}/api/companies/${id}/unlock`, {}, { headers: { Authorization: `Bearer ${token}` } });
      fetchData();
    } catch (err) { console.error(err); } finally { setLockLoading(null); }
  };

  const handleMarkPaid = async (id: number) => {
    setMarkPaidLoading(id);
    try {
      await axios.post(`${import.meta.env.VITE_API_URL}/api/companies/${id}/mark-paid`, {}, { headers: { Authorization: `Bearer ${token}` } });
      fetchData();
    } catch (err) { console.error(err); } finally { setMarkPaidLoading(null); }
  };

  useEffect(() => {
    fetchData();
  }, []);

  const handleApprove = async (id: number) => {
    setActionLoading(id);
    try {
      await axios.post(
        `${import.meta.env.VITE_API_URL}/api/companies/${id}/approve`,
        {},
        { headers: { Authorization: `Bearer ${token}` } }
      );
      fetchData();
    } catch (err) {
      console.error("Error approving company:", err);
    } finally {
      setActionLoading(null);
    }
  };

  const handleReject = async (id: number) => {
    setActionLoading(id);
    try {
      await axios.post(
        `${import.meta.env.VITE_API_URL}/api/companies/${id}/reject`,
        {},
        { headers: { Authorization: `Bearer ${token}` } }
      );
      fetchData();
    } catch (err) {
      console.error("Error rejecting company:", err);
    } finally {
      setActionLoading(null);
    }
  };

  const handleSuspend = async (id: number) => {
    setActionLoading(id);
    try {
      await axios.post(
        `${import.meta.env.VITE_API_URL}/api/companies/${id}/suspend`,
        {},
        { headers: { Authorization: `Bearer ${token}` } }
      );
      fetchData();
    } catch (err) {
      console.error("Error suspending company:", err);
    } finally {
      setActionLoading(null);
    }
  };

  const handleApproveUpgrade = async (id: number) => {
    setUpgradeActionLoading(id);
    try {
      await axios.post(
        `${import.meta.env.VITE_API_URL}/api/super-admin/upgrade-requests/${id}/approve`,
        {},
        { headers: { Authorization: `Bearer ${token}` } }
      );
      fetchData();
    } catch (err) {
      console.error("Error approving upgrade:", err);
    } finally {
      setUpgradeActionLoading(null);
    }
  };

  const handleRejectUpgrade = async (id: number) => {
    setUpgradeActionLoading(id);
    try {
      await axios.post(
        `${import.meta.env.VITE_API_URL}/api/super-admin/upgrade-requests/${id}/reject`,
        {},
        { headers: { Authorization: `Bearer ${token}` } }
      );
      fetchData();
    } catch (err) {
      console.error("Error rejecting upgrade:", err);
    } finally {
      setUpgradeActionLoading(null);
    }
  };

  const handleLogout = () => {
    authContext?.logout();
    navigate("/");
  };

  const pendingCompanies = companies.filter(c => c.status === "pending");
  const allOtherCompanies = companies.filter(c => c.status !== "pending");

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <>
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <div className="bg-primary/20 border-b border-primary/30">
        <div className="max-w-7xl mx-auto px-4 py-3 flex items-center justify-between">
          <img src={logo} alt="Brightfolks Logo" className="h-10 w-auto" />
          <Badge variant="secondary" className="text-xs">Super Admin</Badge>
          <div className="flex items-center gap-2">
            <NotificationBell />
            <Button variant="outline" size="sm" onClick={handleLogout}
              className="border-pink-400 text-pink-500 hover:bg-pink-50">
              <LogOut className="h-4 w-4 mr-1" /> Logout
            </Button>
          </div>
        </div>
        <div className="max-w-7xl mx-auto px-4 pb-4">
          <h1 className="text-2xl font-bold text-gray-800">Platform Dashboard</h1>
          <p className="text-sm text-muted-foreground">Manage all ESL centers on the platform</p>
        </div>
      </div>

      <div className="max-w-7xl mx-auto px-4 py-8 space-y-8">
        {/* Stats */}
        <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
          {[
            { label: "Total Companies", value: stats?.total_companies, icon: Building2 },
            { label: "Active", value: stats?.active_companies, icon: CheckCircle },
            { label: "Pending Approval", value: stats?.pending_companies, icon: Clock },
            { label: "Total Students", value: stats?.total_students, icon: Users },
            { label: "Total Teachers", value: stats?.total_teachers, icon: Users },
          ].map(({ label, value, icon: Icon }) => (
            <Card key={label}>
              <CardContent className="pt-4 flex items-center gap-3">
                <Icon className="h-5 w-5 text-primary shrink-0" />
                <div>
                  <p className="text-2xl font-bold">{value ?? 0}</p>
                  <p className="text-xs text-muted-foreground">{label}</p>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>

        {/* Pending Approvals */}
        {pendingCompanies.length > 0 && (
          <Card>
            <CardHeader>
              <CardTitle className="text-base flex items-center gap-2">
                <Clock className="h-4 w-4 text-yellow-500" />
                Pending Approval ({pendingCompanies.length})
              </CardTitle>
            </CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Company</TableHead>
                    <TableHead>Email</TableHead>
                    <TableHead>Plan</TableHead>
                    <TableHead>Applied</TableHead>
                    <TableHead>Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {pendingCompanies.map((company) => (
                    <TableRow key={company.id}>
                      <TableCell className="font-medium">{company.name}</TableCell>
                      <TableCell>{company.email}</TableCell>
                      <TableCell>
                        <span className="text-xs">{company.plan_name}</span>
                      </TableCell>
                      <TableCell className="text-xs text-muted-foreground">
                        {new Date(company.created_at).toLocaleDateString()}
                      </TableCell>
                      <TableCell>
                        <div className="flex gap-2">
                          <Button size="sm" onClick={() => handleApprove(company.id)}
                            disabled={actionLoading === company.id}>
                            {actionLoading === company.id
                              ? <Loader2 className="h-3 w-3 animate-spin" />
                              : "Approve"}
                          </Button>
                          <Button size="sm" variant="destructive"
                            onClick={() => handleReject(company.id)}
                            disabled={actionLoading === company.id}>
                            Reject
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        )}

        {/* Upgrade Requests */}
        {upgradeRequests.filter(r => r.status === "pending").length > 0 && (
          <Card>
            <CardHeader>
              <CardTitle className="text-base flex items-center gap-2">
                <ArrowUpCircle className="h-4 w-4 text-blue-500" />
                Plan Upgrade Requests ({upgradeRequests.filter(r => r.status === "pending").length})
              </CardTitle>
            </CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Company</TableHead>
                    <TableHead>Current Plan</TableHead>
                    <TableHead>Requested Plan</TableHead>
                    <TableHead>Price/mo</TableHead>
                    <TableHead>Submitted</TableHead>
                    <TableHead>Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {upgradeRequests.filter(r => r.status === "pending").map((req) => (
                    <TableRow key={req.id}>
                      <TableCell>
                        <div className="font-medium text-sm">{req.company_name}</div>
                        <div className="text-xs text-muted-foreground">{req.company_email}</div>
                      </TableCell>
                      <TableCell className="text-xs">{req.current_plan || "Free Trial"}</TableCell>
                      <TableCell className="text-xs font-medium">{req.requested_plan}</TableCell>
                      <TableCell className="text-xs">₱{req.price_monthly.toLocaleString()}/mo</TableCell>
                      <TableCell className="text-xs text-muted-foreground">
                        {new Date(req.created_at).toLocaleDateString()}
                      </TableCell>
                      <TableCell>
                        <div className="flex gap-2">
                          <Button size="sm" onClick={() => handleApproveUpgrade(req.id)}
                            disabled={upgradeActionLoading === req.id}>
                            {upgradeActionLoading === req.id
                              ? <Loader2 className="h-3 w-3 animate-spin" />
                              : "Approve"}
                          </Button>
                          <Button size="sm" variant="destructive"
                            onClick={() => handleRejectUpgrade(req.id)}
                            disabled={upgradeActionLoading === req.id}>
                            Reject
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        )}

        {/* Analytics */}
        {saAnalytics && (
          <div className="space-y-4">
            <div className="flex items-center gap-2">
              <BarChart2 className="h-5 w-5 text-primary" />
              <h2 className="font-semibold text-sm">Platform Analytics</h2>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div className="bg-white rounded-xl border shadow-sm p-4">
                <p className="text-xs text-muted-foreground">Total Companies</p>
                <p className="text-2xl font-bold">{saAnalytics.totals.totalCompanies}</p>
              </div>
              <div className="bg-white rounded-xl border shadow-sm p-4">
                <p className="text-xs text-muted-foreground">Total Sessions</p>
                <p className="text-2xl font-bold">{saAnalytics.totals.totalSessions}</p>
              </div>
              <div className="bg-white rounded-xl border shadow-sm p-4">
                <p className="text-xs text-muted-foreground">Est. Total Revenue</p>
                <p className="text-2xl font-bold">₱{Number(saAnalytics.totals.totalRevenue || 0).toLocaleString()}</p>
              </div>
            </div>
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm font-semibold">Company Growth</CardTitle>
                </CardHeader>
                <CardContent>
                  <ResponsiveContainer width="100%" height={180}>
                    <LineChart data={saAnalytics.companyGrowth} margin={{ top: 4, right: 8, left: -10, bottom: 0 }}>
                      <CartesianGrid strokeDasharray="3 3" />
                      <XAxis dataKey="month" tick={{ fontSize: 10 }} />
                      <YAxis tick={{ fontSize: 10 }} allowDecimals={false} />
                      <Tooltip />
                      <Line type="monotone" dataKey="companies" stroke="#65C3E8" strokeWidth={2} dot={{ r: 3 }} />
                    </LineChart>
                  </ResponsiveContainer>
                </CardContent>
              </Card>
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm font-semibold">Sessions Overall</CardTitle>
                </CardHeader>
                <CardContent>
                  <ResponsiveContainer width="100%" height={180}>
                    <BarChart data={saAnalytics.sessionsOverall} margin={{ top: 4, right: 8, left: -10, bottom: 0 }}>
                      <CartesianGrid strokeDasharray="3 3" />
                      <XAxis dataKey="month" tick={{ fontSize: 10 }} />
                      <YAxis tick={{ fontSize: 10 }} allowDecimals={false} />
                      <Tooltip />
                      <Bar dataKey="sessions" fill="#65C3E8" radius={[4, 4, 0, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                </CardContent>
              </Card>
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm font-semibold">Companies by Plan</CardTitle>
                </CardHeader>
                <CardContent className="flex items-center justify-center">
                  <ResponsiveContainer width="100%" height={180}>
                    <PieChart>
                      <Pie data={saAnalytics.byPlan} dataKey="count" nameKey="plan_name" cx="50%" cy="50%" outerRadius={60} label={(entry: { plan_name: string; count: number }) => `${entry.plan_name}: ${entry.count}`} labelLine={false}>
                        {saAnalytics.byPlan.map((_, i) => (
                          <Cell key={i} fill={["#65C3E8", "#4a9bb5", "#a8dff2", "#2e7a96", "#b8e8f8"][i % 5]} />
                        ))}
                      </Pie>
                      <Tooltip />
                      <Legend />
                    </PieChart>
                  </ResponsiveContainer>
                </CardContent>
              </Card>
            </div>
          </div>
        )}

        {/* Subscription Plans */}
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-3">
            <CardTitle className="text-base flex items-center gap-2">
              <PackagePlus className="h-4 w-4 text-primary" />
              Subscription Plans
            </CardTitle>
            <Button size="sm" onClick={openAddPlan}>Add Plan</Button>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Name</TableHead>
                  <TableHead>Max Students</TableHead>
                  <TableHead>Max Teachers</TableHead>
                  <TableHead>Max Admins</TableHead>
                  <TableHead>Price/mo</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {plans.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={7} className="text-center text-muted-foreground text-sm py-8">
                      No plans yet
                    </TableCell>
                  </TableRow>
                ) : (
                  plans.map((plan) => (
                    <TableRow key={plan.id}>
                      <TableCell className="font-medium">{plan.name}</TableCell>
                      <TableCell>{plan.max_students}</TableCell>
                      <TableCell>{plan.max_teachers}</TableCell>
                      <TableCell>{plan.max_admins ?? 5}</TableCell>
                      <TableCell>₱{Number(plan.price_monthly).toLocaleString()}/mo</TableCell>
                      <TableCell>
                        <span className={`text-xs px-2 py-1 rounded-full font-medium ${plan.is_active ? 'bg-green-100 text-green-800' : 'bg-gray-100 text-gray-500'}`}>
                          {plan.is_active ? 'Active' : 'Disabled'}
                        </span>
                      </TableCell>
                      <TableCell>
                        <div className="flex gap-2">
                          <Button size="sm" variant="outline" className="text-xs" onClick={() => openEditPlan(plan)}>
                            <Pencil className="h-3 w-3 mr-1" /> Edit
                          </Button>
                          <Button
                            size="sm"
                            variant={plan.is_active ? "outline" : "default"}
                            className="text-xs"
                            disabled={planToggleLoading === plan.id}
                            onClick={() => handleTogglePlan(plan)}
                          >
                            {planToggleLoading === plan.id
                              ? <Loader2 className="h-3 w-3 animate-spin" />
                              : plan.is_active ? 'Disable' : 'Enable'}
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </CardContent>
        </Card>

        {/* All Companies */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base">All Companies</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Company</TableHead>
                  <TableHead>Plan</TableHead>
                  <TableHead>Students</TableHead>
                  <TableHead>Teachers</TableHead>
                  <TableHead>Classes/wk</TableHead>
                  <TableHead>Due Date</TableHead>
                  <TableHead>Payment</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {allOtherCompanies.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={9} className="text-center text-muted-foreground text-sm py-8">
                      No companies yet
                    </TableCell>
                  </TableRow>
                ) : (
                  allOtherCompanies.map((company) => {
                    const payment = getPaymentStatus(company);
                    return (
                    <TableRow key={company.id}>
                      <TableCell>
                        <div className="font-medium text-sm">{company.name}</div>
                        <div className="text-xs text-muted-foreground">{company.email}</div>
                      </TableCell>
                      <TableCell className="text-xs">{company.plan_name}</TableCell>
                      <TableCell className="text-xs">{company.student_count}/{company.max_students}</TableCell>
                      <TableCell className="text-xs">{company.teacher_count}/{company.max_teachers}</TableCell>
                      <TableCell className="text-xs">{company.weekly_classes}</TableCell>
                      <TableCell className="text-xs text-muted-foreground">
                        {company.next_due_date
                          ? new Date(company.next_due_date).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })
                          : "—"}
                      </TableCell>
                      <TableCell>
                        <span className={`text-xs px-2 py-1 rounded-full font-medium ${payment.cls}`}>
                          {payment.label}
                        </span>
                      </TableCell>
                      <TableCell>
                        <span className={`text-xs px-2 py-1 rounded-full font-medium ${statusColors[company.status] ?? ''}`}>
                          {company.status}
                        </span>
                      </TableCell>
                      <TableCell>
                        <div className="flex flex-wrap gap-1">
                          <Button size="sm" variant="outline" className="text-xs"
                            onClick={() => setSelectedCompany(company)}>
                            View
                          </Button>
                          {company.status === "active" && company.next_due_date && (
                            <Button size="sm" variant="outline" className="text-xs text-green-700 border-green-300"
                              onClick={() => handleMarkPaid(company.id)}
                              disabled={markPaidLoading === company.id}>
                              {markPaidLoading === company.id ? <Loader2 className="h-3 w-3 animate-spin" /> : "Mark Paid"}
                            </Button>
                          )}
                          {company.status === "active" && (
                            <Button size="sm" variant="outline" className="text-xs"
                              onClick={() => handleSuspend(company.id)}
                              disabled={actionLoading === company.id}>
                              Suspend
                            </Button>
                          )}
                          {(company.status === "active" || company.status === "suspended") && (
                            <Button size="sm" variant="outline" className="text-xs text-red-600 border-red-300"
                              onClick={() => handleLock(company.id)}
                              disabled={lockLoading === company.id}>
                              {lockLoading === company.id ? <Loader2 className="h-3 w-3 animate-spin" /> : "Lock"}
                            </Button>
                          )}
                          {company.status === "locked" && (
                            <Button size="sm" className="text-xs"
                              onClick={() => handleUnlock(company.id)}
                              disabled={lockLoading === company.id}>
                              {lockLoading === company.id ? <Loader2 className="h-3 w-3 animate-spin" /> : "Unlock"}
                            </Button>
                          )}
                          {company.status === "suspended" && (
                            <Button size="sm" className="text-xs"
                              onClick={() => handleApprove(company.id)}
                              disabled={actionLoading === company.id}>
                              Reactivate
                            </Button>
                          )}
                        </div>
                      </TableCell>
                    </TableRow>
                    );
                  })
                )}
              </TableBody>
            </Table>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>

    {/* Company Profile Modal */}
    <Dialog open={!!selectedCompany} onOpenChange={() => setSelectedCompany(null)}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>{selectedCompany?.name}</DialogTitle>
        </DialogHeader>
        {selectedCompany && (
          <div className="space-y-4 text-sm">
            <div className="grid grid-cols-2 gap-3">
              <div>
                <p className="text-xs text-muted-foreground">Email</p>
                <p className="font-medium">{selectedCompany.email}</p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Phone</p>
                <p className="font-medium">{selectedCompany.phone || "—"}</p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Address</p>
                <p className="font-medium">{selectedCompany.address || "—"}</p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Status</p>
                <span className={`text-xs px-2 py-1 rounded-full font-medium ${statusColors[selectedCompany.status] ?? ''}`}>
                  {selectedCompany.status}
                </span>
              </div>
            </div>
            <hr />
            <div className="grid grid-cols-3 gap-3 text-center">
              <div className="rounded-lg bg-primary/10 p-3">
                <p className="text-2xl font-bold">{selectedCompany.student_count}</p>
                <p className="text-xs text-muted-foreground">Students</p>
                <p className="text-xs text-muted-foreground">/ {selectedCompany.max_students} max</p>
              </div>
              <div className="rounded-lg bg-primary/10 p-3">
                <p className="text-2xl font-bold">{selectedCompany.teacher_count}</p>
                <p className="text-xs text-muted-foreground">Teachers</p>
                <p className="text-xs text-muted-foreground">/ {selectedCompany.max_teachers} max</p>
              </div>
              <div className="rounded-lg bg-primary/10 p-3">
                <p className="text-2xl font-bold">{selectedCompany.weekly_classes}</p>
                <p className="text-xs text-muted-foreground">Classes</p>
                <p className="text-xs text-muted-foreground">this week</p>
              </div>
            </div>
            <hr />
            <div className="grid grid-cols-2 gap-3">
              <div>
                <p className="text-xs text-muted-foreground">Plan</p>
                <p className="font-medium">{selectedCompany.plan_name} — ₱{Number(selectedCompany.price_monthly).toLocaleString()}/mo</p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Approved</p>
                <p className="font-medium">{selectedCompany.approved_at ? new Date(selectedCompany.approved_at).toLocaleDateString() : "—"}</p>
              </div>
              {selectedCompany.trial_ends_at && (
                <div>
                  <p className="text-xs text-muted-foreground">Trial Ends</p>
                  <p className="font-medium">{new Date(selectedCompany.trial_ends_at).toLocaleDateString()}</p>
                </div>
              )}
              <div>
                <p className="text-xs text-muted-foreground">Next Due Date</p>
                <p className="font-medium">{selectedCompany.next_due_date ? new Date(selectedCompany.next_due_date).toLocaleDateString() : "—"}</p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Last Paid</p>
                <p className="font-medium">{selectedCompany.last_paid_at ? new Date(selectedCompany.last_paid_at).toLocaleDateString() : "Never"}</p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Payment Status</p>
                {(() => { const p = getPaymentStatus(selectedCompany); return <span className={`text-xs px-2 py-1 rounded-full font-medium ${p.cls}`}>{p.label}</span>; })()}
              </div>
            </div>
          </div>
        )}
        <DialogFooter>
          <Button variant="outline" onClick={() => setSelectedCompany(null)}>Close</Button>
          {selectedCompany?.status === 'active' && selectedCompany.next_due_date && (
            <Button className="text-xs" onClick={() => { handleMarkPaid(selectedCompany.id); setSelectedCompany(null); }}>
              Mark as Paid
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>

    {/* Add / Edit Plan Modal */}
    <Dialog open={showPlanModal} onOpenChange={setShowPlanModal}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{editPlan ? 'Edit Plan' : 'Add Subscription Plan'}</DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <div>
            <Label>Plan Name</Label>
            <Input value={planForm.name} onChange={e => setPlanForm(f => ({ ...f, name: e.target.value }))} placeholder="e.g. Basic" />
          </div>
          <div className="grid grid-cols-3 gap-3">
            <div>
              <Label>Max Students</Label>
              <Input type="number" min="1" value={planForm.max_students} onChange={e => setPlanForm(f => ({ ...f, max_students: e.target.value }))} />
            </div>
            <div>
              <Label>Max Teachers</Label>
              <Input type="number" min="1" value={planForm.max_teachers} onChange={e => setPlanForm(f => ({ ...f, max_teachers: e.target.value }))} />
            </div>
            <div>
              <Label>Max Admins</Label>
              <Input type="number" min="1" value={planForm.max_admins} onChange={e => setPlanForm(f => ({ ...f, max_admins: e.target.value }))} placeholder="5" />
            </div>
          </div>
          <div>
            <Label>Price / month (₱)</Label>
            <Input type="number" min="0" value={planForm.price_monthly} onChange={e => setPlanForm(f => ({ ...f, price_monthly: e.target.value }))} />
          </div>
          <div>
            <Label>Description (optional)</Label>
            <Input value={planForm.description} onChange={e => setPlanForm(f => ({ ...f, description: e.target.value }))} placeholder="Brief description" />
          </div>
        </div>
        <DialogFooter className="mt-4">
          <Button variant="outline" onClick={() => setShowPlanModal(false)}>Cancel</Button>
          <Button onClick={handlePlanSubmit} disabled={planLoading || !planForm.name || !planForm.max_students || !planForm.max_teachers || planForm.price_monthly === ''}>
            {planLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : editPlan ? 'Save Changes' : 'Create Plan'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  </>
  );
};

export default SuperAdminDashboard;
