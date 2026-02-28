import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import Login from "../components/Login";
import Register from "../components/Register";
import LearnMore from "../components/LearnMore";
import TutorialPackages from "../components/TutorialPackages";
import Footer from "../components/Footer";
import { Building2, ArrowRight } from "lucide-react";

const Home = () => {
  const [showRegister, setShowRegister] = useState(false);
  const navigate = useNavigate();

  const toggleAuth = () => {
    setShowRegister((prev) => !prev);
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-sky-50 to-white">
      {/* Hero section */}
      <div className="max-w-7xl mx-auto px-4 pt-16 pb-8 flex flex-col md:flex-row items-center gap-10 md:gap-16">
        {/* Left — branding */}
        <div className="hidden md:flex flex-col flex-1">
          <h1 className="text-5xl font-bold text-primary leading-tight">
            Welcome to<br />Eunitalk
          </h1>
          <p className="mt-4 text-lg text-muted-foreground">
            Your gateway to personalized learning. Book lessons, manage your
            sessions, and more.
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
              Learn More
            </Button>
            <Button
              variant="secondary"
              onClick={() =>
                document
                  .getElementById("tutorial-packages")
                  ?.scrollIntoView({ behavior: "smooth" })
              }
            >
              Tutorial Packages
            </Button>
          </div>
        </div>

        {/* Right — login / register card */}
        <div className="w-full md:max-w-md flex-shrink-0">
          <Card className="shadow-xl rounded-2xl">
            <CardHeader className="pb-2">
              <CardTitle className="text-center text-primary text-xl font-semibold">
                {showRegister ? "Create Account" : "Welcome Back"}
              </CardTitle>
            </CardHeader>
            <CardContent>
              {showRegister ? (
                <Register toggleAuth={toggleAuth} />
              ) : (
                <Login />
              )}
              <Button
                variant="ghost"
                onClick={toggleAuth}
                className="w-full mt-4 text-sm text-muted-foreground hover:text-primary"
              >
                {showRegister
                  ? "Already have an account? Log in here."
                  : "Are you a new student? Register here."}
              </Button>
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
            Do you want to register as a company?
          </h2>
          <p className="text-muted-foreground">
            Are you running an ESL center? Join the EuniTalk platform and manage your
            students, teachers, and schedules — all in one place.
          </p>
          <Button onClick={() => navigate("/company/register")} size="lg" className="gap-2">
            Register Your ESL Center <ArrowRight className="h-4 w-4" />
          </Button>
        </div>
      </section>

      <Footer />
    </div>
  );
};

export default Home;
