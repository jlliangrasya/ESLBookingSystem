import { useMemo, useState } from "react";
import { Search, ChevronsUpDown } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";

export interface StudentPickerItem {
  id: string;
  name: string;
  durationMinutes?: number | null;
  sessionsRemaining?: number;
  note?: string;
}

interface StudentPackagePickerProps {
  items: StudentPickerItem[];
  value: string;
  onChange: (id: string) => void;
  placeholder?: string;
  emptyMessage?: string;
  noMatchMessage?: string;
  /** Duration values (e.g. ["25", "50"]) to offer as quick filter pills. Omit to hide the filter row. */
  durationOptions?: string[];
  disabled?: boolean;
}

/** Searchable, filterable combobox for picking a student (optionally with package duration/sessions info). */
export function StudentPackagePicker({
  items,
  value,
  onChange,
  placeholder = "Select a student…",
  emptyMessage = "No students available.",
  noMatchMessage = "No matching students.",
  durationOptions,
  disabled,
}: StudentPackagePickerProps) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const [durationFilter, setDurationFilter] = useState("all");

  const showDurationFilter = !!durationOptions && durationOptions.length > 0;

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return items.filter(it => {
      if (q && !it.name.toLowerCase().includes(q)) return false;
      if (showDurationFilter && durationFilter !== "all" && String(it.durationMinutes ?? "") !== durationFilter) return false;
      return true;
    });
  }, [items, search, durationFilter, showDurationFilter]);

  const selected = items.find(it => it.id === value) ?? null;

  return (
    <Popover
      open={open}
      onOpenChange={o => {
        setOpen(o);
        if (!o) { setSearch(""); setDurationFilter("all"); }
      }}
    >
      <PopoverTrigger asChild>
        <Button
          type="button"
          variant="outline"
          role="combobox"
          aria-expanded={open}
          disabled={disabled}
          className="w-full justify-between font-normal"
        >
          <span className={`truncate ${!selected ? "text-muted-foreground" : ""}`}>
            {selected ? selected.name : placeholder}
          </span>
          <ChevronsUpDown className="h-4 w-4 shrink-0 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-[var(--radix-popover-trigger-width)]" align="start">
        <div className="p-2 border-b space-y-2">
          <div className="relative">
            <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
            <Input
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="Search students…"
              className="h-8 pl-7 text-sm"
              autoFocus
            />
          </div>
          {showDurationFilter && (
            <div className="flex gap-1">
              {["all", ...durationOptions!].map(d => (
                <button
                  key={d}
                  type="button"
                  onClick={() => setDurationFilter(d)}
                  className={`px-2 py-0.5 rounded-full text-xs border transition-colors ${
                    durationFilter === d
                      ? "bg-primary text-primary-foreground border-primary"
                      : "bg-transparent text-muted-foreground border-input hover:bg-accent"
                  }`}
                >
                  {d === "all" ? "All" : `${d} min`}
                </button>
              ))}
            </div>
          )}
        </div>
        <div className="max-h-64 overflow-y-auto p-1">
          {items.length === 0 ? (
            <div className="px-3 py-4 text-sm text-muted-foreground text-center">{emptyMessage}</div>
          ) : filtered.length === 0 ? (
            <div className="px-3 py-4 text-sm text-muted-foreground text-center">{noMatchMessage}</div>
          ) : filtered.map(it => (
            <button
              key={it.id}
              type="button"
              onClick={() => { onChange(it.id); setOpen(false); }}
              className={`w-full flex items-center justify-between gap-2 rounded-sm px-2 py-1.5 text-sm text-left hover:bg-accent transition-colors ${
                it.id === value ? "bg-accent" : ""
              }`}
            >
              <div className="min-w-0">
                <div className="truncate font-medium">{it.name}</div>
                {it.note && <div className="text-[10px] text-amber-600 truncate">{it.note}</div>}
              </div>
              {(it.durationMinutes != null || it.sessionsRemaining != null) && (
                <div className="flex items-center gap-1.5 shrink-0">
                  {it.durationMinutes != null && (
                    <span className="text-xs text-muted-foreground">{it.durationMinutes} min</span>
                  )}
                  {it.sessionsRemaining != null && (
                    <Badge
                      variant="secondary"
                      className="h-5 min-w-5 rounded-full px-1 justify-center tabular-nums"
                      title={`${it.sessionsRemaining} session${it.sessionsRemaining === 1 ? "" : "s"} left`}
                    >
                      {it.sessionsRemaining}
                    </Badge>
                  )}
                </div>
              )}
            </button>
          ))}
        </div>
      </PopoverContent>
    </Popover>
  );
}
