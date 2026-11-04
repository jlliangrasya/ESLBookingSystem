import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import axios from "axios";
import { AlertTriangle, CalendarPlus, Check, CopyPlus, Download, Loader2, Trash2, X } from "lucide-react";
import { DAYS_OF_WEEK, summarizeRegularSlots, type TeacherRegularSlot } from "@/utils/regularSlots";
import { downloadRegularScheduleImage, type RegularImageCell } from "@/utils/regularScheduleImage";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Alert, AlertDescription } from "@/components/ui/alert";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

// One student's agreed weekly slot with this teacher, plus the package that
// "Apply to Actual" would book it from.
interface RegularSlot {
  id: number;
  student_id: number;
  student_name: string;
  day_of_week: string;
  start_time: string; // "HH:MM"
  student_package_id: number | null;
  sessions_remaining: number;
  duration_minutes: number | null;
}

type StudentResult = {
  student_id: number;
  student_name: string;
  sessions_booked: number;
  sessions_remaining?: number;
  error?: string;
  groups?: { label: string; sessions_booked: number; skipped_dates: { date: string; reason: string }[] }[];
};

const fmt12 = (t: string) => {
  const [h, m] = t.split(":").map(Number);
  return `${h % 12 || 12}:${String(m).padStart(2, "0")} ${h < 12 ? "AM" : "PM"}`;
};
const toMinutes = (t: string) => {
  const [h, m] = t.split(":").map(Number);
  return h * 60 + m;
};

// Drag-selection, tuned like the Actual view's grid.
/** How far the pointer must travel before a press counts as a drag rather than a click. */
const DRAG_THRESHOLD_PX = 8;
/** Touch has no drag-to-select, so a hold starts one. */
const LONG_PRESS_MS = 500;
/** Finger travel before a hold is written off as the start of a scroll. */
const TOUCH_SCROLL_CANCEL_PX = 10;
/** A drag this close to the scroll box's top or bottom edge scrolls the grid. */
const AUTOSCROLL_EDGE_PX = 32;
const AUTOSCROLL_MAX_STEP_PX = 14;

/** A grid cell: d = DAYS_OF_WEEK index, t = slotTimes index. */
type CellPos = { d: number; t: number };

/**
 * The grid cell under a viewport point. Touch gives every pointermove to the cell
 * the press started on, so a dragged finger has to be located by hit-testing.
 */
const cellFromPoint = (x: number, y: number): CellPos | null => {
  const el = document.elementFromPoint(x, y);
  const cell = el instanceof Element ? el.closest("[data-regular-cell]") : null;
  if (!(cell instanceof HTMLElement)) return null;
  const [d, t] = (cell.dataset.regularCell ?? "").split(":").map(Number);
  return Number.isInteger(d) && Number.isInteger(t) ? { d, t } : null;
};

interface TeacherRegularScheduleProps {
  teacher: { id: number; name: string };
  // The calendar's own row times and student colors, so both views line up.
  slotTimes: string[];
  palette: string[];
  canApply: boolean;
  // Add/remove students' regular slots by clicking the grid
  canEdit: boolean;
  // Set the teacher's regular open/closed hours
  canEditHours: boolean;
  // The Actual week on screen ("yyyy-MM-dd" Monday), which "Copy from Actual" copies
  weekLabel: string;
  weekStart: string;
  // Called after classes are booked, so the Actual view can refresh.
  onApplied: () => void;
}

type EditMode = "students" | "hours";

// The calendar's "Regular Schedule" view: the teacher's regular open/closed
// hours plus every student's agreed weekly slots with them, as a Mon–Sun
// template. Open slots with no student are the teacher's regular vacancies.
// All of it is a record; only "Apply to Actual" books classes and deducts sessions.
const TeacherRegularSchedule: React.FC<TeacherRegularScheduleProps> = ({
  teacher, slotTimes, palette, canApply, canEdit, canEditHours, weekLabel, weekStart, onApplied,
}) => {
  const [slots, setSlots] = useState<RegularSlot[]>([]);
  const [openSet, setOpenSet] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(true);
  const [showApply, setShowApply] = useState(false);
  const [showCopy, setShowCopy] = useState(false);
  // The grid cell being edited
  const [editCell, setEditCell] = useState<{ day: string; time: string } | null>(null);
  const [mode, setMode] = useState<EditMode>(canEdit ? "students" : "hours");
  const [hoursSaving, setHoursSaving] = useState(false);
  const [hoursError, setHoursError] = useState<string | null>(null);
  const [downloading, setDownloading] = useState(false);

  // Drag-selection, for opening or closing a range of regular hours at once: the
  // rectangle between the cell the drag started on (anchor) and the one under the
  // pointer (focus). Works in both modes; a plain click still does the mode's thing.
  const [selAnchor, setSelAnchor] = useState<CellPos | null>(null);
  const [selFocus, setSelFocus] = useState<CellPos | null>(null);
  const [isSelecting, setIsSelecting] = useState(false);
  // Where the press went down; a ref so an ordinary click re-renders nothing.
  const pressRef = useRef<{ d: number; t: number; x: number; y: number; touch: boolean } | null>(null);
  const longPressTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  // True once a press has travelled far enough to count as a drag.
  const dragMovedRef = useRef(false);
  // Mirrors isSelecting for the non-passive touchmove listener.
  const isSelectingRef = useRef(false);
  // True while a finished drag's highlight is standing, waiting for Mark open/closed.
  const selectionCommittedRef = useRef(false);
  // Set when a release ends a drag, so the click that follows doesn't also act on a cell.
  const suppressClickRef = useRef(false);
  const lastPointerRef = useRef<{ x: number; y: number } | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const tableRef = useRef<HTMLTableElement>(null);

  const token = localStorage.getItem("token");
  const base = import.meta.env.VITE_API_URL;

  const fetchSlots = useCallback(async () => {
    setLoading(true);
    const headers = { Authorization: `Bearer ${token}` };
    try {
      const [schedRes, hoursRes] = await Promise.all([
        axios.get(`${base}/api/admin/teachers/${teacher.id}/regular-schedule`, { headers }),
        axios.get(`${base}/api/admin/teachers/${teacher.id}/regular-slots`, { headers }),
      ]);
      setSlots(Array.isArray(schedRes.data) ? schedRes.data : []);
      const hours: TeacherRegularSlot[] = Array.isArray(hoursRes.data) ? hoursRes.data : [];
      setOpenSet(new Set(hours.map((h) => `${h.day_of_week}|${h.slot_time}`)));
    } catch {
      setSlots([]);
      setOpenSet(new Set());
    } finally {
      setLoading(false);
    }
  }, [base, token, teacher.id]);

  useEffect(() => { fetchSlots(); }, [fetchSlots]);

  const saveHours = useCallback(async (next: Set<string>, before: Set<string>) => {
    setHoursSaving(true);
    setHoursError(null);
    try {
      await axios.put(
        `${base}/api/admin/teachers/${teacher.id}/regular-slots`,
        { slots: [...next].map((k) => { const [day_of_week, slot_time] = k.split("|"); return { day_of_week, slot_time }; }) },
        { headers: { Authorization: `Bearer ${token}` } },
      );
    } catch (err: unknown) {
      setOpenSet(before);
      setHoursError(axios.isAxiosError(err) && err.response ? err.response.data?.message || "Failed to save regular hours" : "Failed to save regular hours");
    } finally {
      setHoursSaving(false);
    }
  }, [base, token, teacher.id]);

  const selectedKeys = useMemo(() => {
    const keys = new Set<string>();
    if (!selAnchor || !selFocus) return keys;
    for (let d = Math.min(selAnchor.d, selFocus.d); d <= Math.max(selAnchor.d, selFocus.d); d++) {
      for (let t = Math.min(selAnchor.t, selFocus.t); t <= Math.max(selAnchor.t, selFocus.t); t++) {
        keys.add(`${DAYS_OF_WEEK[d]}|${slotTimes[t]}`);
      }
    }
    return keys;
  }, [selAnchor, selFocus, slotTimes]);
  const selectionSize = selectedKeys.size;

  const clearSelection = useCallback(() => {
    selectionCommittedRef.current = false;
    isSelectingRef.current = false;
    setSelAnchor(null);
    setSelFocus(null);
    setIsSelecting(false);
  }, []);

  // Another teacher's grid must not inherit the highlight.
  useEffect(() => { clearSelection(); }, [teacher.id, clearSelection]);

  // A gesture ends wherever the pointer is released, often outside the grid, so the
  // release is caught on the window. Only a drag over more than one cell leaves a
  // highlight standing for the action bar.
  useEffect(() => {
    const finish = (cancelled: boolean) => {
      pressRef.current = null;
      if (longPressTimerRef.current) clearTimeout(longPressTimerRef.current);
      longPressTimerRef.current = null;
      if (!isSelecting) return;
      isSelectingRef.current = false;
      setIsSelecting(false);
      suppressClickRef.current = true;
      if (!cancelled && dragMovedRef.current && selectionSize > 1) {
        selectionCommittedRef.current = true;
        return;
      }
      selectionCommittedRef.current = false;
      setSelAnchor(null);
      setSelFocus(null);
    };
    const onUp = () => finish(false);
    const onCancel = () => finish(true);
    window.addEventListener("pointerup", onUp);
    window.addEventListener("pointercancel", onCancel);
    return () => {
      window.removeEventListener("pointerup", onUp);
      window.removeEventListener("pointercancel", onCancel);
    };
  }, [isSelecting, selectionSize]);

  // Once a hold has started a highlight, finger movement must extend it rather than
  // scroll the grid; only a non-passive listener can cancel the scroll.
  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    const onTouchMove = (e: TouchEvent) => { if (isSelectingRef.current) e.preventDefault(); };
    el.addEventListener("touchmove", onTouchMove, { passive: false });
    return () => el.removeEventListener("touchmove", onTouchMove);
    // The grid isn't mounted while loading, so re-attach once it is.
  }, [loading]);

  // Escape drops a standing highlight.
  useEffect(() => {
    if (!selAnchor || isSelecting) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") clearSelection(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [selAnchor, isSelecting, clearSelection]);

  // Holding the pointer near the scroll box's top or bottom edge while dragging
  // scrolls the grid, so a range can reach rows that are out of view.
  useEffect(() => {
    if (!isSelecting) return;
    const onMove = (e: PointerEvent) => { lastPointerRef.current = { x: e.clientX, y: e.clientY }; };
    window.addEventListener("pointermove", onMove);
    let frame = 0;
    const tick = () => {
      const el = scrollRef.current;
      const p = lastPointerRef.current;
      if (el && p) {
        const rect = el.getBoundingClientRect();
        const top = rect.top + (tableRef.current?.tHead?.getBoundingClientRect().height ?? 0);
        let step = 0;
        if (p.y < top + AUTOSCROLL_EDGE_PX) step = -Math.min(AUTOSCROLL_MAX_STEP_PX, top + AUTOSCROLL_EDGE_PX - p.y);
        else if (p.y > rect.bottom - AUTOSCROLL_EDGE_PX) step = Math.min(AUTOSCROLL_MAX_STEP_PX, p.y - (rect.bottom - AUTOSCROLL_EDGE_PX));
        if (step !== 0) {
          const before = el.scrollTop;
          el.scrollTop += step;
          if (el.scrollTop !== before) {
            // The rows slid under a still pointer, so find the cell now under it.
            const cell = cellFromPoint(p.x, Math.min(Math.max(p.y, top + 2), rect.bottom - 2));
            if (cell) {
              dragMovedRef.current = true;
              setSelFocus((prev) => (prev && prev.d === cell.d && prev.t === cell.t ? prev : cell));
            }
          }
        }
      }
      frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => {
      window.removeEventListener("pointermove", onMove);
      cancelAnimationFrame(frame);
      lastPointerRef.current = null;
    };
  }, [isSelecting]);

  /** Open a one-cell highlight where the finger is being held. */
  const beginTouchSelection = () => {
    longPressTimerRef.current = null;
    const press = pressRef.current;
    if (!press) return;
    dragMovedRef.current = false;
    selectionCommittedRef.current = false;
    isSelectingRef.current = true; // the very next touchmove must already be cancelled
    setSelAnchor({ d: press.d, t: press.t });
    setSelFocus({ d: press.d, t: press.t });
    setIsSelecting(true);
  };

  // A press only records where it started; a click, hold or drag is decided by what
  // the pointer does next.
  const handleCellPointerDown = (d: number, t: number, e: React.PointerEvent) => {
    if (e.pointerType === "mouse" && e.button !== 0) return;
    // The highlight only exists to open/close hours
    if (!canEditHours || hoursSaving) return;
    dragMovedRef.current = false;
    suppressClickRef.current = false;
    if (longPressTimerRef.current) clearTimeout(longPressTimerRef.current);
    longPressTimerRef.current = null;
    const touch = e.pointerType !== "mouse";
    pressRef.current = { d, t, x: e.clientX, y: e.clientY, touch };
    if (touch) longPressTimerRef.current = setTimeout(beginTouchSelection, LONG_PRESS_MS);
  };

  const handleCellPointerMove = (d: number, t: number, e: React.PointerEvent) => {
    const press = pressRef.current;
    if (!press) return;
    if (press.touch) {
      if (isSelecting) {
        const cell = cellFromPoint(e.clientX, e.clientY);
        if (cell) {
          dragMovedRef.current = true;
          setSelFocus(cell);
        }
        return;
      }
      // Moving before the hold lands means the user is scrolling, not selecting.
      if (Math.abs(e.clientX - press.x) > TOUCH_SCROLL_CANCEL_PX || Math.abs(e.clientY - press.y) > TOUCH_SCROLL_CANCEL_PX) {
        if (longPressTimerRef.current) clearTimeout(longPressTimerRef.current);
        longPressTimerRef.current = null;
        pressRef.current = null;
      }
      return;
    }
    if (isSelecting) return; // pointerenter extends it from here
    if (Math.abs(e.clientX - press.x) < DRAG_THRESHOLD_PX && Math.abs(e.clientY - press.y) < DRAG_THRESHOLD_PX) return;
    e.preventDefault();
    dragMovedRef.current = true;
    selectionCommittedRef.current = false;
    setSelAnchor({ d: press.d, t: press.t });
    setSelFocus({ d, t });
    setIsSelecting(true);
  };

  const handleCellPointerEnter = (d: number, t: number, e: React.PointerEvent) => {
    if (e.pointerType !== "mouse" || !isSelecting) return;
    setSelFocus({ d, t });
  };

  /**
   * Every cell click runs through here first. A click that ends a drag does nothing;
   * while a highlight is standing, a click inside keeps it and one outside dismisses it.
   */
  const guardCellClick = (key: string): boolean => {
    if (suppressClickRef.current) {
      suppressClickRef.current = false;
      return false;
    }
    if (selectionCommittedRef.current) {
      if (!selectedKeys.has(key)) clearSelection();
      return false;
    }
    return true;
  };

  const toggleHour = (key: string) => {
    if (hoursSaving) return;
    const before = openSet;
    const next = new Set(openSet);
    if (next.has(key)) next.delete(key); else next.add(key);
    setOpenSet(next);
    saveHours(next, before);
  };

  /** Mark every highlighted cell open or closed. */
  const applySelection = (open: boolean) => {
    const before = openSet;
    const next = new Set(openSet);
    for (const k of selectedKeys) {
      if (open) next.add(k); else next.delete(k);
    }
    clearSelection();
    if (next.size === before.size && [...next].every((k) => before.has(k))) return;
    setOpenSet(next);
    saveHours(next, before);
  };

  const selectionLabel = (() => {
    if (!selAnchor || !selFocus) return "";
    const d1 = Math.min(selAnchor.d, selFocus.d);
    const d2 = Math.max(selAnchor.d, selFocus.d);
    const t1 = Math.min(selAnchor.t, selFocus.t);
    const t2 = Math.max(selAnchor.t, selFocus.t);
    const days = d1 === d2 ? DAYS_OF_WEEK[d1].slice(0, 3) : `${DAYS_OF_WEEK[d1].slice(0, 3)}–${DAYS_OF_WEEK[d2].slice(0, 3)}`;
    const endMins = toMinutes(slotTimes[t2]) + 30;
    const end = `${String(Math.floor(endMins / 60) % 24).padStart(2, "0")}:${String(endMins % 60).padStart(2, "0")}`;
    return `${days} · ${fmt12(slotTimes[t1])} – ${fmt12(end)}`;
  })();
  const showSelectionBar = !!selAnchor && !isSelecting && selectionSize > 1;

  const colorByStudent = useMemo(() => {
    const ids = [...new Set(slots.map((s) => s.student_id))].sort((a, b) => a - b);
    return new Map(ids.map((id, i) => [id, palette[i % palette.length]]));
  }, [slots, palette]);

  // Each slot sits in the grid row its start time falls in, and runs down as
  // many 30-min rows as the package's class length (like the Actual view).
  // Times outside the grid's hours are listed underneath instead.
  const { cells, outside } = useMemo(() => {
    const cells = new Map<string, { slot: RegularSlot; continuation: boolean }[]>();
    const outside: RegularSlot[] = [];
    const first = toMinutes(slotTimes[0]);
    for (const s of slots) {
      const rowIdx = Math.floor((toMinutes(s.start_time) - first) / 30);
      if (rowIdx < 0 || rowIdx >= slotTimes.length) { outside.push(s); continue; }
      const span = Math.max(1, Math.ceil((s.duration_minutes || 25) / 30));
      for (let i = 0; i < span && rowIdx + i < slotTimes.length; i++) {
        const key = `${s.day_of_week}|${slotTimes[rowIdx + i]}`;
        cells.set(key, [...(cells.get(key) ?? []), { slot: s, continuation: i > 0 }]);
      }
    }
    return { cells, outside };
  }, [slots, slotTimes]);

  const studentCount = colorByStudent.size;
  const hasHours = openSet.size > 0;
  const vacantCount = [...openSet].filter((k) => !cells.has(k)).length;

  const handleDownload = async () => {
    setDownloading(true);
    try {
      await downloadRegularScheduleImage({
        teacherName: teacher.name,
        days: DAYS_OF_WEEK,
        times: slotTimes,
        cell: (day, time): RegularImageCell => {
          const here = cells.get(`${day}|${time}`) ?? [];
          if (here.length > 1) return { kind: "clash", label: here.map(({ slot }) => slot.student_name).join(", ") };
          if (here.length === 1) {
            const { slot, continuation } = here[0];
            return { kind: "student", label: continuation ? `↳ ${slot.student_name}` : slot.student_name, color: colorByStudent.get(slot.student_id) ?? palette[0] };
          }
          return openSet.has(`${day}|${time}`) ? { kind: "open" } : { kind: "closed" };
        },
      });
    } finally {
      setDownloading(false);
    }
  };

  const hint =
    mode === "hours" && canEditHours
      ? "Click a slot to switch it open (green) or closed (gray), or drag across slots — hold then drag on touch — to open or close a whole range."
      : canEdit
        ? `Click a slot to add or remove a student.${canEditHours ? " Drag across slots to open or close a range." : ""}`
        : "";

  return (
    <>
      <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-2 mb-3">
        <p className="text-xs text-muted-foreground">
          {teacher.name}'s regular weekly timetable, kept as a record. Green slots with no student are
          regular vacancies. Nothing here is booked until you apply it.
        </p>
        <div className="flex flex-wrap gap-2 shrink-0">
          <Button size="sm" variant="outline" disabled={loading || downloading} onClick={handleDownload}>
            {downloading ? <Loader2 className="h-4 w-4 animate-spin mr-1" /> : <Download className="h-4 w-4 mr-1" />} Download Image
          </Button>
          {(canEdit || canEditHours) && (
            <Button size="sm" variant="outline" disabled={loading} onClick={() => setShowCopy(true)}>
              <CopyPlus className="h-4 w-4 mr-1" /> Copy from Actual
            </Button>
          )}
          {(canApply || canEditHours) && (
            <Button size="sm" disabled={loading || (slots.length === 0 && openSet.size === 0)} onClick={() => setShowApply(true)}>
              <CalendarPlus className="h-4 w-4 mr-1" /> Apply to Actual
            </Button>
          )}
        </div>
      </div>

      {(canEdit || canEditHours) && (
        <div className="flex flex-wrap items-center gap-2 mb-3">
          {canEdit && canEditHours && (
            <div className="inline-flex rounded-lg border p-0.5 bg-muted/40" role="tablist" aria-label="What clicking edits">
              {([["students", "Edit students"], ["hours", "Edit open / closed hours"]] as const).map(([v, label]) => (
                <button
                  key={v}
                  role="tab"
                  aria-selected={mode === v}
                  onClick={() => setMode(v)}
                  className={`px-3 py-1 text-xs font-medium rounded-md transition-colors ${
                    mode === v ? "bg-white text-primary shadow-sm" : "text-muted-foreground hover:text-foreground"
                  }`}
                >
                  {label}
                </button>
              ))}
            </div>
          )}
          {hoursSaving && <Loader2 className="h-3.5 w-3.5 animate-spin text-muted-foreground" />}
          {hint && <span className="text-xs text-muted-foreground">{hint}</span>}
        </div>
      )}
      {showSelectionBar && (
        <div className="flex flex-wrap items-center gap-2 mb-3 rounded-lg border border-primary/40 bg-primary/5 px-3 py-2">
          <span className="text-sm font-medium">{selectionLabel}</span>
          <span className="text-xs text-muted-foreground">{selectionSize} slots</span>
          <div className="flex gap-2 ml-auto">
            <Button size="sm" className="h-7 px-2 text-xs bg-green-600 hover:bg-green-700" onClick={() => applySelection(true)}>
              <Check className="h-3.5 w-3.5 mr-1" /> Mark open
            </Button>
            <Button size="sm" variant="outline" className="h-7 px-2 text-xs" onClick={() => applySelection(false)}>
              Mark closed
            </Button>
            <Button size="sm" variant="ghost" className="h-7 w-7 p-0" aria-label="Clear selection" onClick={clearSelection}>
              <X className="h-3.5 w-3.5" />
            </Button>
          </div>
        </div>
      )}
      {hoursError && (
        <Alert variant="destructive" className="mb-3">
          <AlertDescription>{hoursError}</AlertDescription>
        </Alert>
      )}

      {loading ? (
        <div className="flex justify-center py-16">
          <Loader2 className="h-6 w-6 animate-spin text-primary" />
        </div>
      ) : (
        <>
          <div ref={scrollRef} className="overflow-auto max-h-[70vh] overscroll-contain">
            {/* select-none stops a drag across the grid turning into a text selection */}
            <table ref={tableRef} className={`w-full text-xs border-collapse table-fixed ${canEditHours ? "select-none" : ""}`}>
              <thead className="sticky top-0 z-10 bg-white shadow-[0_1px_0_0_var(--border)]">
                <tr>
                  <th className="p-1 text-left w-16 bg-white">Time</th>
                  {DAYS_OF_WEEK.map((d) => (
                    <th key={d} className="p-1 text-center bg-white">{d.slice(0, 3)}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {slotTimes.map((time, t) => (
                  <tr key={time}>
                    <td className="p-1 font-medium text-muted-foreground whitespace-nowrap">{fmt12(time)}</td>
                    {DAYS_OF_WEEK.map((day, d) => {
                      const key = `${day}|${time}`;
                      const here = cells.get(key) ?? [];
                      const isOpen = openSet.has(key);
                      const action = mode === "hours" && canEditHours
                        ? () => toggleHour(key)
                        : mode === "students" && canEdit ? () => setEditCell({ day, time }) : null;
                      const clickable = !!action;
                      // Every cell takes part in drag-selection, whatever the mode.
                      const cellProps = {
                        "data-regular-cell": `${d}:${t}`,
                        onPointerDown: (e: React.PointerEvent) => handleCellPointerDown(d, t, e),
                        onPointerMove: (e: React.PointerEvent) => handleCellPointerMove(d, t, e),
                        onPointerEnter: (e: React.PointerEvent) => handleCellPointerEnter(d, t, e),
                        onClick: () => { if (guardCellClick(key)) action?.(); },
                      };
                      const selected = selectedKeys.has(key) ? "ring-2 ring-inset ring-primary" : "";
                      if (here.length === 0) {
                        return (
                          <td
                            key={day}
                            {...cellProps}
                            title={
                              (isOpen ? "Regularly open — vacant" : "Regularly closed")
                              + (mode === "hours" && canEditHours ? " · click to switch" : clickable ? " · click to add a student" : "")
                            }
                            className={`p-1 text-center border ${
                              isOpen ? "bg-green-100 text-green-700" : "bg-gray-100 text-gray-400"
                            } ${clickable ? "cursor-pointer hover:brightness-95" : ""} ${selected}`}
                          >
                            {isOpen ? "✓" : mode === "students" && canEdit ? "+" : ""}
                          </td>
                        );
                      }
                      const clash = here.length > 1;
                      const only = here[0];
                      // Only flagged once the teacher has regular hours, or every slot would be.
                      const outsideHours = hasHours && !isOpen;
                      return (
                        <td
                          key={day}
                          {...cellProps}
                          title={here.map(({ slot }) => `${slot.student_name} — ${slot.day_of_week} ${fmt12(slot.start_time)}`).join("\n")
                            + (clash ? "\n⚠ More than one student in this slot" : "")
                            + (outsideHours ? "\n⚠ Outside the teacher's regular open hours" : "")
                            + (mode === "hours" && canEditHours ? "\nClick to switch open/closed" : clickable ? "\nClick to edit" : "")}
                          style={clash ? undefined : { backgroundColor: colorByStudent.get(only.slot.student_id), color: "#fff" }}
                          className={`p-1 text-center border ${clash ? "bg-amber-100 text-amber-800" : ""} ${
                            outsideHours ? "outline-2 outline-dashed outline-red-500 -outline-offset-2" : ""
                          } ${clickable ? "cursor-pointer hover:brightness-110" : ""} ${selected}`}
                        >
                          {clash ? (
                            <div className="truncate font-medium">⚠ {here.map(({ slot }) => slot.student_name).join(", ")}</div>
                          ) : (
                            <div className="truncate font-medium">
                              {only.continuation ? `↳ ${only.slot.student_name}` : only.slot.student_name}
                            </div>
                          )}
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {outside.length > 0 && (
            <p className="text-xs text-muted-foreground mt-2">
              Outside the grid hours:{" "}
              {outside.map((s) => `${s.student_name} (${s.day_of_week.slice(0, 3)} ${fmt12(s.start_time)})`).join(", ")}
            </p>
          )}
          <div className="flex flex-wrap gap-4 mt-3 text-xs text-muted-foreground">
            <span>
              {studentCount} student{studentCount === 1 ? "" : "s"} · {slots.length} class slot{slots.length === 1 ? "" : "s"} a week
              {hasHours && ` · ${vacantCount} vacant half-hour${vacantCount === 1 ? "" : "s"}`}
            </span>
            <span><span className="inline-block w-3 h-3 bg-green-100 border rounded mr-1" />Open (✓) — regular vacancy</span>
            <span><span className="inline-block w-3 h-3 bg-gray-100 border rounded mr-1" />Closed</span>
            <span>
              <span className="inline-block w-3 h-3 border rounded-l" style={{ backgroundColor: palette[0] }} />
              <span className="inline-block w-3 h-3 border rounded-r mr-1" style={{ backgroundColor: palette[2] }} />
              Student's regular class (one color per student)
            </span>
            <span><span className="inline-block w-3 h-3 bg-amber-100 border rounded mr-1" />⚠ Two students in one slot</span>
            {hasHours && (
              <span><span className="inline-block w-3 h-3 border-2 border-dashed border-red-500 rounded mr-1" />Class outside the teacher's regular hours</span>
            )}
          </div>
        </>
      )}

      <EditRegularSlotDialog
        cell={editCell}
        teacher={teacher}
        // Everything covering this cell, including longer classes that started above it
        entries={editCell ? (cells.get(`${editCell.day}|${editCell.time}`) ?? []).map(({ slot }) => slot) : []}
        onClose={() => setEditCell(null)}
        onChanged={(fresh) => (fresh ? setSlots(fresh) : fetchSlots())}
      />

      <ApplyTeacherRegularDialog
        open={showApply}
        teacher={teacher}
        slots={slots}
        hoursCount={openSet.size}
        canOpenHours={canEditHours}
        canBookStudents={canApply}
        onClose={() => setShowApply(false)}
        // Refresh the session counts shown here as well as the Actual view's slots and classes
        onApplied={() => { fetchSlots(); onApplied(); }}
      />

      <CopyFromActualDialog
        open={showCopy}
        teacher={teacher}
        weekLabel={weekLabel}
        weekStart={weekStart}
        currentHoursCount={openSet.size}
        canCopyHours={canEditHours}
        canCopyClasses={canEdit}
        onClose={() => setShowCopy(false)}
        onCopied={fetchSlots}
      />
    </>
  );
};

type CopiedClass = {
  student_id: number;
  student_name: string;
  day_of_week: string;
  start_time: string;
  // added: new regular slot; already: already regular with this teacher;
  // other_teacher: the student has a regular slot then with someone else; full: 21 slots already
  status: "added" | "already" | "other_teacher" | "full";
  other_teacher?: string | null;
};

type CopyResult = { hours_count: number | null; hours: TeacherRegularSlot[] | null; classes: CopiedClass[]; classes_added: number };

const COPY_STATUS: Record<CopiedClass["status"], { label: string; className: string }> = {
  added: { label: "New", className: "text-green-700" },
  already: { label: "Already regular", className: "text-muted-foreground" },
  other_teacher: { label: "Has a regular slot then", className: "text-amber-600" },
  full: { label: "Too many regular slots", className: "text-amber-600" },
};

interface CopyFromActualDialogProps {
  open: boolean;
  teacher: { id: number; name: string };
  weekLabel: string;
  weekStart: string;
  currentHoursCount: number;
  canCopyHours: boolean;
  canCopyClasses: boolean;
  onClose: () => void;
  onCopied: () => void;
}

// The reverse of "Apply to Actual": one real week of the teacher's calendar
// becomes their regular schedule. The open hours are replaced; students'
// classes are only added, so a student absent that week keeps their slot.
// A record only — nothing is booked, deducted or opened.
const CopyFromActualDialog: React.FC<CopyFromActualDialogProps> = ({
  open, teacher, weekLabel, weekStart, currentHoursCount, canCopyHours, canCopyClasses, onClose, onCopied,
}) => {
  const [copyHours, setCopyHours] = useState(true);
  const [copyClasses, setCopyClasses] = useState(true);
  const [preview, setPreview] = useState<CopyResult | null>(null);
  const [result, setResult] = useState<CopyResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const url = `${import.meta.env.VITE_API_URL}/api/admin/teachers/${teacher.id}/regular-schedule/copy-from-week`;

  // Preview everything this admin may copy, every time it opens.
  useEffect(() => {
    if (!open) return;
    setCopyHours(canCopyHours);
    setCopyClasses(canCopyClasses);
    setPreview(null);
    setResult(null);
    setError(null);
    setLoading(true);
    axios
      .post<CopyResult>(
        url,
        { start_date: weekStart, hours: canCopyHours, classes: canCopyClasses, dry_run: true },
        { headers: { Authorization: `Bearer ${localStorage.getItem("token")}` } },
      )
      .then((res) => setPreview(res.data))
      .catch((err: unknown) => {
        const data = axios.isAxiosError(err) ? err.response?.data : undefined;
        setError(data?.message || "Couldn't read that week's calendar");
      })
      .finally(() => setLoading(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const newCount = preview?.classes.filter((c) => c.status === "added").length ?? 0;
  const doHours = copyHours && canCopyHours && preview?.hours_count !== null;
  const doClasses = copyClasses && canCopyClasses && newCount > 0;

  const handleCopy = async () => {
    setSaving(true);
    setError(null);
    try {
      const res = await axios.post<CopyResult>(
        url,
        { start_date: weekStart, hours: doHours, classes: doClasses },
        { headers: { Authorization: `Bearer ${localStorage.getItem("token")}` } },
      );
      setResult(res.data);
      onCopied();
    } catch (err: unknown) {
      const data = axios.isAxiosError(err) ? err.response?.data : undefined;
      setError(data?.message || "Failed to copy to the regular schedule");
    } finally {
      setSaving(false);
    }
  };

  const hoursCount = preview?.hours_count ?? 0;

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o && !saving) onClose(); }}>
      <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Copy from Actual — {teacher.name}</DialogTitle>
          <DialogDescription>
            Makes the {weekLabel} on the real calendar {teacher.name}'s regular schedule. Nothing is booked or deducted.
          </DialogDescription>
        </DialogHeader>

        {loading ? (
          <div className="flex justify-center py-8"><Loader2 className="h-5 w-5 animate-spin text-muted-foreground" /></div>
        ) : result ? (
          <div className="p-3 bg-green-50 border border-green-200 rounded-lg space-y-0.5 text-green-700 font-medium">
            {result.hours_count !== null && (
              <p className="flex items-center gap-1.5">
                <Check className="h-4 w-4" /> Regular hours set to {result.hours_count / 2} hour{result.hours_count === 2 ? "" : "s"} a week
              </p>
            )}
            {doClasses && (
              <p className="flex items-center gap-1.5">
                <Check className="h-4 w-4" /> {result.classes_added} class{result.classes_added === 1 ? "" : "es"} added to students' regular schedules
              </p>
            )}
          </div>
        ) : preview && (
          <>
            <label className={`flex items-start gap-2 rounded-lg border p-3 ${canCopyHours ? "cursor-pointer" : "opacity-60"}`}>
              <input
                type="checkbox"
                className="mt-0.5 h-4 w-4 accent-primary"
                checked={doHours}
                disabled={!canCopyHours || saving}
                onChange={(e) => setCopyHours(e.target.checked)}
              />
              <span className="text-sm">
                <span className="font-medium">Teacher's regular open hours</span>
                <span className="block text-xs text-muted-foreground">
                  {!canCopyHours
                    ? "You don't have permission to change the teacher's regular hours."
                    : `Replaces the regular hours (now ${currentHoursCount / 2} h a week) with that week's open and booked slots: ${hoursCount / 2} h a week. Every other slot becomes closed.`}
                </span>
                {canCopyHours && preview.hours && (
                  <span className="block mt-1.5 text-xs">
                    {preview.hours.length === 0
                      ? <span className="text-amber-600">No open slots that week — every regular slot will be closed.</span>
                      : summarizeRegularSlots(preview.hours).map((d) => (
                          <span key={d.day} className="flex gap-2">
                            <span className="font-medium w-8 shrink-0">{d.day}</span>
                            <span className="text-muted-foreground">{d.ranges}</span>
                          </span>
                        ))}
                  </span>
                )}
              </span>
            </label>

            <label className={`flex items-start gap-2 rounded-lg border p-3 ${canCopyClasses && newCount > 0 ? "cursor-pointer" : "opacity-60"}`}>
              <input
                type="checkbox"
                className="mt-0.5 h-4 w-4 accent-primary"
                checked={doClasses}
                disabled={!canCopyClasses || newCount === 0 || saving}
                onChange={(e) => setCopyClasses(e.target.checked)}
              />
              <span className="text-sm">
                <span className="font-medium">Students' classes</span>
                <span className="block text-xs text-muted-foreground">
                  {!canCopyClasses
                    ? "You don't have permission to change students' regular schedules."
                    : preview.classes.length === 0
                      ? "No classes that week."
                      : newCount === 0
                        ? "Every class that week is already in the regular schedule."
                        : `Adds ${newCount} class${newCount === 1 ? "" : "es"} to the students' regular schedules. Existing regular slots are kept, even if the student had no class that week.`}
                </span>
              </span>
            </label>

            {canCopyClasses && preview.classes.length > 0 && (
              <div className="border rounded-lg divide-y text-sm max-h-60 overflow-y-auto">
                {preview.classes.map((c, i) => (
                  <div key={i} className="flex items-center justify-between gap-2 px-3 py-1.5">
                    <span className="truncate">
                      <span className="font-medium">{c.student_name}</span>{" "}
                      <span className="text-muted-foreground">{c.day_of_week.slice(0, 3)} {fmt12(c.start_time)}</span>
                    </span>
                    <span className={`text-xs shrink-0 ${COPY_STATUS[c.status].className}`}>
                      {COPY_STATUS[c.status].label}
                      {c.status === "other_teacher" && c.other_teacher ? ` with ${c.other_teacher}` : ""}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </>
        )}

        {error && (
          <Alert variant="destructive">
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}

        <DialogFooter>
          {result ? (
            <Button onClick={onClose}>Done</Button>
          ) : (
            <>
              <Button variant="outline" disabled={saving} onClick={onClose}>Cancel</Button>
              <Button onClick={handleCopy} disabled={loading || saving || !preview || (!doHours && !doClasses)}>
                {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : "Copy to Regular"}
              </Button>
            </>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

interface EditRegularSlotDialogProps {
  // null keeps the dialog closed
  cell: { day: string; time: string } | null;
  teacher: { id: number; name: string };
  entries: RegularSlot[];
  onClose: () => void;
  // Fresh slot list when the server returned one, otherwise undefined to refetch.
  onChanged: (fresh?: RegularSlot[]) => void;
}

// Add or remove students' regular slots at one day/time of this teacher's
// template. A record only — nothing is booked until "Apply to Actual".
const EditRegularSlotDialog: React.FC<EditRegularSlotDialogProps> = ({ cell, teacher, entries, onClose, onChanged }) => {
  const [students, setStudents] = useState<{ id: number; name: string }[]>([]);
  const [studentId, setStudentId] = useState("");
  const [time, setTime] = useState("");
  const [saving, setSaving] = useState(false);
  const [removingId, setRemovingId] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);

  const token = localStorage.getItem("token");
  const base = import.meta.env.VITE_API_URL;

  // Fresh form every time it opens; the student list is loaded once.
  useEffect(() => {
    if (!cell) return;
    setStudentId("");
    setTime(cell.time);
    setError(null);
    if (students.length > 0) return;
    axios
      .get(`${base}/api/student/students`, { headers: { Authorization: `Bearer ${token}` } })
      .then((res) => {
        const rows: { id: number; name: string; is_active?: boolean | number }[] = Array.isArray(res.data) ? res.data : (res.data?.data ?? []);
        setStudents(
          rows
            .filter((s) => s.is_active === undefined || !!s.is_active)
            .map(({ id, name }) => ({ id, name }))
            .sort((a, b) => a.name.localeCompare(b.name)),
        );
      })
      .catch(() => setStudents([]));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cell]);

  const handleAdd = async () => {
    if (!cell || !studentId) return;
    setSaving(true);
    setError(null);
    try {
      const res = await axios.post(
        `${base}/api/admin/teachers/${teacher.id}/regular-schedule`,
        { student_id: Number(studentId), day_of_week: cell.day, start_time: time },
        { headers: { Authorization: `Bearer ${token}` } },
      );
      onChanged(Array.isArray(res.data) ? res.data : undefined);
      onClose();
    } catch (err: unknown) {
      setError(axios.isAxiosError(err) && err.response ? err.response.data?.message || "Failed to add slot" : "An unexpected error occurred");
    } finally {
      setSaving(false);
    }
  };

  const handleRemove = async (entryId: number) => {
    setRemovingId(entryId);
    setError(null);
    try {
      await axios.delete(`${base}/api/admin/regular-schedule/${entryId}`, { headers: { Authorization: `Bearer ${token}` } });
      onChanged();
    } catch (err: unknown) {
      setError(axios.isAxiosError(err) && err.response ? err.response.data?.message || "Failed to remove slot" : "An unexpected error occurred");
    } finally {
      setRemovingId(null);
    }
  };

  const busy = saving || removingId !== null;

  return (
    <Dialog open={!!cell} onOpenChange={(o) => { if (!o && !busy) onClose(); }}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Regular Schedule — {cell?.day} {cell ? fmt12(cell.time) : ""}</DialogTitle>
          <DialogDescription>
            Agreed weekly slots with {teacher.name}. Kept as a record — this doesn't book classes or
            deduct sessions.
          </DialogDescription>
        </DialogHeader>

        {entries.length > 0 && (
          <div className="border rounded-lg divide-y text-sm">
            {entries.map((e) => (
              <div key={e.id} className="flex items-center justify-between gap-2 px-3 py-2">
                <span className="truncate">
                  <span className="font-medium">{e.student_name}</span>
                  <span className="text-muted-foreground"> · {e.day_of_week.slice(0, 3)} {fmt12(e.start_time)}</span>
                </span>
                <Button
                  size="sm"
                  variant="ghost"
                  aria-label={`Remove ${e.student_name}'s slot`}
                  className="h-7 w-7 p-0 shrink-0 text-destructive hover:text-destructive hover:bg-destructive/10"
                  disabled={busy}
                  onClick={() => handleRemove(e.id)}
                >
                  {removingId === e.id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Trash2 className="h-3.5 w-3.5" />}
                </Button>
              </div>
            ))}
          </div>
        )}

        <div className="space-y-2">
          <p className="text-sm font-medium">{entries.length > 0 ? "Add another student" : "Add a student"}</p>
          <div className="grid grid-cols-[1fr_7.5rem] gap-2">
            <Select value={studentId} onValueChange={setStudentId} disabled={busy}>
              <SelectTrigger aria-label="Student">
                <SelectValue placeholder="Select a student" />
              </SelectTrigger>
              <SelectContent>
                {students.map((s) => (
                  <SelectItem key={s.id} value={String(s.id)}>{s.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Input type="time" aria-label="Start time" value={time} onChange={(e) => setTime(e.target.value)} disabled={busy} />
          </div>
        </div>

        {error && (
          <Alert variant="destructive">
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}

        <DialogFooter>
          <Button variant="outline" disabled={busy} onClick={onClose}>Close</Button>
          <Button onClick={handleAdd} disabled={busy || !studentId || !time}>
            {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : "Add Slot"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

interface ApplyTeacherRegularDialogProps {
  open: boolean;
  teacher: { id: number; name: string };
  slots: RegularSlot[];
  // Number of regular open half-hours a week
  hoursCount: number;
  canOpenHours: boolean;
  canBookStudents: boolean;
  onClose: () => void;
  onApplied: () => void;
}

type ApplyResult = {
  slots_opened: number;
  slots_closed: number;
  leave_days: string[];
  students: StudentResult[];
};

// Applies the teacher's regular timetable to the Actual calendar for N weeks:
// opens the teacher's regular hours as real slots, then books the students'
// regular classes. Each student is booked (or not) on their own, so one
// student short on sessions doesn't hold up the rest.
const ApplyTeacherRegularDialog: React.FC<ApplyTeacherRegularDialogProps> = ({
  open, teacher, slots, hoursCount, canOpenHours, canBookStudents, onClose, onApplied,
}) => {
  const [weeks, setWeeks] = useState("4");
  const [startDate, setStartDate] = useState("");
  const [openHours, setOpenHours] = useState(true);
  const [bookStudents, setBookStudents] = useState(true);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<ApplyResult | null>(null);

  const canHours = canOpenHours && hoursCount > 0;
  const canStudents = canBookStudents && slots.length > 0;

  // Fresh form every time it opens; tick whatever there is to apply.
  useEffect(() => {
    if (!open) return;
    setWeeks("4");
    setStartDate("");
    setOpenHours(canHours);
    setBookStudents(canStudents);
    setError(null);
    setResult(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const weeksNum = Math.min(12, Math.max(1, parseInt(weeks) || 4));
  const doHours = openHours && canHours;
  const doStudents = bookStudents && canStudents;

  const perStudent = useMemo(() => {
    const map = new Map<number, { id: number; name: string; count: number; packageId: number | null; sessions: number }>();
    for (const s of slots) {
      const cur = map.get(s.student_id) ?? { id: s.student_id, name: s.student_name, count: 0, packageId: s.student_package_id, sessions: s.sessions_remaining };
      cur.count += 1;
      map.set(s.student_id, cur);
    }
    return [...map.values()].sort((a, b) => a.name.localeCompare(b.name));
  }, [slots]);

  const handleApply = async () => {
    setLoading(true);
    setError(null);
    try {
      const token = localStorage.getItem("token");
      const res = await axios.post(
        `${import.meta.env.VITE_API_URL}/api/admin/teachers/${teacher.id}/regular-schedule/apply`,
        { num_weeks: weeksNum, start_date: startDate || undefined, open_hours: doHours, book_students: doStudents },
        { headers: { Authorization: `Bearer ${token}` } },
      );
      setResult({ slots_opened: res.data?.slots_opened ?? 0, slots_closed: res.data?.slots_closed ?? 0, leave_days: res.data?.leave_days ?? [], students: res.data?.students ?? [] });
      onApplied();
    } catch (err: unknown) {
      const data = axios.isAxiosError(err) ? err.response?.data : undefined;
      setError(data?.message || "Failed to apply regular schedule");
      if (data?.students) setResult({ slots_opened: data.slots_opened ?? 0, slots_closed: data.slots_closed ?? 0, leave_days: data.leave_days ?? [], students: data.students });
    } finally {
      setLoading(false);
    }
  };

  const totalBooked = result?.students.reduce((n, r) => n + r.sessions_booked, 0) ?? 0;
  const hoursPerWeek = hoursCount / 2;

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o && !loading) onClose(); }}>
      <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Apply to Actual — {teacher.name}</DialogTitle>
          <DialogDescription>
            Copies {teacher.name}'s regular timetable onto the real calendar for the weeks you choose.
          </DialogDescription>
        </DialogHeader>

        {!result && (
          <>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>Weeks (1–12)</Label>
                <Input type="number" min={1} max={12} value={weeks} onChange={(e) => setWeeks(e.target.value)} disabled={loading} />
              </div>
              <div className="space-y-1.5">
                <Label>Start Date</Label>
                <Input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} disabled={loading} />
              </div>
            </div>
            <p className="text-xs text-muted-foreground -mt-1">Start date defaults to tomorrow.</p>

            <label className={`flex items-start gap-2 rounded-lg border p-3 ${canHours ? "cursor-pointer" : "opacity-60"}`}>
              <input
                type="checkbox"
                className="mt-0.5 h-4 w-4 accent-primary"
                checked={doHours}
                disabled={!canHours || loading}
                onChange={(e) => setOpenHours(e.target.checked)}
              />
              <span className="text-sm">
                <span className="font-medium">Open the teacher's regular hours</span>
                <span className="block text-xs text-muted-foreground">
                  {!canOpenHours
                    ? "You don't have permission to open teacher slots."
                    : hoursCount === 0
                      ? "No regular open hours set yet — set them in “Edit open / closed hours”."
                      : `${hoursPerWeek} hour${hoursPerWeek === 1 ? "" : "s"} a week, ~${hoursCount * weeksNum} slots in total. The regular open slots are opened and every other slot is closed, so the real calendar matches the Regular view. Leave days and slots with a class are left alone.`}
                </span>
              </span>
            </label>

            <label className={`flex items-start gap-2 rounded-lg border p-3 ${canStudents ? "cursor-pointer" : "opacity-60"}`}>
              <input
                type="checkbox"
                className="mt-0.5 h-4 w-4 accent-primary"
                checked={doStudents}
                disabled={!canStudents || loading}
                onChange={(e) => setBookStudents(e.target.checked)}
              />
              <span className="text-sm">
                <span className="font-medium">Book the students' regular classes</span>
                <span className="block text-xs text-muted-foreground">
                  {!canBookStudents
                    ? "You don't have permission to book classes."
                    : slots.length === 0
                      ? "No student has a regular slot with this teacher yet."
                      : "Deducts 1 session per class. Each student is booked separately: one without enough sessions is skipped and the rest still go ahead. A class needs the teacher's slot to be open."}
                </span>
              </span>
            </label>

            {doStudents && (
              <div className="border rounded-lg divide-y text-sm">
                {perStudent.map((s) => {
                  const planned = s.count * weeksNum;
                  return (
                    <div key={s.id} className="flex items-center justify-between gap-2 px-3 py-2">
                      <span className="font-medium truncate">{s.name}</span>
                      <span className="text-xs text-muted-foreground shrink-0 text-right">
                        up to {planned} class{planned === 1 ? "" : "es"} · {s.packageId ? `${s.sessions} sessions left` : "no active package"}
                        {s.packageId && planned > s.sessions && (
                          <span className="block text-amber-600">
                            <AlertTriangle className="h-3 w-3 inline mr-0.5" />may not have enough sessions
                          </span>
                        )}
                      </span>
                    </div>
                  );
                })}
              </div>
            )}
          </>
        )}

        {result && (
          <div className="space-y-2">
            {(result.slots_opened > 0 || result.slots_closed > 0 || totalBooked > 0) && (
              <div className="p-3 bg-green-50 border border-green-200 rounded-lg space-y-0.5">
                {doHours && (
                  <p className="text-green-700 font-medium flex items-center gap-1.5">
                    <Check className="h-4 w-4" /> {result.slots_opened} slot{result.slots_opened === 1 ? "" : "s"} opened, {result.slots_closed} closed
                  </p>
                )}
                {doStudents && (
                  <p className="text-green-700 font-medium flex items-center gap-1.5">
                    <Check className="h-4 w-4" /> {totalBooked} class{totalBooked === 1 ? "" : "es"} booked
                  </p>
                )}
              </div>
            )}
            {result.leave_days.length > 0 && (
              <p className="text-xs text-amber-600">
                <AlertTriangle className="h-3 w-3 inline mr-0.5" />
                Not opened — teacher on leave: {result.leave_days.join(", ")}
              </p>
            )}
            {result.students.length > 0 && (
              <div className="border rounded-lg divide-y text-sm max-h-72 overflow-y-auto">
                {result.students.map((r) => (
                  <div key={r.student_id} className="px-3 py-2">
                    <div className="flex items-center justify-between gap-2">
                      <span className="font-medium truncate">{r.student_name}</span>
                      {r.error ? (
                        <span className="text-xs text-destructive shrink-0">Not booked</span>
                      ) : (
                        <span className="text-xs text-green-700 shrink-0">
                          {r.sessions_booked} booked · {r.sessions_remaining} sessions left
                        </span>
                      )}
                    </div>
                    {r.error && <p className="text-xs text-destructive mt-0.5">{r.error}</p>}
                    {r.groups?.flatMap((g) => g.skipped_dates.map((d) => ({ ...d, label: g.label }))).map((d, i) => (
                      <p key={i} className="text-xs text-amber-600 mt-0.5">
                        <span className="font-mono text-gray-600">{d.date}</span> {d.label}: {d.reason}
                      </p>
                    ))}
                  </div>
                ))}
              </div>
            )}
            {error && (
              <Alert variant="destructive">
                <AlertDescription>{error}</AlertDescription>
              </Alert>
            )}
          </div>
        )}

        {error && !result && (
          <Alert variant="destructive">
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}

        <DialogFooter>
          {result ? (
            <Button onClick={onClose}>Done</Button>
          ) : (
            <>
              <Button variant="outline" disabled={loading} onClick={onClose}>Cancel</Button>
              <Button onClick={handleApply} disabled={loading || (!doHours && !doStudents)}>
                {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : "Apply to Actual"}
              </Button>
            </>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

export default TeacherRegularSchedule;
