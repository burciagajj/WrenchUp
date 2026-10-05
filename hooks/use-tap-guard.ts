import { useCallback, useRef } from "react";

// Rapidly tapping a button whose onPress does async work (a network call,
// etc.) before navigating can re-enter the handler multiple times before the
// first call's state/navigation lands — each re-entry stacking its own
// screen. This wraps an async handler so a tap is ignored while a previous
// invocation from the same guard is still in flight.
export function useTapGuard() {
  const busyRef = useRef(false);

  return useCallback(<Args extends unknown[]>(fn: (...args: Args) => Promise<void> | void) => {
    return async (...args: Args) => {
      if (busyRef.current) return;
      busyRef.current = true;
      try {
        await fn(...args);
      } finally {
        busyRef.current = false;
      }
    };
  }, []);
}
