import { Navigate } from "react-router-dom";
import { useContext } from "react";
import AuthContext, { UserRole } from "../context/AuthContext";

interface ProtectedRouteProps {
  children: JSX.Element;
  allowedRoles: UserRole[];
}

const ProtectedRoute = ({ children, allowedRoles }: ProtectedRouteProps) => {
  const authContext = useContext(AuthContext);

  if (!authContext) return <Navigate to="/" />;

  const { token, user } = authContext;

  if (!token || !user) return <Navigate to="/" />;

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

  return children;
};

export default ProtectedRoute;
