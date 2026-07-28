import { useCallback, useContext, useEffect, useState } from "react";
import axios from "axios";
import AuthContext, { User, UserRole } from "@/context/AuthContext";

export interface LinkedAccount {
  id: number;
  name: string;
  email: string;
  role: UserRole;
}

const roleHome: Record<UserRole, string> = {
  super_admin: "/super-admin",
  company_admin: "/admin-dashboard",
  teacher: "/teacher-dashboard",
  student: "/studentdashboard",
};

export const roleLabel = (role: UserRole): string =>
  role === "company_admin" ? "Admin" : role === "teacher" ? "Teacher" : role;

// The navbar and the profile card each hold their own copy of the list, so a
// link added in one has to tell the other — otherwise the switcher only appears
// after the next full page load.
const CHANGED_EVENT = "linked-accounts-changed";
export const notifyLinkedAccountsChanged = () =>
  window.dispatchEvent(new Event(CHANGED_EVENT));

/**
 * Loads the accounts linked to the signed-in user (an admin who also teaches
 * links their teacher account once, then switches between the two from the
 * profile menu) and swaps the session to one of them on demand.
 */
export function useLinkedAccounts() {
  const auth = useContext(AuthContext);
  const [accounts, setAccounts] = useState<LinkedAccount[]>([]);
  const [switching, setSwitching] = useState(false);

  const base = import.meta.env.VITE_API_URL;
  const token = auth?.token;
  // Only these roles can hold a link, so nobody else pays for the request
  const canLink = auth?.user?.role === "company_admin" || auth?.user?.role === "teacher";

  const refresh = useCallback(async () => {
    if (!token || !canLink) {
      setAccounts([]);
      return;
    }
    try {
      const res = await axios.get<LinkedAccount[]>(`${base}/api/auth/linked-accounts`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      setAccounts(res.data);
    } catch {
      setAccounts([]);
    }
  }, [base, token, canLink]);

  useEffect(() => {
    refresh();
    window.addEventListener(CHANGED_EVENT, refresh);
    return () => window.removeEventListener(CHANGED_EVENT, refresh);
  }, [refresh]);

  const switchTo = async (account: LinkedAccount) => {
    if (!auth || switching) return;
    setSwitching(true);
    try {
      const res = await axios.post<{
        token: string;
        user: User;
        trial_expired: boolean;
        company_status: string;
      }>(
        `${base}/api/auth/switch-account`,
        { user_id: account.id },
        { headers: { Authorization: `Bearer ${token}` } }
      );
      const { token: newToken, user, trial_expired, company_status } = res.data;
      await auth.switchAccount(newToken, user, trial_expired, company_status);
      // Hard reload rather than a client-side navigate: the new role renders a
      // different app entirely, and this drops every page's cached state from
      // the old identity instead of leaving it to be re-rendered stale.
      // `replace` so Back doesn't return to the previous role's URL.
      // `switching` deliberately stays true — the page is on its way out, and
      // clearing it would flash the button back to its idle label first.
      window.location.replace(roleHome[user.role]);
    } catch (err) {
      const msg =
        (err as { response?: { data?: { message?: string } } })?.response?.data?.message ||
        "Could not switch account. Please try again.";
      alert(msg);
      setSwitching(false);
    }
  };

  return { accounts, refresh, switchTo, switching, canLink };
}
