import { Navigate } from "react-router-dom";
import { useContext } from "react";
import AuthContext, { UserRole } from "../context/AuthContext";
import { usePermissions } from "../context/PermissionsContext";

interface ProtectedRouteProps {
  children: JSX.Element;
  allowedRoles: UserRole[];
  // Sub-admin permission key needed to open the page (company_admin only)
  permission?: string;
}

const ProtectedRoute = ({ children, allowedRoles, permission }: ProtectedRouteProps) => {
  const authContext = useContext(AuthContext);
  const perms = usePermissions();

  if (!authContext) return <Navigate to="/" />;

  const { token, user, trialExpired, companyStatus } = authContext;

  if (!token || !user) return <Navigate to="/" />;

  // NOTE: 'pending' is deliberately absent from the checks below. It means
  // "registered and fully usable, but not yet cleared to invite real students" —
  // the single restriction is enforced by POST /api/admin/students and surfaced on
  // /onboarding/approval. Redirecting pending companies away from the app is the
  // behaviour this onboarding redesign specifically removed; don't reintroduce it.

  // Suspended (non-payment) → admin pays, others see generic
  if (companyStatus === 'suspended') {
    if (user.role === 'company_admin') return <Navigate to="/company-suspended" />;
    return <Navigate to="/company-locked-user" />;
  }
  // Locked (by Brightfolks) → admin contacts support, others see generic
  if (companyStatus === 'locked') {
    if (user.role === 'company_admin') return <Navigate to="/company-locked" />;
    return <Navigate to="/company-locked-user" />;
  }

  // If company admin's trial has expired, force to upgrade page
  if (user.role === 'company_admin' && trialExpired) return <Navigate to="/upgrade" />;

  if (!allowedRoles.includes(user.role)) {
    // Redirect to the correct dashboard for this role
    const roleHome: Record<UserRole, string> = {
      super_admin: '/super-admin',
      company_admin: '/admin-dashboard',
      teacher: '/teacher-dashboard',
      student: '/studentdashboard',
    };
    return <Navigate to={roleHome[user.role]} />;
  }

  if (permission && user.role === "company_admin") {
    if (perms.loading) {
      return <div className="flex items-center justify-center min-h-screen text-gray-400">Loading…</div>;
    }
    if (!perms.can(permission)) {
      if (perms.homePath) return <Navigate to={perms.homePath} replace />;
      return (
        <div className="flex flex-col items-center justify-center min-h-screen gap-3 px-4 text-center">
          <p className="text-lg font-semibold">No pages available</p>
          <p className="text-sm text-muted-foreground max-w-sm">
            Your admin account doesn't have access to any pages yet. Ask the company owner to grant you permissions.
          </p>
          <button className="text-sm text-primary underline" onClick={() => authContext.logout()}>Log out</button>
        </div>
      );
    }
  }

  return children;
};

export default ProtectedRoute;
