import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import axios from "axios";
import BrandLogo from "@/components/BrandLogo";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Pencil, Save, Eye, EyeOff, ArrowLeft, Package, X, CheckCircle2, CalendarClock, Layers } from "lucide-react";
import { TIMEZONES, setUserTimezone } from "@/utils/timezone";

interface PackageHistory {
  id: number;
  package_name: string;
  subject: string | null;
  session_limit: number;
  sessions_remaining: number;
  price: number;
  currency: string;
  duration_minutes: number;
  payment_status: "unpaid" | "paid" | "rejected";
  purchased_at: string;
}

interface StudentProfile {
  name: string;
  email: string;
  guardian_name: string;
  nationality: string;
  age: string;
  timezone: string;
  created_at?: string;
}

const StudentProfilePage = () => {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const token = localStorage.getItem("token");
  const headers = { Authorization: `Bearer ${token}` };
  const base = import.meta.env.VITE_API_URL;

  const [profile, setProfile] = useState<StudentProfile>({
    name: "", email: "", guardian_name: "", nationality: "", age: "",
    timezone: Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC",
  });
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saveMsg, setSaveMsg] = useState<string | null>(null);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [packageHistory, setPackageHistory] = useState<PackageHistory[]>([]);
  const [stats, setStats] = useState({ completed_count: 0, upcoming_count: 0, sessions_remaining: 0 });

  useEffect(() => {
    axios.get(`${base}/api/student/stats`, { headers })
      .then((res) => setStats(res.data))
      .catch(console.error);

    axios.get(`${base}/api/student/package-history`, { headers })
      .then((res) => setPackageHistory(res.data))
      .catch(console.error);

    axios.get(`${base}/api/student/profile`, { headers })
      .then((res) => {
        setProfile({
          name: res.data.name || "",
          email: res.data.email || "",
          guardian_name: res.data.guardian_name || "",
          nationality: res.data.nationality || "",
          age: res.data.age?.toString() || "",
          timezone: res.data.timezone || Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC",
          created_at: res.data.created_at,
        });
      })
      .catch(console.error);
  }, []);

  const handleEdit = () => {
    setIsEditing(true);
    setPassword("");
    setSaveMsg(null);
    setSaveError(null);
  };

  const handleCancel = () => {
    setIsEditing(false);
    setPassword("");
    setSaveMsg(null);
    setSaveError(null);
  };

  const handleSave = async () => {
    setSaving(true);
    setSaveMsg(null);
    setSaveError(null);
    try {
      const payload: Record<string, string | number | null> = {
        name: profile.name,
        email: profile.email,
        guardian_name: profile.guardian_name || null,
        nationality: profile.nationality || null,
        age: profile.age ? Number(profile.age) : null,
        timezone: profile.timezone,
      };
      if (password) payload.password = password;
      await axios.put(`${base}/api/student/profile`, payload, { headers });
      setUserTimezone(profile.timezone);
      setSaveMsg(t("profile.updateSuccess"));
      setIsEditing(false);
      setPassword("");
    } catch (err: unknown) {
      const msg = (err as { response?: { data?: { message?: string } } })?.response?.data?.message || "Failed to save";
      setSaveError(msg);
    } finally {
      setSaving(false);
    }
  };

  const initials = profile.name
    .split(" ")
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0].toUpperCase())
    .join("");

  const memberSince = profile.created_at
    ? new Date(profile.created_at).toLocaleDateString(undefined, { year: "numeric", month: "long" })
    : null;

  const field = (id: string, label: string, value: string, key: keyof StudentProfile, type = "text") => (
    <div className="space-y-1.5">
      <Label htmlFor={id}>{label}</Label>
      <Input
        id={id}
        type={type}
        value={value}
        onChange={(e) => setProfile((p) => ({ ...p, [key]: e.target.value }))}
        disabled={!isEditing}
      />
    </div>
  );

  return (
    <div className="min-h-screen brand-gradient-subtle">
      <div className="brand-gradient shadow-lg">
        <div className="max-w-7xl mx-auto px-4 py-3 flex items-center justify-between">
          <BrandLogo variant="white" />
        </div>
      </div>

      <div className="max-w-3xl mx-auto px-4 py-8 space-y-5">
        <Button variant="ghost" className="gap-2 -ml-2" onClick={() => navigate("/studentdashboard")}>
          <ArrowLeft className="h-4 w-4" /> {t("profile.backToDashboard")}
        </Button>

        {/* Hero card */}
        <Card className="glow-card border-0 rounded-2xl overflow-hidden">
          <div className="brand-gradient h-24" />
          <CardContent className="px-6 pb-6 -mt-12">
            <div className="flex items-end gap-4">
              <div className="h-20 w-20 rounded-full brand-gradient flex items-center justify-center text-white text-2xl font-bold border-4 border-background shadow-lg shrink-0">
                {initials || "S"}
              </div>
              <div className="pb-1 min-w-0">
                <h2 className="text-xl font-bold leading-tight truncate">{profile.name || "—"}</h2>
                <p className="text-sm text-muted-foreground truncate">{profile.email}</p>
                {memberSince && (
                  <p className="text-xs text-muted-foreground mt-0.5">Member since {memberSince}</p>
                )}
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Stats row */}
        <div className="grid grid-cols-3 gap-3">
          <Card className="glow-card border-0 rounded-2xl">
            <CardContent className="flex flex-col items-center justify-center py-5 gap-1">
              <CheckCircle2 className="h-5 w-5 text-primary mb-0.5" />
              <span className="text-2xl font-bold">{stats.completed_count}</span>
              <span className="text-xs text-muted-foreground text-center">Sessions Completed</span>
            </CardContent>
          </Card>
          <Card className="glow-card border-0 rounded-2xl">
            <CardContent className="flex flex-col items-center justify-center py-5 gap-1">
              <CalendarClock className="h-5 w-5 text-primary mb-0.5" />
              <span className="text-2xl font-bold">{stats.upcoming_count}</span>
              <span className="text-xs text-muted-foreground text-center">Upcoming Classes</span>
            </CardContent>
          </Card>
          <Card className="glow-card border-0 rounded-2xl">
            <CardContent className="flex flex-col items-center justify-center py-5 gap-1">
              <Layers className="h-5 w-5 text-primary mb-0.5" />
              <span className="text-2xl font-bold">{stats.sessions_remaining}</span>
              <span className="text-xs text-muted-foreground text-center">Sessions Remaining</span>
            </CardContent>
          </Card>
        </div>

        {/* Profile form */}
        <Card className="glow-card border-0 rounded-2xl">
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-base">Personal Information</CardTitle>
            {!isEditing ? (
              <Button variant="outline" size="sm" onClick={handleEdit} className="gap-1.5">
                <Pencil className="h-3.5 w-3.5" /> {t("profile.editProfile")}
              </Button>
            ) : (
              <div className="flex gap-2">
                <Button variant="ghost" size="sm" onClick={handleCancel} className="gap-1.5">
                  <X className="h-3.5 w-3.5" /> Cancel
                </Button>
                <Button size="sm" onClick={handleSave} disabled={saving} className="gap-1.5">
                  <Save className="h-3.5 w-3.5" />
                  {saving ? t("profile.saving") : t("profile.save")}
                </Button>
              </div>
            )}
          </CardHeader>
          <CardContent className="space-y-4">
            {saveMsg && <p className="text-sm text-green-600 font-medium">{saveMsg}</p>}
            {saveError && <p className="text-sm text-destructive">{saveError}</p>}

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              {field("s-name", t("profile.fullName"), profile.name, "name")}
              {field("s-email", t("profile.email"), profile.email, "email", "email")}
              {field("s-guardian", t("profile.guardianName"), profile.guardian_name, "guardian_name")}
              {field("s-nationality", t("profile.nationality"), profile.nationality, "nationality")}
              {field("s-age", t("profile.age"), profile.age, "age", "number")}

              <div className="space-y-1.5">
                <Label>{t("profile.timezone")}</Label>
                <Select
                  value={profile.timezone}
                  onValueChange={(v) => setProfile((p) => ({ ...p, timezone: v }))}
                  disabled={!isEditing}
                >
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent className="max-h-60">
                    {TIMEZONES.map((tz) => (
                      <SelectItem key={tz.value} value={tz.value}>{tz.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            {isEditing && (
              <div className="space-y-1.5">
                <Label htmlFor="s-password">
                  {t("profile.password")}{" "}
                  <span className="text-muted-foreground text-xs">({t("profile.passwordHint")})</span>
                </Label>
                <div className="relative max-w-sm">
                  <Input
                    id="s-password"
                    type={showPassword ? "text" : "password"}
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="Enter new password"
                    className="pr-10"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword((v) => !v)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                    tabIndex={-1}
                  >
                    {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  </button>
                </div>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Package history */}
        <Card className="glow-card border-0 rounded-2xl">
          <CardHeader className="pb-2">
            <CardTitle className="flex items-center gap-2 text-base">
              <Package className="h-4 w-4 text-primary" />
              Package History
            </CardTitle>
          </CardHeader>
          <CardContent>
            {packageHistory.length === 0 ? (
              <p className="text-sm text-muted-foreground">No packages availed yet.</p>
            ) : (
              <div className="space-y-3">
                {packageHistory.map((pkg) => (
                  <div key={pkg.id} className="flex items-start justify-between gap-3 rounded-xl border px-4 py-3">
                    <div className="space-y-0.5 min-w-0">
                      <p className="font-medium text-sm truncate">{pkg.package_name}</p>
                      {pkg.subject && <p className="text-xs text-muted-foreground">{pkg.subject}</p>}
                      <p className="text-xs text-muted-foreground">
                        {pkg.session_limit} sessions · {pkg.duration_minutes} min ·{" "}
                        {pkg.currency} {Number(pkg.price).toLocaleString()}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        Availed:{" "}
                        {new Date(pkg.purchased_at).toLocaleDateString(undefined, {
                          year: "numeric", month: "short", day: "numeric",
                        })}
                      </p>
                    </div>
                    <Badge
                      variant={
                        pkg.payment_status === "paid"
                          ? "default"
                          : pkg.payment_status === "rejected"
                          ? "destructive"
                          : "secondary"
                      }
                      className="shrink-0 capitalize"
                    >
                      {pkg.payment_status}
                    </Badge>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
};

export default StudentProfilePage;
