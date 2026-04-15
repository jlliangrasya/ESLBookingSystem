import { lazy, Suspense } from "react";
import { Routes, Route } from "react-router-dom";
import { AuthProvider } from "./context/AuthContext";
import ProtectedRoute from "./components/ProtectedRoute";

// Eager-load only the landing page (needed before auth resolves)
import Home from "./pages/Home.tsx";

// All other pages are lazy-loaded — each becomes its own JS chunk
const StudentDashboard = lazy(() => import("./pages/StudentDashboard.tsx"));
const AdminDashboard = lazy(() => import("./pages/AdminDashboard.tsx"));
const TimeslotPage = lazy(() => import("./pages/TimeslotPage.tsx"));
const StudentListPage = lazy(() => import("./pages/StudentList.tsx"));
const AdminProfile = lazy(() => import("./pages/AdminProfile.tsx"));
const SuperAdminDashboard = lazy(
  () => import("./pages/SuperAdminDashboard.tsx"),
);
const CompanyRegisterPage = lazy(
  () => import("./pages/CompanyRegisterPage.tsx"),
);
const TeacherDashboard = lazy(() => import("./pages/TeacherDashboard.tsx"));
const UpgradePage = lazy(() => import("./pages/UpgradePage.tsx"));
const TeacherManagementPage = lazy(
  () => import("./pages/TeacherManagementPage.tsx"),
);
const AdminManagementPage = lazy(
  () => import("./pages/AdminManagementPage.tsx"),
);
const PackageSetupPage = lazy(() => import("./pages/PackageSetupPage.tsx"));
const AdminStudentProfilePage = lazy(
  () => import("./pages/AdminStudentProfilePage.tsx"),
);
const TeacherProfilePage = lazy(() => import("./pages/TeacherProfilePage.tsx"));
const AdminTeacherProfilePage = lazy(
  () => import("./pages/AdminTeacherProfilePage.tsx"),
);
const ForgotPasswordPage = lazy(() => import("./pages/ForgotPasswordPage.tsx"));
const ResetPasswordPage = lazy(() => import("./pages/ResetPasswordPage.tsx"));
const StudentProfilePage = lazy(() => import("./pages/StudentProfilePage.tsx"));
const ActivityLogPage = lazy(() => import("./pages/ActivityLogPage.tsx"));
const SubscriptionPlansPage = lazy(
  () => import("./pages/SubscriptionPlansPage.tsx"),
);
const DocumentationPage = lazy(() => import("./pages/DocumentationPage.tsx"));
const CompanyLockedPage = lazy(() => import("./pages/CompanyLockedPage.tsx"));
const CompanyLockedUserPage = lazy(
  () => import("./pages/CompanyLockedUserPage.tsx"),
);
const CompanySuspendedPage = lazy(
  () => import("./pages/CompanySuspendedPage.tsx"),
);
const AnnouncementManagementPage = lazy(
  () => import("./pages/AnnouncementManagementPage.tsx"),
);
const BulkImportPage = lazy(() => import("./pages/BulkImportPage.tsx"));
const TeacherAssignmentsPage = lazy(
  () => import("./pages/TeacherAssignmentsPage.tsx"),
);
const StudentAssignmentsPage = lazy(
  () => import("./pages/StudentAssignmentsPage.tsx"),
);
const RecurringSchedulesPage = lazy(
  () => import("./pages/RecurringSchedulesPage.tsx"),
);

const AppRoutes = () => {
  return (
    <AuthProvider>
      <Suspense
        fallback={
          <div className="flex items-center justify-center min-h-screen text-gray-400">
            Loading…
          </div>
        }
      >
        <Routes>
          {/* Public */}
          <Route path="/" element={<Home />} />
          <Route path="/company/register" element={<CompanyRegisterPage />} />
          <Route path="/upgrade" element={<UpgradePage />} />
          <Route path="/company-locked" element={<CompanyLockedPage />} />
          <Route
            path="/company-locked-user"
            element={<CompanyLockedUserPage />}
          />
          <Route path="/company-suspended" element={<CompanySuspendedPage />} />
          <Route path="/forgot-password" element={<ForgotPasswordPage />} />
          <Route path="/reset-password" element={<ResetPasswordPage />} />

          {/* Super Admin */}
          <Route
            path="/super-admin"
            element={
              <ProtectedRoute allowedRoles={["super_admin"]}>
                <SuperAdminDashboard />
              </ProtectedRoute>
            }
          />
          <Route
            path="/super-admin/plans"
            element={
              <ProtectedRoute allowedRoles={["super_admin"]}>
                <SubscriptionPlansPage />
              </ProtectedRoute>
            }
          />

          {/* Company Admin */}
          <Route
            path="/admin-dashboard"
            element={
              <ProtectedRoute allowedRoles={["company_admin"]}>
                <AdminDashboard />
              </ProtectedRoute>
            }
          />
          <Route
            path="/students"
            element={
              <ProtectedRoute allowedRoles={["company_admin"]}>
                <StudentListPage />
              </ProtectedRoute>
            }
          />
          <Route
            path="/admin/students/:id"
            element={
              <ProtectedRoute allowedRoles={["company_admin"]}>
                <AdminStudentProfilePage />
              </ProtectedRoute>
            }
          />
          <Route
            path="/admin/teachers/:id"
            element={
              <ProtectedRoute allowedRoles={["company_admin"]}>
                <AdminTeacherProfilePage />
              </ProtectedRoute>
            }
          />
          <Route
            path="/profile"
            element={
              <ProtectedRoute allowedRoles={["company_admin"]}>
                <AdminProfile />
              </ProtectedRoute>
            }
          />
          <Route
            path="/packages"
            element={
              <ProtectedRoute allowedRoles={["company_admin"]}>
                <PackageSetupPage />
              </ProtectedRoute>
            }
          />
          <Route
            path="/teachers"
            element={
              <ProtectedRoute allowedRoles={["company_admin"]}>
                <TeacherManagementPage />
              </ProtectedRoute>
            }
          />
          <Route
            path="/admin-users"
            element={
              <ProtectedRoute allowedRoles={["company_admin"]}>
                <AdminManagementPage />
              </ProtectedRoute>
            }
          />

          {/* Announcements Management — Company Admin */}
          <Route
            path="/admin/announcements"
            element={
              <ProtectedRoute allowedRoles={["company_admin", "super_admin"]}>
                <AnnouncementManagementPage />
              </ProtectedRoute>
            }
          />
          {/* Recurring Schedules — Company Admin */}
          <Route
            path="/admin/recurring"
            element={
              <ProtectedRoute allowedRoles={["company_admin"]}>
                <RecurringSchedulesPage />
              </ProtectedRoute>
            }
          />
          {/* Bulk Import — Company Admin */}
          <Route
            path="/admin/import"
            element={
              <ProtectedRoute allowedRoles={["company_admin"]}>
                <BulkImportPage />
              </ProtectedRoute>
            }
          />

          {/* Teacher */}
          <Route
            path="/teacher-dashboard"
            element={
              <ProtectedRoute allowedRoles={["teacher"]}>
                <TeacherDashboard />
              </ProtectedRoute>
            }
          />
          <Route
            path="/teacher/recurring"
            element={
              <ProtectedRoute allowedRoles={["teacher"]}>
                <RecurringSchedulesPage />
              </ProtectedRoute>
            }
          />
          <Route
            path="/teacher/assignments"
            element={
              <ProtectedRoute allowedRoles={["teacher"]}>
                <TeacherAssignmentsPage />
              </ProtectedRoute>
            }
          />
          <Route
            path="/teacher-profile"
            element={
              <ProtectedRoute allowedRoles={["teacher"]}>
                <TeacherProfilePage />
              </ProtectedRoute>
            }
          />

          {/* Student */}
          <Route
            path="/student/recurring"
            element={
              <ProtectedRoute allowedRoles={["student"]}>
                <RecurringSchedulesPage />
              </ProtectedRoute>
            }
          />
          <Route
            path="/student/assignments"
            element={
              <ProtectedRoute allowedRoles={["student"]}>
                <StudentAssignmentsPage />
              </ProtectedRoute>
            }
          />
          <Route
            path="/student-profile"
            element={
              <ProtectedRoute allowedRoles={["student"]}>
                <StudentProfilePage />
              </ProtectedRoute>
            }
          />
          <Route
            path="/studentdashboard"
            element={
              <ProtectedRoute allowedRoles={["student"]}>
                <StudentDashboard />
              </ProtectedRoute>
            }
          />
          <Route
            path="/timeslots/:date"
            element={
              <ProtectedRoute allowedRoles={["student"]}>
                <TimeslotPage />
              </ProtectedRoute>
            }
          />

          {/* Activity Log — company_admin + super_admin */}
          <Route
            path="/activity-log"
            element={
              <ProtectedRoute allowedRoles={["company_admin", "super_admin"]}>
                <ActivityLogPage />
              </ProtectedRoute>
            }
          />

          {/* Documentation — company_admin (owner) + super_admin */}
          <Route
            path="/documentation"
            element={
              <ProtectedRoute allowedRoles={["company_admin", "super_admin"]}>
                <DocumentationPage />
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
