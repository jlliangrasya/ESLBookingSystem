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
const BUBBLE_OFFSET = 16;

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
      maxWidth: "90vw",
    };
  }

  const vw = window.innerWidth;
  const vh = window.innerHeight;

  let top: number | undefined;
  let left: number | undefined;
  let bottom: number | undefined;
  let right: number | undefined;
  let transform = "";

  const cx = rect.left + rect.width / 2;

  if (placement === "bottom") {
    top = rect.bottom + BUBBLE_OFFSET;
    left = Math.min(Math.max(cx - BUBBLE_WIDTH / 2, 12), vw - BUBBLE_WIDTH - 12);
  } else if (placement === "top") {
    bottom = vh - rect.top + BUBBLE_OFFSET;
    left = Math.min(Math.max(cx - BUBBLE_WIDTH / 2, 12), vw - BUBBLE_WIDTH - 12);
  } else if (placement === "left") {
    top = rect.top + rect.height / 2;
    right = vw - rect.left + BUBBLE_OFFSET;
    transform = "translateY(-50%)";
  } else if (placement === "right") {
    top = rect.top + rect.height / 2;
    left = rect.right + BUBBLE_OFFSET;
    transform = "translateY(-50%)";
  }

  return {
    position: "fixed",
    top: top !== undefined ? `${top}px` : undefined,
    bottom: bottom !== undefined ? `${bottom}px` : undefined,
    left: left !== undefined ? `${left}px` : undefined,
    right: right !== undefined ? `${right}px` : undefined,
    transform: transform || undefined,
    width: BUBBLE_WIDTH,
    maxWidth: "90vw",
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
      className="inline-block animate-bounce text-xl"
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
  const placement: BubblePlacement =
    step.targetSelector === undefined
      ? "center"
      : (step.placement ?? "bottom");

  const style = computePosition(targetRect, placement);
  const isLast = stepIndex === totalSteps - 1;

  return (
    <div
      style={{ ...style, zIndex: 10001 }}
      className="rounded-2xl shadow-2xl border border-white/20 overflow-hidden"
    >
      {/* Header */}
      <div className="flex items-start justify-between gap-2 px-4 pt-4 pb-2 bg-gradient-to-r from-[#1a6fa8] to-[#2589c9]">
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
          className="shrink-0 text-white/60 hover:text-white transition-colors mt-0.5"
          aria-label="Close tour"
        >
          <X className="h-4 w-4" />
        </button>
      </div>

      {/* Body */}
      <div className="px-4 py-3 bg-white text-sm text-gray-700 leading-relaxed">
        <div dangerouslySetInnerHTML={{ __html: step.content }} />

        {/* Action hint */}
        {step.type === "action" && (
          <div className="mt-3 flex items-center gap-2 text-[#1a6fa8] font-semibold text-sm bg-blue-50 rounded-lg px-3 py-2">
            <ArrowIndicator placement={placement} />
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
              className="text-xs text-gray-500 hover:text-gray-700 transition-colors"
            >
              ← Back
            </button>
          ) : (
            <span />
          )}
          <button
            onClick={onNext}
            className="text-xs font-semibold px-4 py-1.5 rounded-full bg-gradient-to-r from-[#1a6fa8] to-[#2589c9] text-white hover:opacity-90 transition-opacity shadow-sm"
          >
            {isLast ? "Got it! ✓" : "Next →"}
          </button>
        </div>
      )}

      {/* Progress dots */}
      <div className="flex justify-center gap-1 pb-2 bg-white">
        {Array.from({ length: Math.min(totalSteps, 10) }).map((_, i) => (
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
