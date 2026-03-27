import { useState, useEffect } from "react";
import axios from "axios";
import NavBar from "@/components/Navbar";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Loader2,
  Package,
  Plus,
  Pencil,
  EyeOff,
  Eye,
  Settings2,
  QrCode,
} from "lucide-react";

interface TutorialPackage {
  id: number;
  package_name: string;
  session_limit: number;
  price: number;
  subject: string | null;
  duration_minutes: number;
  description: string | null;
  is_active: boolean;
}

interface CompanySettings {
  allow_student_pick_teacher: boolean;
  payment_qr_image: string | null;
  cancellation_hours: number;
  cancellation_penalty_enabled: boolean;
  payment_method: "encasher" | "communication_platform" | null;
}

const EMPTY_FORM = {
  package_name: "",
  subject: "",
  session_limit: "",
  duration_minutes: "60",
  price: "",
  description: "",
  is_active: true,
};

const PackageSetupPage = () => {
  const token = localStorage.getItem("token");
  const headers = { Authorization: `Bearer ${token}` };

  const [packages, setPackages] = useState<TutorialPackage[]>([]);
  const [monthlyStats, setMonthlyStats] = useState<Record<number, number>>({});
  const [settings, setSettings] = useState<CompanySettings>({
    allow_student_pick_teacher: true,
    payment_qr_image: null,
    cancellation_hours: 1,
    cancellation_penalty_enabled: false,
    payment_method: null,
  });
  const [loading, setLoading] = useState(true);
  const [settingsSaving, setSettingsSaving] = useState(false);

  // Package modal
  const [showModal, setShowModal] = useState(false);
  const [editPackage, setEditPackage] = useState<TutorialPackage | null>(null);
  const [form, setForm] = useState({ ...EMPTY_FORM });
  const [formLoading, setFormLoading] = useState(false);

  // QR upload — temporarily disabled
  // const [qrPreview, setQrPreview] = useState<string | null>(null);

  const fetchAll = async () => {
    try {
      const [pkgRes, settingsRes] = await Promise.all([
        axios.get(`${import.meta.env.VITE_API_URL}/api/student/packages`, { headers }),
        axios.get(`${import.meta.env.VITE_API_URL}/api/admin/company-settings`, { headers }),
      ]);
      setPackages(pkgRes.data);
      setSettings(settingsRes.data);
      // setQrPreview(settingsRes.data.payment_qr_image || null);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
    // Monthly stats fetched separately so a failure doesn't block the main data
    try {
      const statsRes = await axios.get(`${import.meta.env.VITE_API_URL}/api/admin/package-monthly-stats`, { headers });
      const statsMap: Record<number, number> = {};
      for (const s of statsRes.data) statsMap[s.package_id] = s.availed_this_month;
      setMonthlyStats(statsMap);
    } catch {
      // non-critical — monthly stats unavailable
    }
  };

  useEffect(() => {
    fetchAll();
  }, []);

  const openAdd = () => {
    setEditPackage(null);
    setForm({ ...EMPTY_FORM });
    setShowModal(true);
  };

  const openEdit = (pkg: TutorialPackage) => {
    setEditPackage(pkg);
    setForm({
      package_name: pkg.package_name,
      subject: pkg.subject || "",
      session_limit: String(pkg.session_limit),
      duration_minutes: String(pkg.duration_minutes),
      price: String(pkg.price),
      description: pkg.description || "",
      is_active: pkg.is_active,
    });
    setShowModal(true);
  };

  const handleSavePackage = async () => {
    setFormLoading(true);
    try {
      const payload = {
        package_name: form.package_name,
        subject: form.subject || null,
        session_limit: Number(form.session_limit),
        duration_minutes: Number(form.duration_minutes),
        price: Number(form.price),
        description: form.description || null,
        is_active: form.is_active,
      };
      if (editPackage) {
        await axios.put(
          `${import.meta.env.VITE_API_URL}/api/student/packages/${editPackage.id}`,
          payload,
          { headers },
        );
      } else {
        await axios.post(
          `${import.meta.env.VITE_API_URL}/api/student/packages`,
          payload,
          { headers },
        );
      }
      setShowModal(false);
      fetchAll();
    } catch (err) {
      console.error(err);
    } finally {
      setFormLoading(false);
    }
  };

  const handleToggleActive = async (pkg: TutorialPackage) => {
    try {
      if (pkg.is_active) {
        await axios.delete(
          `${import.meta.env.VITE_API_URL}/api/student/packages/${pkg.id}`,
          { headers },
        );
      } else {
        await axios.put(
          `${import.meta.env.VITE_API_URL}/api/student/packages/${pkg.id}`,
          { ...pkg, is_active: true },
          { headers },
        );
      }
      fetchAll();
    } catch (err) {
      console.error(err);
    }
  };

  // QR upload handler — temporarily disabled
  // const handleQrUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
  //   const file = e.target.files?.[0];
  //   if (!file) return;
  //   const reader = new FileReader();
  //   reader.onload = (ev) => {
  //     const base64 = ev.target?.result as string;
  //     setQrPreview(base64);
  //     setSettings((prev) => ({ ...prev, payment_qr_image: base64 }));
  //   };
  //   reader.readAsDataURL(file);
  // };

  const handleSaveSettings = async () => {
    setSettingsSaving(true);
    try {
      await axios.put(
        `${import.meta.env.VITE_API_URL}/api/admin/company-settings`,
        {
          allow_student_pick_teacher: settings.allow_student_pick_teacher,
          payment_qr_image: settings.payment_qr_image,
          cancellation_hours: settings.cancellation_hours,
          cancellation_penalty_enabled: settings.cancellation_penalty_enabled,
          payment_method: settings.payment_method,
        },
        { headers },
      );
    } catch (err) {
      console.error(err);
    } finally {
      setSettingsSaving(false);
    }
  };

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
      <div className="max-w-7xl mx-auto px-4 py-8 space-y-8 brand-gradient-subtle pattern-dots-light min-h-screen">
        {/* Class Packages Card */}
        <Card className="glow-card border-0 rounded-2xl">
          <CardHeader className="flex flex-row items-center justify-between">
            <CardTitle className="flex items-center gap-2">
              <Package className="h-5 w-5 text-primary" />
              Class Packages
            </CardTitle>
            <Button size="sm" onClick={openAdd} className="gap-1">
              <Plus className="h-4 w-4" /> Add Package
            </Button>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow className="brand-gradient-subtle">
                  <TableHead>Package Name</TableHead>
                  <TableHead>Subject</TableHead>
                  <TableHead>Sessions</TableHead>
                  <TableHead>Duration</TableHead>
                  <TableHead>Price</TableHead>
                  <TableHead>This Month</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {packages.length === 0 ? (
                  <TableRow>
                    <TableCell
                      colSpan={8}
                      className="text-center text-muted-foreground text-sm py-10"
                    >
                      No packages yet. Click "Add Package" to create your first
                      package.
                    </TableCell>
                  </TableRow>
                ) : (
                  packages.map((pkg) => (
                    <TableRow
                      key={pkg.id}
                      className={!pkg.is_active ? "opacity-50" : ""}
                    >
                      <TableCell className="font-medium">
                        <div>{pkg.package_name}</div>
                        {pkg.description && (
                          <div className="text-xs text-muted-foreground mt-0.5 max-w-[200px] truncate">
                            {pkg.description}
                          </div>
                        )}
                      </TableCell>
                      <TableCell className="text-sm">
                        {pkg.subject || (
                          <span className="text-muted-foreground">—</span>
                        )}
                      </TableCell>
                      <TableCell className="text-sm">
                        {pkg.session_limit} sessions
                      </TableCell>
                      <TableCell className="text-sm">
                        {pkg.duration_minutes} min
                      </TableCell>
                      <TableCell className="text-sm">
                        ₱{Number(pkg.price).toLocaleString()}
                      </TableCell>
                      <TableCell className="text-sm">
                        <Badge variant="secondary" className="bg-[#EEF6FA] text-[#2E6B9E] text-xs">
                          {monthlyStats[pkg.id] ?? 0} availed
                        </Badge>
                      </TableCell>
                      <TableCell>
                        {pkg.is_active ? (
                          <Badge className="bg-green-100 text-green-700 text-xs">
                            Active
                          </Badge>
                        ) : (
                          <Badge variant="secondary" className="text-xs">
                            Inactive
                          </Badge>
                        )}
                      </TableCell>
                      <TableCell>
                        <div className="flex gap-1">
                          <Button
                            size="sm"
                            variant="outline"
                            className="h-7 text-xs"
                            onClick={() => openEdit(pkg)}
                          >
                            <Pencil className="h-3 w-3 mr-1" /> Edit
                          </Button>
                          <Button
                            size="sm"
                            variant="outline"
                            className="h-7 text-xs"
                            onClick={() => handleToggleActive(pkg)}
                          >
                            {pkg.is_active ? (
                              <>
                                <EyeOff className="h-3 w-3 mr-1" /> Deactivate
                              </>
                            ) : (
                              <>
                                <Eye className="h-3 w-3 mr-1" /> Activate
                              </>
                            )}
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

        {/* Company Settings Card */}
        <Card className="glow-card border-0 rounded-2xl">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Settings2 className="h-5 w-5 text-primary" />
              Company Settings
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-6">
            {/* Teacher picker toggle */}
            <div className="flex items-center justify-between border rounded-lg p-4">
              <div>
                <p className="font-medium text-sm">
                  Allow students to select their own teacher
                </p>
                <p className="text-xs text-muted-foreground mt-0.5">
                  When enabled, students can pick a teacher during enrollment.
                  When disabled, the admin assigns teachers.
                </p>
              </div>
              <Switch
                checked={settings.allow_student_pick_teacher}
                onCheckedChange={(v) =>
                  setSettings((prev) => ({
                    ...prev,
                    allow_student_pick_teacher: v,
                  }))
                }
              />
            </div>

            {/* Cancellation window */}
            <div className="border rounded-lg p-4 space-y-3">
              <p className="font-medium text-sm">Cancellation Policy</p>
              <div className="flex items-center gap-3">
                <div className="flex-1">
                  <Label className="text-xs text-muted-foreground">
                    Cancellation Window (hours)
                  </Label>
                  <Input
                    type="number"
                    min="0"
                    value={settings.cancellation_hours}
                    onChange={(e) =>
                      setSettings((prev) => ({
                        ...prev,
                        cancellation_hours: Number(e.target.value),
                      }))
                    }
                    className="mt-1"
                  />
                  <p className="text-xs text-muted-foreground mt-1">
                    Set to 0 to allow cancellation at any time. Default: 1 hour.
                  </p>
                </div>
              </div>
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm">
                    Show penalty notice for late teacher cancellations
                  </p>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    When enabled, teachers cancelling within the window will see
                    a penalty warning.
                  </p>
                </div>
                <Switch
                  checked={settings.cancellation_penalty_enabled}
                  onCheckedChange={(v) =>
                    setSettings((prev) => ({
                      ...prev,
                      cancellation_penalty_enabled: v,
                    }))
                  }
                />
              </div>
            </div>

            {/* Payment Method — only one can be active at a time */}
            <div className="border rounded-lg p-4 space-y-3">
              <div className="flex items-center gap-2">
                <QrCode className="h-4 w-4 text-primary" />
                <p className="font-medium text-sm">Payment Method</p>
              </div>
              <p className="text-xs text-muted-foreground">
                Choose how students should pay for their packages. Only one
                option can be active at a time.
              </p>

              {/* Option 1: Direct to Encasher */}
              <div
                className={`border rounded-lg p-3 cursor-pointer transition-colors ${
                  settings.payment_method === "encasher"
                    ? "border-primary bg-primary/5 ring-1 ring-primary"
                    : "hover:bg-muted/50"
                }`}
                onClick={() =>
                  setSettings((prev) => ({
                    ...prev,
                    payment_method:
                      prev.payment_method === "encasher" ? null : "encasher",
                  }))
                }
              >
                <div className="flex items-center justify-between">
                  <div>
                    <p className="font-medium text-sm">Direct to Encasher</p>
                    <p className="text-xs text-muted-foreground mt-0.5">
                      Students will see the Alipay QR code with instructions to
                      transfer payment directly.
                    </p>
                  </div>
                  <Switch
                    checked={settings.payment_method === "encasher"}
                    onCheckedChange={(v) =>
                      setSettings((prev) => ({
                        ...prev,
                        payment_method: v ? "encasher" : null,
                      }))
                    }
                  />
                </div>
              </div>

              {/* Option 2: Via Communication Platforms */}
              <div
                className={`border rounded-lg p-3 cursor-pointer transition-colors ${
                  settings.payment_method === "communication_platform"
                    ? "border-primary bg-primary/5 ring-1 ring-primary"
                    : "hover:bg-muted/50"
                }`}
                onClick={() =>
                  setSettings((prev) => ({
                    ...prev,
                    payment_method:
                      prev.payment_method === "communication_platform"
                        ? null
                        : "communication_platform",
                  }))
                }
              >
                <div className="flex items-center justify-between">
                  <div>
                    <p className="font-medium text-sm">
                      Via WeChat, Zalo, or other communication platforms
                    </p>
                    <p className="text-xs text-muted-foreground mt-0.5">
                      Students will be instructed to message the company via
                      their communication platform to arrange payment.
                    </p>
                  </div>
                  <Switch
                    checked={
                      settings.payment_method === "communication_platform"
                    }
                    onCheckedChange={(v) =>
                      setSettings((prev) => ({
                        ...prev,
                        payment_method: v
                          ? "communication_platform"
                          : null,
                      }))
                    }
                  />
                </div>
              </div>
            </div>

            {/* Custom QR Code upload — temporarily disabled
            <div className="border rounded-lg p-4 space-y-3">
              <div className="flex items-center gap-2">
                <QrCode className="h-4 w-4 text-primary" />
                <p className="font-medium text-sm">Payment QR Code</p>
              </div>
              <p className="text-xs text-muted-foreground">
                Students will see this QR code when enrolling in a package.
                Upload your GCash/PayMaya QR.
              </p>
              {qrPreview && (
                <div className="flex justify-center">
                  <img
                    src={qrPreview}
                    alt="Payment QR"
                    className="max-w-[180px] rounded-lg border"
                  />
                </div>
              )}
              <div>
                <Label className="text-xs text-muted-foreground cursor-pointer">
                  <input
                    type="file"
                    accept="image/*"
                    className="hidden"
                    onChange={handleQrUpload}
                  />
                  <Button variant="outline" size="sm" asChild>
                    <span>
                      {qrPreview ? "Replace QR Code" : "Upload QR Code"}
                    </span>
                  </Button>
                </Label>
              </div>
              {qrPreview && (
                <Button
                  variant="ghost"
                  size="sm"
                  className="text-xs text-destructive"
                  onClick={() => {
                    setQrPreview(null);
                    setSettings((prev) => ({
                      ...prev,
                      payment_qr_image: null,
                    }));
                  }}
                >
                  Remove QR Code
                </Button>
              )}
            </div>
            */}

            <Button onClick={handleSaveSettings} disabled={settingsSaving}>
              {settingsSaving ? (
                <Loader2 className="h-4 w-4 animate-spin mr-2" />
              ) : null}
              Save Settings
            </Button>
          </CardContent>
        </Card>
      </div>

      {/* Add / Edit Package Modal */}
      <Dialog open={showModal} onOpenChange={(o) => !o && setShowModal(false)}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>
              {editPackage ? "Edit Package" : "Add Package"}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-3 py-2">
            <div className="space-y-1.5">
              <Label>
                Package Name <span className="text-destructive">*</span>
              </Label>
              <Input
                placeholder="e.g. Basic English 10"
                value={form.package_name}
                onChange={(e) =>
                  setForm({ ...form, package_name: e.target.value })
                }
              />
            </div>
            <div className="space-y-1.5">
              <Label>Subject</Label>
              <Input
                placeholder="e.g. English Conversation, Math"
                value={form.subject}
                onChange={(e) => setForm({ ...form, subject: e.target.value })}
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>
                  Number of Sessions <span className="text-destructive">*</span>
                </Label>
                <Input
                  type="number"
                  min="1"
                  placeholder="10"
                  value={form.session_limit}
                  onChange={(e) =>
                    setForm({ ...form, session_limit: e.target.value })
                  }
                />
              </div>
              <div className="space-y-1.5">
                <Label>Duration per Session</Label>
                <Select
                  value={form.duration_minutes}
                  onValueChange={(v) =>
                    setForm({ ...form, duration_minutes: v })
                  }
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="25">25 minutes</SelectItem>
                    <SelectItem value="50">50 minutes</SelectItem>
                    <SelectItem value="75">75 minutes</SelectItem>
                    <SelectItem value="100">100 minutes</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="space-y-1.5">
              <Label>
                Price (₱) <span className="text-destructive">*</span>
              </Label>
              <Input
                type="number"
                min="0"
                placeholder="2000"
                value={form.price}
                onChange={(e) => setForm({ ...form, price: e.target.value })}
              />
            </div>
            <div className="space-y-1.5">
              <Label>Description (optional)</Label>
              <Textarea
                placeholder="Short description of what this package includes..."
                value={form.description}
                onChange={(e) =>
                  setForm({ ...form, description: e.target.value })
                }
                rows={2}
              />
            </div>
            {editPackage && (
              <label className="flex items-center gap-2 text-sm cursor-pointer">
                <input
                  type="checkbox"
                  checked={form.is_active}
                  onChange={(e) =>
                    setForm({ ...form, is_active: e.target.checked })
                  }
                  className="accent-primary"
                />
                Active (visible to students)
              </label>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowModal(false)}>
              Cancel
            </Button>
            <Button
              onClick={handleSavePackage}
              disabled={
                formLoading ||
                !form.package_name ||
                !form.session_limit ||
                !form.price
              }
            >
              {formLoading ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : editPackage ? (
                "Save Changes"
              ) : (
                "Create Package"
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
};

export default PackageSetupPage;
