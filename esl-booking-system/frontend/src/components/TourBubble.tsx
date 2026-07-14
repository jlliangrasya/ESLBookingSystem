import { X } from "lucide-react";
import type { TourStep, BubblePlacement } from "@/data/tourSteps";

interface Props {
  step: TourStep;
  targetRect: DOMRect | null;
  stepIndex: number;
  totalSteps: number;
  onNext: () => void;
  onBack: () => void;
  onExit: () => void;
  canGoBack: boolean;
}

const BUBBLE_WIDTH = 320;
const BUBBLE_OFFSET = 14;
const EDGE_MARGIN = 12;
// Estimated bubble height for clamping — actual height varies but this prevents offscreen
const APPROX_BUBBLE_HEIGHT = 260;

function computePosition(
  rect: DOMRect | null,
  placement: BubblePlacement = "bottom"
): React.CSSProperties {
  const isZeroRect = rect && rect.width === 0 && rect.height === 0;

  if (!rect || isZeroRect || placement === "center") {
    return {
      position: "fixed",
      top: "50%",
      left: "50%",
      transform: "translate(-50%, -50%)",
      width: BUBBLE_WIDTH,
      maxWidth: "calc(100vw - 24px)",
    };
  }

  const vw = window.innerWidth;
  const vh = window.innerHeight;

  const cx = rect.left + rect.width / 2;
  // Clamp horizontal so bubble never bleeds off either side
  const clampedLeft = Math.min(
    Math.max(cx - BUBBLE_WIDTH / 2, EDGE_MARGIN),
    vw - BUBBLE_WIDTH - EDGE_MARGIN
  );

  if (placement === "bottom") {
    let top = rect.bottom + BUBBLE_OFFSET;
    // If bubble would go off bottom, flip to top
    if (top + APPROX_BUBBLE_HEIGHT > vh - EDGE_MARGIN) {
      top = Math.max(rect.top - APPROX_BUBBLE_HEIGHT - BUBBLE_OFFSET, EDGE_MARGIN);
    }
    return {
      position: "fixed",
      top: `${top}px`,
      left: `${clampedLeft}px`,
      width: BUBBLE_WIDTH,
      maxWidth: "calc(100vw - 24px)",
    };
  }

  if (placement === "top") {
    let bottom = vh - rect.top + BUBBLE_OFFSET;
    // If bubble would go off top, flip to bottom
    if (vh - bottom - APPROX_BUBBLE_HEIGHT < EDGE_MARGIN) {
      bottom = vh - (rect.bottom + BUBBLE_OFFSET + APPROX_BUBBLE_HEIGHT);
      return {
        position: "fixed",
        top: `${rect.bottom + BUBBLE_OFFSET}px`,
        left: `${clampedLeft}px`,
        width: BUBBLE_WIDTH,
        maxWidth: "calc(100vw - 24px)",
      };
    }
    return {
      position: "fixed",
      bottom: `${bottom}px`,
      left: `${clampedLeft}px`,
      width: BUBBLE_WIDTH,
      maxWidth: "calc(100vw - 24px)",
    };
  }

  if (placement === "left") {
    const right = vw - rect.left + BUBBLE_OFFSET;
    const top = Math.min(
      Math.max(rect.top + rect.height / 2 - APPROX_BUBBLE_HEIGHT / 2, EDGE_MARGIN),
      vh - APPROX_BUBBLE_HEIGHT - EDGE_MARGIN
    );
    // If bubble would bleed off left, show below instead
    if (right + BUBBLE_WIDTH > vw - EDGE_MARGIN) {
      return {
        position: "fixed",
        top: `${rect.bottom + BUBBLE_OFFSET}px`,
        left: `${clampedLeft}px`,
        width: BUBBLE_WIDTH,
        maxWidth: "calc(100vw - 24px)",
      };
    }
    return {
      position: "fixed",
      top: `${top}px`,
      right: `${right}px`,
      width: BUBBLE_WIDTH,
      maxWidth: "calc(100vw - 24px)",
    };
  }

  if (placement === "right") {
    const left = rect.right + BUBBLE_OFFSET;
    const top = Math.min(
      Math.max(rect.top + rect.height / 2 - APPROX_BUBBLE_HEIGHT / 2, EDGE_MARGIN),
      vh - APPROX_BUBBLE_HEIGHT - EDGE_MARGIN
    );
    // If bubble would bleed off right, show below instead
    if (left + BUBBLE_WIDTH > vw - EDGE_MARGIN) {
      return {
        position: "fixed",
        top: `${rect.bottom + BUBBLE_OFFSET}px`,
        left: `${clampedLeft}px`,
        width: BUBBLE_WIDTH,
        maxWidth: "calc(100vw - 24px)",
      };
    }
    return {
      position: "fixed",
      top: `${top}px`,
      left: `${left}px`,
      width: BUBBLE_WIDTH,
      maxWidth: "calc(100vw - 24px)",
    };
  }

  return {
    position: "fixed",
    top: "50%",
    left: "50%",
    transform: "translate(-50%, -50%)",
    width: BUBBLE_WIDTH,
    maxWidth: "calc(100vw - 24px)",
  };
}

function ArrowIndicator({ placement }: { placement: BubblePlacement }) {
  const arrows: Record<BubblePlacement, string> = {
    bottom: "↑",
    top: "↓",
    left: "→",
    right: "←",
    center: "👆",
  };
  return (
    <span
      className="inline-block animate-bounce text-lg"
      style={{ display: "inline-block" }}
    >
      {arrows[placement] ?? "👆"}
    </span>
  );
}

export function TourBubble({
  step,
  targetRect,
  stepIndex,
  totalSteps,
  onNext,
  onBack,
  onExit,
  canGoBack,
}: Props) {
  const effectivePlacement: BubblePlacement =
    (step as { targetSelector?: string }).targetSelector === undefined
      ? "center"
      : (step.placement ?? "bottom");

  const style = computePosition(targetRect, effectivePlacement);
  const isLast = stepIndex === totalSteps - 1;

  return (
    <div
      style={{ ...style, zIndex: 10002 }}
      className="rounded-2xl shadow-2xl overflow-hidden"
    >
      {/* Header */}
      <div className="flex items-start justify-between gap-2 px-4 pt-3 pb-2 bg-gradient-to-r from-[#1a6fa8] to-[#2589c9]">
        <div className="flex-1 min-w-0">
          <div className="text-[10px] font-semibold text-blue-100 uppercase tracking-wider mb-0.5">
            Step {stepIndex + 1} of {totalSteps}
          </div>
          <h3
            className="text-sm font-bold text-white leading-tight"
            dangerouslySetInnerHTML={{ __html: step.title }}
          />
        </div>
        <button
          onClick={onExit}
          className="shrink-0 text-white/60 hover:text-white transition-colors mt-0.5 cursor-pointer"
          aria-label="Close tour"
        >
          <X className="h-4 w-4" />
        </button>
      </div>

      {/* Body */}
      <div className="px-4 py-3 bg-white text-sm text-gray-700 leading-relaxed">
        <div dangerouslySetInnerHTML={{ __html: step.content }} />

        {/* Action hint — shown on action steps */}
        {step.type === "action" && (
          <div className="mt-3 flex items-center gap-2 text-[#1a6fa8] font-semibold text-sm bg-blue-50 border border-blue-100 rounded-lg px-3 py-2">
            <ArrowIndicator placement={effectivePlacement} />
            <span>{step.actionHint}</span>
          </div>
        )}
      </div>

      {/* Footer — only for explain steps */}
      {step.type === "explain" && (
        <div className="px-4 py-3 bg-gray-50 border-t border-gray-100 flex items-center justify-between gap-2">
          {canGoBack ? (
            <button
              onClick={onBack}
              className="text-xs text-gray-500 hover:text-gray-700 transition-colors cursor-pointer"
            >
              ← Back
            </button>
          ) : (
            <span />
          )}
          <button
            onClick={onNext}
            className="text-xs font-semibold px-4 py-1.5 rounded-full bg-gradient-to-r from-[#1a6fa8] to-[#2589c9] text-white hover:opacity-90 transition-opacity shadow-sm cursor-pointer"
          >
            {isLast ? "Got it! ✓" : "Next →"}
          </button>
        </div>
      )}

      {/* Progress bar dots */}
      <div className="flex justify-center gap-1 pb-2 pt-1 bg-white">
        {Array.from({ length: Math.min(totalSteps, 12) }).map((_, i) => (
          <div
            key={i}
            className={`h-1 rounded-full transition-all duration-300 ${
              i === stepIndex
                ? "w-4 bg-[#1a6fa8]"
                : i < stepIndex
                ? "w-1 bg-blue-300"
                : "w-1 bg-gray-200"
            }`}
          />
        ))}
      </div>
    </div>
  );
}
