import { createContext, useState } from "react";
import { setUserTimezone } from "@/utils/timezone";

export type UserRole = 'super_admin' | 'company_admin' | 'teacher' | 'student';

export interface User {
  id: number;
  name: string;
  role: UserRole;
  company_id: number | null;
  timezone?: string;
  is_owner?: boolean;
}

interface AuthContextType {
  token: string | null;
  user: User | null;
  trialExpired: boolean;
  login: (token: string, user: User, trialExpired?: boolean) => void;
  logout: () => void;
}

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

  const login = (token: string, user: User, expired = false) => {
    setToken(token);
    setUser(user);
    setTrialExpired(expired);
    localStorage.setItem("token", token);
    localStorage.setItem("user", JSON.stringify(user));
    localStorage.setItem("trial_expired", String(expired));
    const browserTz = Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC";
    if (user.timezone && user.timezone !== "UTC") {
      setUserTimezone(user.timezone);
    } else {
      setUserTimezone(browserTz);
    }
  };

  const logout = () => {
    setToken(null);
    setUser(null);
    setTrialExpired(false);
    localStorage.removeItem("token");
    localStorage.removeItem("user");
    localStorage.removeItem("trial_expired");
    localStorage.removeItem("userTimezone");
  };

  return (
    <AuthContext.Provider value={{ token, user, trialExpired, login, logout }}>
      {children}
    </AuthContext.Provider>
  );
};

export default AuthContext;
