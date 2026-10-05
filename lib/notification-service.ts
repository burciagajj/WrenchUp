type SupabaseMethod = "GET" | "POST" | "PATCH";

export function getNotificationServiceConfig() {
  return {
    supabaseUrl: process.env.EXPO_PUBLIC_SUPABASE_URL || "",
    serviceKey: process.env.SUPABASE_SERVICE_ROLE_KEY || "",
  };
}

export async function supabaseRest<T = unknown>(
  endpoint: string,
  method: SupabaseMethod,
  serviceKey: string,
  body?: Record<string, unknown>,
): Promise<T | null> {
  const { supabaseUrl } = getNotificationServiceConfig();
  const res = await fetch(`${supabaseUrl}/rest/v1${endpoint}`, {
    method,
    headers: {
      "Content-Type": "application/json",
      Prefer: "return=representation",
      apikey: serviceKey,
      Authorization: `Bearer ${serviceKey}`,
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  let data: unknown = null;
  if (text) {
    try {
      data = JSON.parse(text);
    } catch {
      data = { message: text };
    }
  }
  if (!res.ok) {
    throw new Error(
      typeof data === "object" && data && "message" in data
        ? String((data as { message?: unknown }).message ?? `Supabase request failed (${res.status})`)
        : `Supabase request failed (${res.status})`,
    );
  }
  return data as T | null;
}

export async function getCurrentUserId(
  supabaseUrl: string,
  serviceKey: string,
  sessionToken: string,
): Promise<string | null> {
  const user = await getCurrentUserAuth(supabaseUrl, serviceKey, sessionToken);
  return user?.id ?? null;
}

export async function getCurrentUserAuth(
  supabaseUrl: string,
  serviceKey: string,
  sessionToken: string,
): Promise<{ id: string; email: string | null } | null> {
  const res = await fetch(`${supabaseUrl}/auth/v1/user`, {
    headers: {
      apikey: serviceKey,
      Authorization: `Bearer ${sessionToken}`,
    },
  });
  if (!res.ok) return null;
  const user = await res.json().catch(() => null);
  return user?.id ? { id: String(user.id), email: typeof user.email === "string" ? user.email : null } : null;
}

async function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

class RetryablePushError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "RetryablePushError";
  }
}

export async function sendExpoPush(
  token: string,
  title: string,
  body: string,
  data: Record<string, unknown>,
): Promise<void> {
  let lastError: unknown = null;
  for (let attempt = 0; attempt < 3; attempt += 1) {
    try {
      const res = await fetch("https://exp.host/--/api/v2/push/send", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Accept: "application/json",
        },
        body: JSON.stringify({
          to: token,
          sound: "default",
          title,
          body,
          data,
        }),
      });
      const text = await res.text();
      if (!res.ok) {
        const message = text || `Expo push failed (${res.status})`;
        if (res.status >= 500) {
          throw new RetryablePushError(message);
        }
        throw new Error(message);
      }
      return;
    } catch (error) {
      lastError = error;
      const retryable = error instanceof RetryablePushError || error instanceof TypeError;
      if (attempt < 2 && retryable) {
        await sleep(250 * (attempt + 1));
        continue;
      }
      throw lastError instanceof Error ? lastError : new Error("Expo push failed");
    }
  }
}
