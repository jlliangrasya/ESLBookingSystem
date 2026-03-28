import { useContext } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import BrandLogo from "@/components/BrandLogo";
import { CalendarDays, Users, User, LogOut, LayoutDashboard, GraduationCap, UserCog, Package, ClipboardList, PackagePlus, BookOpen } from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Button } from "@/components/ui/button";
import AuthContext from "@/context/AuthContext";
import NotificationBell from "@/components/NotificationBell";
import LanguageToggle from "@/components/LanguageToggle";

const NavBar: React.FC = () => {
  const navigate = useNavigate();
  const { t } = useTranslation();
  const authContext = useContext(AuthContext);
  const role = authContext?.user?.role;
  const isOwner = authContext?.user?.is_owner ?? false;

  const handleLogout = () => {
    authContext?.logout();
    navigate("/");
  };

  const logoLink = role === "super_admin" ? "/super-admin" : "/admin-dashboard";

  return (
    <header className="w-full brand-gradient shadow-lg sticky top-0 z-50">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between">
        {/* Logo */}
        <Link to={logoLink} className="flex items-center">
          <BrandLogo variant="white" />
        </Link>

        {/* Nav links */}
        <nav className="flex items-center gap-5">
          {role === "super_admin" ? (
            <>
              <Link
                to="/super-admin"
                className="flex flex-col items-center gap-0.5 text-white/70 hover:text-white transition-colors"
                title={t("nav.dashboard")}
              >
                <LayoutDashboard className="h-5 w-5" />
                <span className="text-[10px] font-medium">{t("nav.dashboard")}</span>
              </Link>
              <Link
                to="/super-admin/plans"
                className="flex flex-col items-center gap-0.5 text-white/70 hover:text-white transition-colors"
                title={t("nav.plans")}
              >
                <PackagePlus className="h-5 w-5" />
                <span className="text-[10px] font-medium">{t("nav.plans")}</span>
              </Link>
            </>
          ) : (
            <>
              <Link
                to="/admin-dashboard"
                className="flex flex-col items-center gap-0.5 text-white/70 hover:text-white transition-colors"
                title={t("nav.schedule")}
              >
                <CalendarDays className="h-5 w-5" />
                <span className="text-[10px] font-medium">{t("nav.schedule")}</span>
              </Link>

              <Link
                to="/packages"
                className="flex flex-col items-center gap-0.5 text-white/70 hover:text-white transition-colors"
                title={t("nav.packages")}
              >
                <Package className="h-5 w-5" />
                <span className="text-[10px] font-medium">{t("nav.packages")}</span>
              </Link>

              <Link
                to="/students"
                className="flex flex-col items-center gap-0.5 text-white/70 hover:text-white transition-colors"
                title={t("nav.students")}
              >
                <Users className="h-5 w-5" />
                <span className="text-[10px] font-medium">{t("nav.students")}</span>
              </Link>

              <Link
                to="/teachers"
                className="flex flex-col items-center gap-0.5 text-white/70 hover:text-white transition-colors"
                title={t("nav.teachers")}
              >
                <GraduationCap className="h-5 w-5" />
                <span className="text-[10px] font-medium">{t("nav.teachers")}</span>
              </Link>

              <Link
                to="/admin-users"
                className="flex flex-col items-center gap-0.5 text-white/70 hover:text-white transition-colors"
                title={t("nav.admins")}
              >
                <UserCog className="h-5 w-5" />
                <span className="text-[10px] font-medium">{t("nav.admins")}</span>
              </Link>
            </>
          )}

          {(role === "super_admin" || (role === "company_admin" && isOwner)) && (
            <Link
              to="/documentation"
              className="flex flex-col items-center gap-0.5 text-white/70 hover:text-white transition-colors"
              title={t("nav.documentation")}
            >
              <BookOpen className="h-5 w-5" />
              <span className="text-[10px] font-medium">{t("nav.documentation")}</span>
            </Link>
          )}

          <LanguageToggle variant="white" />
          <NotificationBell variant="white" />

          {/* Profile dropdown */}
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                variant="ghost"
                size="icon"
                className="rounded-full h-9 w-9 text-white/70 hover:text-white hover:bg-white/10"
              >
                <User className="h-5 w-5" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-44">
              {(role === "company_admin" || role === "teacher") && (
                <DropdownMenuItem asChild>
                  <Link
                    to={role === "teacher" ? "/teacher-profile" : "/profile"}
                    className="cursor-pointer flex items-center gap-2"
                  >
                    <User className="h-4 w-4" />
                    {t("nav.profile")}
                  </Link>
                </DropdownMenuItem>
              )}
              {(role === "company_admin" || role === "super_admin") && (
                <DropdownMenuItem asChild>
                  <Link to="/activity-log" className="cursor-pointer flex items-center gap-2">
                    <ClipboardList className="h-4 w-4" />
                    {t("nav.activityLog")}
                  </Link>
                </DropdownMenuItem>
              )}
              {(role === "company_admin" || role === "teacher") && <DropdownMenuSeparator />}
              <DropdownMenuItem
                onClick={handleLogout}
                className="cursor-pointer text-destructive focus:text-destructive flex items-center gap-2"
              >
                <LogOut className="h-4 w-4" />
                {t("nav.logout")}
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </nav>
      </div>
    </header>
  );
};

export default NavBar;
