import { useState } from "react";
import { ChevronDown, ChevronRight } from "lucide-react";
import { cn } from "@/lib/utils";
import {
  PERMISSION_GROUPS,
  pageAccessLevel,
  sanitizePermissions,
  viewKey,
  type PageAccessLevel,
  type PermissionGroup,
} from "@/lib/permissions";

interface PermissionEditorProps {
  value: string[];
  onChange: (next: string[]) => void;
  // Keys the editing admin may grant or revoke. Omit for the owner (everything).
  grantable?: string[];
}

const LEVELS: { level: Exclude<PageAccessLevel, "custom">; label: string }[] = [
  { level: "none", label: "No access" },
  { level: "view", label: "View only" },
  { level: "full", label: "Full access" },
];

const PermissionEditor: React.FC<PermissionEditorProps> = ({ value, onChange, grantable }) => {
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});
  const canGrant = (key: string) => !grantable || grantable.includes(key);

  // Apply a change to one page's keys, never touching keys the editor can't grant
  const setPageKeys = (group: PermissionGroup, wanted: string[]) => {
    const pageKeys = group.permissions.map((p) => p.key);
    const next = value.filter((k) => !pageKeys.includes(k) || !canGrant(k));
    for (const k of wanted) if (canGrant(k) && !next.includes(k)) next.push(k);
    onChange(sanitizePermissions(next));
  };

  const setLevel = (group: PermissionGroup, level: PageAccessLevel) => {
    if (level === "none") setPageKeys(group, []);
    else if (level === "view") setPageKeys(group, [viewKey(group.page)]);
    else if (level === "full") setPageKeys(group, group.permissions.map((p) => p.key));
  };

  const toggle = (group: PermissionGroup, key: string, checked: boolean) => {
    const current = value.filter((k) => group.permissions.some((p) => p.key === k));
    let wanted = checked ? [...current, key] : current.filter((k) => k !== key);
    // Any action implies being able to open the page
    if (checked && key !== viewKey(group.page)) wanted.push(viewKey(group.page));
    // Unticking view removes the page entirely
    if (!checked && key === viewKey(group.page)) wanted = [];
    setPageKeys(group, wanted);
  };

  return (
    <div className="space-y-2">
      {PERMISSION_GROUPS.map((group) => {
        const level = pageAccessLevel(group, value);
        const open = expanded[group.page] ?? level === "custom";
        const actionCount = group.permissions.filter((p) => value.includes(p.key)).length;
        return (
          <div key={group.page} className="border rounded-lg">
            <div className="flex flex-wrap items-center justify-between gap-2 p-2.5">
              <button
                type="button"
                onClick={() => setExpanded({ ...expanded, [group.page]: !open })}
                className="flex items-center gap-1.5 text-sm font-medium"
              >
                {open ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
                {group.label}
                {level === "custom" && (
                  <span className="text-xs font-normal text-muted-foreground">
                    ({actionCount}/{group.permissions.length})
                  </span>
                )}
              </button>
              <div className="flex rounded-md border overflow-hidden text-xs">
                {LEVELS.map(({ level: l, label }) => (
                  <button
                    key={l}
                    type="button"
                    onClick={() => setLevel(group, l)}
                    className={cn(
                      "px-2 py-1 transition-colors border-l first:border-l-0",
                      level === l ? "bg-primary text-white" : "hover:bg-muted",
                    )}
                  >
                    {label}
                  </button>
                ))}
              </div>
            </div>
            {open && (
              <div className="border-t px-3 py-2 grid gap-1.5 sm:grid-cols-2">
                {group.permissions.map((perm) => {
                  const isView = perm.key === viewKey(group.page);
                  const disabled = !canGrant(perm.key);
                  return (
                    <label
                      key={perm.key}
                      className={cn(
                        "flex items-start gap-2 text-sm",
                        disabled ? "opacity-50 cursor-not-allowed" : "cursor-pointer",
                      )}
                      title={disabled ? "You can only grant permissions you have yourself" : perm.description}
                    >
                      <input
                        type="checkbox"
                        className="accent-primary mt-0.5"
                        checked={value.includes(perm.key)}
                        disabled={disabled}
                        onChange={(e) => toggle(group, perm.key, e.target.checked)}
                      />
                      <span>
                        <span className={cn(isView && "font-medium")}>{perm.label}</span>
                        {perm.description && (
                          <span className="block text-xs text-muted-foreground">{perm.description}</span>
                        )}
                      </span>
                    </label>
                  );
                })}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
};

export default PermissionEditor;
