/**
 * Supabase Auth Helper
 * Handles email/password authentication for v1.5
 * Complements existing OAuth flow without breaking it
 */

import { trackAnalyticsEvent } from "@/lib/analytics";

export type AuthUser = {
  id: string;
  email: string;
  role: "customer" | "mechanic";
  fullName?: string | null;
  displayName?: string | null;
  profileCompleted: boolean;
  emailConfirmed: boolean;
};

export type AuthError = {
  code: string;
  message: string;
};

const AUTH_ERROR_LOG_WINDOW_MS = 5000;
const authErrorLogCache = new Map<string, number>();

function shouldLogAuthError(key: string): boolean {
  const now = Date.now();
  const prev = authErrorLogCache.get(key) ?? 0;
  if (now - prev < AUTH_ERROR_LOG_WINDOW_MS) return false;
  authErrorLogCache.set(key, now);
  return true;
}

function getAuthUserFromResponse(response: any): any | null {
  if (response?.user?.id) return response.user;
  if (response?.id && response?.email) return response;
  return null;
}

class SupabaseAuthClient {
  private supabaseUrl: string;
  private supabaseKey: string;

  constructor() {
    this.supabaseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL || "";
    this.supabaseKey = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY || "";

    console.log("[SupabaseAuth] Initializing with:");
    console.log("  URL:", this.supabaseUrl ? "✓ Set" : "✗ Missing");
    console.log("  Key:", this.supabaseKey ? "✓ Set" : "✗ Missing");
    console.log("  Full URL:", this.supabaseUrl);
    console.log("  Full Key:", this.supabaseKey?.substring(0, 20) + "...");

    if (!this.supabaseUrl || !this.supabaseKey) {
      console.error("[SupabaseAuth] CRITICAL: Missing Supabase credentials!");
    }
  }

  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  private async apiCall(
    endpoint: string,
    method: "POST" | "GET" = "POST",
    body?: Record<string, unknown>,
    attempt = 0
  ): Promise<any> {
    const url = `${this.supabaseUrl}/auth/v1${endpoint}`;
    const headers: Record<string, string> = {
      "Content-Type": "application/json",
      apikey: this.supabaseKey,
      Authorization: `Bearer ${this.supabaseKey}`,
    };

    try {
      console.log(`[SupabaseAuth] ${method} ${endpoint}`);
      console.log("  URL:", url);
      console.log("  Headers:", { ...headers, Authorization: "[REDACTED]" });
      console.log("  Body:", body);

      const response = await fetch(url, {
        method,
        headers,
        body: body ? JSON.stringify(body) : undefined,
      });

      let data: any = null;
      try {
        data = await response.json();
      } catch {
        data = {};
      }

      console.log(`[SupabaseAuth] ${method} ${endpoint} - Status: ${response.status}`);
      console.log("  Full Response:", data);

      if (!response.ok) {
        const errorCode = data.error_code || data.error || "unknown_error";
        const errorMsg = data.message || data.error_description || data.msg || "Authentication failed";
        const logKey = `${endpoint}|${errorCode}|${response.status}`;
        if (shouldLogAuthError(logKey)) {
          console.error(`[SupabaseAuth] API Error (${response.status}/${errorCode}): ${errorMsg}`);
        }

        // Backoff + retry on Supabase auth throttling
        if (response.status === 429 && errorCode === "over_email_send_rate_limit") {
          throw {
            code: errorCode,
            message: "Verification email limit reached. Please wait a minute, then try again.",
          };
        }

        if (response.status === 429 && attempt < 3) {
          const retryAfterHeader = response.headers.get("retry-after");
          const retryAfterMs = retryAfterHeader ? Number(retryAfterHeader) * 1000 : NaN;
          const base = Number.isFinite(retryAfterMs) ? retryAfterMs : 600;
          const jitter = Math.floor(Math.random() * 250);
          const backoffMs = base + jitter + attempt * 700;
          console.warn(`[SupabaseAuth] Rate limited. Retrying in ${backoffMs}ms (attempt ${attempt + 1}/3)`);
          await this.sleep(backoffMs);
          return this.apiCall(endpoint, method, body, attempt + 1);
        }

        throw {
          code: errorCode,
          message:
            response.status === 429
              ? "Too many authentication attempts. Please wait a moment and try again."
              : errorMsg,
        };
      }

      return data;
    } catch (error: any) {
      const key = `${endpoint}|${error?.code || "unknown"}|${error?.message || "unknown"}`;
      if (shouldLogAuthError(key)) {
        console.error(`[SupabaseAuth] API call failed: ${error?.message || "Unknown error"}`);
      }
      void trackAnalyticsEvent({
        eventName: "auth_failed",
        properties: {
          endpoint,
          method,
          code: error?.code || "unknown",
          message: error?.message || "Unknown auth error",
        },
      });
      throw error;
    }
  }

  async signUp(
    email: string,
    password: string,
    role: "customer" | "mechanic"
  ): Promise<{ user: AuthUser; session: string; refreshToken?: string }> {
    try {
      console.log("[SupabaseAuth] Starting sign-up for:", email);
      
      // Validate inputs
      if (!email || !password) {
        throw {
          code: "invalid_input",
          message: "Email and password are required",
        };
      }

      // Sign up with Supabase Auth
      console.log("[SupabaseAuth] Calling /signup endpoint...");
      const response = await this.apiCall("/signup", "POST", {
        email,
        password,
        data: { role, profileCompleted: false },
      });

      const signupUser = getAuthUserFromResponse(response);

      console.log("[SupabaseAuth] Sign-up response received:", {
        hasUser: !!signupUser,
        userId: signupUser?.id,
        email: signupUser?.email,
        hasSession: !!response.session,
      });

      if (!signupUser) {
        const errorMsg = response.error_description || response.message || "Failed to create account";
        console.error("[SupabaseAuth] No user in response:", response);
        throw {
          code: response.error_code || "signup_failed",
          message: errorMsg,
        };
      }

      const emailConfirmed = signupUser?.email_confirmed_at !== null;
      console.log("[SupabaseAuth] Sign-up successful:", {
        userId: signupUser.id,
        email: signupUser.email,
        emailConfirmed,
      });

      // Session may be nested, at top level, or missing when email confirmation is on
      let accessToken =
        response.session?.access_token || response.access_token || "";
      let refreshToken =
        response.session?.refresh_token || response.refresh_token;

      const authUser: AuthUser = {
        id: signupUser.id,
        email: signupUser.email,
        role,
        fullName: null,
        displayName: null,
        profileCompleted: false,
        emailConfirmed,
      };

      // No session after signup → sign in immediately (works when email confirm is off)
      if (!accessToken) {
        console.log("[SupabaseAuth] No session on signup, attempting sign-in...");
        try {
          const signInResult = await this.signIn(email, password);
          accessToken = signInResult.session;
          refreshToken = signInResult.refreshToken;
          authUser.emailConfirmed = signInResult.user.emailConfirmed;
          console.log("[SupabaseAuth] Sign-in after signup succeeded");
        } catch (signInErr: any) {
          console.warn("[SupabaseAuth] Sign-in after signup failed:", signInErr?.message);
        }
      }

      return {
        user: authUser,
        session: accessToken,
        refreshToken,
      };
    } catch (error: any) {
      console.error("[SupabaseAuth] Sign-up failed:", {
        code: error?.code,
        message: error?.message,
        fullError: error,
      });
      // Return the error with real Supabase message if available
      throw {
        code: error?.code || "signup_failed",
        message: error?.message || "Failed to create account",
      };
    }
  }

  async signUpForVerification(
    email: string,
    password: string,
    role: "customer" | "mechanic",
    identity?: { fullName?: string; displayName?: string }
  ): Promise<AuthUser> {
    try {
      console.log("[SupabaseAuth] Starting verification-only sign-up for:", email);

      if (!email || !password) {
        throw {
          code: "invalid_input",
          message: "Email and password are required",
        };
      }

      const metadata = {
        role,
        profileCompleted: false,
        full_name: identity?.fullName,
        display_name: identity?.displayName,
      };

      const response = await this.apiCall("/signup", "POST", {
        email,
        password,
        data: metadata,
      });

      const signupUser = getAuthUserFromResponse(response);

      if (!signupUser) {
        const errorMsg = response.error_description || response.message || "Failed to create account";
        console.error("[SupabaseAuth] No user in verification-only response:", response);
        throw {
          code: response.error_code || "signup_failed",
          message: errorMsg,
        };
      }

      return {
        id: signupUser.id,
        email: signupUser.email,
        role,
        fullName: identity?.fullName ?? null,
        displayName: identity?.displayName ?? identity?.fullName ?? null,
        profileCompleted: false,
        emailConfirmed: signupUser?.email_confirmed_at !== null,
      };
    } catch (error: any) {
      console.error("[SupabaseAuth] Verification-only sign-up failed:", {
        code: error?.code,
        message: error?.message,
        fullError: error,
      });
      throw {
        code: error?.code || "signup_failed",
        message: error?.message || "Failed to create account",
      };
    }
  }

  async signIn(email: string, password: string): Promise<{ user: AuthUser; session: string; refreshToken?: string }> {
    try {
      const response = await this.apiCall("/token?grant_type=password", "POST", {
        email,
        password,
      });

      if (!response.user) {
        const errorMsg = response.error_description || response.message || "Invalid email or password";
        throw {
          code: response.error_code || "signin_failed",
          message: errorMsg,
        };
      }

      const role = response.user.user_metadata?.role || "customer";
      const fullName = response.user.user_metadata?.full_name || null;
      const displayName = response.user.user_metadata?.display_name || fullName;
      let profileCompleted = response.user.user_metadata?.profileCompleted || false;
      const emailConfirmed = response.user?.email_confirmed_at !== null;

      // user_metadata.profileCompleted is written by a multi-step client flow
      // (docs upload -> profile save -> mark complete) that can partially
      // fail partway through, leaving it permanently false even though the
      // user_profiles row (the actual source of truth, e.g. after an admin
      // approves a mechanic) shows the profile is genuinely done. Fall back
      // to the DB signal so a stuck flag can't loop someone back into
      // onboarding forever, and self-heal the metadata so this only costs
      // one extra request per affected account.
      if (!profileCompleted && response.access_token) {
        try {
          const profileRes = await fetch(
            `${this.supabaseUrl}/rest/v1/user_profiles?user_id=eq.${response.user.id}&select=completed_at,verification_status`,
            {
              headers: {
                apikey: this.supabaseKey,
                Authorization: `Bearer ${response.access_token}`,
              },
            },
          );
          const rows = profileRes.ok ? await profileRes.json().catch(() => []) : [];
          const row = Array.isArray(rows) ? rows[0] : null;
          const dbSaysComplete = Boolean(row?.completed_at) || row?.verification_status === "approved";
          if (dbSaysComplete) {
            profileCompleted = true;
            void this.updateUserMetadataWithToken(response.access_token, { profileCompleted: true }).catch(() => {});
          }
        } catch {
          // Non-fatal — sign-in proceeds with the metadata-only value.
        }
      }

      return {
        user: {
          id: response.user.id,
          email: response.user.email,
          role,
          fullName,
          displayName,
          profileCompleted,
          emailConfirmed,
        },
        session: response.access_token || "",
        refreshToken: response.refresh_token,
      };
    } catch (error: any) {
      console.error("[SupabaseAuth] Sign-in failed:", error);
      throw {
        code: error?.code || "signin_failed",
        message: error?.message || "Invalid email or password",
      };
    }
  }

  /**
   * Refresh an expired session token using refresh token
   * Supabase stores refresh_token in the response during signup/signin
   * This method attempts to get a new access token
   */
  async refreshSession(refreshToken: string): Promise<{ access_token: string; refresh_token: string }> {
    try {
      if (!refreshToken) {
        throw {
          code: "no_refresh_token",
          message: "No refresh token available",
        };
      }

      console.log("[SupabaseAuth] Attempting to refresh session...");

      const response = await this.apiCall("/token?grant_type=refresh_token", "POST", {
        refresh_token: refreshToken,
      });

      if (!response.access_token) {
        console.error("[SupabaseAuth] No access token in refresh response:", response);
        throw {
          code: "refresh_failed",
          message: "Failed to refresh session",
        };
      }

      console.log("[SupabaseAuth] Session refreshed successfully");

      return {
        access_token: response.access_token,
        refresh_token: response.refresh_token || refreshToken,
      };
    } catch (error: any) {
      console.error("[SupabaseAuth] Session refresh failed:", error);
      throw {
        code: error?.code || "refresh_failed",
        message: error?.message || "Failed to refresh session",
      };
    }
  }

  async resetPassword(email: string): Promise<void> {
    try {
      await this.apiCall("/recover", "POST", { email });
    } catch (error) {
      console.error("[SupabaseAuth] Password reset failed:", error);
      throw error;
    }
  }

  async requestPhoneOtp(phone: string): Promise<void> {
    try {
      await this.apiCall("/otp", "POST", {
        phone,
        channel: "sms",
        create_user: false,
      });
    } catch (error: any) {
      console.error("[SupabaseAuth] Phone OTP request failed:", error);
      throw {
        code: error?.code || "phone_otp_failed",
        message: error?.message || "Could not send phone verification code",
      };
    }
  }

  async verifyPhoneOtp(phone: string, token: string): Promise<void> {
    try {
      await this.apiCall("/verify", "POST", {
        phone,
        token,
        type: "sms",
      });
    } catch (error: any) {
      console.error("[SupabaseAuth] Phone OTP verification failed:", error);
      throw {
        code: error?.code || "phone_verify_failed",
        message: error?.message || "Could not verify phone code",
      };
    }
  }

  async updateUserMetadata(userId: string, metadata: Record<string, unknown>): Promise<void> {
    try {
      const token = await this.getSessionToken();
      if (!token) {
        throw { code: "no_session", message: "No active session" };
      }

      const url = `${this.supabaseUrl}/auth/v1/user`;
      const response = await fetch(url, {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
          apikey: this.supabaseKey,
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ data: metadata }),
      });

      if (!response.ok) {
        const error = await response.json();
        throw {
          code: error.error_code || "update_failed",
          message: error.message || "Failed to update profile",
        };
      }
    } catch (error) {
      console.error("[SupabaseAuth] Update metadata failed:", error);
      throw error;
    }
  }

  async updateUserMetadataWithToken(sessionToken: string, metadata: Record<string, unknown>): Promise<void> {
    try {
      if (!sessionToken) {
        throw { code: "no_session", message: "No active session" };
      }

      const url = `${this.supabaseUrl}/auth/v1/user`;
      const response = await fetch(url, {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
          apikey: this.supabaseKey,
          Authorization: `Bearer ${sessionToken}`,
        },
        body: JSON.stringify({ data: metadata }),
      });

      if (!response.ok) {
        const error = await response.json();
        throw {
          code: error.error_code || "update_failed",
          message: error.message || "Failed to update profile",
        };
      }
    } catch (error) {
      console.error("[SupabaseAuth] Update metadata with token failed:", error);
      throw error;
    }
  }

  async getSessionToken(): Promise<string | null> {
    // This will be implemented in the store/auth provider
    // For now, return null (token will be managed by useAuth hook)
    return null;
  }

  async resendVerificationEmail(email: string): Promise<void> {
    try {
      await this.apiCall("/resend", "POST", { email, type: "signup" });
      console.log("[SupabaseAuth] Verification email resent to:", email);
    } catch (error: any) {
      console.error("[SupabaseAuth] Resend verification email failed:", error);
      throw {
        code: error?.code || "resend_failed",
        message: error?.message || "Failed to resend verification email",
      };
    }
  }

  /**
   * Get current authenticated user from Supabase Auth endpoint
   * Requires a valid session token (JWT)
   */
  async getCurrentUser(sessionToken: string): Promise<AuthUser | null> {
    try {
      if (!sessionToken) {
        console.warn("[SupabaseAuth] getCurrentUser called without session token");
        return null;
      }

      const url = `${this.supabaseUrl}/auth/v1/user`;
      console.log("[SupabaseAuth] Fetching current user from:", url);

      const response = await fetch(url, {
        method: "GET",
        headers: {
          "Content-Type": "application/json",
          apikey: this.supabaseKey,
          Authorization: `Bearer ${sessionToken}`,
        },
      });

      if (!response.ok) {
        const error = await response.json();
        console.error("[SupabaseAuth] Failed to fetch current user:", error);
        return null;
      }

      const data = await response.json();
      // GET /auth/v1/user returns the user object directly (not always wrapped in .user)
      const supabaseUser = data.user ?? data;

      if (!supabaseUser?.id) {
        console.warn("[SupabaseAuth] No user found in response");
        return null;
      }

      const metadata = supabaseUser.user_metadata || supabaseUser.raw_user_meta_data || {};

      const authUser: AuthUser = {
        id: supabaseUser.id,
        email: supabaseUser.email || "",
        role: metadata.role || "customer",
        fullName: metadata.full_name || null,
        displayName: metadata.display_name || metadata.full_name || null,
        profileCompleted: metadata.profileCompleted || false,
        emailConfirmed: supabaseUser.email_confirmed_at !== null,
      };

      console.log("[SupabaseAuth] Current user fetched:", {
        id: authUser.id,
        email: authUser.email,
        role: authUser.role,
      });

      return authUser;
    } catch (error: any) {
      console.error("[SupabaseAuth] getCurrentUser failed:", error);
      return null;
    }
  }

  async checkEmailConfirmed(sessionToken: string): Promise<boolean> {
    try {
      const url = `${this.supabaseUrl}/auth/v1/user`;
      const response = await fetch(url, {
        method: "GET",
        headers: {
          "Content-Type": "application/json",
          apikey: this.supabaseKey,
          Authorization: `Bearer ${sessionToken}`,
        },
      });

      if (!response.ok) {
        console.error("[SupabaseAuth] Failed to check email confirmation status");
        return false;
      }

      const data = await response.json();
      const emailConfirmed = data.user?.email_confirmed_at !== null;
      console.log("[SupabaseAuth] Email confirmed:", emailConfirmed);
      return emailConfirmed;
    } catch (error: any) {
      console.error("[SupabaseAuth] Check email confirmed failed:", error);
      return false;
    }
  }
}

export const supabaseAuth = new SupabaseAuthClient();
