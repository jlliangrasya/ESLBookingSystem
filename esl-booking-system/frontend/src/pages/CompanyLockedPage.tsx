import { useContext, useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import axios from "axios";
import AuthContext from "@/context/AuthContext";
import BrandLogo from "@/components/BrandLogo";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Lock, LogOut, Mail } from "lucide-react";

interface Plan {
  id: number;
  name: string;
  max_students: number;
  max_teachers: number;
  price_monthly: number;
  description: string | null;
}

const CompanyLockedPage = () => {
  const navigate = useNavigate();
  const authContext = useContext(AuthContext);
  const [plans, setPlans] = useState<Plan[]>([]);
  const [selectedPlan, setSelectedPlan] = useState<number | null>(null);

  useEffect(() => {
    if (!authContext?.token) { navigate("/"); return; }
    if (authContext.companyStatus !== "locked") {
      navigate("/");
      return;
    }
    axios.get(`${import.meta.env.VITE_API_URL}/api/companies/subscription-plans`)
      .then(res => setPlans(res.data.filter((p: Plan) => p.price_monthly > 0)))
      .catch(() => {});
  }, []);

  const handleLogout = () => {
    authContext?.logout();
    navigate("/");
  };

  return (
    <div className="min-h-screen bg-gray-50">
      <header className="brand-gradient shadow-lg">
        <div className="max-w-7xl mx-auto px-4 h-16 flex items-center justify-between">
          <BrandLogo variant="white" />
          <Button variant="ghost" size="sm" onClick={handleLogout} className="text-white/70 hover:text-white hover:bg-white/10 gap-1">
            <LogOut className="h-4 w-4" /> Logout
          </Button>
        </div>
      </header>

      <div className="max-w-3xl mx-auto px-4 py-10 space-y-6">
        <div className="text-center space-y-3">
          <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-red-100 mb-2">
            <Lock className="h-8 w-8 text-red-600" />
          </div>
          <h1 className="text-2xl font-bold text-gray-900">Account Locked</h1>
          <p className="text-gray-500 max-w-md mx-auto">
            Your company account has been locked due to non-payment. Please select a subscription plan and send your payment to restore access.
          </p>
        </div>

        {/* Plans */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {plans.map(plan => (
            <Card
              key={plan.id}
              className={`cursor-pointer transition-all ${selectedPlan === plan.id ? "ring-2 ring-primary border-primary" : "hover:border-primary/50"}`}
              onClick={() => setSelectedPlan(plan.id)}
            >
              <CardHeader className="pb-2">
                <CardTitle className="text-base">{plan.name}</CardTitle>
              </CardHeader>
              <CardContent className="space-y-2">
                <p className="text-2xl font-bold text-primary">₱{Number(plan.price_monthly).toLocaleString()}<span className="text-sm text-muted-foreground font-normal">/month</span></p>
                <p className="text-xs text-muted-foreground">{plan.description}</p>
                <div className="flex gap-2 flex-wrap">
                  <Badge variant="secondary" className="text-xs">{plan.max_students} students</Badge>
                  <Badge variant="secondary" className="text-xs">{plan.max_teachers} teachers</Badge>
                </div>
                {selectedPlan === plan.id && (
                  <Badge className="bg-primary text-white text-xs">Selected</Badge>
                )}
              </CardContent>
            </Card>
          ))}
        </div>

        {/* Payment Instructions */}
        <Card className="border-amber-200 bg-amber-50">
          <CardContent className="py-5 space-y-4">
            <div className="flex items-start gap-3">
              <Mail className="h-5 w-5 text-amber-600 mt-0.5 shrink-0" />
              <div className="space-y-3">
                <p className="font-semibold text-amber-800">
                  To reactivate your account, email your payment receipt to:
                </p>
                <a href="mailto:brightfolkscenter@gmail.com" className="text-primary font-bold text-lg hover:underline block">
                  brightfolkscenter@gmail.com
                </a>
                <div className="bg-white rounded-lg p-4 border text-sm space-y-1">
                  <p className="font-semibold text-gray-700 mb-2">Email Format:</p>
                  <p><span className="font-medium">SUBJECT:</span> SUBSCRIPTION PAYMENT</p>
                  <p><span className="font-medium">Company:</span> <span className="text-muted-foreground">(your company name)</span></p>
                  <p><span className="font-medium">Subscription Plan:</span> <span className="text-muted-foreground">{selectedPlan ? plans.find(p => p.id === selectedPlan)?.name || "(select a plan above)" : "(select a plan above)"}</span></p>
                  <p><span className="font-medium">Owner Email:</span> <span className="text-muted-foreground">{authContext?.user?.name || "(your email)"}</span></p>
                  <p className="text-xs text-muted-foreground mt-2 italic">Attach your payment receipt to the email.</p>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
};

export default CompanyLockedPage;
