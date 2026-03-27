import { useState, useEffect } from "react";
import { Loader2 } from "lucide-react";

const API_URL = import.meta.env.VITE_API_URL;

/**
 * Issue #9: Render free tier cold start handler.
 * Pings the /health endpoint on mount. While the server is waking up,
 * shows a friendly loading screen instead of letting requests fail silently.
 */
export default function ServerWakeUp({ children }: { children: React.ReactNode }) {
  const [ready, setReady] = useState(false);
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    let cancelled = false;

    async function ping() {
      try {
        const res = await fetch(`${API_URL}/health`, { signal: AbortSignal.timeout(5000) });
        if (res.ok && !cancelled) {
          setReady(true);
          return;
        }
      } catch {
        // Server still waking up
      }
      if (!cancelled) {
        setTimeout(() => setAttempt((a) => a + 1), 3000);
      }
    }

    ping();
    return () => { cancelled = true; };
  }, [attempt]);

  if (ready) return <>{children}</>;

  return (
    <div className="min-h-screen flex flex-col items-center justify-center bg-background">
      <div className="flex flex-col items-center gap-4 text-center px-4">
        <Loader2 className="h-10 w-10 animate-spin text-primary" />
        <h2 className="text-xl font-semibold">Starting up...</h2>
        <p className="text-muted-foreground max-w-md">
          The server is waking up. This usually takes 10-30 seconds on the first visit.
          Please wait...
        </p>
        {attempt > 3 && (
          <p className="text-sm text-muted-foreground">
            Still connecting... The server may be under heavy load.
          </p>
        )}
      </div>
    </div>
  );
}
