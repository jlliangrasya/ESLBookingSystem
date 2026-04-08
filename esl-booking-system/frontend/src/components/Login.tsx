import { useState, useContext, useEffect } from "react";
import axios from "axios";
import { useTranslation } from "react-i18next";
import AuthContext, { UserRole } from "../context/AuthContext";
import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Loader2, AlertCircle, Eye, EyeOff } from "lucide-react";
import { isPushSupported, subscribeToPush } from "@/utils/pushNotifications";

const ROLE_ROUTES: Record<UserRole, string> = {
  super_admin: "/super-admin",
  company_admin: "/admin-dashboard",
  teacher: "/teacher-dashboard",
  student: "/studentdashboard",
};

const Login = () => {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const { t } = useTranslation();

  const authContext = useContext(AuthContext);
  if (!authContext) throw new Error("AuthContext must be used within an AuthProvider");

  const { login } = authContext;
  const navigate = useNavigate();

  // Dev auto-login (opt-in)
  useEffect(() => {
    const devEmail = import.meta.env.VITE_DEV_EMAIL;
    const devPassword = import.meta.env.VITE_DEV_PASSWORD;
    const devAutoLoginEnabled = import.meta.env.VITE_DEV_AUTO_LOGIN === "true";
    if (import.meta.env.DEV && devAutoLoginEnabled && devEmail && devPassword) {
      axios
        .post(`${import.meta.env.VITE_API_URL}/api/auth/login`, {
          email: devEmail,
          password: devPassword,
        })
        .then((res) => {
          login(res.data.token, res.data.user);
          navigate(ROLE_ROUTES[res.data.user.role as UserRole] ?? "/");
        })
        .catch(() => {});
    }
  }, [login, navigate]);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);
    setError("");
    try {
      const res = await axios.post(
        `${import.meta.env.VITE_API_URL}/api/auth/login`,
        { email, password },
        { headers: { "Content-Type": "application/json" } }
      );

      const trialExpired = res.data.trial_expired ?? false;
      const companyStatus = res.data.company_status ?? 'active';
      login(res.data.token, res.data.user, trialExpired, companyStatus);

      // Subscribe to push notifications (best-effort)
      if (isPushSupported()) {
        subscribeToPush(res.data.token)
          .then((ok) => console.log('[Push] subscribe result:', ok))
          .catch((err) => console.warn('[Push] subscribe failed:', err));
      } else {
        console.warn('[Push] not supported in this browser');
      }

      if (companyStatus === 'locked') return navigate("/company-locked");
      if (companyStatus === 'suspended') return navigate("/company-suspended");
      if (trialExpired) return navigate("/upgrade");
      navigate(ROLE_ROUTES[res.data.user.role as UserRole] ?? "/");
    } catch (err: unknown) {
      if (axios.isAxiosError(err) && err.response) {
        setError(err.response.data.message || t("login.loginFailed"));
      } else {
        setError(t("login.unexpectedError"));
      }
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <form onSubmit={handleLogin} className="space-y-4">
      {error && (
        <Alert variant="destructive">
          <AlertCircle className="h-4 w-4" />
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      <div className="space-y-1.5">
        <Label htmlFor="email">{t("login.email")}</Label>
        <Input
          id="email"
          type="email"
          placeholder={t("login.emailPlaceholder")}
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          required
        />
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="password">{t("login.password")}</Label>
        <div className="relative">
          <Input
            id="password"
            type={showPassword ? "text" : "password"}
            placeholder={t("login.passwordPlaceholder")}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
            className="pr-10"
          />
          <button
            type="button"
            onClick={() => setShowPassword((v) => !v)}
            className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
            tabIndex={-1}
          >
            {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
          </button>
        </div>
      </div>

      <Button type="submit" className="w-full" disabled={isLoading}>
        {isLoading ? (
          <>
            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            {t("login.loggingIn")}
          </>
        ) : (
          t("login.loginButton")
        )}
      </Button>

    </form>
  );
};

export default Login;
