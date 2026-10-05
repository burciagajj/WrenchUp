import { useCallback, useEffect, useRef, useState } from "react";
import { getApiUrl } from "@/lib/api-base-url";

export type PlaceSuggestion = {
  placeId: string;
  description: string;
};

const DEBOUNCE_MS = 300;
const MIN_QUERY_LENGTH = 3;

/**
 * Debounced Google Places Autocomplete suggestions for a free-text address
 * field. Fetches through our own /api/places-autocomplete proxy rather than
 * calling Google directly — see that route for why.
 */
export function usePlacesAutocomplete() {
  const [suggestions, setSuggestions] = useState<PlaceSuggestion[]>([]);
  const [loading, setLoading] = useState(false);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const requestIdRef = useRef(0);

  const search = useCallback((query: string) => {
    if (debounceRef.current) clearTimeout(debounceRef.current);

    const trimmed = query.trim();
    if (trimmed.length < MIN_QUERY_LENGTH) {
      setSuggestions([]);
      setLoading(false);
      return;
    }

    setLoading(true);
    debounceRef.current = setTimeout(async () => {
      const thisRequestId = ++requestIdRef.current;
      try {
        const res = await fetch(getApiUrl(`/api/places-autocomplete?input=${encodeURIComponent(trimmed)}`));
        const data = await res.json().catch(() => null);
        if (thisRequestId !== requestIdRef.current) return; // a newer keystroke superseded this
        setSuggestions(Array.isArray(data?.predictions) ? data.predictions : []);
      } catch {
        if (thisRequestId === requestIdRef.current) setSuggestions([]);
      } finally {
        if (thisRequestId === requestIdRef.current) setLoading(false);
      }
    }, DEBOUNCE_MS);
  }, []);

  const clear = useCallback(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    requestIdRef.current++;
    setSuggestions([]);
    setLoading(false);
  }, []);

  useEffect(() => {
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, []);

  return { suggestions, loading, search, clear };
}
