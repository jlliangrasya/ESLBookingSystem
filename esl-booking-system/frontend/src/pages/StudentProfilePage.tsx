import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import axios from "axios";
import logo from "../assets/Brightfolks_Logo.png";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Pencil, Save, Eye, EyeOff, UserCircle, ArrowLeft } from "lucide-react";
import { TIMEZONES, setUserTimezone } from "@/utils/timezone";

interface StudentProfile {
  name: string;
  email: string;
  guardian_name: string;
  nationality: string;
  age: string;
  timezone: string;
}

const StudentProfilePage = () => {
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

  useEffect(() => {
    axios.get(`${base}/api/student/profile`, { headers })
      .then((res) => {
        setProfile({
          name: res.data.name || "",
          email: res.data.email || "",
          guardian_name: res.data.guardian_name || "",
          nationality: res.data.nationality || "",
          age: res.data.age?.toString() || "",
          timezone: res.data.timezone || Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC",
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
      };
      if (password) payload.password = password;
      payload.timezone = profile.timezone;
      await axios.put(`${base}/api/student/profile`, payload, { headers });
      setUserTimezone(profile.timezone);
      setSaveMsg("Profile updated successfully!");
      setIsEditing(false);
      setPassword("");
    } catch (err: unknown) {
      const msg = (err as { response?: { data?: { message?: string } } })?.response?.data?.message || "Failed to save";
      setSaveError(msg);
    } finally {
      setSaving(false);
    }
  };

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
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <div className="bg-primary/20 border-b border-primary/30">
        <div className="max-w-7xl mx-auto px-4 py-3 flex items-center justify-between">
          <img src={logo} alt="Brightfolks Logo" className="h-10 w-auto" />
        </div>
      </div>

      <div className="max-w-lg mx-auto px-4 py-8 space-y-4">
        <Button variant="ghost" className="gap-2 -ml-2" onClick={() => navigate("/studentdashboard")}>
          <ArrowLeft className="h-4 w-4" /> Back to Dashboard
        </Button>

        <Card className="shadow-md">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-lg">
              <UserCircle className="h-5 w-5 text-primary" />
              My Profile
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {saveMsg && <p className="text-sm text-green-600 font-medium">{saveMsg}</p>}
            {saveError && <p className="text-sm text-destructive">{saveError}</p>}

            {field("s-name", "Full Name", profile.name, "name")}
            {field("s-email", "Email", profile.email, "email", "email")}
            {field("s-guardian", "Guardian Name", profile.guardian_name, "guardian_name")}
            {field("s-nationality", "Nationality", profile.nationality, "nationality")}
            {field("s-age", "Age", profile.age, "age", "number")}

            <div className="space-y-1.5">
              <Label>Timezone</Label>
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

            <div className="space-y-1.5">
              <Label htmlFor="s-password">
                Password <span className="text-muted-foreground text-xs">(leave blank to keep current)</span>
              </Label>
              <div className="relative">
                <Input
                  id="s-password"
                  type={showPassword ? "text" : "password"}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  disabled={!isEditing}
                  placeholder={isEditing ? "Enter new password" : "••••••••"}
                  className="pr-10"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword((v) => !v)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground disabled:opacity-40"
                  tabIndex={-1}
                  disabled={!isEditing}
                >
                  {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              </div>
            </div>

            <div className="pt-2">
              {isEditing ? (
                <Button onClick={handleSave} disabled={saving} className="gap-2">
                  <Save className="h-4 w-4" />
                  {saving ? "Saving..." : "Save"}
                </Button>
              ) : (
                <Button variant="outline" onClick={handleEdit} className="gap-2">
                  <Pencil className="h-4 w-4" />
                  Edit Profile
                </Button>
              )}
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
};

export default StudentProfilePage;
