import { createPortal } from "react-dom";
import { TourBubble } from "./TourBubble";
import type { TourStep } from "@/data/tourSteps";

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

const PAD = 8;
const RADIUS = 8;

export function TourOverlay(props: Props) {
  const { step, targetRect } = props;
  const hasTarget = !!step.targetSelector && !!targetRect;

  const vw = typeof window !== "undefined" ? window.innerWidth : 1920;
  const vh = typeof window !== "undefined" ? window.innerHeight : 1080;

  const cut = hasTarget
    ? {
        x: targetRect!.left - PAD,
        y: targetRect!.top - PAD,
        w: targetRect!.width + PAD * 2,
        h: targetRect!.height + PAD * 2,
      }
    : null;

  return createPortal(
    <div
      style={{ position: "fixed", inset: 0, zIndex: 9998, pointerEvents: "none" }}
    >
      {/* Dim overlay with spotlight cut-out */}
      <svg
        width={vw}
        height={vh}
        style={{ position: "absolute", inset: 0, display: "block" }}
      >
        <defs>
          <mask id="tour-spotlight-mask">
            {/* white = show dim */}
            <rect x={0} y={0} width={vw} height={vh} fill="white" />
            {/* black = cut-out (transparent) */}
            {cut && (
              <rect
                x={cut.x}
                y={cut.y}
                width={cut.w}
                height={cut.h}
                rx={RADIUS}
                ry={RADIUS}
                fill="black"
              />
            )}
          </mask>
        </defs>
        <rect
          x={0}
          y={0}
          width={vw}
          height={vh}
          fill="rgba(0,0,0,0.65)"
          mask="url(#tour-spotlight-mask)"
        />
        {/* Highlight ring around the target */}
        {cut && (
          <rect
            x={cut.x}
            y={cut.y}
            width={cut.w}
            height={cut.h}
            rx={RADIUS}
            ry={RADIUS}
            fill="none"
            stroke="rgba(37,137,201,0.8)"
            strokeWidth={2}
          />
        )}
      </svg>

      {/* Pass-through click area over the spotlight — lets user interact with target */}
      {cut && (
        <div
          style={{
            position: "absolute",
            left: cut.x,
            top: cut.y,
            width: cut.w,
            height: cut.h,
            pointerEvents: "auto",
            zIndex: 9999,
          }}
        />
      )}

      {/* The bubble itself — always interactive */}
      <div style={{ pointerEvents: "auto" }}>
        <TourBubble {...props} />
      </div>
    </div>,
    document.body
  );
}
