import { useContext, useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import axios from "axios";
import AuthContext from "@/context/AuthContext";
import BrandLogo from "@/components/BrandLogo";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import { Lock, LogOut, Mail, Loader2, CheckCircle } from "lucide-react";
import qrCodeImage from "@/assets/superadmin_qrcode.jpg";

interface Plan {
  id: number;
  name: string;
  max_students: number;
  max_teachers: number;
  max_admins: number;
  price_monthly: number;
  description: string | null;
}

const CompanySuspendedPage = () => {
  const navigate = useNavigate();
  const authContext = useContext(AuthContext);
  const [plans, setPlans] = useState<Plan[]>([]);
  const [selectedPlan, setSelectedPlan] = useState<Plan | null>(null);
  const [showModal, setShowModal] = useState(false);
  const [refNumber, setRefNumber] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);

  useEffect(() => {
    if (!authContext?.token) { navigate("/"); return; }
    if (authContext.companyStatus !== "suspended") { navigate("/"); return; }
    axios
      .get(`${import.meta.env.VITE_API_URL}/api/companies/subscription-plans`)
      .then((res) => setPlans(res.data.filter((p: Plan) => p.price_monthly > 0)))
      .catch(() => {});
  }, []);

  const handleLogout = () => {
    authContext?.logout();
    navigate("/");
  };

  const handleSelectPlan = (plan: Plan) => {
    setSelectedPlan(plan);
    setRefNumber("");
    setSubmitted(false);
    setSubmitError(null);
    setShowModal(true);
  };

  const handleSubmitPayment = async () => {
    if (!selectedPlan || !refNumber.trim()) return;
    setSubmitting(true);
    setSubmitError(null);
    try {
      await axios.post(
        `${import.meta.env.VITE_API_URL}/api/companies/upgrade-request`,
        {
          subscription_plan_id: selectedPlan.id,
          reference_number: refNumber.trim(),
          contact_name: authContext?.user?.name,
          contact_email: authContext?.user?.name,
        },
        { headers: { Authorization: `Bearer ${authContext?.token}` } }
      );
      setSubmitted(true);
    } catch (err: unknown) {
      const msg = (err as { response?: { data?: { message?: string } } })?.response?.data?.message || "Failed to submit. Please try again.";
      setSubmitError(msg);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen bg-gray-50">
      <header className="brand-gradient shadow-lg">
        <div className="max-w-7xl mx-auto px-4 h-16 flex items-center justify-between">
          <BrandLogo variant="white" />
          <Button variant="ghost" size="sm" onClick={handleLogout}
            className="text-white/70 hover:text-white hover:bg-white/10 gap-1">
            <LogOut className="h-4 w-4" /> Logout
          </Button>
        </div>
      </header>

      <div className="max-w-3xl mx-auto px-4 py-10 space-y-6">
        <div className="text-center space-y-3">
          <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-amber-100 mb-2">
            <Lock className="h-8 w-8 text-amber-600" />
          </div>
          <h1 className="text-2xl font-bold text-gray-900">Account Suspended</h1>
          <p className="text-gray-500 max-w-md mx-auto">
            Your company account has been suspended due to non-payment. Please select a subscription plan below and complete your payment to restore access.
          </p>
        </div>

        {/* Plans */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {plans.map((plan) => (
            <Card key={plan.id}
              className="cursor-pointer transition-all hover:border-primary/50 hover:shadow-md"
              onClick={() => handleSelectPlan(plan)}>
              <CardHeader className="pb-2">
                <CardTitle className="text-base">{plan.name}</CardTitle>
              </CardHeader>
              <CardContent className="space-y-2">
                <p className="text-2xl font-bold text-primary">
                  ₱{Number(plan.price_monthly).toLocaleString()}
                  <span className="text-sm text-muted-foreground font-normal">/month</span>
                </p>
                <p className="text-xs text-muted-foreground">
                  Up to {plan.max_students} students, {plan.max_teachers} teachers, and {plan.max_admins} admins.
                </p>
                <div className="flex gap-2 flex-wrap">
                  <Badge variant="secondary" className="text-xs">{plan.max_students} students</Badge>
                  <Badge variant="secondary" className="text-xs">{plan.max_teachers} teachers</Badge>
                  <Badge variant="secondary" className="text-xs">{plan.max_admins} admins</Badge>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>

        {/* Bottom contact note */}
        <div className="text-center text-sm text-muted-foreground pt-4">
          <p>If you have concerns, please email{" "}
            <a href="mailto:brightfolkscenter@gmail.com" className="text-primary font-medium hover:underline">
              brightfolkscenter@gmail.com
            </a>
          </p>
        </div>
      </div>

      {/* Payment Modal */}
      <Dialog open={showModal} onOpenChange={(o) => { if (!submitting) setShowModal(o); }}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="text-center">Payment for {selectedPlan?.name}</DialogTitle>
          </DialogHeader>
          {selectedPlan && !submitted && (
            <div className="space-y-4 py-2">
              {/* QR Code */}
              <div className="flex justify-center">
                <img src={qrCodeImage} alt="Payment QR Code"
                  className="max-w-[220px] rounded-lg border shadow-sm" />
              </div>

              {/* Amount */}
              <div className="text-center">
                <p className="text-sm text-muted-foreground">Amount to pay</p>
                <p className="text-3xl font-bold text-primary">
                  ₱{Number(selectedPlan.price_monthly).toLocaleString()}
                  <span className="text-sm text-muted-foreground font-normal">/month</span>
                </p>
              </div>

              {/* Reference number input */}
              <div className="space-y-1.5">
                <Label>Last 5 digits of Reference/Transaction Number <span className="text-destructive">*</span></Label>
                <Input
                  value={refNumber}
                  onChange={(e) => setRefNumber(e.target.value.replace(/\D/g, "").slice(0, 5))}
                  placeholder="e.g. 12345"
                  maxLength={5}
                  className="text-center text-lg tracking-widest font-mono"
                />
                <p className="text-xs text-muted-foreground">Enter the last 5 digits from your payment receipt.</p>
              </div>

              {/* Email instructions */}
              <div className="bg-amber-50 border border-amber-200 rounded-lg p-4 space-y-3">
                <div className="flex items-start gap-2">
                  <Mail className="h-4 w-4 text-amber-600 mt-0.5 shrink-0" />
                  <p className="text-sm font-semibold text-amber-800">
                    Also send your receipt to:
                  </p>
                </div>
                <a href="mailto:brightfolkscenter@gmail.com"
                  className="text-primary font-bold hover:underline block text-center">
                  brightfolkscenter@gmail.com
                </a>
                <div className="bg-white rounded-lg p-3 border text-sm space-y-1.5">
                  <p className="font-semibold text-gray-700 mb-2">Email Format:</p>
                  <p><span className="font-medium">SUBJECT:</span> SUBSCRIPTION PAYMENT</p>
                  <p><span className="font-medium">Company:</span> <span className="text-muted-foreground">(your company name)</span></p>
                  <p><span className="font-medium">Subscription Plan:</span> <span className="text-primary font-medium">{selectedPlan.name}</span></p>
                  <p><span className="font-medium">Owner/Admin Email:</span> <span className="text-muted-foreground">(your email)</span></p>
                  <p className="text-xs text-muted-foreground mt-2 italic">Attach your payment receipt/screenshot.</p>
                </div>
              </div>

              {submitError && <p className="text-sm text-destructive text-center">{submitError}</p>}
            </div>
          )}

          {/* Success state */}
          {submitted && (
            <div className="text-center py-6 space-y-3">
              <CheckCircle className="h-12 w-12 text-green-500 mx-auto" />
              <h3 className="text-lg font-semibold">Payment Submitted!</h3>
              <p className="text-sm text-muted-foreground">
                Your payment reference has been recorded. Brightfolks will review and reactivate your account.
                You will receive a notification once approved.
              </p>
              <p className="text-sm text-muted-foreground">
                Don't forget to also email your receipt to <strong>brightfolkscenter@gmail.com</strong>.
              </p>
            </div>
          )}

          <DialogFooter>
            {!submitted ? (
              <>
                <Button variant="outline" onClick={() => setShowModal(false)} disabled={submitting}>Cancel</Button>
                <Button onClick={handleSubmitPayment} disabled={submitting || refNumber.length < 5}>
                  {submitting ? <><Loader2 className="h-4 w-4 animate-spin mr-2" /> Submitting...</> : "Submit Payment"}
                </Button>
              </>
            ) : (
              <Button onClick={() => setShowModal(false)}>Close</Button>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default CompanySuspendedPage;
