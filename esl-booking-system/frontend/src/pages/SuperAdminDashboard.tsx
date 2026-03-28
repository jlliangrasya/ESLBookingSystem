import { useState, useEffect, useContext } from "react";
import axios from "axios";
import { useNavigate } from "react-router-dom";
import AuthContext from "@/context/AuthContext";
import { Button } from "@/components/ui/button";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Building2, Users, Clock, CheckCircle, LogOut, Loader2,
  ArrowUpCircle, PackagePlus, Pencil, BarChart2, ChevronLeft, Search,
  UserCog, CreditCard, AlertCircle, Database,
} from "lucide-react";
import {
  BarChart, Bar, LineChart, Line, PieChart, Pie, Cell,
  XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend,
} from "recharts";
import BrandLogo from "@/components/BrandLogo";
import NotificationBell from "@/components/NotificationBell";

// ─── Interfaces ────────────────────────────────────────────────────────────────
interface Stats {
  total_companies: number;
  active_companies: number;
  pending_companies: number;
  total_students: number;
  total_teachers: number;
}
interface Company {
  id: number;
  company_name: string;
  company_email: string;
  company_phone: string;
  company_address: string;
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
interface CompanyProfile {
  company: Company & { completed_classes: number; max_admins: number };
  users: CompanyUser[];
}
interface CompanyUser {
  id: number;
  name: string;
  email: string;
  role: string;
  is_owner: boolean;
  is_active: number;
  timezone: string;
  created_at: string;
}
interface AllUser extends CompanyUser {
  company_name: string | null;
  company_id: number | null;
}
interface CompanyPayment {
  id: number;
  amount: number;
  payment_date: string;
  period_start: string;
  period_end: string;
  notes: string | null;
  recorded_by_name: string | null;
  created_at: string;
}

interface SAAnalytics {
  companyGrowth: { month: string; companies: number }[];
  byPlan: { plan_name: string; count: number }[];
  sessionsOverall: { month: string; sessions: number }[];
  totals: { totalCompanies: number; totalSessions: number; totalRevenue: number };
}

type SAPage = "dashboard" | "companies" | "accounts" | "soa" | "backup";

interface BackupLog {
  id: number;
  backup_type: string;
  status: "success" | "failed";
  details: Record<string, unknown> | null;
  created_at: string;
}

// ─── Helpers ───────────────────────────────────────────────────────────────────
const statusColors: Record<string, string> = {
  pending: "bg-yellow-100 text-yellow-800",
  active: "bg-green-100 text-green-800",
  rejected: "bg-red-100 text-red-800",
  suspended: "bg-gray-100 text-gray-800",
  locked: "bg-red-100 text-red-700",
};

function getPaymentStatus(company: Company): { label: string; cls: string } {
  if (company.status === "locked") return { label: "Locked", cls: "bg-red-100 text-red-700" };
  if (!company.next_due_date) return { label: "N/A", cls: "bg-gray-100 text-gray-500" };
  const diffDays = Math.ceil((new Date(company.next_due_date).getTime() - Date.now()) / 86400000);
  if (diffDays < 0) return { label: "Overdue", cls: "bg-red-100 text-red-700" };
  if (diffDays <= 5) return { label: "Due Soon", cls: "bg-yellow-100 text-yellow-700" };
  return { label: "Paid", cls: "bg-green-100 text-green-700" };
}

const roleBadge = (role: string) => {
  const map: Record<string, string> = {
    company_admin: "bg-blue-100 text-blue-800",
    teacher: "bg-purple-100 text-purple-800",
    student: "bg-green-100 text-green-800",
  };
  return map[role] ?? "bg-gray-100 text-gray-700";
};

const emptyPlanForm = { name: "", max_students: "", max_teachers: "", max_admins: "", price_monthly: "", description: "" };

// ─── Component ─────────────────────────────────────────────────────────────────
const SuperAdminDashboard = () => {
  const [page, setPage] = useState<SAPage>("dashboard");

  // Dashboard data
  const [stats, setStats] = useState<Stats | null>(null);
  const [companies, setCompanies] = useState<Company[]>([]);
  const [upgradeRequests, setUpgradeRequests] = useState<UpgradeRequest[]>([]);
  const [plans, setPlans] = useState<Plan[]>([]);
  const [saAnalytics, setSaAnalytics] = useState<SAAnalytics | null>(null);
  const [loading, setLoading] = useState(true);

  // Companies page
  const [companySearch, setCompanySearch] = useState("");
  const [selectedCompanyId, setSelectedCompanyId] = useState<number | null>(null);
  const [companyProfile, setCompanyProfile] = useState<CompanyProfile | null>(null);
  const [profileLoading, setProfileLoading] = useState(false);

  // Accounts page
  const [allUsers, setAllUsers] = useState<AllUser[]>([]);
  const [usersLoading, setUsersLoading] = useState(false);
  const [userSearch, setUserSearch] = useState("");
  const [companyFilter, setCompanyFilter] = useState<"all" | "pending" | "near_expiry" | "active" | "suspended">("all");
  const [toggleLoading, setToggleLoading] = useState<number | null>(null);

  // SOA detail view
  const [soaCompany, setSoaCompany] = useState<Company | null>(null);
  const [paymentHistory, setPaymentHistory] = useState<CompanyPayment[]>([]);
  const [paymentHistoryLoading, setPaymentHistoryLoading] = useState(false);
  const [markPaidNotes, setMarkPaidNotes] = useState("");

  // Action states
  const [actionLoading, setActionLoading] = useState<number | null>(null);
  const [upgradeActionLoading, setUpgradeActionLoading] = useState<number | null>(null);
  const [lockLoading, setLockLoading] = useState<number | null>(null);
  const [markPaidLoading, setMarkPaidLoading] = useState<number | null>(null);

  // Backup logs
  const [backupLogs, setBackupLogs] = useState<BackupLog[]>([]);
  const [backupLogsLoading, setBackupLogsLoading] = useState(false);
  const [backupLogsTotal, setBackupLogsTotal] = useState(0);
  const [recordingBackup, setRecordingBackup] = useState(false);
  const [backupNotes, setBackupNotes] = useState("");

  // Plan modal
  const [showPlanModal, setShowPlanModal] = useState(false);
  const [editPlan, setEditPlan] = useState<Plan | null>(null);
  const [planForm, setPlanForm] = useState(emptyPlanForm);
  const [planLoading, setPlanLoading] = useState(false);
  const [planToggleLoading, setPlanToggleLoading] = useState<number | null>(null);

  const authContext = useContext(AuthContext);
  const navigate = useNavigate();
  const token = localStorage.getItem("token");
  const headers = { Authorization: `Bearer ${token}` };

  // ── Fetch core data ──────────────────────────────────────────────────────────
  const fetchData = async () => {
    try {
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

  // ── Fetch backup logs ────────────────────────────────────────────────────────
  const fetchBackupLogs = async () => {
    setBackupLogsLoading(true);
    try {
      const res = await axios.get(`${import.meta.env.VITE_API_URL}/api/super-admin/backup-logs`, { headers });
      setBackupLogs(res.data.logs);
      setBackupLogsTotal(res.data.total);
    } catch (err) {
      console.error(err);
    } finally {
      setBackupLogsLoading(false);
    }
  };

  const handleRecordBackup = async () => {
    setRecordingBackup(true);
    try {
      await axios.post(`${import.meta.env.VITE_API_URL}/api/super-admin/backup-logs`,
        { backup_type: "manual", status: "success", details: backupNotes ? { notes: backupNotes } : null },
        { headers }
      );
      setBackupNotes("");
      fetchBackupLogs();
    } catch (err) {
      console.error(err);
    } finally {
      setRecordingBackup(false);
    }
  };

  // ── Fetch company profile ────────────────────────────────────────────────────
  const fetchCompanyProfile = async (id: number) => {
    setProfileLoading(true);
    setCompanyProfile(null);
    try {
      const res = await axios.get(`${import.meta.env.VITE_API_URL}/api/super-admin/companies/${id}/profile`, { headers });
      setCompanyProfile(res.data);
    } catch (err) {
      console.error(err);
    } finally {
      setProfileLoading(false);
    }
  };

  // ── Fetch all users ──────────────────────────────────────────────────────────
  const fetchAllUsers = async () => {
    setUsersLoading(true);
    try {
      const res = await axios.get(`${import.meta.env.VITE_API_URL}/api/super-admin/all-users`, { headers });
      setAllUsers(res.data);
    } catch (err) {
      console.error(err);
    } finally {
      setUsersLoading(false);
    }
  };

  const fetchPaymentHistory = async (companyId: number) => {
    setPaymentHistoryLoading(true);
    try {
      const res = await axios.get(`${import.meta.env.VITE_API_URL}/api/super-admin/companies/${companyId}/payments`, { headers });
      setPaymentHistory(res.data);
    } catch (err) { console.error(err); }
    finally { setPaymentHistoryLoading(false); }
  };

  const openSoaCompany = (company: Company) => {
    setSoaCompany(company);
    fetchPaymentHistory(company.id);
    setMarkPaidNotes("");
  };

  useEffect(() => { fetchData(); }, []);
  useEffect(() => { if (page === "accounts") fetchAllUsers(); }, [page]);

  // ── Company actions ──────────────────────────────────────────────────────────
  const handleApprove = async (id: number) => {
    setActionLoading(id);
    try {
      await axios.post(`${import.meta.env.VITE_API_URL}/api/companies/${id}/approve`, {}, { headers });
      fetchData();
    } catch (err) { console.error(err); } finally { setActionLoading(null); }
  };
  const handleReject = async (id: number) => {
    setActionLoading(id);
    try {
      await axios.post(`${import.meta.env.VITE_API_URL}/api/companies/${id}/reject`, {}, { headers });
      fetchData();
    } catch (err) { console.error(err); } finally { setActionLoading(null); }
  };
  const handleSuspend = async (id: number) => {
    setActionLoading(id);
    try {
      await axios.post(`${import.meta.env.VITE_API_URL}/api/companies/${id}/suspend`, {}, { headers });
      fetchData();
    } catch (err) { console.error(err); } finally { setActionLoading(null); }
  };
  const handleLock = async (id: number) => {
    setLockLoading(id);
    try {
      await axios.post(`${import.meta.env.VITE_API_URL}/api/companies/${id}/lock`, {}, { headers });
      fetchData();
    } catch (err) { console.error(err); } finally { setLockLoading(null); }
  };
  const handleUnlock = async (id: number) => {
    setLockLoading(id);
    try {
      await axios.post(`${import.meta.env.VITE_API_URL}/api/companies/${id}/unlock`, {}, { headers });
      fetchData();
    } catch (err) { console.error(err); } finally { setLockLoading(null); }
  };
  const handleMarkPaid = async (id: number, notes?: string) => {
    setMarkPaidLoading(id);
    try {
      await axios.post(`${import.meta.env.VITE_API_URL}/api/companies/${id}/mark-paid`, { notes: notes || undefined }, { headers });
      fetchData();
      if (selectedCompanyId === id) fetchCompanyProfile(id);
      if (soaCompany?.id === id) {
        fetchPaymentHistory(id);
        setSoaCompany(prev => prev ? { ...prev, last_paid_at: new Date().toISOString() } : prev);
        setMarkPaidNotes("");
      }
    } catch (err) { console.error(err); } finally { setMarkPaidLoading(null); }
  };
  const handleApproveUpgrade = async (id: number) => {
    setUpgradeActionLoading(id);
    try {
      await axios.post(`${import.meta.env.VITE_API_URL}/api/super-admin/upgrade-requests/${id}/approve`, {}, { headers });
      fetchData();
    } catch (err) { console.error(err); } finally { setUpgradeActionLoading(null); }
  };
  const handleRejectUpgrade = async (id: number) => {
    setUpgradeActionLoading(id);
    try {
      await axios.post(`${import.meta.env.VITE_API_URL}/api/super-admin/upgrade-requests/${id}/reject`, {}, { headers });
      fetchData();
    } catch (err) { console.error(err); } finally { setUpgradeActionLoading(null); }
  };

  // ── User toggle ──────────────────────────────────────────────────────────────
  const handleToggleUser = async (userId: number, fromProfile = false) => {
    setToggleLoading(userId);
    try {
      await axios.patch(`${import.meta.env.VITE_API_URL}/api/super-admin/users/${userId}/toggle-status`, {}, { headers });
      if (fromProfile && selectedCompanyId) fetchCompanyProfile(selectedCompanyId);
      else fetchAllUsers();
    } catch (err) { console.error(err); } finally { setToggleLoading(null); }
  };

  // ── Plan actions ─────────────────────────────────────────────────────────────
  const openAddPlan = () => { setEditPlan(null); setPlanForm(emptyPlanForm); setShowPlanModal(true); };
  const openEditPlan = (plan: Plan) => {
    setEditPlan(plan);
    setPlanForm({ name: plan.name, max_students: String(plan.max_students), max_teachers: String(plan.max_teachers), max_admins: String(plan.max_admins ?? 5), price_monthly: String(plan.price_monthly), description: plan.description || "" });
    setShowPlanModal(true);
  };
  const handlePlanSubmit = async () => {
    setPlanLoading(true);
    try {
      const payload = { name: planForm.name, max_students: Number(planForm.max_students), max_teachers: Number(planForm.max_teachers), max_admins: Number(planForm.max_admins) || 5, price_monthly: Number(planForm.price_monthly), description: planForm.description || null };
      if (editPlan) await axios.put(`${import.meta.env.VITE_API_URL}/api/super-admin/plans/${editPlan.id}`, payload, { headers });
      else await axios.post(`${import.meta.env.VITE_API_URL}/api/super-admin/plans`, payload, { headers });
      setShowPlanModal(false);
      fetchData();
    } catch (err) { console.error(err); } finally { setPlanLoading(false); }
  };
  const handleTogglePlan = async (plan: Plan) => {
    setPlanToggleLoading(plan.id);
    try {
      await axios.post(`${import.meta.env.VITE_API_URL}/api/super-admin/plans/${plan.id}/${plan.is_active ? "disable" : "enable"}`, {}, { headers });
      fetchData();
    } catch (err) { console.error(err); } finally { setPlanToggleLoading(null); }
  };

  const handleLogout = () => { authContext?.logout(); navigate("/"); };

  // ── Derived ──────────────────────────────────────────────────────────────────
  const pendingCompanies = companies.filter(c => c.status === "pending");
  const nearExpiryCompanies = companies.filter(c => {
    if (!c.next_due_date) return false;
    const diffDays = Math.ceil((new Date(c.next_due_date).getTime() - Date.now()) / 86400000);
    return diffDays >= 0 && diffDays <= 7;
  });

  const filteredCompanies = companies.filter(c => {
    const matchesSearch = (c.company_name ?? "").toLowerCase().includes(companySearch.toLowerCase()) ||
      (c.company_email ?? "").toLowerCase().includes(companySearch.toLowerCase());
    if (!matchesSearch) return false;
    if (companyFilter === "pending") return c.status === "pending";
    if (companyFilter === "near_expiry") {
      if (!c.next_due_date) return false;
      const diffDays = Math.ceil((new Date(c.next_due_date).getTime() - Date.now()) / 86400000);
      return diffDays >= 0 && diffDays <= 7;
    }
    if (companyFilter === "active") return c.status === "active";
    if (companyFilter === "suspended") return c.status === "suspended";
    return true;
  });
  const filteredUsers = allUsers.filter(u =>
    u.name.toLowerCase().includes(userSearch.toLowerCase()) ||
    u.email.toLowerCase().includes(userSearch.toLowerCase()) ||
    (u.company_name ?? "").toLowerCase().includes(userSearch.toLowerCase())
  );

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  // ── Company Profile view (sub-view of Companies page) ────────────────────────
  const renderCompanyProfile = () => {
    if (profileLoading) return <div className="flex justify-center py-20"><Loader2 className="h-8 w-8 animate-spin text-primary" /></div>;
    if (!companyProfile) return null;
    const { company, users } = companyProfile;
    const payment = getPaymentStatus(company);
    return (
      <div className="space-y-6">
        {/* Back */}
        <Button variant="outline" size="sm" onClick={() => { setSelectedCompanyId(null); setCompanyProfile(null); }}>
          <ChevronLeft className="h-4 w-4 mr-1" /> Back to Companies
        </Button>

        {/* Header card */}
        <Card>
          <CardContent className="pt-5">
            <div className="flex items-start justify-between gap-4 flex-wrap">
              <div>
                <h2 className="text-xl font-bold">{company.company_name}</h2>
                <p className="text-sm text-muted-foreground">{company.company_email}</p>
                {company.company_phone && <p className="text-sm text-muted-foreground">{company.company_phone}</p>}
                {company.company_address && <p className="text-sm text-muted-foreground">{company.company_address}</p>}
              </div>
              <div className="flex flex-col gap-2 items-end">
                <span className={`text-xs px-3 py-1 rounded-full font-semibold ${statusColors[company.status] ?? ""}`}>
                  {company.status.toUpperCase()}
                </span>
                <span className={`text-xs px-3 py-1 rounded-full font-medium ${payment.cls}`}>
                  Payment: {payment.label}
                </span>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Stats */}
        <div className="grid grid-cols-3 gap-4">
          {[
            { label: "Students", value: `${company.student_count} / ${company.max_students}`, sub: "enrolled / max" },
            { label: "Teachers", value: `${company.teacher_count} / ${company.max_teachers}`, sub: "active / max" },
            { label: "Completed Classes", value: company.completed_classes, sub: "all time" },
          ].map(({ label, value, sub }) => (
            <Card key={label}>
              <CardContent className="pt-5 text-center">
                <p className="text-2xl font-bold">{value}</p>
                <p className="text-sm font-medium text-muted-foreground">{label}</p>
                <p className="text-xs text-muted-foreground">{sub}</p>
              </CardContent>
            </Card>
          ))}
        </div>

        {/* Subscription & Payment */}
        <Card>
          <CardHeader><CardTitle className="text-sm">Subscription & Payment</CardTitle></CardHeader>
          <CardContent>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
              <div>
                <p className="text-xs text-muted-foreground">Plan</p>
                <p className="font-semibold">{company.plan_name}</p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Price</p>
                <p className="font-semibold">₱{Number(company.price_monthly).toLocaleString()}/mo</p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Last Paid</p>
                <p className="font-semibold">{company.last_paid_at ? new Date(company.last_paid_at).toLocaleDateString() : "Never"}</p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Next Due</p>
                <p className="font-semibold">{company.next_due_date ? new Date(company.next_due_date).toLocaleDateString() : "—"}</p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Trial Ends</p>
                <p className="font-semibold">{company.trial_ends_at ? new Date(company.trial_ends_at).toLocaleDateString() : "—"}</p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Approved At</p>
                <p className="font-semibold">{company.approved_at ? new Date(company.approved_at).toLocaleDateString() : "—"}</p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Approved By</p>
                <p className="font-semibold">{company.approved_by_name || "—"}</p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Registered</p>
                <p className="font-semibold">{new Date(company.created_at).toLocaleDateString()}</p>
              </div>
            </div>
            <div className="flex gap-2 mt-4 flex-wrap">
              {company.status === "active" && company.next_due_date && (
                <Button size="sm" variant="outline" className="text-green-700 border-green-300"
                  onClick={() => handleMarkPaid(company.id)} disabled={markPaidLoading === company.id}>
                  {markPaidLoading === company.id ? <Loader2 className="h-3 w-3 animate-spin" /> : "Mark Paid"}
                </Button>
              )}
              {company.status === "active" && (
                <Button size="sm" variant="outline" onClick={() => handleSuspend(company.id)} disabled={actionLoading === company.id}>
                  Suspend
                </Button>
              )}
              {(company.status === "active" || company.status === "suspended") && (
                <Button size="sm" variant="outline" className="text-red-600 border-red-300"
                  onClick={() => handleLock(company.id)} disabled={lockLoading === company.id}>
                  {lockLoading === company.id ? <Loader2 className="h-3 w-3 animate-spin" /> : "Lock"}
                </Button>
              )}
              {company.status === "locked" && (
                <Button size="sm" onClick={() => handleUnlock(company.id)} disabled={lockLoading === company.id}>
                  {lockLoading === company.id ? <Loader2 className="h-3 w-3 animate-spin" /> : "Unlock"}
                </Button>
              )}
              {company.status === "suspended" && (
                <Button size="sm" onClick={() => handleApprove(company.id)} disabled={actionLoading === company.id}>
                  Reactivate
                </Button>
              )}
            </div>
          </CardContent>
        </Card>

        {/* Accounts */}
        <Card>
          <CardHeader><CardTitle className="text-sm">Accounts ({users.length})</CardTitle></CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Name</TableHead>
                  <TableHead>Email</TableHead>
                  <TableHead>Role</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Action</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {users.length === 0 ? (
                  <TableRow><TableCell colSpan={5} className="text-center text-muted-foreground py-6 text-sm">No accounts yet</TableCell></TableRow>
                ) : users.map(u => (
                  <TableRow key={u.id}>
                    <TableCell className="font-medium text-sm">
                      {u.name}
                      {u.is_owner ? <span className="ml-1 text-xs text-yellow-600">(owner)</span> : null}
                    </TableCell>
                    <TableCell className="text-xs text-muted-foreground">{u.email}</TableCell>
                    <TableCell>
                      <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${roleBadge(u.role)}`}>
                        {u.role.replace("_", " ")}
                      </span>
                    </TableCell>
                    <TableCell>
                      <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${u.is_active ? "bg-green-100 text-green-700" : "bg-red-100 text-red-700"}`}>
                        {u.is_active ? "Active" : "Inactive"}
                      </span>
                    </TableCell>
                    <TableCell>
                      <Button size="sm" variant="outline" className="text-xs"
                        disabled={toggleLoading === u.id}
                        onClick={() => handleToggleUser(u.id, true)}>
                        {toggleLoading === u.id ? <Loader2 className="h-3 w-3 animate-spin" /> : u.is_active ? "Deactivate" : "Activate"}
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      </div>
    );
  };

  // ── Pages ────────────────────────────────────────────────────────────────────
  const renderDashboard = () => (
    <div className="space-y-8">
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
                {pendingCompanies.map(company => (
                  <TableRow key={company.id}>
                    <TableCell className="font-medium">{company.company_name}</TableCell>
                    <TableCell>{company.company_email}</TableCell>
                    <TableCell><span className="text-xs">{company.plan_name}</span></TableCell>
                    <TableCell className="text-xs text-muted-foreground">{new Date(company.created_at).toLocaleDateString()}</TableCell>
                    <TableCell>
                      <div className="flex gap-2">
                        <Button size="sm" onClick={() => handleApprove(company.id)} disabled={actionLoading === company.id}>
                          {actionLoading === company.id ? <Loader2 className="h-3 w-3 animate-spin" /> : "Approve"}
                        </Button>
                        <Button size="sm" variant="destructive" onClick={() => handleReject(company.id)} disabled={actionLoading === company.id}>
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
                {upgradeRequests.filter(r => r.status === "pending").map(req => (
                  <TableRow key={req.id}>
                    <TableCell>
                      <div className="font-medium text-sm">{req.company_name}</div>
                      <div className="text-xs text-muted-foreground">{req.company_email}</div>
                    </TableCell>
                    <TableCell className="text-xs">{req.current_plan || "Free Trial"}</TableCell>
                    <TableCell className="text-xs font-medium">{req.requested_plan}</TableCell>
                    <TableCell className="text-xs">₱{req.price_monthly.toLocaleString()}/mo</TableCell>
                    <TableCell className="text-xs text-muted-foreground">{new Date(req.created_at).toLocaleDateString()}</TableCell>
                    <TableCell>
                      <div className="flex gap-2">
                        <Button size="sm" onClick={() => handleApproveUpgrade(req.id)} disabled={upgradeActionLoading === req.id}>
                          {upgradeActionLoading === req.id ? <Loader2 className="h-3 w-3 animate-spin" /> : "Approve"}
                        </Button>
                        <Button size="sm" variant="destructive" onClick={() => handleRejectUpgrade(req.id)} disabled={upgradeActionLoading === req.id}>
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
            {[
              { label: "Total Companies", value: saAnalytics.totals.totalCompanies },
              { label: "Total Sessions", value: saAnalytics.totals.totalSessions },
              { label: "Est. Total Revenue", value: `₱${Number(saAnalytics.totals.totalRevenue || 0).toLocaleString()}` },
            ].map(({ label, value }) => (
              <div key={label} className="bg-white rounded-xl border shadow-sm p-4">
                <p className="text-xs text-muted-foreground">{label}</p>
                <p className="text-2xl font-bold">{value}</p>
              </div>
            ))}
          </div>
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
            <Card>
              <CardHeader className="pb-2"><CardTitle className="text-sm font-semibold">Company Growth</CardTitle></CardHeader>
              <CardContent>
                <ResponsiveContainer width="100%" height={180}>
                  <LineChart data={saAnalytics.companyGrowth} margin={{ top: 4, right: 8, left: -10, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis dataKey="month" tick={{ fontSize: 10 }} />
                    <YAxis tick={{ fontSize: 10 }} allowDecimals={false} />
                    <Tooltip />
                    <Line type="monotone" dataKey="companies" stroke="#4A9EAF" strokeWidth={2} dot={{ r: 3, fill: "#4A9EAF" }} />
                  </LineChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="pb-2"><CardTitle className="text-sm font-semibold">Sessions Overall</CardTitle></CardHeader>
              <CardContent>
                <ResponsiveContainer width="100%" height={180}>
                  <BarChart data={saAnalytics.sessionsOverall} margin={{ top: 4, right: 8, left: -10, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis dataKey="month" tick={{ fontSize: 10 }} />
                    <YAxis tick={{ fontSize: 10 }} allowDecimals={false} />
                    <Tooltip />
                    <Bar dataKey="sessions" fill="#F4A261" radius={[4, 4, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="pb-2"><CardTitle className="text-sm font-semibold">Companies by Plan</CardTitle></CardHeader>
              <CardContent className="flex items-center justify-center">
                <ResponsiveContainer width="100%" height={180}>
                  <PieChart>
                    <Pie data={saAnalytics.byPlan} dataKey="count" nameKey="plan_name" cx="50%" cy="50%" outerRadius={60}
                      // eslint-disable-next-line @typescript-eslint/no-explicit-any
                      label={(entry: any) => `${entry.plan_name}: ${entry.count}`} labelLine={false}>
                      {saAnalytics.byPlan.map((_, i) => (
                        <Cell key={i} fill={["#4A9EAF", "#E76F7A", "#F4A261", "#7EC8A0", "#6BBAD0"][i % 5]} />
                      ))}
                    </Pie>
                    <Tooltip /><Legend />
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
                <TableRow><TableCell colSpan={7} className="text-center text-muted-foreground text-sm py-8">No plans yet</TableCell></TableRow>
              ) : plans.map(plan => (
                <TableRow key={plan.id}>
                  <TableCell className="font-medium">{plan.name}</TableCell>
                  <TableCell>{plan.max_students}</TableCell>
                  <TableCell>{plan.max_teachers}</TableCell>
                  <TableCell>{plan.max_admins ?? 5}</TableCell>
                  <TableCell>₱{Number(plan.price_monthly).toLocaleString()}/mo</TableCell>
                  <TableCell>
                    <span className={`text-xs px-2 py-1 rounded-full font-medium ${plan.is_active ? "bg-green-100 text-green-800" : "bg-gray-100 text-gray-500"}`}>
                      {plan.is_active ? "Active" : "Disabled"}
                    </span>
                  </TableCell>
                  <TableCell>
                    <div className="flex gap-2">
                      <Button size="sm" variant="outline" className="text-xs" onClick={() => openEditPlan(plan)}>
                        <Pencil className="h-3 w-3 mr-1" /> Edit
                      </Button>
                      <Button size="sm" variant={plan.is_active ? "outline" : "default"} className="text-xs"
                        disabled={planToggleLoading === plan.id} onClick={() => handleTogglePlan(plan)}>
                        {planToggleLoading === plan.id ? <Loader2 className="h-3 w-3 animate-spin" /> : plan.is_active ? "Disable" : "Enable"}
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );

  const renderSOADetail = () => {
    if (!soaCompany) return null;
    const payment = getPaymentStatus(soaCompany);
    const totalPaid = paymentHistory.reduce((s, p) => s + Number(p.amount), 0);
    return (
      <div className="space-y-5">
        <Button variant="outline" size="sm" onClick={() => setSoaCompany(null)}>
          <ChevronLeft className="h-4 w-4 mr-1" /> Back to SOA
        </Button>

        {/* Header */}
        <div className="flex items-start justify-between flex-wrap gap-3">
          <div>
            <h2 className="text-xl font-bold">{soaCompany.company_name}</h2>
            <p className="text-sm text-muted-foreground">{soaCompany.company_email}</p>
          </div>
          <div className="flex gap-2 flex-wrap">
            <span className={`text-xs px-3 py-1 rounded-full font-semibold ${statusColors[soaCompany.status] ?? ""}`}>
              {soaCompany.status.toUpperCase()}
            </span>
            <span className={`text-xs px-3 py-1 rounded-full font-medium ${payment.cls}`}>
              {payment.label}
            </span>
          </div>
        </div>

        {/* Subscription details + billing summary */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
          <Card>
            <CardHeader className="pb-2"><CardTitle className="text-sm">Subscription Details</CardTitle></CardHeader>
            <CardContent>
              <dl className="grid grid-cols-2 gap-x-4 gap-y-3 text-sm">
                {[
                  { label: "Plan", value: soaCompany.plan_name },
                  { label: "Monthly Fee", value: Number(soaCompany.price_monthly) > 0 ? `₱${Number(soaCompany.price_monthly).toLocaleString()}` : "Free" },
                  { label: "Account Status", value: <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${statusColors[soaCompany.status] ?? ""}`}>{soaCompany.status}</span> },
                  { label: "Next Due", value: soaCompany.next_due_date ? new Date(soaCompany.next_due_date).toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" }) : "—" },
                  { label: "Last Paid", value: soaCompany.last_paid_at ? new Date(soaCompany.last_paid_at).toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" }) : "Never" },
                  { label: "Trial Ends", value: soaCompany.trial_ends_at ? new Date(soaCompany.trial_ends_at).toLocaleDateString() : "—" },
                  { label: "Approved", value: soaCompany.approved_at ? new Date(soaCompany.approved_at).toLocaleDateString() : "—" },
                  { label: "Approved By", value: soaCompany.approved_by_name || "—" },
                ].map(({ label, value }) => (
                  <div key={label}>
                    <dt className="text-xs text-muted-foreground">{label}</dt>
                    <dd className="font-medium">{value}</dd>
                  </div>
                ))}
              </dl>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-2"><CardTitle className="text-sm">Billing Summary</CardTitle></CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-2 gap-3">
                <div className="bg-green-50 rounded-lg p-3 text-center">
                  <p className="text-xl font-bold text-green-700">₱{totalPaid.toLocaleString()}</p>
                  <p className="text-xs text-muted-foreground">Total Paid (All Time)</p>
                </div>
                <div className="bg-blue-50 rounded-lg p-3 text-center">
                  <p className="text-xl font-bold text-blue-700">{paymentHistory.length}</p>
                  <p className="text-xs text-muted-foreground">Total Payments</p>
                </div>
              </div>

              {/* Mark Paid action */}
              {(soaCompany.status === "active" || soaCompany.status === "locked") && (
                <div className="border rounded-lg p-3 space-y-2">
                  <p className="text-xs font-medium text-muted-foreground">Record a payment</p>
                  <input
                    className="w-full border rounded px-3 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-primary"
                    placeholder="Notes (optional, e.g. GCash ref #123)"
                    value={markPaidNotes}
                    onChange={e => setMarkPaidNotes(e.target.value)}
                  />
                  <Button size="sm" className="w-full bg-green-600 hover:bg-green-700 text-white"
                    disabled={markPaidLoading === soaCompany.id}
                    onClick={() => handleMarkPaid(soaCompany.id, markPaidNotes)}>
                    {markPaidLoading === soaCompany.id
                      ? <Loader2 className="h-4 w-4 animate-spin" />
                      : "✓ Mark as Paid — Extend 1 Month"}
                  </Button>
                </div>
              )}
            </CardContent>
          </Card>
        </div>

        {/* Payment History */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm flex items-center gap-2">
              <CreditCard className="h-4 w-4 text-primary" /> Payment History
            </CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            {paymentHistoryLoading ? (
              <div className="flex justify-center py-10"><Loader2 className="h-6 w-6 animate-spin text-primary" /></div>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Payment Date</TableHead>
                    <TableHead>Amount</TableHead>
                    <TableHead>Period Covered</TableHead>
                    <TableHead>Recorded By</TableHead>
                    <TableHead>Notes</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {paymentHistory.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={5} className="text-center text-muted-foreground text-sm py-10">
                        No payment records yet. Use "Mark as Paid" above to record the first payment.
                      </TableCell>
                    </TableRow>
                  ) : paymentHistory.map(p => (
                    <TableRow key={p.id}>
                      <TableCell className="text-sm font-medium">
                        {new Date(p.payment_date).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}
                      </TableCell>
                      <TableCell className="text-sm font-semibold text-green-700">
                        ₱{Number(p.amount).toLocaleString()}
                      </TableCell>
                      <TableCell className="text-xs text-muted-foreground">
                        {new Date(p.period_start).toLocaleDateString("en-US", { month: "short", day: "numeric" })}
                        {" — "}
                        {new Date(p.period_end).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}
                      </TableCell>
                      <TableCell className="text-xs">{p.recorded_by_name || "—"}</TableCell>
                      <TableCell className="text-xs text-muted-foreground">{p.notes || "—"}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>
      </div>
    );
  };

  const renderSOA = () => {
    if (soaCompany) return renderSOADetail();
    return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-semibold">Statement of Accounts</h2>
          <p className="text-sm text-muted-foreground">Billing status and payment history for all companies</p>
        </div>
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {[
          { label: "Total Monthly Revenue", value: `₱${companies.filter(c => c.status === "active").reduce((sum, c) => sum + Number(c.price_monthly || 0), 0).toLocaleString()}`, cls: "text-green-600" },
          { label: "Active Subscriptions", value: companies.filter(c => c.status === "active").length, cls: "text-blue-600" },
          { label: "Overdue Payments", value: companies.filter(c => { if (!c.next_due_date) return false; return new Date(c.next_due_date) < new Date() && c.status === "active"; }).length, cls: "text-red-600" },
          { label: "Due Within 7 Days", value: nearExpiryCompanies.length, cls: "text-yellow-600" },
        ].map(({ label, value, cls }) => (
          <Card key={label}>
            <CardContent className="pt-4">
              <p className={`text-2xl font-bold ${cls}`}>{value}</p>
              <p className="text-xs text-muted-foreground mt-0.5">{label}</p>
            </CardContent>
          </Card>
        ))}
      </div>

      <Card>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Company</TableHead>
                  <TableHead>Plan</TableHead>
                  <TableHead>Monthly Fee</TableHead>
                  <TableHead>Account Status</TableHead>
                  <TableHead>Last Paid</TableHead>
                  <TableHead>Next Due</TableHead>
                  <TableHead>Payment Status</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {companies.length === 0 ? (
                  <TableRow><TableCell colSpan={7} className="text-center text-muted-foreground text-sm py-10">No companies</TableCell></TableRow>
                ) : [...companies].sort((a, b) => {
                  const score = (c: Company) => {
                    if (!c.next_due_date) return 3;
                    const d = Math.ceil((new Date(c.next_due_date).getTime() - Date.now()) / 86400000);
                    if (d < 0) return 0;
                    if (d <= 7) return 1;
                    return 2;
                  };
                  return score(a) - score(b);
                }).map(company => {
                  const payment = getPaymentStatus(company);
                  const isOverdue = company.next_due_date && new Date(company.next_due_date) < new Date() && company.status === "active";
                  return (
                    <TableRow key={company.id} className={`cursor-pointer hover:bg-muted/40 ${isOverdue ? "bg-red-50" : ""}`}
                      onClick={() => openSoaCompany(company)}>
                      <TableCell>
                        <span className="font-medium text-sm text-primary hover:underline">{company.company_name}</span>
                        <div className="text-xs text-muted-foreground">{company.company_email}</div>
                      </TableCell>
                      <TableCell className="text-xs">{company.plan_name}</TableCell>
                      <TableCell className="text-sm font-medium">
                        {Number(company.price_monthly) > 0 ? `₱${Number(company.price_monthly).toLocaleString()}/mo` : <span className="text-muted-foreground">Free</span>}
                      </TableCell>
                      <TableCell>
                        <span className={`text-xs px-2 py-1 rounded-full font-medium ${statusColors[company.status] ?? ""}`}>
                          {company.status}
                        </span>
                      </TableCell>
                      <TableCell className="text-xs text-muted-foreground">
                        {company.last_paid_at ? new Date(company.last_paid_at).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" }) : <span className="italic">Never</span>}
                      </TableCell>
                      <TableCell className="text-xs">
                        {company.next_due_date ? new Date(company.next_due_date).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" }) : "—"}
                      </TableCell>
                      <TableCell>
                        <span className={`text-xs px-2 py-1 rounded-full font-medium ${payment.cls}`}>{payment.label}</span>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>
    </div>
    );
  };

  const renderCompaniesPage = () => {
    if (selectedCompanyId && (companyProfile || profileLoading)) return renderCompanyProfile();
    return (
      <div className="space-y-4">
        {/* Search + filter chips */}
        <div className="flex flex-col sm:flex-row sm:items-center gap-3">
          <div className="relative flex-1 max-w-sm">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input placeholder="Search companies..." value={companySearch} onChange={e => setCompanySearch(e.target.value)} className="pl-9" />
          </div>
          <div className="flex flex-wrap gap-2">
            {(["all", "pending", "near_expiry", "active", "suspended"] as const).map(f => {
              const labels: Record<string, string> = { all: "All", pending: "Pending", near_expiry: "Near Expiry", active: "Active", suspended: "Suspended" };
              const counts: Record<string, number> = {
                all: companies.length,
                pending: companies.filter(c => c.status === "pending").length,
                near_expiry: nearExpiryCompanies.length,
                active: companies.filter(c => c.status === "active").length,
                suspended: companies.filter(c => c.status === "suspended").length,
              };
              return (
                <button key={f} onClick={() => setCompanyFilter(f)}
                  className={`text-xs px-3 py-1.5 rounded-full border font-medium transition-colors ${
                    companyFilter === f
                      ? "bg-primary text-white border-primary"
                      : "bg-white text-gray-600 border-gray-300 hover:border-primary hover:text-primary"
                  }`}>
                  {labels[f]} ({counts[f]})
                  {f === "near_expiry" && counts[f] > 0 && <AlertCircle className="inline h-3 w-3 ml-1 text-yellow-500" />}
                </button>
              );
            })}
          </div>
          <span className="text-sm text-muted-foreground whitespace-nowrap">{filteredCompanies.length} shown</span>
        </div>
        <Card>
          <CardContent className="p-0">
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Company</TableHead>
                    <TableHead>Plan</TableHead>
                    <TableHead>Students</TableHead>
                    <TableHead>Teachers</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Payment</TableHead>
                    <TableHead>Next Due</TableHead>
                    <TableHead>Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredCompanies.length === 0 ? (
                    <TableRow><TableCell colSpan={8} className="text-center text-muted-foreground text-sm py-10">No companies found</TableCell></TableRow>
                  ) : filteredCompanies.map(company => {
                    const payment = getPaymentStatus(company);
                    return (
                      <TableRow key={company.id} className="hover:bg-muted/30">
                        <TableCell>
                          <button
                            className="font-medium text-sm text-primary hover:underline text-left"
                            onClick={() => { setSelectedCompanyId(company.id); fetchCompanyProfile(company.id); }}
                          >
                            {company.company_name}
                          </button>
                          <div className="text-xs text-muted-foreground">{company.company_email}</div>
                        </TableCell>
                        <TableCell className="text-xs">{company.plan_name}</TableCell>
                        <TableCell className="text-xs">{company.student_count}/{company.max_students}</TableCell>
                        <TableCell className="text-xs">{company.teacher_count}/{company.max_teachers}</TableCell>
                        <TableCell>
                          <span className={`text-xs px-2 py-1 rounded-full font-medium ${statusColors[company.status] ?? ""}`}>
                            {company.status}
                          </span>
                        </TableCell>
                        <TableCell>
                          <span className={`text-xs px-2 py-1 rounded-full font-medium ${payment.cls}`}>{payment.label}</span>
                        </TableCell>
                        <TableCell className="text-xs text-muted-foreground">
                          {company.next_due_date ? new Date(company.next_due_date).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" }) : "—"}
                        </TableCell>
                        <TableCell>
                          <div className="flex flex-wrap gap-1">
                            {company.status === "pending" && (
                              <>
                                <Button size="sm" className="text-xs" onClick={() => handleApprove(company.id)} disabled={actionLoading === company.id}>
                                  {actionLoading === company.id ? <Loader2 className="h-3 w-3 animate-spin" /> : "Approve"}
                                </Button>
                                <Button size="sm" variant="destructive" className="text-xs" onClick={() => handleReject(company.id)} disabled={actionLoading === company.id}>
                                  Reject
                                </Button>
                              </>
                            )}
                            {company.status === "active" && company.next_due_date && (
                              <Button size="sm" variant="outline" className="text-xs text-green-700 border-green-300"
                                onClick={() => handleMarkPaid(company.id)} disabled={markPaidLoading === company.id}>
                                {markPaidLoading === company.id ? <Loader2 className="h-3 w-3 animate-spin" /> : "Mark Paid"}
                              </Button>
                            )}
                            {company.status === "active" && (
                              <Button size="sm" variant="outline" className="text-xs" onClick={() => handleSuspend(company.id)} disabled={actionLoading === company.id}>
                                Suspend
                              </Button>
                            )}
                            {(company.status === "active" || company.status === "suspended") && (
                              <Button size="sm" variant="outline" className="text-xs text-red-600 border-red-300"
                                onClick={() => handleLock(company.id)} disabled={lockLoading === company.id}>
                                {lockLoading === company.id ? <Loader2 className="h-3 w-3 animate-spin" /> : "Lock"}
                              </Button>
                            )}
                            {company.status === "locked" && (
                              <Button size="sm" className="text-xs" onClick={() => handleUnlock(company.id)} disabled={lockLoading === company.id}>
                                {lockLoading === company.id ? <Loader2 className="h-3 w-3 animate-spin" /> : "Unlock"}
                              </Button>
                            )}
                            {company.status === "suspended" && (
                              <Button size="sm" className="text-xs" onClick={() => handleApprove(company.id)} disabled={actionLoading === company.id}>
                                Reactivate
                              </Button>
                            )}
                          </div>
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </div>
          </CardContent>
        </Card>
      </div>
    );
  };

  const renderAccountsPage = () => (
    <div className="space-y-4">
      <div className="flex items-center gap-3">
        <div className="relative flex-1 max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input placeholder="Search by name, email, or company..." value={userSearch} onChange={e => setUserSearch(e.target.value)} className="pl-9" />
        </div>
        <span className="text-sm text-muted-foreground">{filteredUsers.length} accounts</span>
      </div>
      <Card>
        <CardContent className="p-0">
          {usersLoading ? (
            <div className="flex justify-center py-12"><Loader2 className="h-6 w-6 animate-spin text-primary" /></div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Name</TableHead>
                  <TableHead>Email</TableHead>
                  <TableHead>Company</TableHead>
                  <TableHead>Role</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Registered</TableHead>
                  <TableHead>Action</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredUsers.length === 0 ? (
                  <TableRow><TableCell colSpan={7} className="text-center text-muted-foreground text-sm py-10">No accounts found</TableCell></TableRow>
                ) : filteredUsers.map(u => (
                  <TableRow key={u.id}>
                    <TableCell className="font-medium text-sm">
                      {u.name}
                      {u.is_owner ? <span className="ml-1 text-xs text-yellow-600">(owner)</span> : null}
                    </TableCell>
                    <TableCell className="text-xs text-muted-foreground">{u.email}</TableCell>
                    <TableCell className="text-xs">{u.company_name || "—"}</TableCell>
                    <TableCell>
                      <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${roleBadge(u.role)}`}>
                        {u.role.replace("_", " ")}
                      </span>
                    </TableCell>
                    <TableCell>
                      <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${u.is_active ? "bg-green-100 text-green-700" : "bg-red-100 text-red-700"}`}>
                        {u.is_active ? "Active" : "Inactive"}
                      </span>
                    </TableCell>
                    <TableCell className="text-xs text-muted-foreground">{new Date(u.created_at).toLocaleDateString()}</TableCell>
                    <TableCell>
                      <Button size="sm" variant="outline" className="text-xs"
                        disabled={toggleLoading === u.id}
                        onClick={() => handleToggleUser(u.id, false)}>
                        {toggleLoading === u.id ? <Loader2 className="h-3 w-3 animate-spin" /> : u.is_active ? "Deactivate" : "Activate"}
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );

  // ── Backup Logs page ─────────────────────────────────────────────────────────
  const renderBackupPage = () => (
    <div className="space-y-4">
      <div>
        <h2 className="text-lg font-semibold">Backup Logs</h2>
        <p className="text-sm text-muted-foreground">Record and view manual database backup entries</p>
      </div>

      {/* Record Manual Backup */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm flex items-center gap-2">
            <Database className="h-4 w-4 text-primary" /> Record Manual Backup
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="flex gap-2 items-start">
            <Input
              type="text"
              placeholder="Optional notes (e.g. pre-update backup)"
              value={backupNotes}
              onChange={e => setBackupNotes(e.target.value)}
              className="flex-1"
            />
            <Button size="sm" onClick={handleRecordBackup} disabled={recordingBackup}>
              {recordingBackup ? <Loader2 className="h-3 w-3 animate-spin" /> : "Log Backup"}
            </Button>
          </div>
          <p className="text-xs text-muted-foreground">
            Use this to record that you performed a manual database backup (e.g. via mysqldump). This does not create a backup — it only logs that one was performed.
          </p>
        </CardContent>
      </Card>

      {/* Backup Log Table */}
      <Card>
        <CardHeader className="pb-2">
          <div className="flex items-center justify-between">
            <CardTitle className="text-sm">Log History ({backupLogsTotal} entries)</CardTitle>
            <Button variant="outline" size="sm" onClick={fetchBackupLogs} disabled={backupLogsLoading}>
              {backupLogsLoading ? <Loader2 className="h-3 w-3 animate-spin" /> : "Refresh"}
            </Button>
          </div>
        </CardHeader>
        <CardContent className="p-0">
          {backupLogsLoading ? (
            <div className="flex justify-center py-10"><Loader2 className="h-6 w-6 animate-spin text-primary" /></div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Date &amp; Time</TableHead>
                  <TableHead>Type</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Notes</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {backupLogs.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={4} className="text-center text-muted-foreground text-sm py-10">
                      No backup logs yet. Use the form above to record your first backup.
                    </TableCell>
                  </TableRow>
                ) : backupLogs.map(log => (
                  <TableRow key={log.id}>
                    <TableCell className="text-sm">
                      {new Date(log.created_at).toLocaleString("en-US", { dateStyle: "medium", timeStyle: "short" })}
                    </TableCell>
                    <TableCell>
                      <span className="text-xs px-2 py-1 rounded-full font-medium bg-blue-100 text-blue-700 capitalize">
                        {log.backup_type}
                      </span>
                    </TableCell>
                    <TableCell>
                      <span className={`text-xs px-2 py-1 rounded-full font-medium ${log.status === "success" ? "bg-green-100 text-green-700" : "bg-red-100 text-red-700"}`}>
                        {log.status}
                      </span>
                    </TableCell>
                    <TableCell className="text-xs text-muted-foreground">
                      {log.details ? (log.details as { notes?: string }).notes || JSON.stringify(log.details) : "—"}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );

  // ── Main render ──────────────────────────────────────────────────────────────
  const navItems: { key: SAPage; label: string; icon: React.FC<{ className?: string }> }[] = [
    { key: "dashboard", label: "Dashboard", icon: BarChart2 },
    { key: "companies", label: "Companies", icon: Building2 },
    { key: "accounts", label: "Accounts", icon: UserCog },
    { key: "soa", label: "Statement of Accounts", icon: CreditCard },
    { key: "backup", label: "Backup Logs", icon: Database },
  ];

  return (
    <>
      <div className="min-h-screen brand-gradient-subtle pattern-dots-light">
        {/* Top bar */}
        <header className="w-full brand-gradient shadow-lg sticky top-0 z-30">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between">
            {/* Logo */}
            <div className="flex items-center gap-2">
              <BrandLogo variant="white" />
            </div>

            {/* Nav icons + actions */}
            <nav className="flex items-center gap-5">
              {navItems.map(({ key, label, icon: Icon }) => (
                <button
                  key={key}
                  title={label}
                  onClick={() => { setPage(key); if (key !== "companies") { setSelectedCompanyId(null); setCompanyProfile(null); } if (key !== "soa") setSoaCompany(null); if (key === "backup") fetchBackupLogs(); }}
                  className={`flex flex-col items-center gap-0.5 transition-colors ${
                    page === key ? "text-white" : "text-white/60 hover:text-white"
                  }`}
                >
                  <Icon className="h-5 w-5" />
                  <span className="text-[10px] font-medium">{label === "Statement of Accounts" ? "SOA" : label}</span>
                </button>
              ))}

              <NotificationBell variant="white" />

              <Button variant="ghost" size="sm" onClick={handleLogout}
                className="text-white/60 hover:text-white hover:bg-white/10 flex flex-col items-center gap-0.5 h-auto py-0">
                <LogOut className="h-5 w-5" />
                <span className="text-[10px] font-medium">Logout</span>
              </Button>
            </nav>
          </div>
        </header>

        <div className="max-w-7xl mx-auto px-4 py-8">
          {page === "dashboard" && renderDashboard()}
          {page === "companies" && renderCompaniesPage()}
          {page === "accounts" && renderAccountsPage()}
          {page === "soa" && renderSOA()}
          {page === "backup" && renderBackupPage()}
        </div>
      </div>

      {/* Plan Modal */}
      <Dialog open={showPlanModal} onOpenChange={setShowPlanModal}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{editPlan ? "Edit Plan" : "Add Subscription Plan"}</DialogTitle>
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
            <Button onClick={handlePlanSubmit}
              disabled={planLoading || !planForm.name || !planForm.max_students || !planForm.max_teachers || planForm.price_monthly === ""}>
              {planLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : editPlan ? "Save Changes" : "Create Plan"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
};

export default SuperAdminDashboard;
