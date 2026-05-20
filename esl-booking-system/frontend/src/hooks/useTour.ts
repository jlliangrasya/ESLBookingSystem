export function useTour(companyId: number) {
  const completedKey = `tour_completed_${companyId}`;
  const segmentKey   = `tour_segment_${companyId}`;

  const isCompleted = () => localStorage.getItem(completedKey) === "true";
  const getSegment  = () => localStorage.getItem(segmentKey) ?? "A";
  const setSegment  = (s: string) => localStorage.setItem(segmentKey, s);
  const markDone    = () => {
    localStorage.setItem(completedKey, "true");
    localStorage.setItem(segmentKey, "done");
  };
  const resetTour   = () => {
    localStorage.removeItem(completedKey);
    localStorage.setItem(segmentKey, "A");
  };

  return { isCompleted, getSegment, setSegment, markDone, resetTour };
}
