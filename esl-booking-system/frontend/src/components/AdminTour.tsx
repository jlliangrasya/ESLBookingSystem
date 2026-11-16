import { useEffect, useRef } from "react";
import { useTourEngine } from "@/context/TourEngine";
import { useTour } from "@/hooks/useTour";
import { useOnboarding } from "@/context/OnboardingContext";

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
  const { status, loading } = useOnboarding();
  const started = useRef(false);

  useEffect(() => {
    if (!autoStart) return;
    if (started.current) return;
    // Wait for onboarding status so an already-set-up account never flashes the
    // welcome tour before we know better.
    if (loading) return;

    // A company with a package, a teacher, and a submitted class record is clearly
    // past setup. The "completed" flag lives in localStorage, so without this the
    // tour would reappear on every new browser/device or after storage is cleared.
    // Marking it done here keeps the manual "Tour" button working as a replay.
    if (status?.account_set_up) {
      if (!tour.isCompleted()) tour.markDone();
      return;
    }

    if (tour.isCompleted()) return;
    if (tour.getSegment() !== segment) return;
    const t = setTimeout(() => {
      started.current = true;
      engine.startTour(segment, companyId);
    }, 700);

    return () => clearTimeout(t);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loading, status?.account_set_up]);

  return null;
}

export function useStartTour(companyId: number) {
  const engine = useTourEngine();
  return () => engine.resetAndStart(companyId);
}
