const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:5000';

// The backend (Render free tier) can take 30-50s to wake from idle sleep, so
// network steps retry on this schedule instead of failing once and giving up.
const RETRY_DELAYS_MS = [0, 8000, 20000, 45000];

async function withRetries<T>(label: string, fn: () => Promise<T>): Promise<T> {
  let lastErr: unknown;
  for (const delay of RETRY_DELAYS_MS) {
    if (delay > 0) await new Promise((r) => setTimeout(r, delay));
    try {
      return await fn();
    } catch (err) {
      lastErr = err;
      console.warn(`[Push] ${label} failed, retrying…`, err);
    }
  }
  throw lastErr;
}

function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  return Promise.race([
    promise,
    new Promise<never>((_, reject) => setTimeout(() => reject(new Error('timeout')), ms)),
  ]);
}

function urlBase64ToUint8Array(base64String: string): Uint8Array {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
  const rawData = window.atob(base64);
  const outputArray = new Uint8Array(rawData.length);
  for (let i = 0; i < rawData.length; ++i) {
    outputArray[i] = rawData.charCodeAt(i);
  }
  return outputArray;
}

async function getVapidPublicKey(): Promise<string | null> {
  if (import.meta.env.VITE_VAPID_PUBLIC_KEY) {
    return import.meta.env.VITE_VAPID_PUBLIC_KEY;
  }
  try {
    return await withRetries('fetch VAPID key', async () => {
      const res = await fetch(`${API_URL}/api/push/vapid-public-key`);
      const data = await res.json();
      if (!data.publicKey) throw new Error('server returned no VAPID key');
      return data.publicKey;
    });
  } catch {
    return null;
  }
}

async function postSubscription(subscription: PushSubscription, token: string): Promise<boolean> {
  const subJson = subscription.toJSON();
  const res = await fetch(`${API_URL}/api/push/subscribe`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({
      endpoint: subJson.endpoint,
      keys: subJson.keys,
    }),
  });
  if (res.ok) return true;
  // 5xx/429 are transient (cold start, rate limit) — throw so withRetries retries
  if (res.status >= 500 || res.status === 429 || res.status === 408) {
    throw new Error(`subscribe endpoint returned ${res.status}`);
  }
  console.error('[Push] backend subscribe failed:', res.status, await res.text());
  return false;
}

// The subscription's key must match the server's current VAPID key — if the
// server key was rotated, the old subscription silently receives nothing.
function matchesServerKey(subscription: PushSubscription, expected: Uint8Array): boolean {
  const current = subscription.options?.applicationServerKey;
  if (!current) return true; // browser doesn't expose it — assume it's fine
  const cur = new Uint8Array(current);
  return cur.length === expected.length && cur.every((b, i) => b === expected[i]);
}

export function isPushSupported(): boolean {
  return 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window;
}

export async function subscribeToPush(token: string): Promise<boolean> {
  if (!isPushSupported()) {
    console.warn('[Push] browser does not support push');
    return false;
  }

  const vapidKey = await getVapidPublicKey();
  if (!vapidKey) {
    console.warn('[Push] no VAPID public key available');
    return false;
  }

  const permission = await Notification.requestPermission();
  if (permission !== 'granted') {
    console.warn('[Push] notification permission denied:', permission);
    return false;
  }

  const registration = await navigator.serviceWorker.ready;
  console.log('[Push] service worker ready, subscribing…');

  const appServerKey = urlBase64ToUint8Array(vapidKey);
  let subscription = await registration.pushManager.getSubscription();
  if (subscription && !matchesServerKey(subscription, appServerKey)) {
    await subscription.unsubscribe().catch(() => {});
    subscription = null;
  }
  if (!subscription) {
    subscription = await registration.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: appServerKey,
    });
  }

  const ok = await withRetries('save subscription', () => postSubscription(subscription!, token));
  if (ok) console.log('[Push] subscription saved to backend');
  return ok;
}

/**
 * Silently re-sync the push subscription on app load. Never prompts for
 * permission — only acts when the user already granted it. Repairs the two
 * silent-death cases: a subscribe that failed while the backend was
 * cold-starting, and a subscription orphaned by a VAPID key rotation.
 */
export async function ensurePushSubscription(token: string): Promise<boolean> {
  if (!isPushSupported()) return false;
  if (Notification.permission !== 'granted') return false;
  try {
    const registration = await withTimeout(navigator.serviceWorker.ready, 10000);
    const vapidKey = await getVapidPublicKey();
    if (!vapidKey) return false;
    const appServerKey = urlBase64ToUint8Array(vapidKey);

    let subscription = await registration.pushManager.getSubscription();
    if (subscription && !matchesServerKey(subscription, appServerKey)) {
      console.warn('[Push] VAPID key changed — re-subscribing');
      await subscription.unsubscribe().catch(() => {});
      subscription = null;
    }
    if (!subscription) {
      subscription = await registration.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: appServerKey,
      });
    }

    const ok = await withRetries('sync subscription', () => postSubscription(subscription!, token));
    if (ok) console.log('[Push] subscription synced to backend');
    return ok;
  } catch (err) {
    console.warn('[Push] ensure subscription failed:', err);
    return false;
  }
}

export async function unsubscribeFromPush(token: string): Promise<void> {
  if (!isPushSupported()) return;
  try {
    const registration = await withTimeout(navigator.serviceWorker.ready, 3000);
    const subscription = await registration.pushManager.getSubscription();
    if (subscription) {
      const endpoint = subscription.endpoint;
      await subscription.unsubscribe();
      await fetch(`${API_URL}/api/push/unsubscribe`, {
        method: 'DELETE',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ endpoint }),
      });
    }
  } catch {
    // Silently fail — fire-and-forget
  }
}

export async function isPushSubscribed(): Promise<boolean> {
  if (!isPushSupported()) return false;
  try {
    const registration = await withTimeout(navigator.serviceWorker.ready, 3000);
    const subscription = await registration.pushManager.getSubscription();
    return !!subscription;
  } catch {
    return false;
  }
}
