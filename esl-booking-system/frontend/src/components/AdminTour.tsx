import { useEffect, useRef } from "react";
import { useTourEngine } from "@/context/TourEngine";
import { useTour } from "@/hooks/useTour";

// E and F are legacy segments — profile steps are now embedded in C and D
export type TourSegment = "A" | "B" | "C" | "D" | "E" | "F";

interface Props {
  segment: TourSegment;
  companyId: number;
  autoStart?: boolean;
}

export function AdminTour({ segment, companyId, autoStart = false }: Props) {
  const engine = useTourEngine();
  const tour = useTour(companyId);
  const started = useRef(false);

  useEffect(() => {
    if (!autoStart) return;
    if (tour.isCompleted()) return;
    if (tour.getSegment() !== segment) return;
    if (started.current) return;
    started.current = true;

    const t = setTimeout(() => {
      engine.startTour(segment, companyId);
    }, 700);

    return () => clearTimeout(t);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return null;
}

export function useStartTour(companyId: number) {
  const engine = useTourEngine();
  return () => engine.resetAndStart(companyId);
}
