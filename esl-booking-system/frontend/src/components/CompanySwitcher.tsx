import { useContext, useEffect, useMemo, useState } from "react";
import axios from "axios";
import { Building2, Check, Search, ShieldCheck } from "lucide-react";
import AuthContext, { User } from "@/context/AuthContext";
import {
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
} from "@/components/ui/dropdown-menu";

interface SwitchableCompany {
  id: number;
  company_name: string;
}

/**
 * Lets the super admin jump into any active company as its owner, hop between
 * companies, and return to their own account — all from the profile menu.
 * Every request goes out with the super admin's own token, so it keeps working
 * while they're switched into a company.
 */
export function useCompanySwitcher() {
  const auth = useContext(AuthContext);
  const [companies, setCompanies] = useState<SwitchableCompany[]>([]);
  const [switchingId, setSwitchingId] = useState<number | "back" | null>(null);

  const base = import.meta.env.VITE_API_URL;
  const impersonator = auth?.impersonator ?? null;
  const superToken = impersonator?.token ?? (auth?.user?.role === "super_admin" ? auth.token : null);
  const enabled = Boolean(superToken);
  const currentCompanyId = impersonator ? auth?.user?.company_id ?? null : null;

  useEffect(() => {
    if (!superToken) {
      setCompanies([]);
      return;
    }
    axios
      .get<SwitchableCompany[]>(`${base}/api/super-admin/switchable-companies`, {
        headers: { Authorization: `Bearer ${superToken}` },
      })
      .then((res) => setCompanies(res.data))
      .catch(() => setCompanies([]));
  }, [base, superToken]);

  const switchTo = async (company: SwitchableCompany) => {
    if (!auth || !superToken || switchingId !== null || company.id === currentCompanyId) return;
    setSwitchingId(company.id);
    try {
      const res = await axios.post<{
        token: string;
        user: User;
        trial_expired: boolean;
        company_status: string;
      }>(`${base}/api/super-admin/companies/${company.id}/switch`, {}, {
        headers: { Authorization: `Bearer ${superToken}` },
      });
      const { token, user, trial_expired, company_status } = res.data;
      auth.enterCompany(token, user, trial_expired, company_status);
      // Hard reload so no page keeps cached data from the previous identity.
      // `switchingId` stays set — the page is on its way out.
      window.location.replace("/admin-dashboard");
    } catch (err) {
      const msg =
        (err as { response?: { data?: { message?: string } } })?.response?.data?.message ||
        "Could not switch company. Please try again.";
      alert(msg);
      setSwitchingId(null);
    }
  };

  const backToSuperAdmin = () => {
    if (!auth || !impersonator) return;
    setSwitchingId("back");
    auth.exitCompany();
    window.location.replace("/super-admin");
  };

  return {
    enabled,
    companies,
    currentCompanyId,
    isImpersonating: Boolean(impersonator),
    switchingId,
    switchTo,
    backToSuperAdmin,
  };
}

type Switcher = ReturnType<typeof useCompanySwitcher>;

function useCompanyFilter(companies: SwitchableCompany[]) {
  const [query, setQuery] = useState("");
  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return q ? companies.filter((c) => c.company_name.toLowerCase().includes(q)) : companies;
  }, [companies, query]);
  return { query, setQuery, filtered };
}

/** Items for the desktop profile dropdown. Renders nothing for non-super-admins. */
export function CompanySwitcherMenuItems({ switcher }: { switcher: Switcher }) {
  const { enabled, companies, currentCompanyId, isImpersonating, switchingId, switchTo, backToSuperAdmin } = switcher;
  const { query, setQuery, filtered } = useCompanyFilter(companies);
  if (!enabled) return null;

  return (
    <>
      {isImpersonating && (
        <>
          <DropdownMenuItem
            disabled={switchingId !== null}
            onSelect={(e) => { e.preventDefault(); backToSuperAdmin(); }}
            className="cursor-pointer flex items-center gap-2 font-medium text-primary focus:text-primary"
          >
            <ShieldCheck className="h-4 w-4 text-primary" />
            {switchingId === "back" ? "Switching..." : "Back to Super Admin"}
          </DropdownMenuItem>
          <DropdownMenuSeparator />
        </>
      )}
      <DropdownMenuLabel className="text-xs text-muted-foreground">Switch company</DropdownMenuLabel>
      {companies.length > 6 && (
        <div className="px-2 pb-1">
          <div className="relative">
            <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              // Keep Radix's typeahead/arrow handling from stealing keystrokes
              onKeyDown={(e) => e.stopPropagation()}
              placeholder="Search companies..."
              className="w-full rounded-md border bg-background pl-7 pr-2 py-1.5 text-sm outline-none focus:ring-1 focus:ring-primary"
            />
          </div>
        </div>
      )}
      <div className="max-h-64 overflow-y-auto">
        {filtered.length === 0 && (
          <p className="px-2 py-1.5 text-sm text-muted-foreground">
            {companies.length === 0 ? "No active companies" : "No matches"}
          </p>
        )}
        {filtered.map((c) => {
          const current = c.id === currentCompanyId;
          return (
            <DropdownMenuItem
              key={c.id}
              disabled={switchingId !== null}
              onSelect={(e) => { e.preventDefault(); switchTo(c); }}
              className={`cursor-pointer flex items-center gap-2 ${current ? "font-medium" : ""}`}
            >
              <Building2 className="h-4 w-4 shrink-0" />
              <span className="truncate flex-1">
                {switchingId === c.id ? "Switching..." : c.company_name}
              </span>
              {current && <Check className="h-4 w-4 text-primary shrink-0" />}
            </DropdownMenuItem>
          );
        })}
      </div>
      <DropdownMenuSeparator />
    </>
  );
}

/** Same switcher for the mobile hamburger menu (white-on-gradient styling). */
export function CompanySwitcherMobile({ switcher, onDone }: { switcher: Switcher; onDone?: () => void }) {
  const { enabled, companies, currentCompanyId, isImpersonating, switchingId, switchTo, backToSuperAdmin } = switcher;
  const { query, setQuery, filtered } = useCompanyFilter(companies);
  if (!enabled) return null;

  return (
    <div className="border-y border-white/10 py-2 my-1">
      {isImpersonating && (
        <button
          disabled={switchingId !== null}
          onClick={() => { onDone?.(); backToSuperAdmin(); }}
          className="flex items-center gap-3 px-4 py-3 text-white hover:bg-white/10 transition-colors w-full disabled:opacity-50"
        >
          <ShieldCheck className="h-5 w-5" />
          <span className="text-sm font-semibold">
            {switchingId === "back" ? "Switching..." : "Back to Super Admin"}
          </span>
        </button>
      )}
      <p className="px-4 pt-2 pb-1 text-xs font-medium uppercase tracking-wide text-white/50">Switch company</p>
      {companies.length > 6 && (
        <div className="px-4 pb-2">
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search companies..."
            className="w-full rounded-md bg-white/10 px-3 py-2 text-sm text-white placeholder:text-white/50 outline-none focus:ring-1 focus:ring-white/40"
          />
        </div>
      )}
      <div className="max-h-60 overflow-y-auto">
        {filtered.length === 0 && (
          <p className="px-4 py-2 text-sm text-white/60">
            {companies.length === 0 ? "No active companies" : "No matches"}
          </p>
        )}
        {filtered.map((c) => {
          const current = c.id === currentCompanyId;
          return (
            <button
              key={c.id}
              disabled={switchingId !== null || current}
              onClick={() => switchTo(c)}
              className={`flex items-center gap-3 px-4 py-2.5 w-full text-left transition-colors disabled:cursor-default ${
                current ? "text-white bg-white/10" : "text-white/80 hover:text-white hover:bg-white/10"
              }`}
            >
              <Building2 className="h-5 w-5 shrink-0" />
              <span className="text-sm font-medium truncate flex-1">
                {switchingId === c.id ? "Switching..." : c.company_name}
              </span>
              {current && <Check className="h-4 w-4 shrink-0" />}
            </button>
          );
        })}
      </div>
    </div>
  );
}

/**
 * Thin strip under the navbar while the super admin is inside a company, so
 * it's always obvious whose data they're looking at and how to get out.
 */
export function ImpersonationBanner({ switcher }: { switcher: Switcher }) {
  const auth = useContext(AuthContext);
  if (!switcher.isImpersonating) return null;
  return (
    <div className="bg-amber-400 text-amber-950 text-xs sm:text-sm">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-1.5 flex items-center justify-between gap-3">
        <span className="truncate">
          Viewing as <strong>{auth?.user?.company_name ?? "company"}</strong> (Super Admin)
        </span>
        <button
          onClick={switcher.backToSuperAdmin}
          disabled={switcher.switchingId !== null}
          className="shrink-0 font-semibold underline underline-offset-2 hover:no-underline disabled:opacity-50"
        >
          Back to Super Admin
        </button>
      </div>
    </div>
  );
}
