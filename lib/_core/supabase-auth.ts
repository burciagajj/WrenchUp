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
  ): Promise<{ user: AuthUser; session: string }> {
    try {
      // Sign up with Supabase Auth
      const response = await this.apiCall("/signup", "POST", {
        email,
        password,
        data: { role, profileCompleted: false },
      });

      if (!response.user) {
        const errorMsg = response.error_description || response.message || "Failed to create account";
        throw {
          code: response.error_code || "signup_failed",
          message: errorMsg,
        };
      }

      return {
        user: {
          id: response.user.id,
          email: response.user.email,
          role,
          profileCompleted: false,
        },
        session: response.session?.access_token || "",
      };
    } catch (error: any) {
      console.error("[SupabaseAuth] Sign-up failed:", error);
      // Return the error with real Supabase message if available
      throw {
        code: error?.code || "signup_failed",
        message: error?.message || "Failed to create account",
      };
    }
  }

  async signIn(email: string, password: string): Promise<{ user: AuthUser; session: string }> {
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

      return {
        user: {
          id: response.user.id,
          email: response.user.email,
          role,
          profileCompleted,
        },
        session: response.access_token || "",
      };
    } catch (error: any) {
      console.error("[SupabaseAuth] Sign-in failed:", error);
      throw {
        code: error?.code || "signin_failed",
        message: error?.message || "Invalid email or password",
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
}

export const supabaseAuth = new SupabaseAuthClient();
