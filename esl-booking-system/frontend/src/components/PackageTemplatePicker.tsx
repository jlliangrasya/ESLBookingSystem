import { Sparkles, Clock, Layers, Gift } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";

/**
 * One-click starting points for a company's first class package.
 *
 * These are pure client-side presets — clicking one opens the normal Add Package
 * dialog with the fields already filled in, so the owner reviews and saves through
 * the existing POST /api/student/packages path. Nothing is created behind their
 * back, and they set their own price before committing.
 *
 * Deliberately not a backend endpoint or DB table: a preset is a form default, not
 * data. Keeping it client-side means no round trip, no duplicate-detection logic,
 * and no second server path for creating a package that could drift from the real
 * one.
 *
 * Price is left blank so the owner enters their own — except the trial class, which
 * is free by definition.
 */

export interface PackagePrefill {
  package_name: string;
  subject: string;
  session_limit: string;
  duration_minutes: string;
  price: string;
  description: string;
}

const SUBJECT = "English Conversation";
const SESSION_COUNTS = [5, 10, 20];

const GROUPS = [
  {
    key: "one_on_one",
    label: "Standard 1-on-1",
    blurb: "Private lessons, one student at a time.",
    duration: 25,
    kind: "one-on-one",
  },
  {
    key: "group",
    label: "Group Class",
    blurb: "Longer sessions for several students together.",
    duration: 50,
    kind: "group",
  },
];

function buildPrefill(
  label: string,
  sessions: number,
  duration: number,
  kind: string,
  price: string,
): PackagePrefill {
  const noun = sessions === 1 ? "Class" : "Classes";
  const lesson = sessions === 1 ? "lesson" : "lessons";
  return {
    package_name: `${label} — ${sessions} ${noun}`,
    subject: SUBJECT,
    session_limit: String(sessions),
    duration_minutes: String(duration),
    price,
    description: `${sessions} ${kind} ${lesson}, ${duration} minutes each.`,
  };
}

const PackageTemplatePicker = ({
  onPick,
  hasPackages,
}: {
  onPick: (prefill: PackagePrefill) => void;
  hasPackages: boolean;
}) => {
  // Only the first-run case needs hand-holding. Once a company has a package the
  // ordinary Add Package button is the right affordance.
  if (hasPackages) return null;

  return (
    <Card className="glow-card border-0 rounded-2xl">
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-base">
          <Sparkles className="h-4 w-4 text-primary" />
          Pick a package to get started
        </CardTitle>
        <p className="text-xs text-muted-foreground">
          Choose one and we'll fill in the details — just add your price and save.
          You can customise everything anytime.
        </p>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {GROUPS.map((g) => (
            <div
              key={g.key}
              className="rounded-xl border bg-white p-4 flex flex-col gap-2 hover:border-primary/40 transition-colors"
            >
              <h3 className="text-sm font-semibold text-gray-800">{g.label}</h3>
              <p className="text-xs text-muted-foreground flex-1">{g.blurb}</p>
              <div className="flex items-center gap-3 text-xs text-muted-foreground">
                <span className="inline-flex items-center gap-1">
                  <Clock className="h-3 w-3" />
                  {g.duration} min
                </span>
                <span className="inline-flex items-center gap-1">
                  <Layers className="h-3 w-3" />
                  Pick a size
                </span>
              </div>
              <div className="grid grid-cols-3 gap-1.5 mt-1">
                {SESSION_COUNTS.map((n) => (
                  <Button
                    key={n}
                    size="sm"
                    variant="outline"
                    className="template-pick-btn text-xs h-8 px-0"
                    onClick={() =>
                      onPick(buildPrefill(g.label, n, g.duration, g.kind, ""))
                    }
                  >
                    {n} classes
                  </Button>
                ))}
              </div>
            </div>
          ))}

          {/* Trial is a single free lesson — one option, price fixed at 0. */}
          <div className="rounded-xl border bg-white p-4 flex flex-col gap-2 hover:border-primary/40 transition-colors">
            <h3 className="text-sm font-semibold text-gray-800 flex items-center gap-1.5">
              <Gift className="h-3.5 w-3.5 text-primary" />
              Trial Class
            </h3>
            <p className="text-xs text-muted-foreground flex-1">
              One free lesson so a new student can try you out.
            </p>
            <div className="flex items-center gap-3 text-xs text-muted-foreground">
              <span className="inline-flex items-center gap-1">
                <Clock className="h-3 w-3" />
                25 min
              </span>
              <span className="inline-flex items-center gap-1">
                <Layers className="h-3 w-3" />
                1 class
              </span>
            </div>
            <Button
              size="sm"
              variant="outline"
              className="template-pick-btn w-full text-xs h-8 mt-1"
              onClick={() => onPick(buildPrefill("Trial Class", 1, 25, "trial", "0"))}
            >
              Free trial · no charge
            </Button>
          </div>
        </div>
        <p className="text-xs text-muted-foreground">
          Want something different? Use <strong>Build a custom package</strong> below
          to start from a blank form.
        </p>
      </CardContent>
    </Card>
  );
};

export default PackageTemplatePicker;
