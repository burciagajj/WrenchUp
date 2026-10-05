import { useState } from "react";
import { Alert, Linking, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";
import { ScreenContainer } from "@/components/screen-container";
import { getApiBaseUrl } from "@/constants/oauth";
import { useAuth } from "@/lib/auth-context";
import { resolveAuthSession } from "@/lib/resolve-auth-session";
import { getCapabilityRequirement } from "@/lib/service-capabilities";

type CapabilityReviewRow = {
  id: string;
  mechanic_user_id: string;
  capability_code: string;
  document_url: string | null;
  status: "pending_review" | "approved" | "rejected";
  rejection_reason: string | null;
  submitted_at: string | null;
  reviewed_at: string | null;
  mechanic_email: string | null;
  mechanic_name: string | null;
};

type AdminApiResponse = {
  data?: CapabilityReviewRow[] | { signedUrl?: string };
  error?: string;
};

/**
 * Reviews mechanic_service_capabilities submissions — e.g. the gas container
 * photo required to unlock fuel_delivery jobs. Generic across capability
 * codes (see lib/service-capabilities.ts), so a future gated service shows
 * up here with no changes to this screen.
 */
export default function CapabilityReviewScreen() {
  const { user } = useAuth();
  const [rows, setRows] = useState<CapabilityReviewRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [rejectionReasons, setRejectionReasons] = useState<Record<string, string>>({});

  const callAdminApi = async (body: Record<string, unknown>) => {
    const baseUrl = getApiBaseUrl();
    if (!baseUrl) throw new Error("API base URL is unavailable.");
    if (!user?.id) throw new Error("Sign in with an admin account first.");
    const resolved = await resolveAuthSession(user);
    if (!resolved) throw new Error("Could not resolve the current admin session.");
    const res = await fetch(`${baseUrl}/api/admin/service-capabilities`, {
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
        Object.fromEntries(nextRows.map((row) => [row.id, row.rejection_reason || ""])),
      );
    } catch (err: unknown) {
      Alert.alert("Could not load reviews", err instanceof Error ? err.message : "Please try again.");
    } finally {
      setLoading(false);
    }
  };

  const openDocument = async (path: string | null) => {
    if (!path) {
      Alert.alert("Photo missing", "This mechanic has not uploaded this photo.");
      return;
    }
    setLoading(true);
    try {
      const data = await callAdminApi({ action: "signed_url", path });
      const signedUrl = !Array.isArray(data) ? data?.signedUrl : null;
      if (!signedUrl) throw new Error("Signed URL was not returned.");
      await Linking.openURL(signedUrl);
    } catch (err: unknown) {
      Alert.alert("Could not open photo", err instanceof Error ? err.message : "Please try again.");
    } finally {
      setLoading(false);
    }
  };

  const updateStatus = async (id: string, status: "approved" | "rejected") => {
    setLoading(true);
    try {
      await callAdminApi({
        action: "update",
        id,
        status,
        rejectionReason: rejectionReasons[id] || "",
      });
      await loadRows();
    } catch (err: unknown) {
      Alert.alert("Could not update status", err instanceof Error ? err.message : "Please try again.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <ScreenContainer showBackButton title="Service Capability Review" containerClassName="bg-background">
      <ScrollView contentContainerStyle={styles.content}>
        <Text style={styles.label}>Admin access</Text>
        <Text style={styles.infoValue}>Signed in as {user?.email || "not signed in"}.</Text>
        <Pressable onPress={loadRows} disabled={loading || !user?.id} style={styles.primaryBtn}>
          <Text style={styles.primaryBtnText}>{loading ? "Working..." : "Load Reviews"}</Text>
        </Pressable>

        {rows.map((row) => {
          const requirement = getCapabilityRequirement(row.capability_code);
          return (
            <View key={row.id} style={styles.card}>
              <View style={styles.cardHeader}>
                <Text style={styles.name}>{row.mechanic_name || row.mechanic_email || row.mechanic_user_id}</Text>
                <Text style={styles.status}>{row.status}</Text>
              </View>
              <Info label="Capability" value={requirement?.label.en ?? row.capability_code} />
              <Info label="Email" value={row.mechanic_email} />
              <Info label="Submitted" value={row.submitted_at ? new Date(row.submitted_at).toLocaleString() : null} />
              <DocumentButton label="Photo" path={row.document_url} onPress={openDocument} />
              <Info label="Reviewed" value={row.reviewed_at ? new Date(row.reviewed_at).toLocaleString() : null} />
              <View style={styles.infoRow}>
                <Text style={styles.infoLabel}>Rejection reason</Text>
                <TextInput
                  value={rejectionReasons[row.id] ?? ""}
                  onChangeText={(text) => setRejectionReasons((prev) => ({ ...prev, [row.id]: text }))}
                  placeholder="Required when rejecting"
                  placeholderTextColor="#64748B"
                  style={styles.input}
                />
              </View>
              <View style={styles.actions}>
                <Pressable onPress={() => updateStatus(row.id, "approved")} disabled={loading} style={[styles.actionBtn, styles.approveBtn]}>
                  <Text style={styles.actionBtnText}>Approve</Text>
                </Pressable>
                <Pressable onPress={() => updateStatus(row.id, "rejected")} disabled={loading} style={[styles.actionBtn, styles.rejectBtn]}>
                  <Text style={styles.actionBtnText}>Reject</Text>
                </Pressable>
              </View>
            </View>
          );
        })}
      </ScrollView>
    </ScreenContainer>
  );
}

function DocumentButton({
  label,
  path,
  onPress,
}: {
  label: string;
  path?: string | null;
  onPress: (path: string | null) => void;
}) {
  return (
    <View style={styles.docRow}>
      <View style={{ flex: 1 }}>
        <Text style={styles.infoLabel}>{label}</Text>
        <Text style={[styles.infoValue, !path && styles.missing]} numberOfLines={1}>
          {path || "Not uploaded"}
        </Text>
      </View>
      <Pressable onPress={() => onPress(path ?? null)} disabled={!path} style={[styles.openBtn, !path && styles.openBtnDisabled]}>
        <Text style={styles.openBtnText}>Open</Text>
      </Pressable>
    </View>
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
  card: { backgroundColor: "#111827", borderWidth: 1, borderColor: "#243044", borderRadius: 12, padding: 14, gap: 8 },
  cardHeader: { flexDirection: "row", justifyContent: "space-between", gap: 12 },
  name: { color: "#F8FAFC", fontSize: 16, fontWeight: "900", flex: 1 },
  status: { color: "#F97316", fontSize: 12, fontWeight: "900" },
  infoRow: { gap: 2 },
  infoLabel: { color: "#94A3B8", fontSize: 11, fontWeight: "800" },
  infoValue: { color: "#E5E7EB", fontSize: 12 },
  missing: { color: "#FB923C", fontWeight: "800" },
  docRow: { flexDirection: "row", alignItems: "center", gap: 10 },
  openBtn: { backgroundColor: "#C2410C", borderRadius: 8, paddingHorizontal: 12, paddingVertical: 8 },
  openBtnDisabled: { backgroundColor: "#334155" },
  openBtnText: { color: "#FFFFFF", fontWeight: "900", fontSize: 12 },
  actions: { flexDirection: "row", gap: 10, marginTop: 8 },
  actionBtn: { flex: 1, borderRadius: 10, paddingVertical: 10, alignItems: "center" },
  approveBtn: { backgroundColor: "#059669" },
  rejectBtn: { backgroundColor: "#DC2626" },
  actionBtnText: { color: "#FFFFFF", fontWeight: "900" },
});
