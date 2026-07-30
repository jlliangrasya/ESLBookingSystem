import { Link } from "react-router-dom";
import { CheckCircle2, Circle, Rocket, ArrowRight, Sparkles } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import {
  useOnboarding,
  type OnboardingStatus,
  type OnboardingStepKey,
} from "@/context/OnboardingContext";

/**
 * Onboarding progress UI.
 *
 * `variant="bar"`  — the small persistent strip (LinkedIn profile-completion
 *                    style) rendered under the navbar on every admin page, so
 *                    there's always a visible reason to finish.
 * `variant="card"` — the full checklist on the dashboard.
 *
 * Both hide themselves once all four steps are done; the card then shows the
 * optional "add the rest" prompts instead. Neither is dismissible while
 * onboarding is incomplete — a dismissed checklist was one reason companies
 * dropped out with no way back to the path.
 */

interface StepCopy {
  key: OnboardingStepKey;
  label: string;
  description: (s: OnboardingStatus) => string;
  href: string | null;
  cta: string;
}

// Copy is deliberately small-scale: each step describes one concrete action with
// a visible payoff, not a category of work ("Add your teachers", "Set up your
// class packages") that reads like an afternoon of data entry.
const STEPS: StepCopy[] = [
  {
    key: "company_registered",
    label: "Create your school",
    description: () => "Done — your account is live.",
    href: null,
    cta: "",
  },
  {
    key: "teacher_added",
    label: "Add your first teacher",
    description: () => "Just a name and an email — see Brightfolks in action.",
    href: "/teachers",
    cta: "Add a teacher",
  },
  {
    key: "class_created",
    label: "Pick a class package",
    description: () => "Start from a ready-made one. You can customise it anytime.",
    href: "/packages",
    cta: "Pick a package",
  },
  {
    key: "milestone_reached",
    label: "Your teacher logs in",
    description: (s) =>
      s.first_teacher
        ? `${s.first_teacher.name} has an invite — once they log in, they'll see their class.`
        : "They'll get an invite as soon as you add them.",
    href: "/onboarding/milestone",
    cta: "See progress",
  },
];

function nextStep(status: OnboardingStatus): StepCopy | null {
  return STEPS.find((s) => !status.steps[s.key] && s.href) ?? null;
}

export function OnboardingProgressBar() {
  const { status } = useOnboarding();

  if (!status || status.onboarding_complete) return null;

  const pct = Math.round((status.completed_count / status.total_count) * 100);
  const next = nextStep(status);

  // Styled for the brand-gradient header it's mounted inside (see Navbar), hence
  // the translucent-white treatment rather than the card's primary tints.
  return (
    <div className="bg-black/15 border-t border-white/10">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-1.5 flex items-center gap-3 flex-wrap">
        <Rocket className="h-3.5 w-3.5 text-white/80 shrink-0" />
        <span className="text-xs font-medium text-white/90 shrink-0">
          Setup {status.completed_count} of {status.total_count} done
        </span>
        <div
          className="h-1.5 flex-1 min-w-24 rounded-full bg-white/20 overflow-hidden"
          role="progressbar"
          aria-valuenow={status.completed_count}
          aria-valuemin={0}
          aria-valuemax={status.total_count}
          aria-label="Onboarding progress"
        >
          <div
            className="h-full rounded-full bg-white transition-all duration-500"
            style={{ width: `${pct}%` }}
          />
        </div>
        {next && (
          <Link
            to={next.href!}
            className="text-xs font-semibold text-white hover:underline shrink-0 inline-flex items-center gap-1"
          >
            {next.cta}
            <ArrowRight className="h-3 w-3" />
          </Link>
        )}
      </div>
    </div>
  );
}

const OnboardingChecklist = () => {
  const { status } = useOnboarding();

  if (!status) return null;

  // Once the required path is finished, stop pushing. What's left is genuinely
  // optional, and it's framed that way — no counter, no progress bar, dismissible.
  if (status.onboarding_complete) {
    return <PostMilestonePrompts status={status} />;
  }

  const pct = Math.round((status.completed_count / status.total_count) * 100);

  return (
    <Card className="border border-primary/20 bg-primary/5 shadow-sm">
      <CardHeader className="pb-2">
        <CardTitle className="text-base font-semibold flex items-center gap-2">
          <Rocket className="h-4 w-4 text-primary" />
          Get your first class on the board
        </CardTitle>
      </CardHeader>
      <CardContent className="pt-1 pb-4">
        <div className="flex items-center gap-3 mb-4">
          <div className="h-2 flex-1 rounded-full bg-primary/15 overflow-hidden">
            <div
              className="h-full rounded-full bg-primary transition-all duration-500"
              style={{ width: `${pct}%` }}
            />
          </div>
          <span className="text-xs font-medium text-muted-foreground shrink-0">
            {status.completed_count} of {status.total_count}
          </span>
        </div>

        <ol className="space-y-2.5">
          {STEPS.map((step) => {
            const done = status.steps[step.key];
            return (
              <li key={step.key} className="flex items-start gap-3">
                {done ? (
                  <CheckCircle2 className="h-5 w-5 text-green-500 shrink-0 mt-0.5" />
                ) : (
                  <Circle className="h-5 w-5 text-gray-300 shrink-0 mt-0.5" />
                )}
                <div className="min-w-0 flex-1">
                  <div className="flex items-center justify-between gap-2 flex-wrap">
                    <span
                      className={`text-sm font-medium ${
                        done ? "line-through text-muted-foreground" : "text-gray-800"
                      }`}
                    >
                      {step.label}
                    </span>
                    {!done && step.href && (
                      <Button asChild size="sm" variant="outline" className="h-6 text-xs">
                        <Link to={step.href}>{step.cta}</Link>
                      </Button>
                    )}
                  </div>
                  <p className="text-xs text-muted-foreground">
                    {step.description(status)}
                  </p>
                </div>
              </li>
            );
          })}
        </ol>

        {status.student_invites_gated && (
          <p className="text-xs text-muted-foreground mt-4 pt-3 border-t">
            Inviting real students needs a one-time account review — everything
            above works right now, with no waiting.
          </p>
        )}
      </CardContent>
    </Card>
  );
};

/**
 * Shown after the milestone. These are the steps that used to be mandatory and
 * blocked companies from ever feeling progress; now they're suggestions.
 */
function PostMilestonePrompts({ status }: { status: OnboardingStatus }) {
  const extras = [
    {
      label: "Add the rest of your team",
      description: "Invite your other teachers the same way.",
      href: "/teachers",
      hide: false,
    },
    {
      label: status.student_invites_gated ? "Invite your students" : "Add your students",
      description: status.student_invites_gated
        ? "Needs a one-time account review first — you can prepare the roster now."
        : "Register students and send them their login details.",
      href: status.student_invites_gated ? "/onboarding/approval" : "/students",
      hide: status.counts.student_count > 0,
    },
    {
      label: "Customise your packages",
      description: "Set your own pricing, sessions, and subjects.",
      href: "/packages",
      hide: false,
    },
    {
      label: "Open your teachers' availability",
      description: "Students can only book into slots you've opened.",
      href: "/admin/calendar",
      hide: false,
    },
  ].filter((e) => !e.hide);

  if (extras.length === 0) return null;

  return (
    <Card className="border border-primary/15 shadow-sm">
      <CardHeader className="pb-2">
        <CardTitle className="text-base font-semibold flex items-center gap-2">
          <Sparkles className="h-4 w-4 text-primary" />
          {status.milestone_teacher
            ? `Nice — ${status.milestone_teacher.name} can now see their class!`
            : "You're set up"}
        </CardTitle>
      </CardHeader>
      <CardContent className="pt-1 pb-4">
        <p className="text-xs text-muted-foreground mb-3">
          Optional from here — add these whenever it suits you.
        </p>
        <ul className="space-y-2">
          {extras.map((e) => (
            <li key={e.label} className="flex items-start justify-between gap-2 flex-wrap">
              <div className="min-w-0">
                <span className="text-sm font-medium text-gray-800">{e.label}</span>
                <p className="text-xs text-muted-foreground">{e.description}</p>
              </div>
              <Button asChild size="sm" variant="ghost" className="h-6 text-xs text-primary">
                <Link to={e.href}>
                  Open <ArrowRight className="h-3 w-3 ml-1" />
                </Link>
              </Button>
            </li>
          ))}
        </ul>
      </CardContent>
    </Card>
  );
}

export default OnboardingChecklist;
