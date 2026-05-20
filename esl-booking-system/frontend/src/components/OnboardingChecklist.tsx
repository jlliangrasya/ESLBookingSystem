import { useState, useEffect } from "react";
import { Link } from "react-router-dom";
import { CheckCircle2, Circle, X, Rocket } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";

interface OnboardingChecklistProps {
  companyId: number;
  teacherCount: number | null;
  studentCount: number;
  bookingCount: number;
<<<<<<< HEAD
=======
  packageCount: number;
>>>>>>> main
}

const OnboardingChecklist = ({
  companyId,
  teacherCount,
  studentCount,
  bookingCount,
<<<<<<< HEAD
=======
  packageCount,
>>>>>>> main
}: OnboardingChecklistProps) => {
  const storageKey = `onboarding_dismissed_${companyId}`;

  const [dismissed, setDismissed] = useState(
    () => localStorage.getItem(storageKey) === "true"
  );

  const steps = [
    {
<<<<<<< HEAD
      label: "Add a Teacher",
      description: "Add at least one teacher to your school.",
      done: (teacherCount ?? 0) > 0,
      href: "/teachers" as string | null,
=======
      label: "Create a Class Package",
      description: "Set up at least one package so students can be enrolled.",
      done: packageCount > 0,
      href: "/packages",
    },
    {
      label: "Add a Teacher",
      description: "Add at least one teacher to your school.",
      done: (teacherCount ?? 0) > 0,
      href: "/teachers",
>>>>>>> main
    },
    {
      label: "Add a Student",
      description: "Register your first student.",
      done: studentCount > 0,
<<<<<<< HEAD
      href: "/students" as string | null,
=======
      href: "/students",
>>>>>>> main
    },
    {
      label: "Send Student Credentials",
      description: "Copy the credentials from the Students page and send them to your student.",
      done: studentCount > 0,
<<<<<<< HEAD
      href: "/students" as string | null,
    },
    {
      label: "Book a Class",
      description: "Have your student log in and book their first class.",
      done: bookingCount > 0,
      href: null,
=======
      href: "/students",
    },
    {
      label: "Book a Class",
      description: "Have your student log in and book their first class, or book on their behalf from their profile.",
      done: bookingCount > 0,
      href: null as string | null,
>>>>>>> main
    },
  ];

  const completedCount = steps.filter((s) => s.done).length;
  const allDone = completedCount === steps.length;

  useEffect(() => {
    if (allDone) {
      localStorage.setItem(storageKey, "true");
      setDismissed(true);
    }
  }, [allDone, storageKey]);

  const handleDismiss = () => {
    localStorage.setItem(storageKey, "true");
    setDismissed(true);
  };

  if (dismissed) return null;

  return (
    <Card className="border border-primary/20 bg-primary/5 shadow-sm">
      <CardHeader className="pb-2 flex flex-row items-center justify-between space-y-0">
        <CardTitle className="text-base font-semibold flex items-center gap-2">
          <Rocket className="h-4 w-4 text-primary" />
          Getting Started
        </CardTitle>
        <Button
          variant="ghost"
          size="icon"
          className="h-7 w-7 text-muted-foreground hover:text-foreground"
          onClick={handleDismiss}
          aria-label="Dismiss checklist"
        >
          <X className="h-4 w-4" />
        </Button>
      </CardHeader>
      <CardContent className="pt-1 pb-4">
        <p className="text-xs text-muted-foreground mb-3">
          {completedCount} of {steps.length} steps complete
        </p>
        <ol className="space-y-2">
          {steps.map((step, i) => (
            <li key={i} className="flex items-start gap-3">
              {step.done ? (
                <CheckCircle2 className="h-5 w-5 text-green-500 shrink-0 mt-0.5" />
              ) : (
                <Circle className="h-5 w-5 text-gray-300 shrink-0 mt-0.5" />
              )}
              <div className="min-w-0">
                {step.href && !step.done ? (
                  <Link
                    to={step.href}
                    className="text-sm font-medium text-primary hover:underline"
                  >
                    {step.label}
                  </Link>
                ) : (
                  <span
                    className={`text-sm font-medium ${
                      step.done ? "line-through text-muted-foreground" : "text-gray-800"
                    }`}
                  >
                    {step.label}
                  </span>
                )}
                <p className="text-xs text-muted-foreground">{step.description}</p>
              </div>
            </li>
          ))}
        </ol>
      </CardContent>
    </Card>
  );
};

export default OnboardingChecklist;
