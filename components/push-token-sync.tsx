import { useEffect, useRef } from "react";
import { Platform } from "react-native";
import { useAuth, getSessionToken } from "@/lib/auth-context";
import { ensureValidAccessToken } from "@/lib/profile-session";
import { supabaseUserData } from "@/lib/_core/supabase-user-data";
import { getExpoPushToken } from "@/lib/notifications";

export function PushTokenSync() {
  const { user, isLoading } = useAuth();
  const userId = user?.id ?? null;
  const userEmail = user?.email ?? null;
  const userRole = user?.role ?? null;
  const lastTokenRef = useRef<string | null>(null);
  const lastUserIdRef = useRef<string | null>(null);

  useEffect(() => {
    if (Platform.OS === "web") return;
    if (isLoading || !userId || !userEmail || !userRole) {
      lastUserIdRef.current = null;
      lastTokenRef.current = null;
      return;
    }

    let cancelled = false;

    (async () => {
      try {
        const expoPushToken = await getExpoPushToken();
        if (cancelled || !expoPushToken) return;
        if (lastUserIdRef.current === userId && lastTokenRef.current === expoPushToken) {
          return;
        }

        const storedToken = await getSessionToken();
        if (!storedToken || cancelled) return;
        const sessionToken = await ensureValidAccessToken(storedToken);
        if (cancelled) return;

        const profile = await supabaseUserData.getOrCreateProfile(userId, userRole, sessionToken);
        if (cancelled) return;
        if (profile.expo_push_token === expoPushToken) {
          lastUserIdRef.current = userId;
          lastTokenRef.current = expoPushToken;
          return;
        }

        await supabaseUserData.updateProfile(
          userId,
          { expo_push_token: expoPushToken },
          sessionToken,
          userEmail,
        );
        lastUserIdRef.current = userId;
        lastTokenRef.current = expoPushToken;
      } catch (error) {
        console.warn("[PushTokenSync] Could not sync push token:", error);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [isLoading, userId, userEmail, userRole]);

  return null;
}
