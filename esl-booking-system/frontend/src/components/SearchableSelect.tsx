import { useEffect, useMemo, useRef, useState } from "react";
import { Check, ChevronDown, Search } from "lucide-react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";

export interface SearchableOption {
  value: string;
  label: string;
}

interface SearchableSelectProps {
  options: SearchableOption[];
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  searchPlaceholder?: string;
  emptyText?: string;
  disabled?: boolean;
  "aria-label"?: string;
}

// A select with a search box, for long lists like students. The list floats in
// a popover layer, so a Dialog's own scrolling doesn't crop it.
const SearchableSelect: React.FC<SearchableSelectProps> = ({
  options, value, onChange, placeholder = "Select…", searchPlaceholder = "Search…",
  emptyText = "No matches", disabled, "aria-label": ariaLabel,
}) => {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [active, setActive] = useState(0);
  const [listEl, setListEl] = useState<HTMLUListElement | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const selected = options.find((o) => o.value === value);
  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return q ? options.filter((o) => o.label.toLowerCase().includes(q)) : options;
  }, [options, query]);

  // An open Dialog blocks wheel and touch scrolling outside itself, which would
  // include this list (it lives outside the Dialog in the page). Stopping those
  // events at the list lets it scroll.
  useEffect(() => {
    if (!listEl) return;
    const stop = (e: Event) => e.stopPropagation();
    listEl.addEventListener("wheel", stop);
    listEl.addEventListener("touchmove", stop);
    return () => {
      listEl.removeEventListener("wheel", stop);
      listEl.removeEventListener("touchmove", stop);
    };
  }, [listEl]);

  // Keep the highlighted row in view while arrowing through the list.
  useEffect(() => {
    listEl?.querySelector<HTMLElement>(`[data-index="${active}"]`)?.scrollIntoView({ block: "nearest" });
  }, [active, listEl]);

  const handleOpenChange = (next: boolean) => {
    if (next) {
      setQuery("");
      setActive(Math.max(0, options.findIndex((o) => o.value === value)));
    }
    setOpen(next);
  };

  const pick = (o: SearchableOption) => {
    onChange(o.value);
    setOpen(false);
  };

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setActive((i) => Math.min(filtered.length - 1, i + 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActive((i) => Math.max(0, i - 1));
    } else if (e.key === "Enter") {
      e.preventDefault();
      if (filtered[active]) pick(filtered[active]);
    }
    // Escape is handled by the popover: it closes the list, not the Dialog.
  };

  return (
    <Popover open={open} onOpenChange={handleOpenChange}>
      <PopoverTrigger asChild>
        <button
          type="button"
          aria-label={ariaLabel}
          aria-haspopup="listbox"
          aria-expanded={open}
          disabled={disabled}
          className="flex h-9 w-full items-center justify-between gap-2 rounded-md border bg-transparent px-3 text-sm shadow-xs disabled:opacity-50 disabled:cursor-not-allowed focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50"
        >
          <span className={`truncate ${selected ? "" : "text-muted-foreground"}`}>{selected?.label ?? placeholder}</span>
          <ChevronDown className="h-4 w-4 shrink-0 opacity-50" />
        </button>
      </PopoverTrigger>
      <PopoverContent
        align="start"
        className="w-[var(--radix-popover-trigger-width)] min-w-56 p-0"
        onOpenAutoFocus={(e) => { e.preventDefault(); inputRef.current?.focus(); }}
      >
        <div className="flex items-center gap-2 border-b px-2">
          <Search className="h-4 w-4 shrink-0 text-muted-foreground" />
          <input
            ref={inputRef}
            value={query}
            onChange={(e) => { setQuery(e.target.value); setActive(0); }}
            onKeyDown={onKeyDown}
            placeholder={searchPlaceholder}
            aria-label={searchPlaceholder}
            className="h-9 w-full bg-transparent text-sm outline-none placeholder:text-muted-foreground"
          />
        </div>
        <ul ref={setListEl} role="listbox" className="max-h-60 overflow-y-auto overscroll-contain py-1">
          {filtered.length === 0 && <li className="px-3 py-2 text-sm text-muted-foreground">{emptyText}</li>}
          {filtered.map((o, i) => (
            <li
              key={o.value}
              data-index={i}
              role="option"
              aria-selected={o.value === value}
              onPointerEnter={() => setActive(i)}
              onClick={() => pick(o)}
              className={`flex cursor-pointer items-center justify-between gap-2 px-3 py-1.5 text-sm ${i === active ? "bg-accent text-accent-foreground" : ""}`}
            >
              <span className="truncate">{o.label}</span>
              {o.value === value && <Check className="h-4 w-4 shrink-0 text-primary" />}
            </li>
          ))}
        </ul>
      </PopoverContent>
    </Popover>
  );
};

export default SearchableSelect;
