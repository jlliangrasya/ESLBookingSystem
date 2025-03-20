import { Navigate } from "react-router-dom";
import { useContext } from "react";
import AuthContext from "../context/AuthContext";

interface ProtectedRouteProps {
  children: JSX.Element;
  adminOnly?: boolean;
}

const ProtectedRoute = ({ children, adminOnly }: ProtectedRouteProps) => {
  const authContext = useContext(AuthContext);

  // 🔹 If AuthContext is unavailable, safely redirect to login
  if (!authContext) return <Navigate to="/login" />;

  const { token, user } = authContext;
  const isAdmin = user?.isAdmin ?? false; // Fix: Ensure we access isAdmin safely

  // 🔹 If not logged in, redirect to login
  if (!token) return <Navigate to="/login" />;

  // 🔹 If trying to access an admin-only page but is not an admin, redirect to student dashboard
  if (adminOnly && !isAdmin) return <Navigate to="/dashboard" />;

  return children;
};

export default ProtectedRoute;

// const ProtectedRoute = ({ children }: { children: JSX.Element }) => {
//   return children; // Bypass authentication completely for now
// };
