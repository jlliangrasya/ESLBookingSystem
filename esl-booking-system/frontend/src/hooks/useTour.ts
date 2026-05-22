export function useTour(companyId: number) {
  const completedKey = `tour_completed_${companyId}`;
  const segmentKey   = `tour_segment_${companyId}`;
  const stepKey      = `tour_step_${companyId}`;

  const isCompleted = () => localStorage.getItem(completedKey) === "true";
  const getSegment  = () => localStorage.getItem(segmentKey) ?? "A";
  const setSegment  = (s: string) => localStorage.setItem(segmentKey, s);
  const getStep     = () => parseInt(localStorage.getItem(stepKey) ?? "0", 10);
  const setStep     = (n: number) => localStorage.setItem(stepKey, String(n));
  const markDone    = () => {
    localStorage.setItem(completedKey, "true");
    localStorage.setItem(segmentKey, "done");
    localStorage.removeItem(stepKey);
  };
  const resetTour   = () => {
    localStorage.removeItem(completedKey);
    localStorage.setItem(segmentKey, "A");
    localStorage.removeItem(stepKey);
  };

  return { isCompleted, getSegment, setSegment, getStep, setStep, markDone, resetTour };
}
