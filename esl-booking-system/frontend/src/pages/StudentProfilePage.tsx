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
import {
  Pencil,
  Save,
  Eye,
  EyeOff,
  ArrowLeft,
  Package,
  X,
  CheckCircle2,
  CalendarClock,
  Layers,
  TrendingUp,
  TrendingDown,
} from "lucide-react";
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

interface SessionAdjustment {
  id: number;
  student_package_id: number;
  adjustment: number;
  remarks: string;
  created_at: string;
  adjusted_by_name: string;
}

type TimelineItem =
  | { kind: "package"; date: string; data: PackageHistory }
  | { kind: "adjustment"; date: string; data: SessionAdjustment };

interface StudentProfile {
  name: string;
  email: string;
  guardian_name: string;
  nationality: string;
  age: string;
  timezone: string;
  created_at?: string;
}

const MONTHS = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12];

const StudentProfilePage = () => {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const token = localStorage.getItem("token");
  const headers = { Authorization: `Bearer ${token}` };
  const base = import.meta.env.VITE_API_URL;

  const [profile, setProfile] = useState<StudentProfile>({
    name: "",
    email: "",
    guardian_name: "",
    nationality: "",
    age: "",
    timezone: Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC",
  });
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saveMsg, setSaveMsg] = useState<string | null>(null);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [packageHistory, setPackageHistory] = useState<PackageHistory[]>([]);
  const [adjustments, setAdjustments] = useState<SessionAdjustment[]>([]);
  const [stats, setStats] = useState({
    completed_count: 0,
    upcoming_count: 0,
    sessions_remaining: 0,
  });
  const [selectedYear, setSelectedYear] = useState<string>("all");
  const [selectedMonth, setSelectedMonth] = useState<string>("all");

  useEffect(() => {
    axios
      .get(`${base}/api/student/stats`, { headers })
      .then((r) => setStats(r.data))
      .catch(console.error);
    axios
      .get(`${base}/api/student/package-history`, { headers })
      .then((r) => setPackageHistory(r.data))
      .catch(console.error);
    axios
      .get(`${base}/api/student/package-adjustments`, { headers })
      .then((r) => setAdjustments(r.data))
      .catch(console.error);
    axios
      .get(`${base}/api/student/profile`, { headers })
      .then((r) => {
        setProfile({
          name: r.data.name || "",
          email: r.data.email || "",
          guardian_name: r.data.guardian_name || "",
          nationality: r.data.nationality || "",
          age: r.data.age?.toString() || "",
          timezone:
            r.data.timezone ||
            Intl.DateTimeFormat().resolvedOptions().timeZone ||
            "UTC",
          created_at: r.data.created_at,
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
      setSaveError(
        (err as { response?: { data?: { message?: string } } })?.response?.data
          ?.message || t("profile.updateFailed"),
      );
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
    ? new Date(profile.created_at).toLocaleDateString(undefined, {
        year: "numeric",
        month: "long",
      })
    : null;

  const field = (
    id: string,
    label: string,
    value: string,
    key: keyof StudentProfile,
    type = "text",
  ) => (
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

  // Build a flat timeline of packages + adjustments sorted newest-first
  const timeline: TimelineItem[] = [
    ...packageHistory.map((pkg) => ({
      kind: "package" as const,
      date: pkg.purchased_at,
      data: pkg,
    })),
    ...adjustments.map((adj) => ({
      kind: "adjustment" as const,
      date: adj.created_at,
      data: adj,
    })),
  ].sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());

  // Collect unique years from the full timeline, newest-first
  const yearSet = new Set<string>();
  for (const item of timeline) yearSet.add(item.date.slice(0, 4));
  const yearOptions = Array.from(yearSet).sort((a, b) => b.localeCompare(a));

  // Filter timeline by selected year + month
  const filteredTimeline = timeline.filter((item) => {
    const [y, m] = item.date.slice(0, 7).split("-");
    if (selectedYear !== "all" && y !== selectedYear) return false;
    if (selectedMonth !== "all" && m !== selectedMonth.padStart(2, "0"))
      return false;
    return true;
  });

  const monthName = (num: number) =>
    new Date(2000, num - 1).toLocaleDateString(undefined, { month: "long" });

  return (
    <div className="min-h-screen brand-gradient-subtle">
      {/* Navbar */}
      <div className="brand-gradient shadow-lg">
        <div className="max-w-7xl mx-auto px-4 py-3 flex items-center justify-between">
          <BrandLogo variant="white" />
        </div>
      </div>

      {/* Full-width banner */}
      <div className="brand-gradient h-24 w-full" />

      {/* Page body */}
      <div className="max-w-5xl mx-auto px-6 pb-12">
        {/* Avatar row — avatar left, identity info right, both overlap banner */}
        <div className="-mt-10 mb-6 flex items-end justify-between gap-4">
          {/* Avatar */}
          <div className="h-20 w-20 shrink-0 rounded-full brand-gradient flex items-center justify-center text-white text-2xl font-bold border-4 border-background shadow-lg select-none">
            {initials || "S"}
          </div>

          {/* Identity — right-aligned, sits at bottom of banner overlap */}
          <div className="text-right pb-1">
            <h2 className="text-xl font-bold leading-tight">
              {profile.name || "—"}
            </h2>
            <p className="text-sm text-muted-foreground">{profile.email}</p>
            {memberSince && (
              <p className="text-xs text-muted-foreground mt-0.5">
                {t("profile.memberSince", { date: memberSince })}
              </p>
            )}
          </div>
        </div>

        <Button
          variant="ghost"
          size="sm"
          className="gap-2 -ml-2 mb-6"
          onClick={() => navigate("/studentdashboard")}
        >
          <ArrowLeft className="h-4 w-4" /> {t("profile.backToDashboard")}
        </Button>

        {/* Two-column layout */}
        <div className="grid grid-cols-1 lg:grid-cols-[1fr_340px] gap-5 items-start">
          {/* LEFT — stats + form */}
          <div className="space-y-5">
            {/* Stats row */}
            <div className="grid grid-cols-3 gap-3">
              <Card className="glow-card border-0 rounded-2xl">
                <CardContent className="flex flex-col items-center justify-center py-5 gap-1">
                  <CheckCircle2 className="h-5 w-5 text-primary mb-0.5" />
                  <span className="text-2xl font-bold">
                    {stats.completed_count}
                  </span>
                  <span className="text-xs text-muted-foreground text-center leading-tight">
                    {t("profile.statsCompleted")}
                  </span>
                </CardContent>
              </Card>
              <Card className="glow-card border-0 rounded-2xl">
                <CardContent className="flex flex-col items-center justify-center py-5 gap-1">
                  <CalendarClock className="h-5 w-5 text-primary mb-0.5" />
                  <span className="text-2xl font-bold">
                    {stats.upcoming_count}
                  </span>
                  <span className="text-xs text-muted-foreground text-center leading-tight">
                    {t("profile.statsUpcoming")}
                  </span>
                </CardContent>
              </Card>
              <Card className="glow-card border-0 rounded-2xl">
                <CardContent className="flex flex-col items-center justify-center py-5 gap-1">
                  <Layers className="h-5 w-5 text-primary mb-0.5" />
                  <span className="text-2xl font-bold">
                    {stats.sessions_remaining}
                  </span>
                  <span className="text-xs text-muted-foreground text-center leading-tight">
                    {t("profile.statsRemaining")}
                  </span>
                </CardContent>
              </Card>
            </div>

            {/* Personal info form */}
            <Card className="glow-card border-0 rounded-2xl">
              <CardHeader className="flex flex-row items-center justify-between pb-2">
                <CardTitle className="text-base">
                  {t("profile.personalInfo")}
                </CardTitle>
                {!isEditing ? (
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={handleEdit}
                    className="gap-1.5"
                  >
                    <Pencil className="h-3.5 w-3.5" />{" "}
                    {t("profile.editProfile")}
                  </Button>
                ) : (
                  <div className="flex gap-2">
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={handleCancel}
                      className="gap-1.5"
                    >
                      <X className="h-3.5 w-3.5" /> {t("profile.cancel")}
                    </Button>
                    <Button
                      size="sm"
                      onClick={handleSave}
                      disabled={saving}
                      className="gap-1.5"
                    >
                      <Save className="h-3.5 w-3.5" />
                      {saving ? t("profile.saving") : t("profile.save")}
                    </Button>
                  </div>
                )}
              </CardHeader>
              <CardContent className="space-y-4">
                {saveMsg && (
                  <p className="text-sm text-green-600 font-medium">
                    {saveMsg}
                  </p>
                )}
                {saveError && (
                  <p className="text-sm text-destructive">{saveError}</p>
                )}

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  {field("s-name", t("profile.fullName"), profile.name, "name")}
                  {field(
                    "s-email",
                    t("profile.email"),
                    profile.email,
                    "email",
                    "email",
                  )}
                  {field(
                    "s-guardian",
                    t("profile.guardianName"),
                    profile.guardian_name,
                    "guardian_name",
                  )}
                  {field(
                    "s-nationality",
                    t("profile.nationality"),
                    profile.nationality,
                    "nationality",
                  )}
                  {field(
                    "s-age",
                    t("profile.age"),
                    profile.age,
                    "age",
                    "number",
                  )}
                  <div className="space-y-1.5">
                    <Label>{t("profile.timezone")}</Label>
                    <Select
                      value={profile.timezone}
                      onValueChange={(v) =>
                        setProfile((p) => ({ ...p, timezone: v }))
                      }
                      disabled={!isEditing}
                    >
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent className="max-h-60">
                        {TIMEZONES.map((tz) => (
                          <SelectItem key={tz.value} value={tz.value}>
                            {tz.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                </div>

                {isEditing && (
                  <div className="space-y-1.5">
                    <Label htmlFor="s-password">
                      {t("profile.password")}{" "}
                      <span className="text-muted-foreground text-xs">
                        ({t("profile.passwordHint")})
                      </span>
                    </Label>
                    <div className="relative max-w-sm">
                      <Input
                        id="s-password"
                        type={showPassword ? "text" : "password"}
                        value={password}
                        onChange={(e) => setPassword(e.target.value)}
                        placeholder={t("profile.newPasswordPlaceholder")}
                        className="pr-10"
                      />
                      <button
                        type="button"
                        tabIndex={-1}
                        onClick={() => setShowPassword((v) => !v)}
                        className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                      >
                        {showPassword ? (
                          <EyeOff className="h-4 w-4" />
                        ) : (
                          <Eye className="h-4 w-4" />
                        )}
                      </button>
                    </div>
                  </div>
                )}
              </CardContent>
            </Card>
          </div>

          {/* RIGHT — Student Records, sticky + scrollable */}
          <div className="sticky top-4">
            <Card className="glow-card border-0 rounded-2xl">
              <CardHeader className="pb-2 space-y-2">
                <CardTitle className="flex items-center gap-2 text-base">
                  <Package className="h-4 w-4 text-primary" />
                  {t("profile.studentRecords")}
                </CardTitle>

                {/* Year + Month filters */}
                {timeline.length > 0 && (
                  <div className="flex gap-2">
                    <Select
                      value={selectedYear}
                      onValueChange={(v) => {
                        setSelectedYear(v);
                        setSelectedMonth("all");
                      }}
                    >
                      <SelectTrigger className="h-8 text-xs flex-1">
                        <SelectValue placeholder={t("profile.filterAllYears")} />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="all">
                          {t("profile.filterAllYears")}
                        </SelectItem>
                        {yearOptions.map((y) => (
                          <SelectItem key={y} value={y}>
                            {y}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>

                    <Select
                      value={selectedMonth}
                      onValueChange={setSelectedMonth}
                    >
                      <SelectTrigger className="h-8 text-xs flex-1">
                        <SelectValue
                          placeholder={t("profile.filterAllMonths")}
                        />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="all">
                          {t("profile.filterAllMonths")}
                        </SelectItem>
                        {MONTHS.map((m) => (
                          <SelectItem key={m} value={String(m)}>
                            {monthName(m)}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                )}
              </CardHeader>

              <CardContent className="overflow-y-auto max-h-[65vh] pr-1">
                {filteredTimeline.length === 0 ? (
                  <p className="text-sm text-muted-foreground">
                    {timeline.length === 0
                      ? t("profile.noPackages")
                      : t("profile.noRecordsForMonth")}
                  </p>
                ) : (
                  <div className="space-y-2">
                    {filteredTimeline.map((item) => {
                      if (item.kind === "package") {
                        const pkg = item.data;
                        return (
                          <div
                            key={`pkg-${pkg.id}`}
                            className="flex items-start justify-between gap-3 rounded-xl border px-4 py-3"
                          >
                            <div className="space-y-0.5 min-w-0">
                              <p className="font-medium text-sm truncate">
                                {pkg.package_name}
                              </p>
                              {pkg.subject && (
                                <p className="text-xs text-muted-foreground">
                                  {pkg.subject}
                                </p>
                              )}
                              <p className="text-xs text-muted-foreground">
                                {pkg.session_limit} {t("profile.sessions")} ·{" "}
                                {pkg.duration_minutes} {t("profile.min")} ·{" "}
                                {pkg.currency}{" "}
                                {Number(pkg.price).toLocaleString()}
                              </p>
                              <p className="text-xs text-muted-foreground">
                                {t("profile.availed")}:{" "}
                                {new Date(pkg.purchased_at).toLocaleDateString(
                                  undefined,
                                  {
                                    year: "numeric",
                                    month: "short",
                                    day: "numeric",
                                  },
                                )}
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
                              {t(
                                `profile.paymentStatus.${pkg.payment_status}`,
                              )}
                            </Badge>
                          </div>
                        );
                      }

                      const adj = item.data;
                      return (
                        <div
                          key={`adj-${adj.id}`}
                          className="flex items-start gap-2.5 rounded-lg border border-dashed px-3 py-2.5"
                        >
                          <div className="mt-0.5 shrink-0">
                            {adj.adjustment > 0 ? (
                              <TrendingUp className="h-3.5 w-3.5 text-green-500" />
                            ) : (
                              <TrendingDown className="h-3.5 w-3.5 text-destructive" />
                            )}
                          </div>
                          <div className="space-y-0.5 min-w-0">
                            <p className="text-xs font-medium">
                              {adj.adjustment > 0
                                ? t("profile.adjustment.added", {
                                    count: adj.adjustment,
                                  })
                                : t("profile.adjustment.deducted", {
                                    count: Math.abs(adj.adjustment),
                                  })}
                            </p>
                            <p className="text-xs text-muted-foreground wrap-break-word">
                              {t("profile.adjustment.reason")}: {adj.remarks}
                            </p>
                            <p className="text-xs text-muted-foreground">
                              {t("profile.adjustment.by")}:{" "}
                              {adj.adjusted_by_name} ·{" "}
                              {new Date(adj.created_at).toLocaleDateString(
                                undefined,
                                {
                                  year: "numeric",
                                  month: "short",
                                  day: "numeric",
                                },
                              )}
                            </p>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </CardContent>
            </Card>
          </div>
        </div>
      </div>
    </div>
  );
};

export default StudentProfilePage;
