import { lazy, Suspense } from "react";
import { Routes, Route } from "react-router-dom";
import { AuthProvider } from "./context/AuthContext";
import ProtectedRoute from "./components/ProtectedRoute";

// Eager-load only the landing page (needed before auth resolves)
import Home from "./pages/Home.tsx";

// All other pages are lazy-loaded — each becomes its own JS chunk
const StudentDashboard         = lazy(() => import("./pages/StudentDashboard.tsx"));
const AdminDashboard           = lazy(() => import("./pages/AdminDashboard.tsx"));
const TimeslotPage             = lazy(() => import("./pages/TimeslotPage.tsx"));
const StudentListPage          = lazy(() => import("./pages/StudentList.tsx"));
const AdminProfile             = lazy(() => import("./pages/AdminProfile.tsx"));
const SuperAdminDashboard      = lazy(() => import("./pages/SuperAdminDashboard.tsx"));
const CompanyRegisterPage      = lazy(() => import("./pages/CompanyRegisterPage.tsx"));
const TeacherDashboard         = lazy(() => import("./pages/TeacherDashboard.tsx"));
const UpgradePage              = lazy(() => import("./pages/UpgradePage.tsx"));
const TeacherManagementPage    = lazy(() => import("./pages/TeacherManagementPage.tsx"));
const AdminManagementPage      = lazy(() => import("./pages/AdminManagementPage.tsx"));
const PackageSetupPage         = lazy(() => import("./pages/PackageSetupPage.tsx"));
const AdminStudentProfilePage  = lazy(() => import("./pages/AdminStudentProfilePage.tsx"));
const TeacherProfilePage       = lazy(() => import("./pages/TeacherProfilePage.tsx"));
const AdminTeacherProfilePage  = lazy(() => import("./pages/AdminTeacherProfilePage.tsx"));
const ForgotPasswordPage       = lazy(() => import("./pages/ForgotPasswordPage.tsx"));
const ResetPasswordPage        = lazy(() => import("./pages/ResetPasswordPage.tsx"));
const StudentProfilePage       = lazy(() => import("./pages/StudentProfilePage.tsx"));
const ActivityLogPage          = lazy(() => import("./pages/ActivityLogPage.tsx"));

const AppRoutes = () => {
  return (
    <AuthProvider>
      <Suspense fallback={<div className="flex items-center justify-center min-h-screen text-gray-400">Loading…</div>}>
      <Routes>
        {/* Public */}
        <Route path="/" element={<Home />} />
        <Route path="/company/register" element={<CompanyRegisterPage />} />
        <Route path="/upgrade" element={<UpgradePage />} />
        <Route path="/forgot-password" element={<ForgotPasswordPage />} />
        <Route path="/reset-password" element={<ResetPasswordPage />} />

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
          path="/admin/students/:id"
          element={
            <ProtectedRoute allowedRoles={['company_admin']}>
              <AdminStudentProfilePage />
            </ProtectedRoute>
          }
        />
        <Route
          path="/admin/teachers/:id"
          element={
            <ProtectedRoute allowedRoles={['company_admin']}>
              <AdminTeacherProfilePage />
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
        <Route
          path="/packages"
          element={
            <ProtectedRoute allowedRoles={['company_admin']}>
              <PackageSetupPage />
            </ProtectedRoute>
          }
        />
        <Route
          path="/teachers"
          element={
            <ProtectedRoute allowedRoles={['company_admin']}>
              <TeacherManagementPage />
            </ProtectedRoute>
          }
        />
        <Route
          path="/admin-users"
          element={
            <ProtectedRoute allowedRoles={['company_admin']}>
              <AdminManagementPage />
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
        <Route
          path="/teacher-profile"
          element={
            <ProtectedRoute allowedRoles={['teacher']}>
              <TeacherProfilePage />
            </ProtectedRoute>
          }
        />

        {/* Student */}
        <Route
          path="/student-profile"
          element={
            <ProtectedRoute allowedRoles={['student']}>
              <StudentProfilePage />
            </ProtectedRoute>
          }
        />
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

        {/* Activity Log — company_admin + super_admin */}
        <Route
          path="/activity-log"
          element={
            <ProtectedRoute allowedRoles={['company_admin', 'super_admin']}>
              <ActivityLogPage />
            </ProtectedRoute>
          }
        />

        {/* Fallback */}
        <Route path="*" element={<Home />} />
      </Routes>
      </Suspense>
    </AuthProvider>
  );
};

export default AppRoutes;
