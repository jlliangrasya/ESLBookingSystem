import {
  createContext,
  useContext,
  useState,
  useEffect,
  useRef,
  useCallback,
  type ReactNode,
} from "react";
import { TOUR_SEGMENTS, NEXT_SEGMENT, type TourStep } from "@/data/tourSteps";
import { TourOverlay } from "@/components/TourOverlay";

// ── Inline tour storage (avoids calling hooks inside callbacks) ─────────────

function tourStorage(companyId: number) {
  const completedKey = `tour_completed_${companyId}`;
  const segmentKey = `tour_segment_${companyId}`;
  const stepKey = `tour_step_${companyId}`;
  return {
    isCompleted: () => localStorage.getItem(completedKey) === "true",
    getSegment: () => localStorage.getItem(segmentKey) ?? "A",
    setSegment: (s: string) => localStorage.setItem(segmentKey, s),
    getStep: () => parseInt(localStorage.getItem(stepKey) ?? "0", 10),
    setStep: (n: number) => localStorage.setItem(stepKey, String(n)),
    markDone: () => {
      localStorage.setItem(completedKey, "true");
      localStorage.setItem(segmentKey, "done");
      localStorage.removeItem(stepKey);
    },
    resetTour: () => {
      localStorage.removeItem(completedKey);
      localStorage.setItem(segmentKey, "A");
      localStorage.removeItem(stepKey);
    },
  };
}

// ── Context ──────────────────────────────────────────────────────────────────

interface TourEngineContextType {
  active: boolean;
  startTour: (segmentId: string, companyId: number) => void;
  resetAndStart: (companyId: number) => void;
  exit: () => void;
}

const TourEngineContext = createContext<TourEngineContextType | undefined>(
  undefined,
);

export function useTourEngine() {
  const ctx = useContext(TourEngineContext);
  if (!ctx)
    throw new Error("useTourEngine must be used inside TourEngineProvider");
  return ctx;
}

// ── Provider ─────────────────────────────────────────────────────────────────

export function TourEngineProvider({ children }: { children: ReactNode }) {
  const [active, setActive] = useState(false);
  const [segmentId, setSegmentId] = useState<string | null>(null);
  const [stepIndex, setStepIndex] = useState(0);
  const [targetRect, setTargetRect] = useState<DOMRect | null>(null);
  const companyIdRef = useRef<number>(0);

  const pollingRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const observerRef = useRef<ResizeObserver | null>(null);
  const scrollListenerRef = useRef<(() => void) | null>(null);
  const clickHandlerRef = useRef<((e: Event) => void) | null>(null);
  const clickTargetRef = useRef<Element | null>(null);
  const retryTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const retryIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Keep latest values accessible in callbacks without stale closures
  const stepIndexRef = useRef(stepIndex);
  const segmentIdRef = useRef(segmentId);
  useEffect(() => {
    stepIndexRef.current = stepIndex;
  }, [stepIndex]);
  useEffect(() => {
    segmentIdRef.current = segmentId;
  }, [segmentId]);

  // ── Derived ───────────────────────────────────────────────────────────────
  const currentSegment = segmentId
    ? (TOUR_SEGMENTS.find((s) => s.id === segmentId) ?? null)
    : null;
  const steps: TourStep[] = currentSegment?.steps ?? [];
  const currentStep: TourStep | null = steps[stepIndex] ?? null;

  // ── Polling ───────────────────────────────────────────────────────────────
  const stopPolling = useCallback(() => {
    if (pollingRef.current) {
      clearInterval(pollingRef.current);
      pollingRef.current = null;
    }
  }, []);

  const pollForElement = useCallback(
    (selector: string, timeout: number, onFound: () => void) => {
      stopPolling();
      const deadline = Date.now() + timeout;
      pollingRef.current = setInterval(() => {
        if (document.querySelector(selector)) {
          stopPolling();
          onFound();
        } else if (Date.now() > deadline) {
          stopPolling();
        }
      }, 150);
    },
    [stopPolling],
  );

  // ── Rect tracking ─────────────────────────────────────────────────────────
  const cleanupTracking = useCallback(() => {
    observerRef.current?.disconnect();
    observerRef.current = null;
    if (scrollListenerRef.current) {
      window.removeEventListener("scroll", scrollListenerRef.current, true);
      scrollListenerRef.current = null;
    }
    if (retryTimerRef.current) {
      clearTimeout(retryTimerRef.current);
      retryTimerRef.current = null;
    }
  }, []);

  const setupTracking = useCallback(
    (selector: string) => {
      cleanupTracking();

      const trySetup = (attempts = 0) => {
        const el = document.querySelector(selector);
        if (el) {
          // Only scroll if the element is not already visible in the viewport
          const preRect = el.getBoundingClientRect();
          const alreadyVisible =
            preRect.width > 0 &&
            preRect.height > 0 &&
            preRect.top >= 0 &&
            preRect.bottom <= window.innerHeight;
          if (!alreadyVisible) {
            el.scrollIntoView({
              behavior: "smooth",
              block: "nearest",
              inline: "nearest",
            });
          }

          // Wait one frame for layout to settle after scroll
          const afterScroll = () => {
            const rect = el.getBoundingClientRect();
            // If element has no dimensions yet, retry
            if (rect.width === 0 && rect.height === 0 && attempts < 30) {
              retryTimerRef.current = setTimeout(
                () => trySetup(attempts + 1),
                200,
              );
              return;
            }
            setTargetRect(rect);

            // Guard: skip ResizeObserver updates that report zero dimensions
            // (initial observation fires on the next frame and can briefly return
            // zero during a layout recalculation, which would snap the bubble to center)
            const observer = new ResizeObserver(() => {
              const newRect = el.getBoundingClientRect();
              if (newRect.width > 0 && newRect.height > 0) {
                setTargetRect(newRect);
              }
            });
            observer.observe(el);
            observerRef.current = observer;

            const onScroll = () => setTargetRect(el.getBoundingClientRect());
            window.addEventListener("scroll", onScroll, true);
            scrollListenerRef.current = onScroll;
          };
          requestAnimationFrame(() => requestAnimationFrame(afterScroll));
        } else if (attempts < 30) {
          retryTimerRef.current = setTimeout(() => trySetup(attempts + 1), 200);
        }
      };

      trySetup();
    },
    [cleanupTracking],
  );

  // ── Click listener cleanup ────────────────────────────────────────────────
  const cleanupClickListener = useCallback(() => {
    if (clickHandlerRef.current && clickTargetRef.current) {
      clickTargetRef.current.removeEventListener(
        "click",
        clickHandlerRef.current,
      );
      clickHandlerRef.current = null;
      clickTargetRef.current = null;
    }
    if (retryIntervalRef.current) {
      clearInterval(retryIntervalRef.current);
      retryIntervalRef.current = null;
    }
  }, []);

  // ── Advance ───────────────────────────────────────────────────────────────
  const doAdvance = useCallback((fromIdx: number, fromSegId: string) => {
    const seg = TOUR_SEGMENTS.find((s) => s.id === fromSegId);
    if (!seg) return;
    const nextIdx = fromIdx + 1;
    const store = tourStorage(companyIdRef.current);

    if (nextIdx < seg.steps.length) {
      store.setStep(nextIdx);
      setStepIndex(nextIdx);
    } else {
      const nextSeg = NEXT_SEGMENT[fromSegId];
      if (!nextSeg || nextSeg === "done") {
        store.markDone();
      } else {
        store.setSegment(nextSeg);
        store.setStep(0);
      }
      setActive(false);
      setSegmentId(null);
      setStepIndex(0);
      setTargetRect(null);
    }
  }, []);

  // ── Attach action click listener ──────────────────────────────────────────
  useEffect(() => {
    if (!active || !currentStep || currentStep.type !== "action") return;

    cleanupClickListener();

    const attach = () => {
      const el = document.querySelector(currentStep.targetSelector);
      if (!el) return false;

      const handler = () => {
        const waitFor = (currentStep as { waitForElement?: string })
          .waitForElement;
        const timeout =
          (currentStep as { waitTimeout?: number }).waitTimeout ?? 8000;
        if (waitFor) {
          pollForElement(waitFor, timeout, () =>
            doAdvance(stepIndexRef.current, segmentIdRef.current!),
          );
        } else {
          doAdvance(stepIndexRef.current, segmentIdRef.current!);
        }
      };

      el.addEventListener("click", handler, { once: true });
      clickHandlerRef.current = handler;
      clickTargetRef.current = el;
      return true;
    };

    if (!attach()) {
      retryIntervalRef.current = setInterval(() => {
        if (attach()) {
          clearInterval(retryIntervalRef.current!);
          retryIntervalRef.current = null;
        }
      }, 200);
    }

    return () => {
      cleanupClickListener();
      stopPolling();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active, stepIndex, segmentId]);

  // ── Track target rect ─────────────────────────────────────────────────────
  useEffect(() => {
    if (!active || !currentStep?.targetSelector) {
      cleanupTracking();
      setTargetRect(null);
      return;
    }
    setupTracking(currentStep.targetSelector);
    return cleanupTracking;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active, stepIndex, segmentId]);

  // ── Resize handler ────────────────────────────────────────────────────────
  useEffect(() => {
    if (!active || !currentStep?.targetSelector) return;
    const onResize = () => {
      const el = document.querySelector(currentStep.targetSelector!);
      if (el) setTargetRect(el.getBoundingClientRect());
    };
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, [active, currentStep]);

  // ── Public API ────────────────────────────────────────────────────────────
  const startTour = useCallback((sid: string, cid: number) => {
    companyIdRef.current = cid;
    const store = tourStorage(cid);
    const savedStep = store.getStep();
    setSegmentId(sid);
    setStepIndex(savedStep);
    setActive(true);
  }, []);

  const resetAndStart = useCallback((cid: number) => {
    companyIdRef.current = cid;
    tourStorage(cid).resetTour();
    setSegmentId("A");
    setStepIndex(0);
    setActive(true);
  }, []);

  const exit = useCallback(() => {
    cleanupClickListener();
    cleanupTracking();
    stopPolling();
    setActive(false);
    setSegmentId(null);
    setStepIndex(0);
    setTargetRect(null);
  }, [cleanupClickListener, cleanupTracking, stopPolling]);

  const advance = useCallback(() => {
    doAdvance(stepIndexRef.current, segmentIdRef.current!);
  }, [doAdvance]);

  const back = useCallback(() => {
    const prev = stepIndexRef.current - 1;
    if (prev >= 0) {
      tourStorage(companyIdRef.current).setStep(prev);
      setStepIndex(prev);
    }
  }, []);

  return (
    <TourEngineContext.Provider
      value={{ active, startTour, resetAndStart, exit }}
    >
      {children}
      {active && currentStep && (
        <TourOverlay
          step={currentStep}
          targetRect={targetRect}
          stepIndex={stepIndex}
          totalSteps={steps.length}
          onNext={advance}
          onBack={back}
          onExit={exit}
          canGoBack={stepIndex > 0 && steps[stepIndex - 1]?.type === "explain"}
        />
      )}
    </TourEngineContext.Provider>
  );
}
