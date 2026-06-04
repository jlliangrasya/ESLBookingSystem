import { createPortal } from "react-dom";
import { useEffect, useRef, useState } from "react";
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

const PAD = 10;
const RADIUS = 8;

export function TourOverlay(props: Props) {
  const { step, targetRect } = props;

  // Track viewport size reactively so the SVG always covers the full screen
  const [viewport, setViewport] = useState({
    w: window.innerWidth,
    h: window.innerHeight,
  });
  useEffect(() => {
    const onResize = () =>
      setViewport({ w: window.innerWidth, h: window.innerHeight });
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, []);

  const hasTarget = !!step.targetSelector && !!targetRect;

  // Guard against zero-size rects (element not yet painted)
  const rectIsValid =
    hasTarget &&
    (targetRect!.width > 0 || targetRect!.height > 0);

  const cut = rectIsValid
    ? {
        x: Math.round(targetRect!.left - PAD),
        y: Math.round(targetRect!.top - PAD),
        w: Math.round(targetRect!.width + PAD * 2),
        h: Math.round(targetRect!.height + PAD * 2),
      }
    : null;

  // Unique mask ID per render to avoid conflicts with other SVG masks on page
  const maskId = useRef(
    `tour-mask-${Math.random().toString(36).slice(2)}`
  ).current;

  return createPortal(
    <div
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 9998,
        pointerEvents: "none",
      }}
    >
      {/* Full-viewport SVG dim layer with cut-out spotlight */}
      <svg
        style={{
          position: "fixed",
          inset: 0,
          width: "100vw",
          height: "100vh",
          display: "block",
          overflow: "hidden",
          pointerEvents: "none",
        }}
        // Explicit px dimensions match the viewport state so the mask math is correct
        width={viewport.w}
        height={viewport.h}
      >
        <defs>
          <mask id={maskId}>
            {/* white = visible dim region */}
            <rect
              x={0}
              y={0}
              width={viewport.w}
              height={viewport.h}
              fill="white"
            />
            {/* black = transparent cut-out */}
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

        {/* The dark overlay, punched through by the mask */}
        <rect
          x={0}
          y={0}
          width={viewport.w}
          height={viewport.h}
          fill="rgba(0,0,0,0.6)"
          mask={`url(#${maskId})`}
        />

        {/* Animated highlight ring around the target */}
        {cut && (
          <rect
            x={cut.x}
            y={cut.y}
            width={cut.w}
            height={cut.h}
            rx={RADIUS}
            ry={RADIUS}
            fill="none"
            stroke="#2589c9"
            strokeWidth={2.5}
            opacity={0.9}
          />
        )}
      </svg>

      {/*
        Click pass-through over spotlight: sits above the dim layer (z 9999)
        but lets pointer events reach the underlying DOM element.
        We use pointer-events:none here and let the actual element handle clicks —
        the TourEngine attaches its listener directly to the DOM node, so this
        div just needs to NOT block the element.
      */}
      {cut && (
        <div
          style={{
            position: "fixed",
            left: cut.x,
            top: cut.y,
            width: cut.w,
            height: cut.h,
            pointerEvents: "none", // let clicks fall through to the real element
            zIndex: 9999,
            borderRadius: RADIUS,
            // Subtle pulsing glow to draw attention
            boxShadow: "0 0 0 3px rgba(37,137,201,0.35), 0 0 20px 4px rgba(37,137,201,0.15)",
            animation: "tour-pulse 2s ease-in-out infinite",
          }}
        />
      )}

      {/* Bubble — position:fixed is set on the bubble itself; just re-enable pointer events */}
      <div style={{ pointerEvents: "auto" }}>
        <TourBubble {...props} />
      </div>

      <style>{`
        @keyframes tour-pulse {
          0%, 100% { box-shadow: 0 0 0 3px rgba(37,137,201,0.4), 0 0 20px 4px rgba(37,137,201,0.15); }
          50%       { box-shadow: 0 0 0 5px rgba(37,137,201,0.2), 0 0 28px 8px rgba(37,137,201,0.08); }
        }
      `}</style>
    </div>,
    document.body
  );
}
