import { useContext, useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import axios from "axios";
import AuthContext from "@/context/AuthContext";
import BrandLogo from "@/components/BrandLogo";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import { Lock, LogOut, Mail } from "lucide-react";
import qrCodeImage from "@/assets/superadmin_qrcode.jpg";

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
  const [selectedPlan, setSelectedPlan] = useState<Plan | null>(null);
  const [showModal, setShowModal] = useState(false);

  useEffect(() => {
    if (!authContext?.token) { navigate("/"); return; }
    if (authContext.companyStatus !== "locked") { navigate("/"); return; }
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
    setShowModal(true);
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
          <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-red-100 mb-2">
            <Lock className="h-8 w-8 text-red-600" />
          </div>
          <h1 className="text-2xl font-bold text-gray-900">Account Locked</h1>
          <p className="text-gray-500 max-w-md mx-auto">
            Your company account has been locked due to non-payment. Please select a subscription plan below to make your payment and restore access.
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
                <p className="text-xs text-muted-foreground">{plan.description}</p>
                <div className="flex gap-2 flex-wrap">
                  <Badge variant="secondary" className="text-xs">{plan.max_students} students</Badge>
                  <Badge variant="secondary" className="text-xs">{plan.max_teachers} teachers</Badge>
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
      <Dialog open={showModal} onOpenChange={setShowModal}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="text-center">Payment for {selectedPlan?.name}</DialogTitle>
          </DialogHeader>
          {selectedPlan && (
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

              {/* Send receipt instructions */}
              <div className="bg-amber-50 border border-amber-200 rounded-lg p-4 space-y-3">
                <div className="flex items-start gap-2">
                  <Mail className="h-4 w-4 text-amber-600 mt-0.5 shrink-0" />
                  <p className="text-sm font-semibold text-amber-800">
                    After payment, send your receipt to:
                  </p>
                </div>
                <a href="mailto:brightfolkscenter@gmail.com"
                  className="text-primary font-bold text-lg hover:underline block text-center">
                  brightfolkscenter@gmail.com
                </a>

                <div className="bg-white rounded-lg p-3 border text-sm space-y-1.5">
                  <p className="font-semibold text-gray-700 mb-2">Email Format:</p>
                  <p><span className="font-medium">SUBJECT:</span> SUBSCRIPTION PAYMENT</p>
                  <p><span className="font-medium">Company:</span>{" "}
                    <span className="text-muted-foreground">(your company name)</span>
                  </p>
                  <p><span className="font-medium">Subscription Plan:</span>{" "}
                    <span className="text-primary font-medium">{selectedPlan.name}</span>
                  </p>
                  <p><span className="font-medium">Owner/Admin Email:</span>{" "}
                    <span className="text-muted-foreground">{authContext?.user?.name || "(your email)"}</span>
                  </p>
                  <p className="text-xs text-muted-foreground mt-2 italic">
                    Attach your payment receipt/screenshot to the email.
                  </p>
                </div>
              </div>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowModal(false)}>Close</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default CompanyLockedPage;
