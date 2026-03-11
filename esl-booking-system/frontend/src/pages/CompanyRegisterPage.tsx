import { useState, useEffect } from "react";
import axios from "axios";
import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { CheckCircle2, Loader2, AlertCircle, Users, BookOpen, Star } from "lucide-react";
import logo from "../assets/EuniTalk_Logo.png";

interface Plan {
  id: number;
  name: string;
  max_students: number;
  max_teachers: number;
  price_monthly: number;
  description: string;
}

const planIcons = [BookOpen, Users, Star];

const CompanyRegisterPage = () => {
  const [plans, setPlans] = useState<Plan[]>([]);
  const [selectedPlan, setSelectedPlan] = useState<number | null>(null);
  const [submitted, setSubmitted] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [form, setForm] = useState({
    name: "",
    email: "",
    phone: "",
    address: "",
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

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    setForm({ ...form, [e.target.name]: e.target.value });
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedPlan) {
      setError("Please select a subscription plan.");
      return;
    }
    setIsLoading(true);
    setError(null);
    try {
      await axios.post(`${import.meta.env.VITE_API_URL}/api/companies/register`, {
        ...form,
        subscription_plan_id: selectedPlan,
      });
      setSubmitted(true);
    } catch (err: unknown) {
      if (axios.isAxiosError(err) && err.response) {
        setError(err.response.data.message || "Registration failed");
      } else {
        setError("An unexpected error occurred");
      }
    } finally {
      setIsLoading(false);
    }
  };

  if (submitted) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-primary/10 to-blue-50 flex items-center justify-center p-4">
        <Card className="max-w-md w-full text-center shadow-lg">
          <CardContent className="pt-8 pb-8 space-y-4">
            <CheckCircle2 className="h-16 w-16 text-green-500 mx-auto" />
            <h2 className="text-2xl font-bold text-gray-800">Application Submitted!</h2>
            <p className="text-muted-foreground">
              Your ESL center registration is pending review. Our team will contact you at{" "}
              <span className="font-medium">{form.owner_email}</span> once approved.
            </p>
            <Button onClick={() => navigate("/")} className="w-full mt-4">
              Back to Home
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-primary/10 to-blue-50">
      {/* Header */}
      <div className="bg-white border-b px-4 py-3 flex items-center justify-between max-w-7xl mx-auto">
        <img src={logo} alt="EuniTalk Logo" className="h-10 w-auto cursor-pointer"
          onClick={() => navigate("/")} />
        <Button variant="outline" size="sm" onClick={() => navigate("/")}>
          Back to Home
        </Button>
      </div>

      <div className="max-w-5xl mx-auto px-4 py-10 space-y-10">
        {/* Hero */}
        <div className="text-center space-y-2">
          <h1 className="text-3xl font-bold text-gray-800">
            Register Your ESL Center
          </h1>
          <p className="text-muted-foreground max-w-xl mx-auto">
            Join the EuniTalk platform. Manage your students, teachers, and schedules — all in one place.
          </p>
        </div>

        {/* Subscription Plans */}
        <div>
          <h2 className="text-lg font-semibold text-gray-700 mb-4">Choose a Plan</h2>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {plans.map((plan, i) => {
              const Icon = planIcons[i % planIcons.length];
              const isSelected = selectedPlan === plan.id;
              const isFreeTrial = plan.price_monthly === 0;
              return (
                <Card
                  key={plan.id}
                  onClick={() => setSelectedPlan(plan.id)}
                  className={`cursor-pointer transition-all border-2 ${
                    isSelected
                      ? "border-primary shadow-md"
                      : isFreeTrial
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
                      {isFreeTrial && (
                        <span className="text-[10px] font-bold bg-green-100 text-green-700 px-2 py-0.5 rounded-full uppercase tracking-wide">
                          Free Trial
                        </span>
                      )}
                    </div>
                  </CardHeader>
                  <CardContent className="space-y-2">
                    {isFreeTrial ? (
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
                      {isFreeTrial && <li className="text-green-600 font-medium">✓ 30-day trial period</li>}
                    </ul>
                    <p className="text-xs text-muted-foreground">{plan.description}</p>
                    {isSelected && (
                      <p className="text-xs font-semibold text-primary">✓ Selected</p>
                    )}
                  </CardContent>
                </Card>
              );
            })}
          </div>
        </div>

        {/* Registration Form */}
        <Card className="shadow-md">
          <CardHeader>
            <CardTitle className="text-lg">Company & Account Details</CardTitle>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleSubmit} className="space-y-5">
              {error && (
                <Alert variant="destructive">
                  <AlertCircle className="h-4 w-4" />
                  <AlertDescription>{error}</AlertDescription>
                </Alert>
              )}

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <Label htmlFor="name">ESL Center Name *</Label>
                  <Input id="name" name="name" placeholder="e.g. Bright English Academy"
                    value={form.name} onChange={handleChange} required />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="email">Company Email *</Label>
                  <Input id="email" name="email" type="email" placeholder="contact@yourschool.com"
                    value={form.email} onChange={handleChange} required />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="phone">Phone Number</Label>
                  <Input id="phone" name="phone" placeholder="+63 912 345 6789"
                    value={form.phone} onChange={handleChange} />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="address">Address</Label>
                  <Input id="address" name="address" placeholder="City, Province"
                    value={form.address} onChange={handleChange} />
                </div>
              </div>

              <hr />
              <p className="text-sm font-medium text-gray-600">Admin Account (your login)</p>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <Label htmlFor="owner_name">Your Full Name *</Label>
                  <Input id="owner_name" name="owner_name" placeholder="Juan Dela Cruz"
                    value={form.owner_name} onChange={handleChange} required />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="owner_email">Your Email *</Label>
                  <Input id="owner_email" name="owner_email" type="email" placeholder="you@example.com"
                    value={form.owner_email} onChange={handleChange} required />
                </div>
                <div className="space-y-1.5 md:col-span-2">
                  <Label htmlFor="owner_password">Password *</Label>
                  <Input id="owner_password" name="owner_password" type="password"
                    placeholder="Minimum 8 characters"
                    value={form.owner_password} onChange={handleChange} required />
                </div>
              </div>

              <Button type="submit" className="w-full" disabled={isLoading || !selectedPlan}>
                {isLoading ? (
                  <><Loader2 className="mr-2 h-4 w-4 animate-spin" /> Submitting…</>
                ) : (
                  "Submit Application"
                )}
              </Button>

              <p className="text-xs text-center text-muted-foreground">
                By submitting, you agree to our terms of service. Your application will be reviewed
                within 1–2 business days.
              </p>
            </form>
          </CardContent>
        </Card>
      </div>
    </div>
  );
};

export default CompanyRegisterPage;
