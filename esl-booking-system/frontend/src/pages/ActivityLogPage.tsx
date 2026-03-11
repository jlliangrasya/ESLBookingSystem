import { useState, useEffect, useContext } from "react";
import axios from "axios";
import NavBar from "../components/Navbar";
import AuthContext from "@/context/AuthContext";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ClipboardList, ChevronLeft, ChevronRight, Search } from "lucide-react";

interface AuditLog {
  id: number;
  company_id: number | null;
  user_id: number | null;
  action: string;
  target_type: string | null;
  target_id: number | null;
  details: string | null;
  created_at: string;
  user_name: string | null;
  company_name: string | null;
}

const PAGE_SIZE = 20;

const ActivityLogPage = () => {
  const authContext = useContext(AuthContext);
  const role = authContext?.user?.role;
  const token = localStorage.getItem("token");
  const base = import.meta.env.VITE_API_URL;
  const headers = { Authorization: `Bearer ${token}` };

  const [logs, setLogs] = useState<AuditLog[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(false);

  const endpoint =
    role === "super_admin"
      ? `${base}/api/super-admin/audit-logs`
      : `${base}/api/admin/audit-logs`;

  const fetchLogs = async (p = page) => {
    setLoading(true);
    try {
      const res = await axios.get(endpoint, {
        headers,
        params: { limit: PAGE_SIZE, offset: (p - 1) * PAGE_SIZE },
      });
      setLogs(res.data.logs || res.data);
      setTotal(res.data.total ?? (res.data.logs ?? res.data).length);
    } catch (err) {
      console.error("Error fetching audit logs:", err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchLogs(page);
  }, [page]);

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  const filtered = search
    ? logs.filter(
        (l) =>
          l.action.toLowerCase().includes(search.toLowerCase()) ||
          (l.user_name || "").toLowerCase().includes(search.toLowerCase()) ||
          (l.company_name || "").toLowerCase().includes(search.toLowerCase())
      )
    : logs;

  const formatAction = (action: string) =>
    action.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());

  const actionColor = (action: string): string => {
    if (action.includes("delete") || action.includes("cancel") || action.includes("reject"))
      return "bg-red-100 text-red-700";
    if (action.includes("create") || action.includes("approve") || action.includes("done"))
      return "bg-green-100 text-green-700";
    if (action.includes("update") || action.includes("edit") || action.includes("paid"))
      return "bg-blue-100 text-blue-700";
    return "bg-gray-100 text-gray-700";
  };

  return (
    <>
      <NavBar />
      <div className="max-w-5xl mx-auto px-4 py-8">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-lg">
              <ClipboardList className="h-5 w-5 text-primary" />
              Activity Log
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Search by action, user, or company…"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="pl-9"
              />
            </div>

            {loading ? (
              <p className="text-sm text-muted-foreground text-center py-8">Loading…</p>
            ) : filtered.length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-8">No activity records found.</p>
            ) : (
              <div className="space-y-2">
                {filtered.map((log) => (
                  <div key={log.id} className="border rounded-lg p-3 flex flex-col sm:flex-row sm:items-start sm:justify-between gap-2">
                    <div className="space-y-1 flex-1">
                      <div className="flex items-center gap-2 flex-wrap">
                        <Badge className={`text-xs font-medium ${actionColor(log.action)}`}>
                          {formatAction(log.action)}
                        </Badge>
                        {log.target_type && (
                          <span className="text-xs text-muted-foreground">
                            → {log.target_type}
                            {log.target_id ? ` #${log.target_id}` : ""}
                          </span>
                        )}
                      </div>
                      <div className="text-xs text-muted-foreground flex flex-wrap gap-x-3">
                        {log.user_name && <span>By: <span className="font-medium text-foreground">{log.user_name}</span></span>}
                        {role === "super_admin" && log.company_name && (
                          <span>Company: <span className="font-medium text-foreground">{log.company_name}</span></span>
                        )}
                      </div>
                      {log.details && (
                        <p className="text-xs text-muted-foreground truncate max-w-xl">
                          {(() => {
                            try {
                              const d = JSON.parse(log.details);
                              return Object.entries(d).map(([k, v]) => `${k}: ${v}`).join(" · ");
                            } catch {
                              return log.details;
                            }
                          })()}
                        </p>
                      )}
                    </div>
                    <p className="text-xs text-muted-foreground whitespace-nowrap">
                      {new Date(log.created_at).toLocaleString("en-US", {
                        month: "short", day: "numeric", year: "numeric",
                        hour: "2-digit", minute: "2-digit", hour12: true,
                      })}
                    </p>
                  </div>
                ))}
              </div>
            )}

            {!search && totalPages > 1 && (
              <div className="flex items-center justify-between text-sm text-muted-foreground pt-2">
                <span>Page {page} of {totalPages} ({total} records)</span>
                <div className="flex gap-1">
                  <Button size="sm" variant="outline" className="h-7 w-7 p-0"
                    disabled={page === 1} onClick={() => setPage((p) => p - 1)}>
                    <ChevronLeft className="h-4 w-4" />
                  </Button>
                  <Button size="sm" variant="outline" className="h-7 w-7 p-0"
                    disabled={page === totalPages} onClick={() => setPage((p) => p + 1)}>
                    <ChevronRight className="h-4 w-4" />
                  </Button>
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </>
  );
};

export default ActivityLogPage;
