import Constants from "expo-constants";
import { Platform } from "react-native";

const API_PORT = 3000;

/** True when running on a physical device / simulator, not web. */
function isNativeClient(): boolean {
  return Platform.OS === "ios" || Platform.OS === "android";
}

/** localhost / 127.0.0.1 won't work from a phone — needs LAN IP or ngrok. */
function isLocalhostUrl(url: string): boolean {
  try {
    const host = new URL(url).hostname;
    return host === "localhost" || host === "127.0.0.1";
  } catch {
    return /localhost|127\.0\.0\.1/i.test(url);
  }
}

/**
 * Host from Expo dev client (Metro), e.g. "192.168.1.4" or "abc.ngrok-free.app".
 * See: Constants.expoConfig.hostUri → "host:8081"
 */
function getExpoDevHost(): string | null {
  const hostUri =
    Constants.expoConfig?.hostUri ??
    (Constants as { manifest2?: { extra?: { expoClient?: { hostUri?: string } } } }).manifest2
      ?.extra?.expoClient?.hostUri ??
    (Constants as { manifest?: { debuggerHost?: string } }).manifest?.debuggerHost;

  if (!hostUri || typeof hostUri !== "string") return null;

  const host = hostUri.split(":")[0]?.trim();
  return host || null;
}

function protocolForHost(host: string): "http" | "https" {
  if (host.includes("ngrok") || host.endsWith(".app") || host.endsWith(".dev")) {
    return "https";
  }
  return "http";
}

/**
 * Build API base URL from the same machine / tunnel Expo uses (port 3000).
 */
function deriveDevApiBaseUrl(): string | null {
  const host = getExpoDevHost();
  if (!host) return null;

  const protocol = protocolForHost(host);
  // ngrok tunnels are usually single-port; user should set EXPO_PUBLIC_API_BASE_URL for ngrok→3000
  if (protocol === "https") {
    return null;
  }

  return `${protocol}://${host}:${API_PORT}`;
}

/**
 * Resolve API server base URL for Express routes (/api/trpc, /api/symptom-diagnose, etc.).
 *
 * Priority:
 * 1. EXPO_PUBLIC_API_BASE_URL (set to current ngrok/LAN URL — update when tunnel restarts)
 * 2. On native, if env is localhost → replace with Expo debugger LAN host:3000
 * 3. Web Manus sandbox hostname swap (8081 → 3000)
 */
export function getApiBaseUrl(): string {
  const fromEnv = (process.env.EXPO_PUBLIC_API_BASE_URL ?? "").replace(/\/$/, "");

  if (fromEnv) {
    if (isNativeClient() && isLocalhostUrl(fromEnv)) {
      const derived = deriveDevApiBaseUrl();
      if (derived) {
        console.log("[api-base-url] Replacing localhost with dev host:", derived);
        return derived;
      }
    }
    return fromEnv;
  }

  if (Platform.OS === "web" && typeof window !== "undefined" && window.location) {
    const { protocol, hostname, port } = window.location;
    if (hostname === "localhost" && port === "8081") {
      return `${protocol}//${hostname}:${API_PORT}`;
    }
    const apiHostname = hostname.replace(/^8081-/, "3000-");
    if (apiHostname !== hostname) {
      return `${protocol}//${apiHostname}`;
    }
  }

  if (isNativeClient()) {
    const derived = deriveDevApiBaseUrl();
    if (derived) return derived;
  }

  return "";
}

/** Full URL for an API path, e.g. "/api/symptom-diagnose". */
export function getApiUrl(path: string): string {
  const base = getApiBaseUrl();
  const normalized = path.startsWith("/") ? path : `/${path}`;
  if (!base) {
    if (Platform.OS === "web") {
      return normalized;
    }
    throw new Error(
      "API server URL not configured. Set EXPO_PUBLIC_API_BASE_URL in .env to your ngrok or LAN URL (e.g. https://YOUR-ID.ngrok-free.app or http://192.168.x.x:3000)."
    );
  }
  return `${base.replace(/\/$/, "")}${normalized}`;
}
