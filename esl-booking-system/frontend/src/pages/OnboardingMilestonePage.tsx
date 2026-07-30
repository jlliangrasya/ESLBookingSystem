import { Link } from "react-router-dom";
import {
  CheckCircle2,
  Circle,
  Loader2,
  Mail,
  PartyPopper,
  ArrowRight,
  Users,
  Package,
  CalendarRange,
  UserPlus,
} from "lucide-react";
import NavBar from "@/components/Navbar";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { useOnboarding } from "@/context/OnboardingContext";

/**
 * The onboarding milestone screen.
 *
 * The milestone is "a teacher can log in and see their assigned class". Because a
 * class in this system is a student's booked session, and inviting a real student
 * is exactly what sits behind the approval gate, the milestone is presented from
 * the owner's side: their teacher is invited, their package is ready, and the
 * screen confirms the moment the teacher actually logs in.
 *
 * Everything offered below the milestone is explicitly optional — that's the whole
 * point of the reorder.
 */
const OnboardingMilestonePage = () => {
  const { status, loading, refresh } = useOnboarding();

  if (loading) {
    return (
      <>
        <NavBar />
        <div className="flex items-center justify-center py-24">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
        </div>
      </>
    );
  }

  if (!status) {
    return (
      <>
        <NavBar />
        <div className="max-w-2xl mx-auto px-4 py-16 text-center text-muted-foreground">
          Couldn't load your setup progress. Please refresh the page.
        </div>
      </>
    );
  }

  const teacher = status.milestone_teacher ?? status.first_teacher;
  const reached = status.steps.milestone_reached;

  return (
    <>
      <NavBar />
      <div className="max-w-3xl mx-auto px-4 py-8 space-y-6">
        {reached ? (
          <Card className="border-green-200 bg-green-50/60 shadow-sm">
            <CardContent className="pt-8 pb-8 text-center space-y-3">
              <PartyPopper className="h-14 w-14 text-green-500 mx-auto" />
              <h1 className="text-2xl font-bold text-gray-800">
                Nice — {teacher?.name} can now see their class!
              </h1>
              <p className="text-muted-foreground max-w-md mx-auto">
                {teacher?.name} logged in and Brightfolks is working for{" "}
                {status.company_name}. That's the hard part done.
              </p>
              <p className="text-sm font-medium text-gray-700 pt-2">
                Want to add the rest of your team?
              </p>
              <div className="flex items-center justify-center gap-2 flex-wrap pt-1">
                <Button asChild size="sm">
                  <Link to="/teachers">
                    <Users className="h-4 w-4 mr-1.5" />
                    Add more teachers
                  </Link>
                </Button>
                <Button asChild size="sm" variant="outline">
                  <Link
                    to={status.student_invites_gated ? "/onboarding/approval" : "/students"}
                  >
                    <UserPlus className="h-4 w-4 mr-1.5" />
                    {status.student_invites_gated
                      ? "Prepare your students"
                      : "Add students"}
                  </Link>
                </Button>
              </div>
            </CardContent>
          </Card>
        ) : (
          <Card className="shadow-sm">
            <CardHeader>
              <CardTitle className="text-xl">You're almost there</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              {status.first_teacher ? (
                <div className="rounded-lg border bg-muted/40 p-4 space-y-2">
                  <p className="text-sm font-medium text-gray-800 flex items-center gap-2">
                    <Mail className="h-4 w-4 text-primary" />
                    Waiting for {status.first_teacher.name} to log in
                  </p>
                  <p className="text-xs text-muted-foreground">
                    We sent an invite to{" "}
                    <span className="font-medium">{status.first_teacher.email}</span>.
                    The moment they sign in, they'll see the class you set up — and
                    this page will say so.
                  </p>
                  <p className="text-xs text-muted-foreground">
                    Didn't arrive? Open their profile to copy their login details and
                    send them directly.
                  </p>
                  <div className="flex gap-2 pt-1 flex-wrap">
                    <Button asChild size="sm" variant="outline" className="h-7 text-xs">
                      <Link to={`/admin/teachers/${status.first_teacher.id}`}>
                        Open teacher profile
                      </Link>
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      className="h-7 text-xs"
                      onClick={refresh}
                    >
                      Check again
                    </Button>
                  </div>
                </div>
              ) : (
                <p className="text-sm text-muted-foreground">
                  Add your first teacher to see Brightfolks in action — it takes
                  about a minute.
                </p>
              )}
            </CardContent>
          </Card>
        )}

        {/* The required path, always visible so progress stays concrete. */}
        <Card className="shadow-sm">
          <CardHeader className="pb-2">
            <CardTitle className="text-base">
              Setup — {status.completed_count} of {status.total_count} done
            </CardTitle>
          </CardHeader>
          <CardContent className="pt-1 space-y-2.5">
            <MilestoneStep
              done={status.steps.company_registered}
              label="School created"
              detail={status.company_name}
            />
            <MilestoneStep
              done={status.steps.teacher_added}
              label="First teacher added"
              detail={
                status.first_teacher
                  ? `${status.first_teacher.name} — ${status.first_teacher.email}`
                  : "Name and email is all it takes"
              }
              href={status.steps.teacher_added ? null : "/teachers"}
              cta="Add a teacher"
            />
            <MilestoneStep
              done={status.steps.class_created}
              label="Class package ready"
              detail={
                status.counts.package_count > 0
                  ? `${status.counts.package_count} package${status.counts.package_count === 1 ? "" : "s"} — customise anytime`
                  : "Pick a ready-made one to get started"
              }
              href={status.steps.class_created ? null : "/packages"}
              cta="Pick a package"
            />
            <MilestoneStep
              done={status.steps.milestone_reached}
              label="Teacher logged in and can see their class"
              detail={
                status.steps.milestone_reached
                  ? "Milestone reached 🎉"
                  : "The last step — and it's theirs, not yours"
              }
            />
          </CardContent>
        </Card>

        {/* Optional extras. Framed as "when you're ready", never as unfinished work. */}
        <Card className="shadow-sm">
          <CardHeader className="pb-2">
            <CardTitle className="text-base">When you're ready</CardTitle>
          </CardHeader>
          <CardContent className="pt-1 space-y-2">
            <p className="text-xs text-muted-foreground mb-2">
              None of this is required. Add it whenever it suits you.
            </p>
            <OptionalRow
              icon={Users}
              label="Add the rest of your teachers"
              href="/teachers"
            />
            <OptionalRow
              icon={UserPlus}
              label={
                status.student_invites_gated
                  ? "Prepare your student roster"
                  : "Add your students"
              }
              href={status.student_invites_gated ? "/onboarding/approval" : "/students"}
              note={
                status.student_invites_gated
                  ? "Needs a one-time account review"
                  : undefined
              }
            />
            <OptionalRow
              icon={Package}
              label="Build custom packages and pricing"
              href="/packages"
            />
            <OptionalRow
              icon={CalendarRange}
              label="Open your teachers' weekly availability"
              href="/admin/calendar"
              note="Students can only book slots you've opened"
            />
          </CardContent>
        </Card>

        <div className="text-center">
          <Button asChild variant="ghost" size="sm" className="text-xs">
            <Link to="/admin-dashboard">
              Go to dashboard <ArrowRight className="h-3 w-3 ml-1" />
            </Link>
          </Button>
        </div>
      </div>
    </>
  );
};

function MilestoneStep({
  done,
  label,
  detail,
  href,
  cta,
}: {
  done: boolean;
  label: string;
  detail: string;
  href?: string | null;
  cta?: string;
}) {
  return (
    <div className="flex items-start gap-3">
      {done ? (
        <CheckCircle2 className="h-5 w-5 text-green-500 shrink-0 mt-0.5" />
      ) : (
        <Circle className="h-5 w-5 text-gray-300 shrink-0 mt-0.5" />
      )}
      <div className="min-w-0 flex-1">
        <div className="flex items-center justify-between gap-2 flex-wrap">
          <span
            className={`text-sm font-medium ${done ? "text-muted-foreground" : "text-gray-800"}`}
          >
            {label}
          </span>
          {href && cta && (
            <Button asChild size="sm" variant="outline" className="h-6 text-xs">
              <Link to={href}>{cta}</Link>
            </Button>
          )}
        </div>
        <p className="text-xs text-muted-foreground">{detail}</p>
      </div>
    </div>
  );
}

function OptionalRow({
  icon: Icon,
  label,
  href,
  note,
}: {
  icon: typeof Users;
  label: string;
  href: string;
  note?: string;
}) {
  return (
    <Link
      to={href}
      className="flex items-center gap-3 rounded-lg border px-3 py-2 hover:bg-muted/50 transition-colors"
    >
      <Icon className="h-4 w-4 text-primary shrink-0" />
      <div className="min-w-0 flex-1">
        <span className="text-sm text-gray-800">{label}</span>
        {note && <p className="text-xs text-muted-foreground">{note}</p>}
      </div>
      <ArrowRight className="h-4 w-4 text-muted-foreground shrink-0" />
    </Link>
  );
}

export default OnboardingMilestonePage;
