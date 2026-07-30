import { useState, useEffect, useCallback, useContext } from "react";
import { Link, useNavigate } from "react-router-dom";
import axios from "axios";
import {
  ShieldCheck,
  Loader2,
  Plus,
  Trash2,
  CheckCircle2,
  Users,
  UserPlus,
  CalendarRange,
  ArrowRight,
} from "lucide-react";
import NavBar from "@/components/Navbar";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Alert, AlertDescription } from "@/components/ui/alert";
import AuthContext from "@/context/AuthContext";
import { useOnboarding } from "@/context/OnboardingContext";

type DraftKind = "teacher" | "student" | "schedule";

interface Draft {
  id: number;
  kind: DraftKind;
  payload: Record<string, string> | null;
}

/**
 * The approval-gate screen.
 *
 * Shown when a company tries to invite a real student before their one-time review
 * has cleared. Deliberately not a blank waiting state: the wait is where companies
 * used to go quiet, so this screen gives them something concrete to do and stores
 * it as drafts that are ready to submit the moment approval lands.
 *
 * Drafts create no accounts and send no email — that's precisely why they're
 * allowed to happen before review.
 */
const OnboardingApprovalPage = () => {
  const authContext = useContext(AuthContext);
  const navigate = useNavigate();
  const token = authContext?.token ?? null;
  const headers = { Authorization: `Bearer ${token}` };
  const base = import.meta.env.VITE_API_URL;

  const { status, loading: statusLoading } = useOnboarding();
  const [drafts, setDrafts] = useState<Draft[]>([]);
  const [loading, setLoading] = useState(true);
  const [requested, setRequested] = useState(false);
  const [draftError, setDraftError] = useState<string | null>(null);

  const fetchDrafts = useCallback(async () => {
    if (!token) return;
    try {
      const res = await axios.get<Draft[]>(`${base}/api/onboarding/drafts`, { headers });
      setDrafts(res.data);
    } catch {
      // Non-fatal — the explanation and checklist still render.
    } finally {
      setLoading(false);
    }
  }, [token]);

  useEffect(() => {
    fetchDrafts();
  }, [fetchDrafts]);

  // Let the reviewer know someone is actually waiting. Server-side this is a no-op
  // if the same company already asked within the last 24h.
  useEffect(() => {
    if (!token || requested || !status?.student_invites_gated) return;
    setRequested(true);
    axios
      .post(`${base}/api/onboarding/request-approval`, {}, { headers })
      .catch(() => {});
  }, [token, requested, status?.student_invites_gated]);

  // Draft writes report failures rather than rejecting into nothing — silently
  // dropping a roster the owner just typed is the one outcome this screen can't
  // afford, since the whole point is that the data is safe until approval.
  const addDraft = async (kind: DraftKind, payload: Record<string, string>) => {
    try {
      const res = await axios.post<Draft>(
        `${base}/api/onboarding/drafts`,
        { kind, payload },
        { headers },
      );
      setDrafts((prev) => [...prev, res.data]);
      setDraftError(null);
    } catch (err) {
      setDraftError(
        axios.isAxiosError(err)
          ? err.response?.data?.message || "Couldn't save that — please try again."
          : "Couldn't save that — please try again.",
      );
      throw err;
    }
  };

  const removeDraft = async (id: number) => {
    try {
      await axios.delete(`${base}/api/onboarding/drafts/${id}`, { headers });
      setDrafts((prev) => prev.filter((d) => d.id !== id));
      setDraftError(null);
    } catch {
      setDraftError("Couldn't remove that draft — please try again.");
    }
  };

  if (statusLoading || loading) {
    return (
      <>
        <NavBar />
        <div className="flex items-center justify-center py-24">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
        </div>
      </>
    );
  }

  // Approved while they were sitting here — send them straight on to the thing
  // they were originally trying to do.
  if (status && !status.student_invites_gated) {
    return (
      <>
        <NavBar />
        <div className="max-w-2xl mx-auto px-4 py-16">
          <Card className="border-green-200 bg-green-50/60">
            <CardContent className="pt-8 pb-8 text-center space-y-3">
              <CheckCircle2 className="h-14 w-14 text-green-500 mx-auto" />
              <h1 className="text-2xl font-bold text-gray-800">You're approved!</h1>
              <p className="text-muted-foreground">
                You can invite real students now. Anything you prepared below is
                still saved.
              </p>
              <Button onClick={() => navigate("/students?invite=1")} className="mt-2">
                Invite your students <ArrowRight className="h-4 w-4 ml-1.5" />
              </Button>
            </CardContent>
          </Card>
        </div>
      </>
    );
  }

  const teacherDrafts = drafts.filter((d) => d.kind === "teacher");
  const studentDrafts = drafts.filter((d) => d.kind === "student");
  const scheduleDraft = drafts.find((d) => d.kind === "schedule") ?? null;

  return (
    <>
      <NavBar />
      <div className="max-w-3xl mx-auto px-4 py-8 space-y-6">
        <Card className="border-amber-200 bg-amber-50/60 shadow-sm">
          <CardContent className="pt-6 pb-6 space-y-2">
            <div className="flex items-start gap-3">
              <ShieldCheck className="h-6 w-6 text-amber-600 shrink-0 mt-0.5" />
              <div>
                <h1 className="text-lg font-bold text-gray-800">
                  We're reviewing your account
                </h1>
                <p className="text-sm text-muted-foreground mt-1">
                  To protect student data, we manually review accounts before
                  inviting real students. This usually takes under 24 hours.
                </p>
                <p className="text-xs text-muted-foreground mt-2">
                  Everything else keeps working — you can add teachers, set up
                  packages, and open availability right now. We'll email you and
                  send an in-app notification with a link straight back to the
                  student invite step.
                </p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="shadow-sm">
          <CardHeader className="pb-2">
            <CardTitle className="text-base">
              While we review your account, here's what to prepare
            </CardTitle>
          </CardHeader>
          <CardContent className="pt-1 space-y-6">
            <p className="text-xs text-muted-foreground">
              Anything you enter here is saved as a draft — no accounts are created
              and nobody is emailed until you're approved.
            </p>

            {draftError && (
              <Alert variant="destructive">
                <AlertDescription className="text-sm">{draftError}</AlertDescription>
              </Alert>
            )}

            <DraftSection
              icon={Users}
              title="Your list of teachers"
              hint="Name and email is all we need."
              fields={[
                { key: "name", label: "Name", placeholder: "Maria Santos" },
                { key: "email", label: "Email", placeholder: "maria@example.com", type: "email" },
              ]}
              drafts={teacherDrafts}
              renderDraft={(p) => `${p.name} — ${p.email}`}
              onAdd={(payload) => addDraft("teacher", payload)}
              onRemove={removeDraft}
            />

            <DraftSection
              icon={UserPlus}
              title="Your student roster"
              hint="Name plus an email or phone number."
              fields={[
                { key: "name", label: "Name", placeholder: "Li Wei" },
                { key: "contact", label: "Email or phone", placeholder: "li@example.com" },
                { key: "guardian_name", label: "Guardian (optional)", placeholder: "", optional: true },
              ]}
              drafts={studentDrafts}
              renderDraft={(p) =>
                `${p.name} — ${p.contact}${p.guardian_name ? ` (guardian: ${p.guardian_name})` : ""}`
              }
              onAdd={(payload) => addDraft("student", payload)}
              onRemove={removeDraft}
            />

            <ScheduleDraft
              draft={scheduleDraft}
              onSave={async (text) => {
                if (scheduleDraft) {
                  try {
                    await axios.put(
                      `${base}/api/onboarding/drafts/${scheduleDraft.id}`,
                      { payload: { notes: text } },
                      { headers },
                    );
                    setDrafts((prev) =>
                      prev.map((d) =>
                        d.id === scheduleDraft.id ? { ...d, payload: { notes: text } } : d,
                      ),
                    );
                    setDraftError(null);
                  } catch {
                    setDraftError("Couldn't save your schedule notes — please try again.");
                    throw new Error("save failed");
                  }
                } else {
                  await addDraft("schedule", { notes: text });
                }
              }}
            />
          </CardContent>
        </Card>

        <Card className="shadow-sm">
          <CardHeader className="pb-2">
            <CardTitle className="text-base">Not blocked on us</CardTitle>
          </CardHeader>
          <CardContent className="pt-1 space-y-2">
            <Link
              to="/teachers"
              className="flex items-center gap-3 rounded-lg border px-3 py-2 hover:bg-muted/50 transition-colors"
            >
              <Users className="h-4 w-4 text-primary shrink-0" />
              <span className="text-sm text-gray-800 flex-1">Add more teachers</span>
              <ArrowRight className="h-4 w-4 text-muted-foreground" />
            </Link>
            <Link
              to="/admin/calendar"
              className="flex items-center gap-3 rounded-lg border px-3 py-2 hover:bg-muted/50 transition-colors"
            >
              <CalendarRange className="h-4 w-4 text-primary shrink-0" />
              <span className="text-sm text-gray-800 flex-1">
                Open your teachers' availability
              </span>
              <ArrowRight className="h-4 w-4 text-muted-foreground" />
            </Link>
          </CardContent>
        </Card>
      </div>
    </>
  );
};

interface FieldDef {
  key: string;
  label: string;
  placeholder: string;
  type?: string;
  optional?: boolean;
}

function DraftSection({
  icon: Icon,
  title,
  hint,
  fields,
  drafts,
  renderDraft,
  onAdd,
  onRemove,
}: {
  icon: typeof Users;
  title: string;
  hint: string;
  fields: FieldDef[];
  drafts: Draft[];
  renderDraft: (payload: Record<string, string>) => string;
  onAdd: (payload: Record<string, string>) => Promise<void>;
  onRemove: (id: number) => Promise<void>;
}) {
  const empty = Object.fromEntries(fields.map((f) => [f.key, ""]));
  const [form, setForm] = useState<Record<string, string>>(empty);
  const [saving, setSaving] = useState(false);

  const required = fields.filter((f) => !f.optional);
  const canSave = required.every((f) => form[f.key]?.trim());

  const submit = async () => {
    if (!canSave) return;
    setSaving(true);
    try {
      await onAdd(form);
      setForm(empty);
    } catch {
      // onAdd already surfaced the message; keep the typed values so the owner
      // can retry without re-entering them.
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-2">
      <div className="flex items-center gap-2">
        <Icon className="h-4 w-4 text-primary" />
        <h3 className="text-sm font-semibold text-gray-800">{title}</h3>
        <span className="text-xs text-muted-foreground">· {drafts.length} saved</span>
      </div>
      <p className="text-xs text-muted-foreground">{hint}</p>

      {drafts.length > 0 && (
        <ul className="space-y-1">
          {drafts.map((d) => (
            <li
              key={d.id}
              className="flex items-center justify-between gap-2 rounded-md bg-muted/50 px-2.5 py-1.5"
            >
              <span className="text-xs text-gray-700 truncate">
                {d.payload ? renderDraft(d.payload) : "—"}
              </span>
              <button
                onClick={() => onRemove(d.id)}
                className="text-muted-foreground hover:text-destructive shrink-0"
                aria-label="Remove draft"
              >
                <Trash2 className="h-3.5 w-3.5" />
              </button>
            </li>
          ))}
        </ul>
      )}

      <div className="flex items-end gap-2 flex-wrap">
        {fields.map((f) => (
          <div key={f.key} className="space-y-1 flex-1 min-w-32">
            <Label className="text-xs">{f.label}</Label>
            <Input
              type={f.type ?? "text"}
              className="h-8 text-sm"
              placeholder={f.placeholder}
              value={form[f.key] ?? ""}
              onChange={(e) => setForm((prev) => ({ ...prev, [f.key]: e.target.value }))}
              onKeyDown={(e) => {
                if (e.key === "Enter") submit();
              }}
            />
          </div>
        ))}
        <Button
          size="sm"
          variant="outline"
          className="h-8"
          disabled={!canSave || saving}
          onClick={submit}
        >
          {saving ? (
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
          ) : (
            <>
              <Plus className="h-3.5 w-3.5 mr-1" /> Add
            </>
          )}
        </Button>
      </div>
    </div>
  );
}

function ScheduleDraft({
  draft,
  onSave,
}: {
  draft: Draft | null;
  onSave: (text: string) => Promise<void>;
}) {
  const [text, setText] = useState(draft?.payload?.notes ?? "");
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  const submit = async () => {
    setSaving(true);
    setSaved(false);
    try {
      await onSave(text);
      setSaved(true);
    } catch {
      // onSave surfaced the message; leave the textarea contents untouched.
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-2">
      <div className="flex items-center gap-2">
        <CalendarRange className="h-4 w-4 text-primary" />
        <h3 className="text-sm font-semibold text-gray-800">Your class schedule</h3>
      </div>
      <p className="text-xs text-muted-foreground">
        Rough notes are fine — days, times, who teaches what.
      </p>
      <Textarea
        rows={4}
        className="text-sm"
        placeholder={"e.g. Mon/Wed/Fri 9-11am — Maria, 1-on-1\nTue/Thu 4-6pm — group class"}
        value={text}
        onChange={(e) => {
          setText(e.target.value);
          setSaved(false);
        }}
      />
      <div className="flex items-center gap-2">
        <Button
          size="sm"
          variant="outline"
          className="h-8"
          disabled={saving || !text.trim()}
          onClick={submit}
        >
          {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : "Save notes"}
        </Button>
        {saved && (
          <span className="text-xs text-green-600 flex items-center gap-1">
            <CheckCircle2 className="h-3.5 w-3.5" /> Saved
          </span>
        )}
      </div>
    </div>
  );
}

export default OnboardingApprovalPage;
