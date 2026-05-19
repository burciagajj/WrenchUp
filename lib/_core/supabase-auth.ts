/**
 * Supabase Auth Helper
 * Handles email/password authentication for v1.5
 * Complements existing OAuth flow without breaking it
 */

export type AuthUser = {
  id: string;
  email: string;
  role: "customer" | "mechanic";
  profileCompleted: boolean;
  emailConfirmed: boolean;
};

export type AuthError = {
  code: string;
  message: string;
};

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

  private async apiCall(
    endpoint: string,
    method: "POST" | "GET" = "POST",
    body?: Record<string, unknown>
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

      const data = await response.json();

      console.log(`[SupabaseAuth] ${method} ${endpoint} - Status: ${response.status}`);
      console.log("  Full Response:", data);

      if (!response.ok) {
        const errorCode = data.error_code || data.error || "unknown_error";
        const errorMsg = data.message || data.error_description || data.msg || "Authentication failed";
        console.error(`[SupabaseAuth] API Error: ${errorCode}`);
        console.error("  Message:", errorMsg);
        console.error("  Full Error Object:", data);
        throw {
          code: errorCode,
          message: errorMsg,
        };
      }

      return data;
    } catch (error: any) {
      console.error("[SupabaseAuth] API call failed:", error);
      console.error("  Error Code:", error?.code);
      console.error("  Error Message:", error?.message);
      console.error("  Full Error:", error);
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

      console.log("[SupabaseAuth] Sign-up response received:", {
        hasUser: !!response.user,
        userId: response.user?.id,
        email: response.user?.email,
        hasSession: !!response.session,
      });

      if (!response.user) {
        const errorMsg = response.error_description || response.message || "Failed to create account";
        console.error("[SupabaseAuth] No user in response:", response);
        throw {
          code: response.error_code || "signup_failed",
          message: errorMsg,
        };
      }

      const emailConfirmed = response.user?.email_confirmed_at !== null;
      console.log("[SupabaseAuth] Sign-up successful:", {
        userId: response.user.id,
        email: response.user.email,
        emailConfirmed,
      });

      return {
        user: {
          id: response.user.id,
          email: response.user.email,
          role,
          profileCompleted: false,
          emailConfirmed,
        },
        session: response.session?.access_token || "",
        refreshToken: response.session?.refresh_token,
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
      const profileCompleted = response.user.user_metadata?.profileCompleted || false;
      const emailConfirmed = response.user?.email_confirmed_at !== null;

      return {
        user: {
          id: response.user.id,
          email: response.user.email,
          role,
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
      const supabaseUser = data.user;

      if (!supabaseUser || !supabaseUser.id) {
        console.warn("[SupabaseAuth] No user found in response");
        return null;
      }

      // Extract user metadata (role, profileCompleted, etc.)
      const metadata = supabaseUser.user_metadata || {};

      const authUser: AuthUser = {
        id: supabaseUser.id,
        email: supabaseUser.email || "",
        role: metadata.role || "customer",
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
