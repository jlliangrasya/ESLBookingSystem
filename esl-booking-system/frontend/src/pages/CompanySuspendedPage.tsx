import { useContext, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import AuthContext from "@/context/AuthContext";
import BrandLogo from "@/components/BrandLogo";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { ShieldX, LogOut, Mail } from "lucide-react";

const CompanySuspendedPage = () => {
  const navigate = useNavigate();
  const authContext = useContext(AuthContext);

  useEffect(() => {
    if (!authContext?.token) { navigate("/"); return; }
    if (authContext.companyStatus !== "suspended") {
      navigate("/");
    }
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

      <div className="max-w-lg mx-auto px-4 py-16 text-center space-y-6">
        <div className="inline-flex items-center justify-center w-20 h-20 rounded-full bg-red-100">
          <ShieldX className="h-10 w-10 text-red-600" />
        </div>

        <h1 className="text-2xl font-bold text-gray-900">Company Suspended</h1>

        <p className="text-gray-500">
          Your company account has been suspended. You are unable to access the platform at this time.
        </p>

        <Card className="border-gray-200 text-left">
          <CardContent className="py-5">
            <div className="flex items-start gap-3">
              <Mail className="h-5 w-5 text-primary mt-0.5 shrink-0" />
              <div className="space-y-2">
                <p className="text-sm font-medium text-gray-700">
                  Please contact Brightfolks to resolve this issue:
                </p>
                <a href="mailto:brightfolkscenter@gmail.com" className="text-primary font-bold text-lg hover:underline block">
                  brightfolkscenter@gmail.com
                </a>
                <p className="text-xs text-muted-foreground">
                  Include your company name and account email in your message.
                </p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
};

export default CompanySuspendedPage;
