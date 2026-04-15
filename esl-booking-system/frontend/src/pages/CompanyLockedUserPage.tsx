import { useContext, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import AuthContext from "@/context/AuthContext";
import BrandLogo from "@/components/BrandLogo";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Lock, LogOut } from "lucide-react";

const CompanyLockedUserPage = () => {
  const navigate = useNavigate();
  const authContext = useContext(AuthContext);

  useEffect(() => {
    if (!authContext?.token) { navigate("/"); return; }
    if (authContext.companyStatus !== "locked") navigate("/");
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
        <div className="inline-flex items-center justify-center w-20 h-20 rounded-full bg-amber-100">
          <Lock className="h-10 w-10 text-amber-600" />
        </div>

        <h1 className="text-2xl font-bold text-gray-900">Account Locked</h1>

        <Card>
          <CardContent className="py-6 space-y-3">
            <p className="text-gray-600">
              The company account is currently locked. Please reach out to your company or to your learning center to resolve this.
            </p>
            <p className="text-sm text-muted-foreground">
              If you need further assistance, contact Brightfolks at{" "}
              <a href="mailto:brightfolkscenter@gmail.com" className="text-primary font-medium hover:underline">
                brightfolkscenter@gmail.com
              </a>
            </p>
          </CardContent>
        </Card>
      </div>
    </div>
  );
};

export default CompanyLockedUserPage;
