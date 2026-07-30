import {
  createContext,
  useContext,
  useState,
  useEffect,
  useCallback,
  useMemo,
  type ReactNode,
} from "react";
import axios from "axios";
import AuthContext from "@/context/AuthContext";

export type OnboardingStepKey =
  | "company_registered"
  | "teacher_added"
  | "class_created"
  | "milestone_reached";

export interface OnboardingStatus {
  company_name: string;
  company_status: string;
  student_invites_gated: boolean;
  steps: Record<OnboardingStepKey, boolean>;
  step_keys: OnboardingStepKey[];
  completed_count: number;
  total_count: number;
  counts: {
    teacher_count: number;
    student_count: number;
    package_count: number;
  };
  first_teacher: { id: number; name: string; email: string } | null;
  milestone_teacher: { id: number; name: string; last_login_at: string } | null;
  onboarding_complete: boolean;
}

interface OnboardingContextValue {
  status: OnboardingStatus | null;
  loading: boolean;
  refresh: () => Promise<void>;
}

const OnboardingContext = createContext<OnboardingContextValue>({
  status: null,
  loading: false,
  refresh: async () => {},
});

/**
 * Holds onboarding status for the whole app.
 *
 * This is a provider rather than a per-component fetch because several surfaces
 * need the same answer at once — the persistent navbar progress bar, the dashboard
 * checklist, the student-invite banner, the milestone screen. Fetching per consumer
 * meant the same query running two or three times on a single page load, and again
 * on every navigation, forever, even for companies that finished onboarding months
 * ago.
 *
 * Fetches once per session for company admins only, and never at all for teachers,
 * students, or super admins. `refresh()` is for after an action that could advance a
 * step.
 */
export function OnboardingProvider({ children }: { children: ReactNode }) {
  const authContext = useContext(AuthContext);
  const token = authContext?.token ?? null;
  const role = authContext?.user?.role ?? null;
  const isCompanyAdmin = role === "company_admin";

  const [status, setStatus] = useState<OnboardingStatus | null>(null);
  const [loading, setLoading] = useState(isCompanyAdmin);

  const refresh = useCallback(async () => {
    if (!token || !isCompanyAdmin) {
      setStatus(null);
      setLoading(false);
      return;
    }
    try {
      const res = await axios.get<OnboardingStatus>(
        `${import.meta.env.VITE_API_URL}/api/onboarding/status`,
        { headers: { Authorization: `Bearer ${token}` } },
      );
      setStatus(res.data);
    } catch {
      // Non-fatal: the progress UI simply doesn't render.
      setStatus(null);
    } finally {
      setLoading(false);
    }
  }, [token, isCompanyAdmin]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const value = useMemo(
    () => ({ status, loading, refresh }),
    [status, loading, refresh],
  );

  return (
    <OnboardingContext.Provider value={value}>
      {children}
    </OnboardingContext.Provider>
  );
}

export function useOnboarding() {
  return useContext(OnboardingContext);
}
