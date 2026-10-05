import { createContext, useState, useEffect } from "react";
import axios from "axios";
import { setUserTimezone } from "@/utils/timezone";
import { unsubscribeFromPush, ensurePushSubscription } from "@/utils/pushNotifications";

export type UserRole = 'super_admin' | 'company_admin' | 'teacher' | 'student';

export interface User {
  id: number;
  name: string;
  role: UserRole;
  company_id: number | null;
  company_name?: string | null;
  timezone?: string;
  is_owner?: boolean;
}

interface AuthContextType {
  token: string | null;
  user: User | null;
  trialExpired: boolean;
  companyStatus: string;
  login: (token: string, user: User, trialExpired?: boolean, companyStatus?: string) => void;
  switchAccount: (token: string, user: User, trialExpired?: boolean, companyStatus?: string) => Promise<void>;
  // Super admin's own session, set aside while they are switched into a company
  impersonator: StoredSession | null;
  enterCompany: (token: string, user: User, trialExpired?: boolean, companyStatus?: string) => void;
  exitCompany: () => void;
  logout: () => void;
}

export interface StoredSession {
  token: string;
  user: User;
}

const IMPERSONATOR_KEY = "impersonator";

const readImpersonator = (): StoredSession | null => {
  try {
    const raw = localStorage.getItem(IMPERSONATOR_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
};

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const AuthProvider = ({ children }: { children: React.ReactNode }) => {
  const storedUser = localStorage.getItem("user");

  const [token, setToken] = useState<string | null>(
    localStorage.getItem("token")
  );
  const [user, setUser] = useState<User | null>(
    storedUser ? JSON.parse(storedUser) : null
  );
  const [trialExpired, setTrialExpired] = useState<boolean>(
    localStorage.getItem("trial_expired") === "true"
  );
  const [companyStatus, setCompanyStatus] = useState<string>(
    localStorage.getItem("company_status") || "active"
  );
  const [impersonator, setImpersonator] = useState<StoredSession | null>(readImpersonator);

  const login = (token: string, user: User, expired = false, status = "active") => {
    setToken(token);
    setUser(user);
    setTrialExpired(expired);
    setCompanyStatus(status);
    localStorage.setItem("token", token);
    localStorage.setItem("user", JSON.stringify(user));
    localStorage.setItem("trial_expired", String(expired));
    localStorage.setItem("company_status", status);
    const browserTz = Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC";
    if (user.timezone && user.timezone !== "UTC") {
      setUserTimezone(user.timezone);
    } else {
      setUserTimezone(browserTz);
    }
  };

  // Swap to a linked account (same person, different role) without logging out.
  // The old account's push subscription is released first and awaited, so it
  // can't race the re-subscribe the token change triggers below.
  const switchAccount = async (
    newToken: string,
    newUser: User,
    expired = false,
    status = "active"
  ) => {
    if (token) await unsubscribeFromPush(token);
    login(newToken, newUser, expired, status);
  };

  // Super admin → company owner. The super admin's own session is kept aside
  // (only the first time — hopping between companies keeps the original), and
  // push is left untouched so this browser keeps the super admin's notifications.
  const enterCompany = (newToken: string, newUser: User, expired = false, status = "active") => {
    const original = impersonator ?? (token && user ? { token, user } : null);
    if (original) {
      setImpersonator(original);
      localStorage.setItem(IMPERSONATOR_KEY, JSON.stringify(original));
    }
    login(newToken, newUser, expired, status);
  };

  const exitCompany = () => {
    if (!impersonator) return;
    setImpersonator(null);
    localStorage.removeItem(IMPERSONATOR_KEY);
    login(impersonator.token, impersonator.user);
  };

  const logout = () => {
    // While switched into a company, the push subscription belongs to the super admin
    const currentToken = impersonator?.token ?? token;
    setImpersonator(null);
    localStorage.removeItem(IMPERSONATOR_KEY);
    setToken(null);
    setUser(null);
    setTrialExpired(false);
    setCompanyStatus("active");
    localStorage.removeItem("token");
    localStorage.removeItem("user");
    localStorage.removeItem("trial_expired");
    localStorage.removeItem("company_status");
    localStorage.removeItem("userTimezone");

    if (currentToken) {
      unsubscribeFromPush(currentToken).catch(() => {});
    }
  };

  // Re-sync the push subscription whenever the app loads with a logged-in
  // user. Silent (never prompts) — repairs subscriptions lost to backend
  // cold starts or VAPID key changes.
  // Skipped while a super admin is inside a company, so this browser isn't
  // re-registered to the company owner's push notifications.
  useEffect(() => {
    if (token && !impersonator) {
      ensurePushSubscription(token).catch(() => {});
    }
  }, [token, impersonator]);

  // Auto-logout on expired/invalid token (401 response)
  useEffect(() => {
    const interceptor = axios.interceptors.response.use(
      (res) => res,
      (err) => {
        if (err.response?.status === 401 && token) {
          logout();
          window.location.href = "/login";
        }
        return Promise.reject(err);
      }
    );
    return () => axios.interceptors.response.eject(interceptor);
  }, [token]);

  return (
    <AuthContext.Provider value={{ token, user, trialExpired, companyStatus, login, switchAccount, impersonator, enterCompany, exitCompany, logout }}>
      {children}
    </AuthContext.Provider>
  );
};

export default AuthContext;
