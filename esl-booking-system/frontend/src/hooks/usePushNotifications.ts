import { useState, useEffect, useCallback } from 'react';
import { isPushSupported, isPushSubscribed, subscribeToPush, unsubscribeFromPush } from '@/utils/pushNotifications';

export function usePushNotifications(token: string | null) {
  const [isSubscribed, setIsSubscribed] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const supported = isPushSupported();

  useEffect(() => {
    if (!supported || !token) return;
    isPushSubscribed().then(setIsSubscribed);
  }, [supported, token]);

  const subscribe = useCallback(async () => {
    if (!token) return false;
    setIsLoading(true);
    try {
      const result = await subscribeToPush(token);
      setIsSubscribed(result);
      return result;
    } finally {
      setIsLoading(false);
    }
  }, [token]);

  const unsubscribe = useCallback(async () => {
    if (!token) return;
    setIsLoading(true);
    try {
      await unsubscribeFromPush(token);
      setIsSubscribed(false);
    } finally {
      setIsLoading(false);
    }
  }, [token]);

  return { supported, isSubscribed, isLoading, subscribe, unsubscribe };
}
