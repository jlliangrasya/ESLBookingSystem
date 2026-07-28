import { useState } from "react";
import axios from "axios";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Eye, EyeOff, Link2, Plus, Repeat, Unlink } from "lucide-react";
import { useLinkedAccounts, roleLabel, notifyLinkedAccountsChanged } from "@/hooks/useLinkedAccounts";

/**
 * Profile-page section for linking a second account you own — e.g. an admin
 * who also teaches links their teacher account here once, then switches
 * between the two from the profile menu in the navbar.
 */
const LinkedAccountsCard: React.FC = () => {
  const { accounts, switchTo, switching, canLink } = useLinkedAccounts();
  const [showForm, setShowForm] = useState(false);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const base = import.meta.env.VITE_API_URL;
  const headers = { Authorization: `Bearer ${localStorage.getItem("token")}` };

  if (!canLink) return null;

  const handleLink = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setMsg(null);
    setError(null);
    try {
      await axios.post(`${base}/api/auth/link-account`, { email, password }, { headers });
      setMsg("Account linked. You can now switch to it from the profile menu.");
      setEmail("");
      setPassword("");
      setShowForm(false);
      notifyLinkedAccountsChanged(); // refreshes this card *and* the navbar switcher
    } catch (err: unknown) {
      const m =
        (err as { response?: { data?: { message?: string } } })?.response?.data?.message ||
        "Could not link that account";
      setError(m);
    } finally {
      setSaving(false);
    }
  };

  const handleUnlink = async (id: number, name: string) => {
    if (!window.confirm(`Unlink ${name}? You'll need the password again to re-link it.`)) return;
    setMsg(null);
    setError(null);
    try {
      await axios.delete(`${base}/api/auth/linked-accounts/${id}`, { headers });
      setMsg("Account unlinked.");
      notifyLinkedAccountsChanged();
    } catch {
      setError("Could not unlink that account");
    }
  };

  return (
    <Card className="glow-card border-0 rounded-2xl">
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-lg">
          <Link2 className="h-5 w-5 text-primary" />
          Linked Accounts
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <p className="text-sm text-muted-foreground">
          If you have another account here — for example you're an admin who also teaches —
          link it once and you can switch between them without logging out.
        </p>

        {msg && <p className="text-sm text-green-600 font-medium">{msg}</p>}
        {error && <p className="text-sm text-destructive">{error}</p>}

        {accounts.length > 0 && (
          <ul className="space-y-2">
            {accounts.map((acct) => (
              <li
                key={acct.id}
                className="flex items-center justify-between gap-3 rounded-lg border p-3"
              >
                <div className="min-w-0">
                  <p className="text-sm font-medium truncate">
                    {acct.name}{" "}
                    <span className="text-xs font-normal text-muted-foreground">
                      ({roleLabel(acct.role)})
                    </span>
                  </p>
                  <p className="text-xs text-muted-foreground truncate">{acct.email}</p>
                </div>
                <div className="flex items-center gap-1 shrink-0">
                  <Button
                    variant="outline"
                    size="sm"
                    className="gap-1.5"
                    disabled={switching}
                    onClick={() => switchTo(acct)}
                  >
                    <Repeat className="h-3.5 w-3.5" />
                    {switching ? "Switching..." : "Switch"}
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="text-muted-foreground hover:text-destructive"
                    title="Unlink"
                    onClick={() => handleUnlink(acct.id, acct.name)}
                  >
                    <Unlink className="h-4 w-4" />
                  </Button>
                </div>
              </li>
            ))}
          </ul>
        )}

        {showForm ? (
          <form onSubmit={handleLink} className="space-y-3 rounded-lg border p-3">
            <p className="text-sm font-medium">Link another account</p>
            <div className="space-y-1.5">
              <Label htmlFor="link-email">Email of the other account</Label>
              <Input
                id="link-email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                autoComplete="off"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="link-password">Password of that account</Label>
              <div className="relative">
                <Input
                  id="link-password"
                  type={showPassword ? "text" : "password"}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                  autoComplete="off"
                  className="pr-10"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword((v) => !v)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                  tabIndex={-1}
                >
                  {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              </div>
              <p className="text-xs text-muted-foreground">
                Asked once, to confirm the account is yours. You won't need it again to switch.
              </p>
            </div>
            <div className="flex gap-2">
              <Button type="submit" size="sm" disabled={saving}>
                {saving ? "Linking..." : "Link account"}
              </Button>
              <Button
                type="button"
                size="sm"
                variant="ghost"
                onClick={() => {
                  setShowForm(false);
                  setError(null);
                }}
              >
                Cancel
              </Button>
            </div>
          </form>
        ) : (
          <Button variant="outline" size="sm" className="gap-2" onClick={() => setShowForm(true)}>
            <Plus className="h-4 w-4" />
            Link another account
          </Button>
        )}
      </CardContent>
    </Card>
  );
};

export default LinkedAccountsCard;
