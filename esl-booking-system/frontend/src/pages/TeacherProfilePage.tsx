import { useState, useEffect } from "react";
import axios from "axios";
import NavBar from "../components/Navbar";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Pencil, Save, Eye, EyeOff, UserCircle } from "lucide-react";
import { TIMEZONES, setUserTimezone } from "@/utils/timezone";

const TeacherProfilePage: React.FC = () => {
  const [profile, setProfile] = useState({
    name: "", email: "", password: "********",
    timezone: Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC",
  });
  const [isEditing, setIsEditing] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saveMsg, setSaveMsg] = useState<string | null>(null);
  const [saveError, setSaveError] = useState<string | null>(null);

  const base = import.meta.env.VITE_API_URL;
  const token = localStorage.getItem("token");
  const headers = { Authorization: `Bearer ${token}` };

  useEffect(() => {
    axios
      .get(`${base}/api/teacher/profile`, { headers })
      .then((res) => {
        setProfile({
          name: res.data.name || "",
          email: res.data.email || "",
          password: "********",
          timezone: res.data.timezone || Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC",
        });
      })
      .catch(console.error);
  }, []);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setProfile((prev) => ({ ...prev, [e.target.name]: e.target.value }));
  };

  const handleEdit = () => {
    setIsEditing(true);
    setSaveMsg(null);
    setSaveError(null);
    setProfile((prev) => ({ ...prev, password: "" }));
  };

  const handleSave = async () => {
    setSaving(true);
    setSaveMsg(null);
    setSaveError(null);
    try {
      const payload: Record<string, string> = { name: profile.name, email: profile.email, timezone: profile.timezone };
      if (profile.password && profile.password !== "********") {
        payload.password = profile.password;
      }
      await axios.put(`${base}/api/teacher/profile`, payload, { headers });
      setUserTimezone(profile.timezone);
      setSaveMsg("Profile updated successfully!");
      setIsEditing(false);
      setProfile((prev) => ({ ...prev, password: "********" }));
    } catch (err: unknown) {
      const msg = (err as { response?: { data?: { message?: string } } })?.response?.data?.message || "Failed to save";
      setSaveError(msg);
    } finally {
      setSaving(false);
    }
  };

  return (
    <>
      <NavBar />
      <div className="max-w-lg mx-auto px-4 py-10 brand-gradient-subtle pattern-dots-light min-h-screen">
        <Card className="glow-card border-0 rounded-2xl">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-lg">
              <UserCircle className="h-5 w-5 text-primary" />
              My Profile
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {saveMsg && (
              <p className="text-sm text-green-600 font-medium">{saveMsg}</p>
            )}
            {saveError && (
              <p className="text-sm text-destructive">{saveError}</p>
            )}

            <div className="space-y-1.5">
              <Label htmlFor="teacher-name">Name</Label>
              <Input
                id="teacher-name"
                type="text"
                name="name"
                value={profile.name}
                onChange={handleChange}
                disabled={!isEditing}
              />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="teacher-email">Email</Label>
              <Input
                id="teacher-email"
                type="email"
                name="email"
                value={profile.email}
                onChange={handleChange}
                disabled={!isEditing}
              />
            </div>

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
              <Label htmlFor="teacher-password">Password</Label>
              <div className="relative">
                <Input
                  id="teacher-password"
                  type={showPassword ? "text" : "password"}
                  name="password"
                  value={profile.password}
                  onChange={handleChange}
                  disabled={!isEditing}
                  placeholder={isEditing ? "Leave blank to keep current" : ""}
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
                  Edit
                </Button>
              )}
            </div>
          </CardContent>
        </Card>
      </div>
    </>
  );
};

export default TeacherProfilePage;
