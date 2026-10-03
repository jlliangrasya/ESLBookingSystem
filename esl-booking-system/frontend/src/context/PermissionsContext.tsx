import { createContext, useCallback, useContext, useEffect, useState } from "react";
import axios from "axios";
import AuthContext from "@/context/AuthContext";
import { PERMISSION_GROUPS, viewKey } from "@/lib/permissions";

interface PermissionsContextType {
  // True until the signed-in company admin's permissions have been fetched
  loading: boolean;
  isOwner: boolean;
  permissions: string[];
  can: (key: string) => boolean;
  canAny: (...keys: string[]) => boolean;
  // First admin page this user may open, or null if none
  homePath: string | null;
  refresh: () => Promise<void>;
}

const PermissionsContext = createContext<PermissionsContextType | undefined>(undefined);

export const PermissionsProvider = ({ children }: { children: React.ReactNode }) => {
  const authContext = useContext(AuthContext);
  const token = authContext?.token;
  const user = authContext?.user;
  const userId = user?.id;
  const isAdmin = user?.role === "company_admin";

  const [isOwner, setIsOwner] = useState(false);
  const [permissions, setPermissions] = useState<string[]>([]);
  // Which account the current permissions belong to. Deriving `loading` from this
  // (rather than a flag set in an effect) means the render right after a login or
  // account switch already counts as loading, instead of briefly showing no access.
  const [loadedFor, setLoadedFor] = useState<number | null>(null);
  const loading = isAdmin && loadedFor !== userId;

  const refresh = useCallback(async () => {
    if (!isAdmin || !token || userId == null) {
      setIsOwner(false);
      setPermissions([]);
      setLoadedFor(null);
      return;
    }
    try {
      const res = await axios.get(`${import.meta.env.VITE_API_URL}/api/admin/me/permissions`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      setIsOwner(!!res.data.is_owner);
      setPermissions(res.data.permissions ?? []);
    } catch (err) {
      console.error("Error fetching permissions:", err);
      setIsOwner(false);
      setPermissions([]);
    } finally {
      setLoadedFor(userId);
    }
  }, [isAdmin, token, userId]);

  // Refetch whenever the signed-in account changes (login, account switch)
  useEffect(() => { refresh(); }, [refresh]);

  const can = useCallback((key: string) => isOwner || permissions.includes(key), [isOwner, permissions]);
  const canAny = useCallback((...keys: string[]) => keys.some(can), [can]);
  const homePath = PERMISSION_GROUPS.find((g) => can(viewKey(g.page)))?.path ?? null;

  return (
    <PermissionsContext.Provider value={{ loading, isOwner, permissions, can, canAny, homePath, refresh }}>
      {children}
    </PermissionsContext.Provider>
  );
};

export const usePermissions = () => {
  const ctx = useContext(PermissionsContext);
  if (!ctx) throw new Error("usePermissions must be used within PermissionsProvider");
  return ctx;
};

export default PermissionsContext;
