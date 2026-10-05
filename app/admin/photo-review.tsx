import { useState } from "react";
import { Alert, Image, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";
import { ScreenContainer } from "@/components/screen-container";
import { getApiBaseUrl } from "@/constants/oauth";
import { useAuth } from "@/lib/auth-context";
import { resolveAuthSession } from "@/lib/resolve-auth-session";

type PhotoReviewRow = {
  id: string;
  user_id: string;
  email: string | null;
  full_name: string | null;
  display_name: string | null;
  role: "customer" | "mechanic" | "admin" | null;
  phone_number: string | null;
  avatar_url: string | null;
  avatar_status: "pending_review" | "approved" | "rejected" | null;
  avatar_submitted_at: string | null;
  avatar_reviewed_at: string | null;
  avatar_reviewed_by: string | null;
  avatar_rejection_reason: string | null;
  updated_at: string | null;
};

type AdminApiResponse = {
  data?: PhotoReviewRow[];
  error?: string;
};

export default function PhotoReviewScreen() {
  const { user } = useAuth();
  const [rows, setRows] = useState<PhotoReviewRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [rejectionReasons, setRejectionReasons] = useState<Record<string, string>>({});
  const [filter, setFilter] = useState<"pending_review" | "all">("pending_review");

  const callAdminApi = async (body: Record<string, unknown>) => {
    const baseUrl = getApiBaseUrl();
    if (!baseUrl) throw new Error("API base URL is unavailable.");
    if (!user?.id) throw new Error("Sign in with an admin account first.");
    const resolved = await resolveAuthSession(user);
    if (!resolved) throw new Error("Could not resolve the current admin session.");
    const res = await fetch(`${baseUrl}/api/admin/photo-verifications`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${resolved.sessionToken}`,
      },
      body: JSON.stringify(body),
    });
    const data = (await res.json().catch(() => ({}))) as AdminApiResponse;
    if (!res.ok) throw new Error(data.error || "Admin request failed");
    return data.data;
  };

  const loadRows = async () => {
    setLoading(true);
    try {
      const data = await callAdminApi({ action: "list" });
      const nextRows = Array.isArray(data) ? data : [];
      setRows(nextRows);
      setRejectionReasons(
        Object.fromEntries(nextRows.map((row) => [row.user_id, row.avatar_rejection_reason || ""])),
      );
    } catch (err: unknown) {
      Alert.alert("Could not load reviews", err instanceof Error ? err.message : "Please try again.");
    } finally {
      setLoading(false);
    }
  };

  const updateStatus = async (userId: string, status: "approved" | "rejected") => {
    if (status === "rejected" && !(rejectionReasons[userId] || "").trim()) {
      Alert.alert("Reason required", "Enter a reason before rejecting a photo.");
      return;
    }
    setLoading(true);
    try {
      await callAdminApi({
        action: "update",
        userId,
        status,
        rejectionReason: rejectionReasons[userId] || "",
      });
      await loadRows();
    } catch (err: unknown) {
      Alert.alert("Could not update status", err instanceof Error ? err.message : "Please try again.");
    } finally {
      setLoading(false);
    }
  };

  const visibleRows = filter === "pending_review" ? rows.filter((r) => r.avatar_status === "pending_review") : rows;

  return (
    <ScreenContainer showBackButton title="Photo Review" containerClassName="bg-background">
      <ScrollView contentContainerStyle={styles.content}>
        <Text style={styles.label}>Admin access</Text>
        <Text style={styles.infoValue}>Signed in as {user?.email || "not signed in"}.</Text>
        <Pressable onPress={loadRows} disabled={loading || !user?.id} style={styles.primaryBtn}>
          <Text style={styles.primaryBtnText}>{loading ? "Working..." : "Load Reviews"}</Text>
        </Pressable>

        <View style={styles.filterRow}>
          <Pressable
            onPress={() => setFilter("pending_review")}
            style={[styles.filterBtn, filter === "pending_review" && styles.filterBtnActive]}
          >
            <Text style={styles.filterBtnText}>Pending</Text>
          </Pressable>
          <Pressable onPress={() => setFilter("all")} style={[styles.filterBtn, filter === "all" && styles.filterBtnActive]}>
            <Text style={styles.filterBtnText}>All ({rows.length})</Text>
          </Pressable>
        </View>

        {visibleRows.map((row) => (
          <View key={row.id} style={styles.card}>
            <View style={styles.cardHeader}>
              <Text style={styles.name}>{row.display_name || row.full_name || row.email || row.user_id}</Text>
              <View style={styles.badges}>
                <Text style={styles.roleBadge}>{row.role || "?"}</Text>
                <Text
                  style={[
                    styles.status,
                    row.avatar_status === "approved" && styles.statusApproved,
                    row.avatar_status === "rejected" && styles.statusRejected,
                  ]}
                >
                  {row.avatar_status || "not_submitted"}
                </Text>
              </View>
            </View>

            {row.avatar_url ? (
              <Image source={{ uri: row.avatar_url }} style={styles.photo} resizeMode="cover" />
            ) : (
              <View style={[styles.photo, styles.photoMissing]}>
                <Text style={styles.missing}>No photo</Text>
              </View>
            )}

            <Info label="Email" value={row.email} />
            <Info label="Phone" value={row.phone_number} />
            <Info label="Submitted" value={row.avatar_submitted_at ? new Date(row.avatar_submitted_at).toLocaleString() : null} />
            <Info label="Reviewed" value={row.avatar_reviewed_at ? new Date(row.avatar_reviewed_at).toLocaleString() : null} />

            <View style={styles.infoRow}>
              <Text style={styles.infoLabel}>Rejection reason</Text>
              <TextInput
                value={rejectionReasons[row.user_id] ?? ""}
                onChangeText={(text) => setRejectionReasons((prev) => ({ ...prev, [row.user_id]: text }))}
                placeholder="Required when rejecting"
                placeholderTextColor="#64748B"
                style={styles.input}
              />
            </View>

            <View style={styles.actions}>
              <Pressable
                onPress={() => updateStatus(row.user_id, "approved")}
                disabled={loading || !row.avatar_url}
                style={[styles.actionBtn, styles.approveBtn]}
              >
                <Text style={styles.actionBtnText}>Approve</Text>
              </Pressable>
              <Pressable onPress={() => updateStatus(row.user_id, "rejected")} disabled={loading} style={[styles.actionBtn, styles.rejectBtn]}>
                <Text style={styles.actionBtnText}>Reject</Text>
              </Pressable>
            </View>
          </View>
        ))}

        {!loading && visibleRows.length === 0 ? (
          <Text style={styles.emptyText}>No photos to review here. Tap “Load Reviews” to fetch the latest.</Text>
        ) : null}
      </ScrollView>
    </ScreenContainer>
  );
}

function Info({ label, value }: { label: string; value?: string | null }) {
  return (
    <View style={styles.infoRow}>
      <Text style={styles.infoLabel}>{label}</Text>
      <Text style={styles.infoValue}>{value || "-"}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  content: { padding: 20, gap: 14, paddingBottom: 40 },
  label: { color: "#94A3B8", fontSize: 13, fontWeight: "800" },
  input: {
    borderWidth: 1,
    borderColor: "#374151",
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    color: "#F8FAFC",
  },
  primaryBtn: { backgroundColor: "#F97316", borderRadius: 10, paddingVertical: 12, alignItems: "center" },
  primaryBtnText: { color: "#FFFFFF", fontWeight: "800" },
  filterRow: { flexDirection: "row", gap: 8 },
  filterBtn: {
    borderWidth: 1,
    borderColor: "#374151",
    borderRadius: 999,
    paddingHorizontal: 14,
    paddingVertical: 8,
  },
  filterBtnActive: { backgroundColor: "#1F2937", borderColor: "#F97316" },
  filterBtnText: { color: "#F8FAFC", fontWeight: "700", fontSize: 12 },
  card: { backgroundColor: "#111827", borderWidth: 1, borderColor: "#243044", borderRadius: 12, padding: 14, gap: 8 },
  cardHeader: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", gap: 12 },
  badges: { flexDirection: "row", gap: 8, alignItems: "center" },
  name: { color: "#F8FAFC", fontSize: 16, fontWeight: "900", flex: 1 },
  roleBadge: {
    color: "#94A3B8",
    fontSize: 11,
    fontWeight: "800",
    borderWidth: 1,
    borderColor: "#334155",
    borderRadius: 6,
    paddingHorizontal: 6,
    paddingVertical: 2,
  },
  status: { color: "#F97316", fontSize: 12, fontWeight: "900" },
  statusApproved: { color: "#34D399" },
  statusRejected: { color: "#F87171" },
  photo: { width: "100%", height: 220, borderRadius: 10, backgroundColor: "#1F2937" },
  photoMissing: { alignItems: "center", justifyContent: "center" },
  missing: { color: "#FB923C", fontWeight: "800" },
  infoRow: { gap: 2 },
  infoLabel: { color: "#94A3B8", fontSize: 11, fontWeight: "800" },
  infoValue: { color: "#E5E7EB", fontSize: 12 },
  actions: { flexDirection: "row", gap: 10, marginTop: 8 },
  actionBtn: { flex: 1, borderRadius: 10, paddingVertical: 10, alignItems: "center" },
  approveBtn: { backgroundColor: "#059669" },
  rejectBtn: { backgroundColor: "#DC2626" },
  actionBtnText: { color: "#FFFFFF", fontWeight: "900" },
  emptyText: { color: "#94A3B8", fontSize: 13, textAlign: "center", marginTop: 20 },
});
