import { useState, useEffect, useContext } from "react";
import axios from "axios";
import { useNavigate } from "react-router-dom";
import AuthContext from "@/context/AuthContext";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Building2, Users, Clock, CheckCircle, LogOut, Loader2 } from "lucide-react";
import logo from "../assets/EuniTalk_Logo.png";

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
  status: string;
  plan_name: string;
  max_students: number;
  price_monthly: number;
  created_at: string;
  approved_at: string | null;
  approved_by_name: string | null;
  total_users: number;
}

const statusColors: Record<string, string> = {
  pending: "bg-yellow-100 text-yellow-800",
  active: "bg-green-100 text-green-800",
  rejected: "bg-red-100 text-red-800",
  suspended: "bg-gray-100 text-gray-800",
};

const SuperAdminDashboard = () => {
  const [stats, setStats] = useState<Stats | null>(null);
  const [companies, setCompanies] = useState<Company[]>([]);
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState<number | null>(null);

  const authContext = useContext(AuthContext);
  const navigate = useNavigate();
  const token = localStorage.getItem("token");

  const fetchData = async () => {
    try {
      const headers = { Authorization: `Bearer ${token}` };
      const [statsRes, companiesRes] = await Promise.all([
        axios.get(`${import.meta.env.VITE_API_URL}/api/super-admin/dashboard`, { headers }),
        axios.get(`${import.meta.env.VITE_API_URL}/api/companies`, { headers }),
      ]);
      setStats(statsRes.data);
      setCompanies(companiesRes.data);
    } catch (err) {
      console.error("Error fetching super admin data:", err);
    } finally {
      setLoading(false);
    }
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
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <div className="bg-primary/20 border-b border-primary/30">
        <div className="max-w-7xl mx-auto px-4 py-3 flex items-center justify-between">
          <img src={logo} alt="EuniTalk Logo" className="h-10 w-auto" />
          <Badge variant="secondary" className="text-xs">Super Admin</Badge>
          <Button variant="outline" size="sm" onClick={handleLogout}
            className="border-pink-400 text-pink-500 hover:bg-pink-50">
            <LogOut className="h-4 w-4 mr-1" /> Logout
          </Button>
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

        {/* All Companies */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base">All Companies</CardTitle>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Company</TableHead>
                  <TableHead>Email</TableHead>
                  <TableHead>Plan</TableHead>
                  <TableHead>Users</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {allOtherCompanies.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={6} className="text-center text-muted-foreground text-sm py-8">
                      No companies yet
                    </TableCell>
                  </TableRow>
                ) : (
                  allOtherCompanies.map((company) => (
                    <TableRow key={company.id}>
                      <TableCell className="font-medium">{company.name}</TableCell>
                      <TableCell>{company.email}</TableCell>
                      <TableCell className="text-xs">{company.plan_name}</TableCell>
                      <TableCell>{company.total_users}</TableCell>
                      <TableCell>
                        <span className={`text-xs px-2 py-1 rounded-full font-medium ${statusColors[company.status]}`}>
                          {company.status}
                        </span>
                      </TableCell>
                      <TableCell>
                        {company.status === "active" && (
                          <Button size="sm" variant="outline"
                            onClick={() => handleSuspend(company.id)}
                            disabled={actionLoading === company.id}
                            className="text-xs">
                            Suspend
                          </Button>
                        )}
                        {company.status === "suspended" && (
                          <Button size="sm" onClick={() => handleApprove(company.id)}
                            disabled={actionLoading === company.id}
                            className="text-xs">
                            Reactivate
                          </Button>
                        )}
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      </div>
    </div>
  );
};

export default SuperAdminDashboard;
