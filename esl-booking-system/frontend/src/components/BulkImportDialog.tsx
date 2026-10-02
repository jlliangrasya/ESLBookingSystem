import { useState, useRef, useMemo, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import axios from "axios";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription } from "@/components/ui/alert";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
} from "@/components/ui/dialog";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import {
  Upload, Download, Loader2, CheckCircle2, AlertCircle, FileSpreadsheet,
  Copy, Check, RefreshCw, Trash2, ArrowLeft, Eye, EyeOff, Wand2, AtSign,
} from "lucide-react";

// Bulk import, in three steps: upload the roster → review it and set the logins
// → create the accounts and hand back the credentials.
//
// The uploaded file never carries a login. For students the admin types the
// email and password for each row; for teachers the email comes from the file
// and the password is generated. That's why the preview step exists at all —
// it's where the credentials get decided, not just a confirmation screen.

type ImportType = "students" | "teachers";

interface ParsedStudent {
  row: number;
  name: string;
  guardian_name: string;
  age: number | null;
  nationality: string;
}

interface ParsedTeacher {
  row: number;
  name: string;
  email: string;
  password: string;
  problem: string | null;
}

interface SkippedRow {
  row: number;
  reason: string;
}

interface Seats {
  limit: number;
  used: number;
  remaining: number;
  plan_name: string;
}

interface ParseResponse {
  type: ImportType;
  rows: (ParsedStudent | ParsedTeacher)[];
  skipped: SkippedRow[];
  header_detected: boolean;
  columns_found: string[];
  unknown_columns: string[];
  seats: Seats;
}

// One editable preview line. Students get an empty email/password to fill in;
// teachers arrive with both already set.
interface DraftRow {
  key: string;
  row: number;
  name: string;
  email: string;
  password: string;
  guardian_name: string;
  age: number | null;
  nationality: string;
  problem: string | null;
}

interface CreatedAccount {
  id: number;
  name: string;
  email: string;
  password: string;
}

interface FailedRow {
  row: number | null;
  name: string;
  email: string;
  reason: string;
}

interface CommitResponse {
  created: CreatedAccount[];
  failed: FailedRow[];
  imported: number;
  skipped: number;
  total: number;
}

const LOGIN_URL = "https://brightfolks.pages.dev";

// Same alphabet as the server's generateTempPassword — no 0/O or 1/l/I, because
// these get read off a screen and retyped.
const PW_ALPHABET = "abcdefghijkmnpqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789";

function generatePassword(length = 10) {
  const bytes = new Uint32Array(length);
  crypto.getRandomValues(bytes);
  let out = "";
  for (let i = 0; i < length; i++) out += PW_ALPHABET[bytes[i] % PW_ALPHABET.length];
  return out;
}

function isValidEmail(email: string) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

function credentialText(type: ImportType, a: CreatedAccount) {
  return type === "students"
    ? `Name: ${a.name}\nEmail: ${a.email}\nPassword: ${a.password}\n\nPlease use the email and password to login to ${LOGIN_URL}`
    : `Hi ${a.name}, you've been invited to Brightfolks.\n\nLogin: ${LOGIN_URL}/login\nEmail: ${a.email}\nTemporary password: ${a.password}\n\nYou can change your password once you're in.`;
}

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  type: ImportType;
  /** Called after accounts are created so the caller can refresh its list. */
  onImported?: () => void;
}

const BulkImportDialog: React.FC<Props> = ({ open, onOpenChange, type, onImported }) => {
  const navigate = useNavigate();
  const API = import.meta.env.VITE_API_URL;
  const headers = useMemo(
    () => ({ Authorization: `Bearer ${localStorage.getItem("token")}` }),
    [],
  );

  const isStudents = type === "students";
  const label = isStudents ? "Students" : "Teachers";
  const singular = isStudents ? "student" : "teacher";

  const [step, setStep] = useState<"upload" | "preview" | "done">("upload");
  const [parsing, setParsing] = useState(false);
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [fileName, setFileName] = useState("");
  const [dragging, setDragging] = useState(false);

  const [drafts, setDrafts] = useState<DraftRow[]>([]);
  const [skipped, setSkipped] = useState<SkippedRow[]>([]);
  const [seats, setSeats] = useState<Seats | null>(null);
  const [unknownColumns, setUnknownColumns] = useState<string[]>([]);
  const [headerDetected, setHeaderDetected] = useState(true);
  // Visible by default: these are credentials the admin is writing down to send
  // to someone, not a password they're entering for themselves. The toggle is
  // there for when someone is screen-sharing.
  const [showPasswords, setShowPasswords] = useState(true);

  // A domain typed once and applied to every row that doesn't carry its own, so
  // a roster of thirty students needs "maria", "juan"… instead of the same
  // "@school.com" thirty times. Rows holding a full address keep it.
  const [emailDomainInput, setEmailDomainInput] = useState("");

  const emailDomain = useMemo(() => {
    const d = emailDomainInput.trim().toLowerCase().replace(/^@+/, "");
    return d ? `@${d}` : "";
  }, [emailDomainInput]);

  // A half-typed domain ("@e", "@exam") would otherwise make every row that
  // relies on it report "Invalid email" at once. The domain is one mistake in
  // one field, so it reports itself and the rows stay quiet.
  const domainValid = !emailDomain || /^@[^\s@]+\.[^\s@]+$/.test(emailDomain);

  /** The address a row will actually be created with. */
  const resolveEmail = useCallback(
    (raw: string) => {
      const e = raw.trim().toLowerCase();
      if (!e) return "";
      if (e.includes("@")) return e;
      return emailDomain ? e + emailDomain : e;
    },
    [emailDomain],
  );

  const [result, setResult] = useState<CommitResponse | null>(null);
  const [copiedKey, setCopiedKey] = useState<string | null>(null);

  const fileInputRef = useRef<HTMLInputElement>(null);

  const reset = useCallback(() => {
    setStep("upload");
    setError(null);
    setFileName("");
    setDrafts([]);
    setSkipped([]);
    setSeats(null);
    setUnknownColumns([]);
    setHeaderDetected(true);
    setResult(null);
    setCopiedKey(null);
    setShowPasswords(true);
    setEmailDomainInput("");
    if (fileInputRef.current) fileInputRef.current.value = "";
  }, []);

  const handleClose = (next: boolean) => {
    if (!next) {
      // A finished import has already changed the roster behind the dialog.
      if (step === "done" && result && result.imported > 0) onImported?.();
      reset();
    }
    onOpenChange(next);
  };

  const copy = async (key: string, text: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopiedKey(key);
      setTimeout(() => setCopiedKey((k) => (k === key ? null : k)), 2000);
    } catch {
      setError("Could not copy to clipboard — please select the text manually.");
    }
  };

  const downloadTemplate = async () => {
    try {
      const res = await axios.get(`${API}/api/import/template/${type}`, { headers, responseType: "blob" });
      const url = window.URL.createObjectURL(new Blob([res.data]));
      const link = document.createElement("a");
      link.href = url;
      link.download = `${type}_template.csv`;
      link.click();
      window.URL.revokeObjectURL(url);
    } catch {
      setError("Failed to download the template.");
    }
  };

  const handleFile = async (file: File) => {
    setParsing(true);
    setError(null);
    setFileName(file.name);
    try {
      const formData = new FormData();
      formData.append("file", file);
      formData.append("type", type);
      const res = await axios.post<ParseResponse>(`${API}/api/import/parse`, formData, {
        headers: { ...headers, "Content-Type": "multipart/form-data" },
      });
      const data = res.data;

      setDrafts(
        data.rows.map((r, i) => {
          const teacher = r as ParsedTeacher;
          const student = r as ParsedStudent;
          return {
            key: `${r.row}-${i}`,
            row: r.row,
            name: r.name,
            email: isStudents ? "" : (teacher.email || ""),
            // Students start blank so nothing is pre-filled on the admin's
            // behalf; teachers get the password the server just generated.
            password: isStudents ? "" : (teacher.password || generatePassword()),
            guardian_name: isStudents ? (student.guardian_name || "") : "",
            age: isStudents ? student.age : null,
            nationality: isStudents ? (student.nationality || "") : "",
            // Only "already registered" is kept from the server: it's the one
            // thing the browser can't re-derive. Empty / malformed / repeated
            // are recomputed as the admin types, so a row the server called
            // invalid stops being flagged once a shared domain completes it.
            problem:
              !isStudents && teacher.problem === "Email already registered"
                ? teacher.problem
                : null,
          };
        }),
      );
      setSkipped(data.skipped);
      setSeats(data.seats);
      setUnknownColumns(data.unknown_columns);
      setHeaderDetected(data.header_detected);
      setStep("preview");
    } catch (err: unknown) {
      const response = axios.isAxiosError(err) ? err.response : undefined;
      // The approval gate — send them to the screen that explains it rather
      // than an inline error they can do nothing about.
      if (response?.status === 403 && response.data?.code === "APPROVAL_REQUIRED") {
        onOpenChange(false);
        reset();
        navigate("/onboarding/approval");
        return;
      }
      setError(response?.data?.message || "Could not read that file.");
      setFileName("");
    } finally {
      setParsing(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  };

  const updateDraft = (key: string, patch: Partial<DraftRow>) =>
    setDrafts((rows) => rows.map((r) => (r.key === key ? { ...r, ...patch } : r)));

  const removeDraft = (key: string) => setDrafts((rows) => rows.filter((r) => r.key !== key));

  const fillAllPasswords = () =>
    setDrafts((rows) => rows.map((r) => ({ ...r, password: r.password || generatePassword() })));

  // Per-row validation, recomputed as the admin types. Duplicate detection runs
  // across the whole draft set so two rows can't claim the same login, and it
  // compares resolved addresses so "maria" and "maria@school.com" collide.
  //
  // No password length rule: an admin setting a child's password may well want
  // something short. It only has to be non-empty.
  const rowErrors = useMemo(() => {
    const counts = new Map<string, number>();
    for (const r of drafts) {
      const e = resolveEmail(r.email);
      if (e) counts.set(e, (counts.get(e) || 0) + 1);
    }
    const map = new Map<string, string>();
    for (const r of drafts) {
      const raw = r.email.trim();
      const email = resolveEmail(r.email);
      // When the shared domain is supplying the "@…" part, only the username
      // the admin typed is theirs to get wrong. Anything wrong with the domain
      // is reported once, on the domain field itself.
      const usesSharedDomain = !!emailDomain && !raw.includes("@");

      if (!r.name.trim()) map.set(r.key, "Name is required");
      else if (!raw) map.set(r.key, "Email is required");
      else if (!raw.includes("@") && !emailDomain)
        map.set(r.key, "Set a shared domain above, or type the full email");
      else if (usesSharedDomain && /\s/.test(raw))
        map.set(r.key, "No spaces allowed before the @");
      else if (!usesSharedDomain && !isValidEmail(email)) map.set(r.key, "Invalid email");
      else if ((counts.get(email) || 0) > 1) map.set(r.key, "Duplicate email in this list");
      else if (!r.password) map.set(r.key, "Password is required");
      else if (r.problem) map.set(r.key, r.problem);
    }
    return map;
  }, [drafts, resolveEmail, emailDomain]);

  const readyCount = drafts.length - rowErrors.size;
  const overSeatLimit = !!seats && drafts.length > seats.remaining;

  const handleCreate = async () => {
    setCreating(true);
    setError(null);
    try {
      const payload = drafts.map((r) => ({
        row: r.row,
        name: r.name.trim(),
        email: resolveEmail(r.email),
        password: r.password,
        ...(isStudents
          ? {
              guardian_name: r.guardian_name.trim() || undefined,
              nationality: r.nationality.trim() || undefined,
              age: r.age ?? undefined,
            }
          : {}),
      }));
      const res = await axios.post<CommitResponse>(
        `${API}/api/import/${type}`,
        isStudents ? { students: payload } : { teachers: payload },
        { headers },
      );
      setResult(res.data);
      setStep("done");
      if (res.data.imported > 0) onImported?.();
    } catch (err: unknown) {
      const response = axios.isAxiosError(err) ? err.response : undefined;
      if (response?.status === 403 && response.data?.code === "APPROVAL_REQUIRED") {
        onOpenChange(false);
        reset();
        navigate("/onboarding/approval");
        return;
      }
      // A 400 still carries per-row reasons when every row was rejected.
      if (response?.data?.failed) {
        setResult(response.data as CommitResponse);
        setStep("done");
      } else {
        setError(response?.data?.message || `Failed to create ${type}.`);
      }
    } finally {
      setCreating(false);
    }
  };

  const allCredentialsText = result
    ? result.created.map((a) => credentialText(type, a)).join("\n\n————————————————\n\n")
    : "";

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent
        className={
          step === "upload"
            ? "sm:max-w-xl"
            : "sm:max-w-5xl max-h-[90vh] overflow-hidden flex flex-col"
        }
      >
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <FileSpreadsheet className="h-5 w-5 text-primary" />
            {step === "done" ? `${label} Import Complete` : `Bulk Add ${label}`}
          </DialogTitle>
          <DialogDescription>
            {step === "upload" &&
              `Upload an Excel (.xlsx) or CSV file. You'll review every row and set the logins before any account is created.`}
            {step === "preview" &&
              (isStudents
                ? `Review the roster, then give each student an email and password.`
                : `Review the roster. Each teacher logs in with the email from your file and the temporary password below.`)}
            {step === "done" && `Copy the login details below and send them to each ${singular}.`}
          </DialogDescription>
        </DialogHeader>

        {error && (
          <Alert variant="destructive">
            <AlertCircle className="h-4 w-4" />
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}

        {/* ── Step 1: upload ─────────────────────────────────────────────── */}
        {step === "upload" && (
          <div className="space-y-4">
            <div
              onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
              onDragLeave={() => setDragging(false)}
              onDrop={(e) => {
                e.preventDefault();
                setDragging(false);
                const file = e.dataTransfer.files?.[0];
                if (file) handleFile(file);
              }}
              onClick={() => fileInputRef.current?.click()}
              className={`cursor-pointer rounded-xl border-2 border-dashed p-8 text-center transition-colors ${
                dragging ? "border-primary bg-primary/5" : "border-muted-foreground/25 hover:border-primary/50 hover:bg-muted/40"
              }`}
            >
              <input
                ref={fileInputRef}
                type="file"
                accept=".csv,.xlsx"
                className="hidden"
                onChange={(e) => { const f = e.target.files?.[0]; if (f) handleFile(f); }}
              />
              {parsing ? (
                <div className="flex flex-col items-center gap-2 text-sm text-muted-foreground">
                  <Loader2 className="h-7 w-7 animate-spin text-primary" />
                  Reading {fileName}…
                </div>
              ) : (
                <div className="flex flex-col items-center gap-2">
                  <Upload className="h-7 w-7 text-primary" />
                  <p className="text-sm font-medium">Drop your file here, or click to browse</p>
                  <p className="text-xs text-muted-foreground">Excel (.xlsx) or CSV — up to 500 rows</p>
                </div>
              )}
            </div>

            <div className="rounded-lg border bg-muted/40 p-4 text-xs space-y-2">
              <p className="font-medium text-foreground">Expected columns</p>
              {isStudents ? (
                <p>
                  <span className="font-medium">Name</span>{" "}
                  <Badge variant="secondary" className="text-[10px]">required</Badge>
                  {", "}Guardian Name, Age, Nationality{" "}
                  <Badge variant="outline" className="text-[10px]">optional</Badge>
                </p>
              ) : (
                <p>
                  <span className="font-medium">Name</span>{" "}
                  <Badge variant="secondary" className="text-[10px]">required</Badge>
                  {", "}
                  <span className="font-medium">Email</span>{" "}
                  <Badge variant="secondary" className="text-[10px]">required</Badge>
                </p>
              )}
              <p className="text-muted-foreground">
                Blank optional cells are simply left empty — nothing is saved for them.
                {isStudents
                  ? " Logins are not read from the file; you'll set them on the next screen."
                  : " Temporary passwords are generated for you on the next screen."}
              </p>
              <Button variant="outline" size="sm" className="gap-1 mt-1" onClick={downloadTemplate}>
                <Download className="h-3.5 w-3.5" /> Download template
              </Button>
            </div>
          </div>
        )}

        {/* ── Step 2: preview + credentials ──────────────────────────────── */}
        {step === "preview" && (
          <>
            <div className="flex flex-wrap items-center gap-2 text-xs">
              <Badge variant="secondary" className="gap-1">
                <FileSpreadsheet className="h-3 w-3" /> {fileName}
              </Badge>
              <Badge variant="outline">{drafts.length} row{drafts.length === 1 ? "" : "s"}</Badge>
              {!domainValid ? (
                <Badge className="bg-amber-100 text-amber-800 hover:bg-amber-100">
                  Finish the shared domain
                </Badge>
              ) : readyCount === drafts.length ? (
                <Badge className="bg-green-100 text-green-700 hover:bg-green-100">All rows ready</Badge>
              ) : (
                <Badge className="bg-amber-100 text-amber-800 hover:bg-amber-100">
                  {readyCount} of {drafts.length} ready
                </Badge>
              )}
              {seats && (
                <span className="text-muted-foreground">
                  {seats.remaining} seat{seats.remaining === 1 ? "" : "s"} left on {seats.plan_name}
                </span>
              )}
            </div>

            {!headerDetected && (
              <Alert>
                <AlertCircle className="h-4 w-4" />
                <AlertDescription className="text-xs">
                  No header row was found, so columns were read in order:{" "}
                  {isStudents ? "Name, Guardian Name, Age, Nationality" : "Name, Email"}. Check the
                  rows below before continuing.
                </AlertDescription>
              </Alert>
            )}
            {unknownColumns.length > 0 && (
              <p className="text-xs text-muted-foreground">
                Ignored column{unknownColumns.length === 1 ? "" : "s"}: {unknownColumns.join(", ")}
              </p>
            )}
            {skipped.length > 0 && (
              <p className="text-xs text-amber-700">
                Skipped {skipped.length} row{skipped.length === 1 ? "" : "s"} with no name
                (row{skipped.length === 1 ? " " : "s "}
                {skipped.map((s) => s.row).join(", ")}).
              </p>
            )}
            {overSeatLimit && seats && (
              <Alert variant="destructive">
                <AlertCircle className="h-4 w-4" />
                <AlertDescription className="text-xs">
                  This file has {drafts.length} rows but only {seats.remaining} seat
                  {seats.remaining === 1 ? "" : "s"} remain on {seats.plan_name}. Remove some rows,
                  or the extras will be skipped.
                </AlertDescription>
              </Alert>
            )}

            {/* Type the domain once; every row without an "@" picks it up. */}
            <div className="flex flex-wrap items-center gap-2 rounded-lg border bg-muted/40 px-3 py-2">
              <AtSign className="h-4 w-4 text-muted-foreground shrink-0" />
              <span className="text-xs font-medium shrink-0">Shared email domain</span>
              <Input
                value={emailDomainInput}
                onChange={(e) => setEmailDomainInput(e.target.value)}
                placeholder="@example.com"
                className={`h-8 text-sm w-52 font-mono ${
                  domainValid ? "" : "border-destructive focus-visible:ring-destructive"
                }`}
                autoComplete="off"
                spellCheck={false}
              />
              <span className="text-xs text-muted-foreground">
                {!domainValid ? (
                  <span className="text-destructive">
                    Finish the domain — it needs a dot, like{" "}
                    <code className="font-mono">@example.com</code>
                  </span>
                ) : emailDomain ? (
                  <>
                    Rows without an <code className="font-mono">@</code> become{" "}
                    <code className="font-mono text-foreground">name{emailDomain}</code>
                  </>
                ) : (
                  <>
                    Optional — set it and you can type just <code className="font-mono">maria</code>{" "}
                    instead of the full address
                  </>
                )}
              </span>
            </div>

            <div className="flex items-center justify-between gap-2">
              <div className="flex gap-2">
                {isStudents && (
                  <Button variant="outline" size="sm" className="gap-1" onClick={fillAllPasswords}>
                    <Wand2 className="h-3.5 w-3.5" /> Generate missing passwords
                  </Button>
                )}
                {!isStudents && (
                  <Button
                    variant="outline"
                    size="sm"
                    className="gap-1"
                    onClick={() => setDrafts((rows) => rows.map((r) => ({ ...r, password: generatePassword() })))}
                  >
                    <RefreshCw className="h-3.5 w-3.5" /> Regenerate all passwords
                  </Button>
                )}
              </div>
              <Button variant="ghost" size="sm" className="gap-1" onClick={() => setShowPasswords((v) => !v)}>
                {showPasswords ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
                {showPasswords ? "Hide" : "Show"} passwords
              </Button>
            </div>

            <div className="flex-1 overflow-auto rounded-lg border">
              <Table>
                <TableHeader className="sticky top-0 bg-background z-10">
                  <TableRow>
                    <TableHead className="w-12 text-xs">Row</TableHead>
                    <TableHead className="text-xs min-w-[150px]">Name</TableHead>
                    {isStudents && <TableHead className="text-xs min-w-[130px]">Guardian</TableHead>}
                    {isStudents && <TableHead className="text-xs w-16">Age</TableHead>}
                    {isStudents && <TableHead className="text-xs min-w-[110px]">Nationality</TableHead>}
                    <TableHead className="text-xs min-w-[200px]">
                      Email / Username <span className="text-destructive">*</span>
                    </TableHead>
                    <TableHead className="text-xs min-w-[170px]">
                      Password <span className="text-destructive">*</span>
                    </TableHead>
                    <TableHead className="w-10" />
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {drafts.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={isStudents ? 8 : 5} className="text-center text-muted-foreground py-8 text-sm">
                        No rows left. Go back and upload a different file.
                      </TableCell>
                    </TableRow>
                  ) : (
                    drafts.map((r) => {
                      const rowError = rowErrors.get(r.key);
                      return (
                        <TableRow key={r.key} className={rowError ? "bg-red-50/60" : undefined}>
                          <TableCell className="text-xs text-muted-foreground font-mono">{r.row}</TableCell>
                          <TableCell>
                            <Input
                              value={r.name}
                              onChange={(e) => updateDraft(r.key, { name: e.target.value })}
                              className="h-8 text-sm"
                            />
                          </TableCell>
                          {isStudents && (
                            <TableCell>
                              <Input
                                value={r.guardian_name}
                                onChange={(e) => updateDraft(r.key, { guardian_name: e.target.value })}
                                placeholder="—"
                                className="h-8 text-sm"
                              />
                            </TableCell>
                          )}
                          {isStudents && (
                            <TableCell>
                              <Input
                                value={r.age ?? ""}
                                onChange={(e) => {
                                  const v = e.target.value.trim();
                                  const n = parseInt(v, 10);
                                  updateDraft(r.key, { age: v === "" || !Number.isFinite(n) ? null : n });
                                }}
                                placeholder="—"
                                className="h-8 text-sm w-14"
                              />
                            </TableCell>
                          )}
                          {isStudents && (
                            <TableCell>
                              <Input
                                value={r.nationality}
                                onChange={(e) => updateDraft(r.key, { nationality: e.target.value })}
                                placeholder="—"
                                className="h-8 text-sm"
                              />
                            </TableCell>
                          )}
                          <TableCell>
                            <Input
                              value={r.email}
                              onChange={(e) => updateDraft(r.key, { email: e.target.value, problem: null })}
                              placeholder={emailDomain ? "maria" : "name@example.com"}
                              className="h-8 text-sm"
                              autoComplete="off"
                              spellCheck={false}
                            />
                            {/* Show the address this row will actually get, but
                                only when the domain is doing the work. */}
                            {emailDomain && r.email.trim() && !r.email.includes("@") && (
                              <p className="text-[11px] text-muted-foreground mt-1 font-mono truncate">
                                {resolveEmail(r.email)}
                              </p>
                            )}
                          </TableCell>
                          <TableCell>
                            <div className="flex items-center gap-1">
                              <Input
                                value={r.password}
                                type={showPasswords ? "text" : "password"}
                                onChange={(e) => updateDraft(r.key, { password: e.target.value })}
                                placeholder="any password"
                                className="h-8 text-sm font-mono"
                                autoComplete="new-password"
                              />
                              <Button
                                variant="ghost"
                                size="icon"
                                className="h-8 w-8 shrink-0"
                                title="Generate a password"
                                onClick={() => updateDraft(r.key, { password: generatePassword() })}
                              >
                                <RefreshCw className="h-3.5 w-3.5" />
                              </Button>
                            </div>
                            {rowError && <p className="text-[11px] text-destructive mt-1">{rowError}</p>}
                          </TableCell>
                          <TableCell>
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-8 w-8 text-muted-foreground hover:text-destructive"
                              title="Remove this row"
                              onClick={() => removeDraft(r.key)}
                            >
                              <Trash2 className="h-3.5 w-3.5" />
                            </Button>
                          </TableCell>
                        </TableRow>
                      );
                    })
                  )}
                </TableBody>
              </Table>
            </div>
          </>
        )}

        {/* ── Step 3: results + credentials to send ──────────────────────── */}
        {step === "done" && result && (
          <div className="flex-1 overflow-auto space-y-4">
            <div className="flex items-center gap-6">
              <div className="flex items-center gap-2">
                <CheckCircle2 className="h-5 w-5 text-green-600" />
                <div>
                  <p className="text-xl font-bold text-green-600">{result.imported}</p>
                  <p className="text-xs text-muted-foreground">Created</p>
                </div>
              </div>
              {result.skipped > 0 && (
                <div className="flex items-center gap-2">
                  <AlertCircle className="h-5 w-5 text-amber-600" />
                  <div>
                    <p className="text-xl font-bold text-amber-600">{result.skipped}</p>
                    <p className="text-xs text-muted-foreground">Skipped</p>
                  </div>
                </div>
              )}
            </div>

            {result.created.length > 0 && (
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <p className="text-sm font-medium">Login credentials</p>
                  <Button size="sm" variant="secondary" className="gap-1" onClick={() => copy("all", allCredentialsText)}>
                    {copiedKey === "all" ? (
                      <><Check className="h-3.5 w-3.5 text-green-600" /> Copied all</>
                    ) : (
                      <><Copy className="h-3.5 w-3.5" /> Copy all</>
                    )}
                  </Button>
                </div>
                <p className="text-xs text-muted-foreground">
                  {isStudents
                    ? "Send each student their email and password."
                    : "An invite email was sent to each teacher. Copy the details here too, in case the email doesn't arrive."}
                </p>
                <div className="rounded-lg border divide-y">
                  {result.created.map((a) => (
                    <div key={a.id} className="flex items-center justify-between gap-3 p-3">
                      <div className="min-w-0">
                        <p className="text-sm font-medium truncate">{a.name}</p>
                        <p className="text-xs text-muted-foreground truncate">{a.email}</p>
                      </div>
                      <div className="flex items-center gap-2 shrink-0">
                        <code className="text-xs bg-muted px-2 py-1 rounded font-mono">{a.password}</code>
                        <Button
                          size="sm"
                          variant="outline"
                          className="gap-1"
                          onClick={() => copy(String(a.id), credentialText(type, a))}
                        >
                          {copiedKey === String(a.id) ? (
                            <><Check className="h-3.5 w-3.5 text-green-600" /> Copied</>
                          ) : (
                            <><Copy className="h-3.5 w-3.5" /> Copy</>
                          )}
                        </Button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {result.failed.length > 0 && (
              <div className="space-y-2">
                <p className="text-sm font-medium">Not created</p>
                <div className="rounded-lg border overflow-hidden">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead className="w-14 text-xs">Row</TableHead>
                        <TableHead className="text-xs">Name</TableHead>
                        <TableHead className="text-xs">Email</TableHead>
                        <TableHead className="text-xs">Reason</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {result.failed.map((f, i) => (
                        <TableRow key={i}>
                          <TableCell className="font-mono text-xs">{f.row ?? "—"}</TableCell>
                          <TableCell className="text-sm">{f.name || "—"}</TableCell>
                          <TableCell className="text-sm">{f.email || "—"}</TableCell>
                          <TableCell className="text-sm text-destructive">{f.reason}</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              </div>
            )}
          </div>
        )}

        <DialogFooter className="mt-2 shrink-0">
          {step === "preview" && (
            <>
              <Button variant="outline" className="gap-1 mr-auto" onClick={reset} disabled={creating}>
                <ArrowLeft className="h-4 w-4" /> Choose another file
              </Button>
              <Button variant="outline" onClick={() => handleClose(false)} disabled={creating}>
                Cancel
              </Button>
              <Button
                onClick={handleCreate}
                disabled={creating || drafts.length === 0 || rowErrors.size > 0 || !domainValid}
                title={
                  !domainValid
                    ? "Finish the shared email domain first"
                    : rowErrors.size > 0
                      ? "Fix the highlighted rows first"
                      : undefined
                }
              >
                {creating ? (
                  <><Loader2 className="h-4 w-4 mr-2 animate-spin" /> Creating…</>
                ) : (
                  `Create ${drafts.length} ${drafts.length === 1 ? singular : type}`
                )}
              </Button>
            </>
          )}
          {step === "upload" && (
            <Button variant="outline" onClick={() => handleClose(false)}>Cancel</Button>
          )}
          {step === "done" && (
            <>
              <Button variant="outline" className="mr-auto" onClick={reset}>
                Import another file
              </Button>
              <Button onClick={() => handleClose(false)}>Done</Button>
            </>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

export default BulkImportDialog;
