/**
 * Auth Context Types
 * Shared types for authentication
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

    if (!this.supabaseUrl || !this.supabaseKey) {
      console.warn("[SupabaseAuth] Missing Supabase credentials");
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
      const response = await fetch(url, {
        method,
        headers,
        body: body ? JSON.stringify(body) : undefined,
      });

      const data = await response.json();

      if (!response.ok) {
        throw {
          code: data.error_code || "unknown_error",
          message: data.message || "Authentication failed",
        };
      }

      return data;
    } catch (error) {
      console.error("[SupabaseAuth] API call failed:", error);
      throw error;
    }
  }

  async signUp(
    email: string,
    password: string,
    role: "customer" | "mechanic"
  ): Promise<{ user: AuthUser; session: string }> {
    try {
      const response = await this.apiCall("/signup", "POST", {
        email,
        password,
        data: { role, profileCompleted: false },
      });

      if (!response.user) {
        throw {
          code: "signup_failed",
          message: "Failed to create account",
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
    } catch (error) {
      console.error("[SupabaseAuth] Sign-up failed:", error);
      throw error;
    }
  }

  async signIn(email: string, password: string): Promise<{ user: AuthUser; session: string }> {
    try {
      const response = await this.apiCall("/token?grant_type=password", "POST", {
        email,
        password,
      });

      if (!response.user) {
        throw {
          code: "signin_failed",
          message: "Invalid email or password",
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
    } catch (error) {
      console.error("[SupabaseAuth] Sign-in failed:", error);
      throw error;
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
      const url = `${this.supabaseUrl}/auth/v1/user`;
      const response = await fetch(url, {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
          apikey: this.supabaseKey,
          Authorization: `Bearer ${this.supabaseKey}`,
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
}

export const supabaseAuth = new SupabaseAuthClient();
