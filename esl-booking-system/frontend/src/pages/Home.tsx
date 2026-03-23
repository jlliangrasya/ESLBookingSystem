import { useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import Login from "../components/Login";
import LearnMore from "../components/LearnMore";
import TutorialPackages from "../components/TutorialPackages";
import Footer from "../components/Footer";
import LanguageToggle from "../components/LanguageToggle";
import BrandLogo from "@/components/BrandLogo";
import { Building2, ArrowRight } from "lucide-react";

const Home = () => {
  const navigate = useNavigate();
  const { t } = useTranslation();

  return (
    <div className="min-h-screen bg-gradient-to-br from-sky-50 to-white">
      {/* Top bar */}
      <header className="w-full bg-white border-b border-border sticky top-0 z-50 shadow-sm">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between">
          <BrandLogo />
          <div className="flex items-center gap-3">
            <LanguageToggle />
            <Button size="sm" variant="outline" onClick={() => navigate("/company/register")}>
              Register Center
            </Button>
          </div>
        </div>
      </header>

      {/* Hero section */}
      <div className="max-w-7xl mx-auto px-4 pt-16 pb-12 flex flex-col md:flex-row items-center gap-10 md:gap-16">
        {/* Left — branding */}
        <div className="hidden md:flex flex-col flex-1">
          <div className="inline-flex items-center gap-2 bg-primary/10 text-primary text-xs font-semibold px-3 py-1.5 rounded-full w-fit mb-4">
            <span className="w-1.5 h-1.5 rounded-full bg-primary animate-pulse" />
            ESL Management Platform
          </div>
          <h1 className="text-5xl font-bold text-gray-900 leading-tight">
            {t("home.welcome")}<br />
            <span className="text-primary">{t("home.brand")}</span>
          </h1>
          <p className="mt-4 text-lg text-muted-foreground max-w-md">
            {t("home.subtitle")}
          </p>
          <div className="mt-6 flex gap-3">
            <Button
              variant="outline"
              onClick={() => document.getElementById("learn-more")?.scrollIntoView({ behavior: "smooth" })}
            >
              {t("home.learnMore")}
            </Button>
            <Button
              variant="secondary"
              onClick={() => document.getElementById("tutorial-packages")?.scrollIntoView({ behavior: "smooth" })}
            >
              {t("home.tutorialPackages")}
            </Button>
          </div>
        </div>

        {/* Right — login card */}
        <div className="w-full md:max-w-md flex-shrink-0">
          <Card className="shadow-xl rounded-2xl border-0 ring-1 ring-border">
            <CardHeader className="pb-2 text-center">
              <div className="flex justify-center mb-2">
                <BrandLogo size="lg" />
              </div>
              <CardTitle className="text-gray-600 text-base font-medium">
                {t("home.welcomeBack")}
              </CardTitle>
            </CardHeader>
            <CardContent>
              <Login />
            </CardContent>
          </Card>
        </div>
      </div>

      {/* Learn More */}
      <section id="learn-more" className="py-16 bg-sky-50">
        <LearnMore />
      </section>

      {/* Tutorial Packages */}
      <section id="tutorial-packages" className="py-16 bg-white">
        <TutorialPackages />
      </section>

      {/* Company CTA */}
      <section className="py-16 bg-primary/10 border-t border-primary/20">
        <div className="max-w-3xl mx-auto px-4 text-center space-y-4">
          <div className="flex justify-center">
            <Building2 className="h-10 w-10 text-primary" />
          </div>
          <h2 className="text-2xl font-bold text-gray-800">
            {t("home.companyCta")}
          </h2>
          <p className="text-muted-foreground">
            {t("home.companyCtaDesc")}
          </p>
          <Button onClick={() => navigate("/company/register")} size="lg" className="gap-2">
            {t("home.registerCenter")} <ArrowRight className="h-4 w-4" />
          </Button>
        </div>
      </section>

      <Footer />
    </div>
  );
};

export default Home;
