import { Routes, Route } from "react-router-dom";
import { AuthProvider } from "./context/AuthContext";
import ProtectedRoute from "./components/ProtectedRoute";

import Home from "./pages/Home.tsx";
import StudentDashboard from "./pages/StudentDashboard.tsx";
import AdminDashboard from "./pages/AdminDashboard.tsx";
import TimeslotPage from "./pages/TimeslotPage.tsx";
import StudentListPage from "./pages/StudentList.tsx";
import AdminProfile from "./pages/AdminProfile.tsx";
import SuperAdminDashboard from "./pages/SuperAdminDashboard.tsx";
import CompanyRegisterPage from "./pages/CompanyRegisterPage.tsx";
import TeacherDashboard from "./pages/TeacherDashboard.tsx";

const AppRoutes = () => {
  return (
    <AuthProvider>
      <Routes>
        {/* Public */}
        <Route path="/" element={<Home />} />
        <Route path="/company/register" element={<CompanyRegisterPage />} />

        {/* Super Admin */}
        <Route
          path="/super-admin"
          element={
            <ProtectedRoute allowedRoles={['super_admin']}>
              <SuperAdminDashboard />
            </ProtectedRoute>
          }
        />

        {/* Company Admin */}
        <Route
          path="/admin-dashboard"
          element={
            <ProtectedRoute allowedRoles={['company_admin']}>
              <AdminDashboard />
            </ProtectedRoute>
          }
        />
        <Route
          path="/students"
          element={
            <ProtectedRoute allowedRoles={['company_admin']}>
              <StudentListPage />
            </ProtectedRoute>
          }
        />
        <Route
          path="/profile"
          element={
            <ProtectedRoute allowedRoles={['company_admin']}>
              <AdminProfile />
            </ProtectedRoute>
          }
        />

        {/* Teacher */}
        <Route
          path="/teacher-dashboard"
          element={
            <ProtectedRoute allowedRoles={['teacher']}>
              <TeacherDashboard />
            </ProtectedRoute>
          }
        />

        {/* Student */}
        <Route
          path="/studentdashboard"
          element={
            <ProtectedRoute allowedRoles={['student']}>
              <StudentDashboard />
            </ProtectedRoute>
          }
        />
        <Route
          path="/timeslots/:date"
          element={
            <ProtectedRoute allowedRoles={['student']}>
              <TimeslotPage />
            </ProtectedRoute>
          }
        />

        {/* Fallback */}
        <Route path="*" element={<Home />} />
      </Routes>
    </AuthProvider>
  );
};

export default AppRoutes;
