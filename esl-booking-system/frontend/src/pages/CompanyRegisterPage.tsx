import { useState, useEffect } from "react";
import axios from "axios";
import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Alert, AlertDescription } from "@/components/ui/alert";
import {
  CheckCircle2,
  Loader2,
  AlertCircle,
  Users,
  BookOpen,
  Star,
  ChevronRight,
  ChevronLeft,
  FileText,
  CreditCard,
} from "lucide-react";
import BrandLogo from "@/components/BrandLogo";
import superadminQR from "@/assets/superadmin_qrcode.jpg";

interface Plan {
  id: number;
  name: string;
  max_students: number;
  max_teachers: number;
  price_monthly: number;
  description: string;
}

const planIcons = [BookOpen, Users, Star];

// Steps: 1 = plan+form, 2 = agreement (paid only), 3 = payment (paid only)
type Step = 1 | 2 | 3;

const CompanyRegisterPage = () => {
  const [plans, setPlans] = useState<Plan[]>([]);
  const [selectedPlan, setSelectedPlan] = useState<number | null>(null);
  const [step, setStep] = useState<Step>(1);
  const [agreed, setAgreed] = useState(false);
  const [paymentReference, setPaymentReference] = useState("");
  const [submitted, setSubmitted] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [form, setForm] = useState({
    company_name: "",
    company_email: "",
    company_phone: "",
    company_address: "",
    owner_name: "",
    owner_email: "",
    owner_password: "",
  });

  const navigate = useNavigate();

  useEffect(() => {
    axios
      .get(`${import.meta.env.VITE_API_URL}/api/companies/subscription-plans`)
      .then((res) => setPlans(res.data))
      .catch(() => {});
  }, []);

  const selectedPlanData = plans.find((p) => p.id === selectedPlan) ?? null;
  const isFreePlan = selectedPlanData?.price_monthly === 0;

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    setForm({ ...form, [e.target.name]: e.target.value });
  };

  // Validate step 1 fields before advancing
  const handleStep1Next = (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedPlan) {
      setError("Please select a subscription plan.");
      return;
    }
    setError(null);
    if (isFreePlan) {
      handleSubmit();
    } else {
      setStep(2);
    }
  };

  const handleStep2Next = () => {
    if (!agreed) return;
    setStep(3);
  };

  const handleSubmit = async (e?: React.FormEvent) => {
    e?.preventDefault();
    setIsLoading(true);
    setError(null);
    try {
      await axios.post(`${import.meta.env.VITE_API_URL}/api/companies/register`, {
        ...form,
        subscription_plan_id: selectedPlan,
        payment_reference: isFreePlan ? undefined : paymentReference || undefined,
      });
      setSubmitted(true);
    } catch (err: unknown) {
      if (axios.isAxiosError(err) && err.response) {
        setError(err.response.data.message || "Registration failed");
      } else {
        setError("An unexpected error occurred");
      }
      // On error in step 3, stay on step 3
    } finally {
      setIsLoading(false);
    }
  };

  // ── Success screen ──────────────────────────────────────────────────────────
  if (submitted) {
    return (
      <div className="min-h-screen brand-gradient-subtle pattern-dots-light flex items-center justify-center p-4">
        <Card className="max-w-md w-full text-center shadow-lg">
          <CardContent className="pt-8 pb-8 space-y-4">
            <CheckCircle2 className="h-16 w-16 text-green-500 mx-auto" />
            <h2 className="text-2xl font-bold text-gray-800">Application Submitted!</h2>
            <p className="text-muted-foreground">
              Your ESL center registration is pending review. Our team will contact you at{" "}
              <span className="font-medium">{form.owner_email}</span> once approved.
            </p>
            {!isFreePlan && (
              <p className="text-sm text-muted-foreground">
                Our team will verify your payment and activate your account within 1–2 business days.
              </p>
            )}
            <Button onClick={() => navigate("/")} className="w-full mt-4">
              Back to Home
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  // ── Step indicator helper ───────────────────────────────────────────────────
  const steps = isFreePlan
    ? [{ label: "Details", icon: FileText }]
    : [
        { label: "Details", icon: FileText },
        { label: "Agreement", icon: CheckCircle2 },
        { label: "Payment", icon: CreditCard },
      ];

  return (
    <div className="min-h-screen brand-gradient-subtle pattern-dots-light">
      {/* Header */}
      <div className="brand-gradient sticky top-0 z-50 shadow-lg">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between">
          <div className="cursor-pointer" onClick={() => navigate("/")}><BrandLogo variant="white" /></div>
          <Button
            variant="outline"
            size="sm"
            className="border-white/30 text-white hover:bg-white/10 hover:text-white"
            onClick={() => navigate("/")}
          >
            Back to Home
          </Button>
        </div>
      </div>

      <div className="max-w-5xl mx-auto px-4 py-10 space-y-10">
        {/* Hero */}
        <div className="text-center space-y-2">
          <h1 className="text-3xl font-bold text-gray-800">Register Your ESL Center</h1>
          <p className="text-muted-foreground max-w-xl mx-auto">
            Join the Brightfolks platform. Manage your students, teachers, and schedules — all in one place.
          </p>
        </div>

        {/* Step indicator (only shown for paid plans, after plan is chosen) */}
        {selectedPlan && !isFreePlan && (
          <div className="flex items-center justify-center gap-0">
            {steps.map((s, i) => {
              const stepNum = (i + 1) as Step;
              const isActive = step === stepNum;
              const isDone = step > stepNum;
              return (
                <div key={s.label} className="flex items-center">
                  <div
                    className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-sm font-medium transition-colors ${
                      isActive
                        ? "bg-primary text-white"
                        : isDone
                        ? "bg-primary/20 text-primary"
                        : "bg-gray-100 text-gray-400"
                    }`}
                  >
                    <s.icon className="h-3.5 w-3.5" />
                    {s.label}
                  </div>
                  {i < steps.length - 1 && (
                    <ChevronRight className="h-4 w-4 text-gray-300 mx-1" />
                  )}
                </div>
              );
            })}
          </div>
        )}

        {/* ── STEP 1: Plan selection + form ──────────────────────────────────── */}
        {step === 1 && (
          <>
            {/* Subscription Plans */}
            <div>
              <h2 className="text-lg font-semibold text-gray-700 mb-4">Choose a Plan</h2>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                {plans.map((plan, i) => {
                  const Icon = planIcons[i % planIcons.length];
                  const isSelected = selectedPlan === plan.id;
                  const isFree = plan.price_monthly === 0;
                  return (
                    <Card
                      key={plan.id}
                      onClick={() => setSelectedPlan(plan.id)}
                      className={`cursor-pointer transition-all border-2 ${
                        isSelected
                          ? "border-primary shadow-md"
                          : isFree
                          ? "border-green-300 hover:border-green-400"
                          : "border-transparent hover:border-primary/40"
                      }`}
                    >
                      <CardHeader className="pb-2">
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-2">
                            <Icon className="h-5 w-5 text-primary" />
                            <CardTitle className="text-base">{plan.name}</CardTitle>
                          </div>
                          {isFree && (
                            <span className="text-[10px] font-bold bg-green-100 text-green-700 px-2 py-0.5 rounded-full uppercase tracking-wide">
                              Free Trial
                            </span>
                          )}
                        </div>
                      </CardHeader>
                      <CardContent className="space-y-2">
                        {isFree ? (
                          <p className="text-2xl font-bold text-green-600">
                            Free
                            <span className="text-sm font-normal text-muted-foreground ml-1">for 30 days</span>
                          </p>
                        ) : (
                          <p className="text-2xl font-bold text-primary">
                            ₱{plan.price_monthly.toLocaleString()}
                            <span className="text-sm font-normal text-muted-foreground">/mo</span>
                          </p>
                        )}
                        <ul className="text-sm text-muted-foreground space-y-1">
                          <li>✓ Up to {plan.max_students} student{plan.max_students !== 1 ? "s" : ""}</li>
                          <li>✓ Up to {plan.max_teachers} teacher{plan.max_teachers !== 1 ? "s" : ""}</li>
                          {isFree && <li className="text-green-600 font-medium">✓ 30-day trial period</li>}
                        </ul>
                        <p className="text-xs text-muted-foreground">{plan.description}</p>
                        {isSelected && <p className="text-xs font-semibold text-primary">✓ Selected</p>}
                      </CardContent>
                    </Card>
                  );
                })}
              </div>
            </div>

            {/* Registration Form */}
            <Card className="glow-card border-0 rounded-2xl">
              <CardHeader>
                <CardTitle className="text-lg">Company & Account Details</CardTitle>
              </CardHeader>
              <CardContent>
                <form onSubmit={handleStep1Next} className="space-y-5">
                  {error && (
                    <Alert variant="destructive">
                      <AlertCircle className="h-4 w-4" />
                      <AlertDescription>{error}</AlertDescription>
                    </Alert>
                  )}

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div className="space-y-1.5">
                      <Label htmlFor="company_name">ESL Center Name *</Label>
                      <Input
                        id="company_name"
                        name="company_name"
                        placeholder="e.g. Bright English Academy"
                        value={form.company_name}
                        onChange={handleChange}
                        required
                      />
                    </div>
                    <div className="space-y-1.5">
                      <Label htmlFor="company_email">Company Email *</Label>
                      <Input
                        id="company_email"
                        name="company_email"
                        type="email"
                        placeholder="contact@yourschool.com"
                        value={form.company_email}
                        onChange={handleChange}
                        required
                      />
                    </div>
                    <div className="space-y-1.5">
                      <Label htmlFor="company_phone">Phone Number</Label>
                      <Input
                        id="company_phone"
                        name="company_phone"
                        placeholder="+63 912 345 6789"
                        value={form.company_phone}
                        onChange={handleChange}
                      />
                    </div>
                    <div className="space-y-1.5">
                      <Label htmlFor="company_address">Address</Label>
                      <Input
                        id="company_address"
                        name="company_address"
                        placeholder="City, Province"
                        value={form.company_address}
                        onChange={handleChange}
                      />
                    </div>
                  </div>

                  <hr />
                  <p className="text-sm font-medium text-gray-600">Admin Account (your login)</p>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div className="space-y-1.5">
                      <Label htmlFor="owner_name">Your Full Name *</Label>
                      <Input
                        id="owner_name"
                        name="owner_name"
                        placeholder="Juan Dela Cruz"
                        value={form.owner_name}
                        onChange={handleChange}
                        required
                      />
                    </div>
                    <div className="space-y-1.5">
                      <Label htmlFor="owner_email">Your Email *</Label>
                      <Input
                        id="owner_email"
                        name="owner_email"
                        type="email"
                        placeholder="you@example.com"
                        value={form.owner_email}
                        onChange={handleChange}
                        required
                      />
                    </div>
                    <div className="space-y-1.5 md:col-span-2">
                      <Label htmlFor="owner_password">Password *</Label>
                      <Input
                        id="owner_password"
                        name="owner_password"
                        type="password"
                        placeholder="Minimum 8 characters"
                        value={form.owner_password}
                        onChange={handleChange}
                        required
                      />
                    </div>
                  </div>

                  <Button type="submit" className="w-full" disabled={isLoading || !selectedPlan}>
                    {isLoading ? (
                      <><Loader2 className="mr-2 h-4 w-4 animate-spin" /> Submitting…</>
                    ) : isFreePlan ? (
                      "Submit Application"
                    ) : (
                      <>Next: Review Agreement <ChevronRight className="ml-1 h-4 w-4" /></>
                    )}
                  </Button>

                  <p className="text-xs text-center text-muted-foreground">
                    By submitting, you agree to our terms of service. Your application will be reviewed
                    within 1–2 business days.
                  </p>
                </form>
              </CardContent>
            </Card>
          </>
        )}

        {/* ── STEP 2: Agreement ──────────────────────────────────────────────── */}
        {step === 2 && (
          <Card className="glow-card border-0 rounded-2xl max-w-2xl mx-auto">
            <CardHeader>
              <CardTitle className="text-lg flex items-center gap-2">
                <FileText className="h-5 w-5 text-primary" />
                Terms & Agreement
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-6">
              <div className="bg-gray-50 border rounded-xl p-5 space-y-3 text-sm text-gray-700 max-h-72 overflow-y-auto">
                <p className="font-semibold text-gray-800">Brightfolks ESL Platform — Subscription Agreement</p>
                <p>
                  By registering your ESL center on the Brightfolks platform, you agree to the following terms
                  and conditions:
                </p>
                <ol className="list-decimal pl-5 space-y-2">
                  <li>
                    <span className="font-medium">Subscription & Billing.</span> Your selected plan (
                    <span className="font-semibold text-primary">{selectedPlanData?.name}</span> — ₱
                    {selectedPlanData?.price_monthly.toLocaleString()}/month) is billed monthly. Payment is due
                    at the start of each billing period.
                  </li>
                  <li>
                    <span className="font-medium">Payment Verification.</span> Initial payment must be made via
                    the provided QR code before your account is activated. Our team will verify and confirm
                    within 1–2 business days.
                  </li>
                  <li>
                    <span className="font-medium">Account Limits.</span> Your plan allows up to{" "}
                    {selectedPlanData?.max_students} student{selectedPlanData?.max_students !== 1 ? "s" : ""} and{" "}
                    {selectedPlanData?.max_teachers} teacher{selectedPlanData?.max_teachers !== 1 ? "s" : ""}. Exceeding
                    these limits requires a plan upgrade.
                  </li>
                  <li>
                    <span className="font-medium">Data Responsibility.</span> You are responsible for the
                    accuracy of all student and teacher data entered into the platform.
                  </li>
                  <li>
                    <span className="font-medium">Account Suspension.</span> Accounts with overdue payments may
                    be locked until the outstanding balance is settled.
                  </li>
                  <li>
                    <span className="font-medium">Termination.</span> You may request account termination at any
                    time by contacting support. Unused prepaid months are non-refundable.
                  </li>
                  <li>
                    <span className="font-medium">Modifications.</span> Brightfolks reserves the right to update
                    pricing or terms with 30 days' notice.
                  </li>
                </ol>
              </div>

              <label className="flex items-start gap-3 cursor-pointer group">
                <input
                  type="checkbox"
                  className="mt-0.5 h-4 w-4 accent-primary cursor-pointer"
                  checked={agreed}
                  onChange={(e) => setAgreed(e.target.checked)}
                />
                <span className="text-sm text-gray-700 group-hover:text-gray-900">
                  I have read and agree to the Brightfolks Subscription Agreement and Terms of Service.
                </span>
              </label>

              <div className="flex gap-3">
                <Button variant="outline" className="flex-1" onClick={() => setStep(1)}>
                  <ChevronLeft className="mr-1 h-4 w-4" /> Back
                </Button>
                <Button className="flex-1" disabled={!agreed} onClick={handleStep2Next}>
                  I Agree & Continue to Payment <ChevronRight className="ml-1 h-4 w-4" />
                </Button>
              </div>
            </CardContent>
          </Card>
        )}

        {/* ── STEP 3: Payment ────────────────────────────────────────────────── */}
        {step === 3 && (
          <Card className="glow-card border-0 rounded-2xl max-w-2xl mx-auto">
            <CardHeader>
              <CardTitle className="text-lg flex items-center gap-2">
                <CreditCard className="h-5 w-5 text-primary" />
                Payment
              </CardTitle>
            </CardHeader>
            <CardContent>
              <form onSubmit={handleSubmit} className="space-y-6">
                {error && (
                  <Alert variant="destructive">
                    <AlertCircle className="h-4 w-4" />
                    <AlertDescription>{error}</AlertDescription>
                  </Alert>
                )}

                {/* Amount due */}
                <div className="bg-primary/5 border border-primary/20 rounded-xl p-4 flex items-center justify-between">
                  <div>
                    <p className="text-sm text-muted-foreground">Amount Due</p>
                    <p className="text-2xl font-bold text-primary">
                      ₱{selectedPlanData?.price_monthly.toLocaleString()}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {selectedPlanData?.name} Plan — first month
                    </p>
                  </div>
                  <div className="text-right text-sm text-muted-foreground">
                    <p>Pay via InstaPay / GCash</p>
                    <p className="font-medium text-gray-700">Brightfolks Center</p>
                    <p className="font-medium text-gray-700">Acct: XXXX XXXX 4807</p>
                  </div>
                </div>

                {/* QR Code */}
                <div className="flex flex-col items-center gap-3">
                  <p className="text-sm font-medium text-gray-700">Scan to Pay</p>
                  <img
                    src={superadminQR}
                    alt="Payment QR Code"
                    className="w-56 h-auto rounded-xl border shadow-sm"
                  />
                  <p className="text-xs text-muted-foreground text-center max-w-xs">
                    Scan the QR code using your GCash or any InstaPay-enabled app to send payment.
                  </p>
                </div>

                {/* Reference number */}
                <div className="space-y-1.5">
                  <Label htmlFor="payment_reference">
                    Reference / Transaction Number{" "}
                    <span className="text-muted-foreground font-normal">(optional)</span>
                  </Label>
                  <Input
                    id="payment_reference"
                    placeholder="e.g. 2024-0001-ABCDE"
                    value={paymentReference}
                    onChange={(e) => setPaymentReference(e.target.value)}
                  />
                  <p className="text-xs text-muted-foreground">
                    Enter the reference number from your payment confirmation to help us verify faster.
                  </p>
                </div>

                <div className="flex gap-3">
                  <Button type="button" variant="outline" className="flex-1" onClick={() => setStep(2)}>
                    <ChevronLeft className="mr-1 h-4 w-4" /> Back
                  </Button>
                  <Button type="submit" className="flex-1" disabled={isLoading}>
                    {isLoading ? (
                      <><Loader2 className="mr-2 h-4 w-4 animate-spin" /> Submitting…</>
                    ) : (
                      "Submit Application"
                    )}
                  </Button>
                </div>

                <p className="text-xs text-center text-muted-foreground">
                  Your application will be reviewed within 1–2 business days after payment is verified.
                </p>
              </form>
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  );
};

export default CompanyRegisterPage;
