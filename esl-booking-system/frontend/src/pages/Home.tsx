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
import HeroIllustration from "@/components/HeroIllustration";
import WaveDivider from "@/components/WaveDivider";
import ScrollReveal from "@/components/ScrollReveal";
import { Building2, ArrowRight } from "lucide-react";
import InstallAppButton from "@/components/InstallAppButton";

const Home = () => {
  const navigate = useNavigate();
  const { t } = useTranslation();

  return (
    <div className="min-h-screen bg-white">
      {/* Top bar */}
      <header className="w-full brand-gradient sticky top-0 z-50 shadow-lg">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between">
          <BrandLogo variant="white" />
          <div className="flex items-center gap-3">
            <LanguageToggle variant="white" />
            <InstallAppButton variant="white" />
            <Button
              size="sm"
              className="bg-white/15 text-white border border-white/40 hover:bg-white/25 transition-colors backdrop-blur-sm"
              onClick={() => navigate("/company/register")}
            >
              Register Center
            </Button>
          </div>
        </div>
      </header>

      {/* ─── Hero Section ──────────────────────────────────────────── */}
      <div className="relative overflow-hidden">
        {/* Background layers */}
        <div className="absolute inset-0 bg-gradient-to-br from-[#EEF6FA] via-[#F0F9F7]/50 to-white" />
        <div className="absolute inset-0 pattern-dots-light" />
        <div className="absolute -top-20 -right-20 w-[500px] h-[500px] bg-gradient-to-bl from-[#D0E8F0]/40 to-transparent rounded-full blur-3xl animate-fade-in delay-300" />
        <div className="absolute -bottom-20 -left-20 w-[400px] h-[400px] bg-gradient-to-tr from-[#B3DDD4]/25 to-transparent rounded-full blur-3xl animate-fade-in delay-500" />

        <div className="relative max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pt-14 pb-20">
          <div className="flex flex-col lg:flex-row items-center gap-12 lg:gap-20">

            {/* Left — Text + Illustration */}
            <div className="flex-1 hidden lg:block">
              <div className="animate-fade-in-up">
                <div className="inline-flex items-center gap-2 brand-gradient text-white text-xs font-semibold px-4 py-2 rounded-full w-fit mb-6 shadow-md">
                  <span className="w-1.5 h-1.5 rounded-full bg-white animate-pulse" />
                  ESL Management Platform
                </div>
              </div>

              <h1 className="text-5xl font-bold text-gray-900 leading-tight animate-fade-in-up delay-100">
                {t("home.welcome")}<br />
                <span className="brand-gradient-text">{t("home.brand")}</span>
              </h1>

              <p className="mt-5 text-lg text-gray-500 max-w-md animate-fade-in-up delay-200">
                {t("home.subtitle")}
              </p>

              <div className="mt-8 flex gap-3 animate-fade-in-up delay-300">
                <Button
                  variant="outline"
                  className="border-[#D0E8F0] hover:bg-[#EEF6FA] transition-colors"
                  onClick={() => document.getElementById("learn-more")?.scrollIntoView({ behavior: "smooth" })}
                >
                  {t("home.learnMore")}
                </Button>
                <Button
                  className="brand-gradient text-white shadow-md hover:shadow-lg transition-all border-0"
                  onClick={() => document.getElementById("tutorial-packages")?.scrollIntoView({ behavior: "smooth" })}
                >
                  {t("home.tutorialPackages")}
                </Button>
              </div>

              {/* Illustration */}
              <div className="mt-10 animate-fade-in delay-600">
                <HeroIllustration className="w-full max-w-[360px]" />
              </div>
            </div>

            {/* Right — Login card */}
            <div className="w-full lg:max-w-md flex-shrink-0 animate-fade-in-right delay-200">
              <Card className="glow-card rounded-2xl border-0 relative overflow-hidden">
                <div className="absolute top-0 left-0 right-0 h-1 brand-gradient" />
                <CardHeader className="pb-2 text-center">
                  <div className="flex justify-center mb-2">
                    <BrandLogo size="lg" />
                  </div>
                  <CardTitle className="text-gray-500 text-base font-medium">
                    {t("home.welcomeBack")}
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <Login />
                </CardContent>
              </Card>
            </div>

          </div>
        </div>
      </div>

      {/* Wave: Hero → Learn More */}
      <WaveDivider fill="#EEF6FA" />

      {/* ─── Learn More ────────────────────────────────────────────── */}
      <section id="learn-more" className="py-20 brand-gradient-subtle">
        <LearnMore />
      </section>

      {/* Wave: Learn More → Packages */}
      <WaveDivider fill="#ffffff" className="bg-gradient-to-r from-[#EEF6FA] to-[#F0F9F7]" />

      {/* ─── Tutorial Packages ─────────────────────────────────────── */}
      <section id="tutorial-packages" className="py-20 bg-white">
        <TutorialPackages />
      </section>

      {/* Wave: Packages → CTA */}
      <div className="bg-white">
        <WaveDivider fill="#2E6B9E" />
      </div>

      {/* ─── Company CTA ───────────────────────────────────────────── */}
      <section className="py-20 brand-gradient relative overflow-hidden">
        <div className="absolute -top-10 -right-10 w-72 h-72 bg-white/5 rounded-full blur-3xl animate-float-slow" />
        <div className="absolute -bottom-10 -left-10 w-56 h-56 bg-white/5 rounded-full blur-3xl animate-float" />

        <div className="relative max-w-3xl mx-auto px-4 text-center space-y-5">
          <ScrollReveal animation="fade-up">
            <div className="flex justify-center">
              <div className="p-3 bg-white/15 rounded-2xl">
                <Building2 className="h-10 w-10 text-white" />
              </div>
            </div>
          </ScrollReveal>
          <ScrollReveal animation="fade-up" delay={100}>
            <h2 className="text-2xl font-bold text-white">
              {t("home.companyCta")}
            </h2>
          </ScrollReveal>
          <ScrollReveal animation="fade-up" delay={200}>
            <p className="text-white/75 max-w-xl mx-auto">
              {t("home.companyCtaDesc")}
            </p>
          </ScrollReveal>
          <ScrollReveal animation="fade-up" delay={300}>
            <Button onClick={() => navigate("/company/register")} size="lg" className="gap-2 bg-white text-brand hover:bg-[#EEF6FA] shadow-lg transition-colors">
              {t("home.registerCenter")} <ArrowRight className="h-4 w-4" />
            </Button>
          </ScrollReveal>
        </div>
      </section>

      {/* Wave: CTA → Footer */}
      <div className="brand-gradient">
        <WaveDivider fill="#0f172a" />
      </div>

      <Footer />
    </div>
  );
};

export default Home;
