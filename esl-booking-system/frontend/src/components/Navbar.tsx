import { useContext, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import BrandLogo from "@/components/BrandLogo";
import { CalendarDays, Users, User, LogOut, LayoutDashboard, GraduationCap, UserCog, Package, ClipboardList, PackagePlus, BookOpen, Menu, X, TrendingUp } from "lucide-react";
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
import InstallAppButton from "@/components/InstallAppButton";

const NavBar: React.FC = () => {
  const navigate = useNavigate();
  const { t } = useTranslation();
  const authContext = useContext(AuthContext);
  const role = authContext?.user?.role;
  const isOwner = authContext?.user?.is_owner ?? false;
  const [mobileOpen, setMobileOpen] = useState(false);

  const handleLogout = () => {
    authContext?.logout();
    navigate("/");
  };

  const logoLink = role === "super_admin" ? "/super-admin" : "/admin-dashboard";

  const NavLink = ({ to, icon: Icon, label }: { to: string; icon: React.ElementType; label: string }) => (
    <Link
      to={to}
      onClick={() => setMobileOpen(false)}
      className="flex flex-col items-center gap-0.5 text-white/70 hover:text-white transition-colors"
      title={label}
    >
      <Icon className="h-5 w-5" />
      <span className="text-[10px] font-medium">{label}</span>
    </Link>
  );

  const MobileNavLink = ({ to, icon: Icon, label }: { to: string; icon: React.ElementType; label: string }) => (
    <Link
      to={to}
      onClick={() => setMobileOpen(false)}
      className="flex items-center gap-3 px-4 py-3 text-white/80 hover:text-white hover:bg-white/10 transition-colors"
    >
      <Icon className="h-5 w-5" />
      <span className="text-sm font-medium">{label}</span>
    </Link>
  );

  const navLinks = role === "super_admin" ? (
    <>
      <NavLink to="/super-admin" icon={LayoutDashboard} label={t("nav.dashboard")} />
      <NavLink to="/super-admin/plans" icon={PackagePlus} label={t("nav.plans")} />
    </>
  ) : (
    <>
      <NavLink to="/admin-dashboard" icon={CalendarDays} label={t("nav.schedule")} />
      <NavLink to="/packages" icon={Package} label={t("nav.packages")} />
      <NavLink to="/students" icon={Users} label={t("nav.students")} />
      <NavLink to="/teachers" icon={GraduationCap} label={t("nav.teachers")} />
      <NavLink to="/admin-users" icon={UserCog} label={t("nav.admins")} />
    </>
  );

  const mobileNavLinks = role === "super_admin" ? (
    <>
      <MobileNavLink to="/super-admin" icon={LayoutDashboard} label={t("nav.dashboard")} />
      <MobileNavLink to="/super-admin/plans" icon={PackagePlus} label={t("nav.plans")} />
    </>
  ) : (
    <>
      <MobileNavLink to="/admin-dashboard" icon={CalendarDays} label={t("nav.schedule")} />
      <MobileNavLink to="/packages" icon={Package} label={t("nav.packages")} />
      <MobileNavLink to="/students" icon={Users} label={t("nav.students")} />
      <MobileNavLink to="/teachers" icon={GraduationCap} label={t("nav.teachers")} />
      <MobileNavLink to="/admin-users" icon={UserCog} label={t("nav.admins")} />
    </>
  );

  return (
    <header className="w-full brand-gradient shadow-lg sticky top-0 z-50 overflow-x-hidden">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between">
        {/* Logo */}
        <Link to={logoLink} className="flex items-center">
          <BrandLogo variant="white" />
        </Link>

        {/* Desktop nav links — hidden on mobile */}
        <nav className="hidden min-[620px]:flex items-center gap-5">
          {navLinks}

          {(role === "super_admin" || (role === "company_admin" && isOwner)) && (
            <NavLink to="/documentation" icon={BookOpen} label={t("nav.documentation")} />
          )}

          <InstallAppButton variant="white" />
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
              {role === "company_admin" && isOwner && (
                <DropdownMenuItem asChild>
                  <Link to="/upgrade" className="cursor-pointer flex items-center gap-2">
                    <TrendingUp className="h-4 w-4 text-primary" />
                    <span className="text-primary font-medium">Upgrade Plan</span>
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

        {/* Mobile: action buttons + hamburger */}
        <div className="flex min-[620px]:hidden items-center gap-2">
          <InstallAppButton variant="white" />
          <NotificationBell variant="white" />
          <Button
            variant="ghost"
            size="icon"
            className="text-white/80 hover:text-white hover:bg-white/10"
            onClick={() => setMobileOpen(!mobileOpen)}
          >
            {mobileOpen ? <X className="h-6 w-6" /> : <Menu className="h-6 w-6" />}
          </Button>
        </div>
      </div>

      {/* Mobile menu */}
      {mobileOpen && (
        <div className="min-[620px]:hidden brand-gradient border-t border-white/10 pb-3">
          {mobileNavLinks}

          {(role === "super_admin" || (role === "company_admin" && isOwner)) && (
            <MobileNavLink to="/documentation" icon={BookOpen} label={t("nav.documentation")} />
          )}

          {(role === "company_admin" || role === "teacher") && (
            <MobileNavLink
              to={role === "teacher" ? "/teacher-profile" : "/profile"}
              icon={User}
              label={t("nav.profile")}
            />
          )}

          {(role === "company_admin" || role === "super_admin") && (
            <MobileNavLink to="/activity-log" icon={ClipboardList} label={t("nav.activityLog")} />
          )}

          {role === "company_admin" && isOwner && (
            <MobileNavLink to="/upgrade" icon={TrendingUp} label="Upgrade Plan" />
          )}

          <div className="flex items-center gap-3 px-4 py-2">
            <LanguageToggle variant="white" />
          </div>

          <button
            onClick={() => { setMobileOpen(false); handleLogout(); }}
            className="flex items-center gap-3 px-4 py-3 text-red-300 hover:text-red-200 hover:bg-white/10 w-full transition-colors"
          >
            <LogOut className="h-5 w-5" />
            <span className="text-sm font-medium">{t("nav.logout")}</span>
          </button>
        </div>
      )}
    </header>
  );
};

export default NavBar;
