import { useState, useEffect, useContext } from "react";
import axios from "axios";
import { useNavigate } from "react-router-dom";
import AuthContext from "@/context/AuthContext";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Alert, AlertDescription } from "@/components/ui/alert";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  Loader2,
  AlertCircle,
  BookOpen,
  Users,
  Star,
  LogOut,
  Clock,
} from "lucide-react";
import BrandLogo from "@/components/BrandLogo";

interface Plan {
  id: number;
  name: string;
  max_students: number;
  max_teachers: number;
  price_monthly: number;
  description: string;
}

const planIcons = [BookOpen, Users, Star];

const UpgradePage = () => {
  const authContext = useContext(AuthContext);
  const navigate = useNavigate();
  const trialExpired = authContext?.trialExpired ?? false;

  const [plans, setPlans] = useState<Plan[]>([]);
  const [selectedPlan, setSelectedPlan] = useState<Plan | null>(null);
  const [step, setStep] = useState<"plans" | "agreement" | "form" | "pending">(
    "plans",
  );

  const [contactName, setContactName] = useState(authContext?.user?.name ?? "");
  const [contactEmail, setContactEmail] = useState("");
  const [referenceNumber, setReferenceNumber] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Check if already has pending request
  const [existingRequest, setExistingRequest] = useState<{
    status: string;
    plan_name: string;
  } | null>(null);

  useEffect(() => {
    // Fetch paid plans only
    axios
      .get(`${import.meta.env.VITE_API_URL}/api/companies/subscription-plans`)
      .then((res) =>
        setPlans(res.data.filter((p: Plan) => p.price_monthly > 0)),
      )
      .catch(() => {});

    // Check existing upgrade request
    const token = localStorage.getItem("token");
    if (token) {
      axios
        .get(
          `${import.meta.env.VITE_API_URL}/api/companies/upgrade-request/status`,
          {
            headers: { Authorization: `Bearer ${token}` },
          },
        )
        .then((res) => {
          if (res.data) setExistingRequest(res.data);
          if (res.data?.status === "pending") setStep("pending");
        })
        .catch(() => {});
    }
  }, []);

  const handleSelectPlan = (plan: Plan) => {
    setSelectedPlan(plan);
    setStep("agreement");
  };

  const handleAgree = () => setStep("form");

  const handleSubmit = async () => {
    if (!selectedPlan) return;
    setIsLoading(true);
    setError(null);
    try {
      const token = localStorage.getItem("token");
      await axios.post(
        `${import.meta.env.VITE_API_URL}/api/companies/upgrade-request`,
        {
          subscription_plan_id: selectedPlan.id,
          reference_number: referenceNumber,
          contact_name: contactName,
          contact_email: contactEmail,
        },
        { headers: { Authorization: `Bearer ${token}` } },
      );
      setStep("pending");
    } catch (err) {
      if (axios.isAxiosError(err)) {
        setError(err.response?.data?.message || "Failed to submit request");
      } else {
        setError("An error occurred");
      }
    } finally {
      setIsLoading(false);
    }
  };

  const handleLogout = () => {
    authContext?.logout();
    navigate("/");
  };

  // Pending screen
  if (step === "pending") {
    return (
      <div className="min-h-screen brand-gradient-subtle pattern-dots-light flex items-center justify-center p-4">
        <Card className="max-w-md w-full text-center shadow-lg">
          <CardContent className="pt-8 pb-8 space-y-4">
            <Clock className="h-16 w-16 text-yellow-500 mx-auto" />
            <h2 className="text-2xl font-bold text-gray-800">
              Awaiting Approval
            </h2>
            <p className="text-muted-foreground">
              Your upgrade request for the{" "}
              <span className="font-medium">
                {selectedPlan?.name || existingRequest?.plan_name}
              </span>{" "}
              plan has been submitted. Our team will review your payment and
              activate your account shortly.
            </p>
            <p className="text-sm text-muted-foreground">
              Don't forget to send your payment receipt to{" "}
              <span className="font-medium text-primary">
                brightfolkscenter@gmail.com
              </span>
            </p>
            <Button variant="outline" onClick={handleLogout} className="gap-2">
              <LogOut className="h-4 w-4" />
              Logout
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="min-h-screen brand-gradient-subtle pattern-dots-light">
      {/* Header */}
      <div className="bg-white border-b px-4 py-3 flex items-center justify-between max-w-7xl mx-auto">
        <BrandLogo />
        {trialExpired && (
          <div className="text-center">
            <p className="text-sm font-semibold text-red-600">
              Your free trial has expired
            </p>
            <p className="text-xs text-muted-foreground">
              Choose a plan to continue
            </p>
          </div>
        )}
        <Button
          variant="ghost"
          size="sm"
          onClick={handleLogout}
          className="gap-1 text-muted-foreground hover:text-destructive"
        >
          <LogOut className="h-4 w-4" /> Logout
        </Button>
      </div>

      <div className="max-w-4xl mx-auto px-4 py-10 space-y-8">
        {/* Hero */}
        <div className="text-center space-y-2">
          <h1 className="text-3xl font-bold text-gray-800">
            Upgrade Your Plan
          </h1>
          <p className="text-muted-foreground">
            Select a subscription plan to restore full access to your
            Brightfolks dashboard.
          </p>
        </div>

        {/* Step indicator */}
        <div className="flex items-center justify-center gap-2 text-sm">
          {["Select Plan", "Agreement", "Payment"].map((label, i) => {
            const stepKeys = ["plans", "agreement", "form"] as const;
            const active = step === stepKeys[i];
            const done =
              (step === "form" && i < 2) || (step === "agreement" && i < 1);
            return (
              <span key={label} className="flex items-center gap-1">
                <span
                  className={`w-6 h-6 rounded-full text-xs flex items-center justify-center font-bold ${
                    done
                      ? "bg-green-500 text-white"
                      : active
                        ? "bg-primary text-white"
                        : "bg-gray-200 text-gray-500"
                  }`}
                >
                  {done ? "✓" : i + 1}
                </span>
                <span
                  className={
                    active
                      ? "font-semibold text-primary"
                      : "text-muted-foreground"
                  }
                >
                  {label}
                </span>
                {i < 2 && <span className="text-gray-300 mx-1">›</span>}
              </span>
            );
          })}
        </div>

        {/* Plan Selection */}
        {step === "plans" && (
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {plans.map((plan, i) => {
              const Icon = planIcons[i % planIcons.length];
              return (
                <Card
                  key={plan.id}
                  onClick={() => handleSelectPlan(plan)}
                  className="cursor-pointer transition-all border-2 border-transparent hover:border-primary/40 hover:shadow-md"
                >
                  <CardHeader className="pb-2">
                    <div className="flex items-center gap-2">
                      <Icon className="h-5 w-5 text-primary" />
                      <CardTitle className="text-base">{plan.name}</CardTitle>
                    </div>
                  </CardHeader>
                  <CardContent className="space-y-2">
                    <p className="text-2xl font-bold text-primary">
                      ₱{plan.price_monthly.toLocaleString()}
                      <span className="text-sm font-normal text-muted-foreground">
                        /mo
                      </span>
                    </p>
                    <ul className="text-sm text-muted-foreground space-y-1">
                      <li>✓ Up to {plan.max_students} students</li>
                      <li>✓ Up to {plan.max_teachers} teachers</li>
                    </ul>
                    <p className="text-xs text-muted-foreground">
                      {plan.description}
                    </p>
                    <Button size="sm" className="w-full mt-2">
                      Select
                    </Button>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        )}

        {/* Payment Form */}
        {step === "form" && selectedPlan && (
          <Card className="shadow-md max-w-lg mx-auto">
            <CardHeader>
              <CardTitle className="text-lg">
                Payment Details — {selectedPlan.name}
              </CardTitle>
              <p className="text-sm text-muted-foreground">
                Amount:{" "}
                <span className="font-semibold text-primary">
                  ₱{selectedPlan.price_monthly.toLocaleString()}/mo
                </span>
              </p>
            </CardHeader>
            <CardContent className="space-y-4">
              {error && (
                <Alert variant="destructive">
                  <AlertCircle className="h-4 w-4" />
                  <AlertDescription>{error}</AlertDescription>
                </Alert>
              )}

              <div className="space-y-1.5">
                <Label>Contact Name</Label>
                <Input
                  value={contactName}
                  onChange={(e) => setContactName(e.target.value)}
                  placeholder="Your full name"
                />
              </div>

              <div className="space-y-1.5">
                <Label>Contact Email</Label>
                <Input
                  type="email"
                  value={contactEmail}
                  onChange={(e) => setContactEmail(e.target.value)}
                  placeholder="your@email.com"
                />
              </div>

              <div className="space-y-1.5">
                <Label>GCash / PayMaya Reference Number</Label>
                <Input
                  value={referenceNumber}
                  onChange={(e) => setReferenceNumber(e.target.value)}
                  placeholder="e.g. 123456789012"
                />
              </div>

              {/* QR Code Placeholder */}
              <div className="border rounded-lg p-4 text-center space-y-2 bg-gray-50">
                <p className="text-sm font-semibold text-gray-700">
                  Scan to Pay
                </p>
                <div className="w-40 h-40 mx-auto bg-gray-200 rounded-lg flex items-center justify-center text-gray-400 text-xs border-2 border-dashed border-gray-300">
                  QR Code
                  <br />
                  (Coming Soon)
                </div>
                <p className="text-xs text-muted-foreground">
                  After payment, send your receipt screenshot to{" "}
                  <span className="font-medium text-primary">
                    brightfolkscenter@gmail.com
                  </span>
                </p>
              </div>

              <div className="flex gap-2 pt-2">
                <Button
                  variant="outline"
                  onClick={() => setStep("plans")}
                  className="flex-1"
                >
                  Back
                </Button>
                <Button
                  onClick={handleSubmit}
                  disabled={
                    isLoading || !referenceNumber.trim() || !contactEmail.trim()
                  }
                  className="flex-1"
                >
                  {isLoading ? (
                    <>
                      <Loader2 className="h-4 w-4 mr-2 animate-spin" />{" "}
                      Submitting…
                    </>
                  ) : (
                    "Submit Request"
                  )}
                </Button>
              </div>
            </CardContent>
          </Card>
        )}
      </div>

      {/* User Agreement Modal */}
      <Dialog
        open={step === "agreement"}
        onOpenChange={(open) => !open && setStep("plans")}
      >
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>
              User Agreement — {selectedPlan?.name} Plan
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-3 text-sm text-muted-foreground max-h-64 overflow-y-auto py-2">
            <p>
              By proceeding with the <strong>{selectedPlan?.name}</strong> plan
              at{" "}
              <strong>
                ₱{selectedPlan?.price_monthly.toLocaleString()}/month
              </strong>
              , you agree to the following terms:
            </p>
            <ul className="space-y-2 list-disc pl-4">
              <li>
                Your subscription will be activated upon manual verification of
                your payment by Brightfolks support.
              </li>
              <li>
                Monthly payments are required to maintain active access to the
                platform.
              </li>
              <li>
                Failure to renew may result in account suspension after your
                current period ends.
              </li>
              <li>
                Subscription fees are non-refundable once the plan is activated.
              </li>
              <li>
                Brightfolks reserves the right to modify plan features or
                pricing with 30 days' notice.
              </li>
              <li>
                Your data will be retained for 30 days after account suspension
                before deletion.
              </li>
              <li>
                You are responsible for ensuring that your usage complies with
                Brightfolks's terms of service.
              </li>
            </ul>
            <p>
              By clicking "I Agree", you confirm that you have read and accepted
              these terms.
            </p>
          </div>
          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={() => setStep("plans")}>
              Go Back
            </Button>
            <Button onClick={handleAgree}>I Agree &amp; Continue</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default UpgradePage;
