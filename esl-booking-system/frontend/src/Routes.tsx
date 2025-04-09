import { Routes, Route } from "react-router-dom";
//import Login from "./components/Login";
import Register from "./components/Register.tsx";
import StudentDashboard from "./pages/StudentDashboard.tsx";
import AdminDashboard from "./pages/AdminDashboard.tsx";
import ProtectedRoute from "./components/ProtectedRoute";
import { AuthProvider } from "./context/AuthContext";
import TimeslotPage from "./pages/TimeslotPage.tsx";
import Home from "./pages/Home.tsx";
import StudentListPage from "./pages/StudentList.tsx";
import AdminProfile from "./pages/AdminProfile.tsx";

const AppRoutes = () => {
  return (
    <AuthProvider>
      <Routes>
        {/* Home Page */}
        <Route path="/" element={<Home />} />

        {/* Public Routes */}
        {/* <Route path="/login" element={<Login />} /> */}
        <Route path="/register" element={<Register />} />

        {/* Protected Routes */}
        <Route
          path="/studentdashboard"
          element={
            <ProtectedRoute>
              <StudentDashboard />
            </ProtectedRoute>
          }
        />
        <Route
          path="/timeslots/:date"
          element={
            <ProtectedRoute>
              <TimeslotPage />
            </ProtectedRoute>
          }
        />

        {/* Admin-Only Route */}
        <Route
          path="/admin-dashboard"
          element={
            <ProtectedRoute /*adminOnly*/>
              <AdminDashboard />
            </ProtectedRoute>
          }
        />
        <Route
          path="/students"
          element={
            <ProtectedRoute>
              <StudentListPage />
            </ProtectedRoute>
          }
        />
        <Route
          path="/profile"
          element={
            <ProtectedRoute>
              <AdminProfile />
            </ProtectedRoute>
          }
        />

        {/* Default Redirect */}
        <Route path="*" element={<Home />} />
      </Routes>
    </AuthProvider>
  );
};

export default AppRoutes;
