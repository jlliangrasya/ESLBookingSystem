import { useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import Login from "../components/Login";
import LearnMore from "../components/LearnMore";
import TutorialPackages from "../components/TutorialPackages";
import Footer from "../components/Footer";
import LanguageToggle from "../components/LanguageToggle";
import { Building2, ArrowRight } from "lucide-react";

const Home = () => {
  const navigate = useNavigate();
  const { t } = useTranslation();

  return (
    <div className="min-h-screen bg-gradient-to-br from-sky-50 to-white">
      {/* Language toggle for unauthenticated users */}
      <div className="absolute top-4 right-4 z-50">
        <LanguageToggle />
      </div>

      {/* Hero section */}
      <div className="max-w-7xl mx-auto px-4 pt-16 pb-8 flex flex-col md:flex-row items-center gap-10 md:gap-16">
        {/* Left — branding */}
        <div className="hidden md:flex flex-col flex-1">
          <h1 className="text-5xl font-bold text-primary leading-tight">
            {t("home.welcome")}<br />{t("home.brand")}
          </h1>
          <p className="mt-4 text-lg text-muted-foreground">
            {t("home.subtitle")}
          </p>
          <div className="mt-6 flex gap-3">
            <Button
              variant="outline"
              onClick={() =>
                document
                  .getElementById("learn-more")
                  ?.scrollIntoView({ behavior: "smooth" })
              }
            >
              {t("home.learnMore")}
            </Button>
            <Button
              variant="secondary"
              onClick={() =>
                document
                  .getElementById("tutorial-packages")
                  ?.scrollIntoView({ behavior: "smooth" })
              }
            >
              {t("home.tutorialPackages")}
            </Button>
          </div>
        </div>

        {/* Right — login / register card */}
        <div className="w-full md:max-w-md flex-shrink-0">
          <Card className="shadow-xl rounded-2xl">
            <CardHeader className="pb-2">
              <CardTitle className="text-center text-primary text-xl font-semibold">
                {t("home.welcomeBack")}
              </CardTitle>
            </CardHeader>
            <CardContent>
              <Login />
              {/* Self-registration disabled — admins add students manually
              <Button
                variant="ghost"
                onClick={toggleAuth}
                className="w-full mt-4 text-sm text-muted-foreground hover:text-primary"
              >
                {showRegister
                  ? "Already have an account? Log in here."
                  : "Are you a new student? Register here."}
              </Button>
              */}
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
