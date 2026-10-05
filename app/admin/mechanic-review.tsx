import { useState } from "react";
import { Alert, Linking, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";
import { ScreenContainer } from "@/components/screen-container";
import { getApiBaseUrl } from "@/constants/oauth";
import { useAuth } from "@/lib/auth-context";
import { resolveAuthSession } from "@/lib/resolve-auth-session";

type MechanicReviewRow = {
  id: string;
  user_id: string;
  email: string | null;
  full_name: string | null;
  display_name: string | null;
  phone_number: string | null;
  phone_verified_at: string | null;
  verification_status: "pending_review" | "approved" | "rejected" | null;
  id_document_url: string | null;
  insurance_document_url: string | null;
  certification_document_url: string | null;
  business_license_document_url: string | null;
  license_expires_at: string | null;
  insurance_expires_at: string | null;
  reviewed_at: string | null;
  reviewed_by: string | null;
  rejection_reason: string | null;
  mechanic_attested_no_criminal_record: boolean | null;
  mechanic_attested_at: string | null;
  updated_at: string | null;
};

type AdminApiResponse = {
  data?: MechanicReviewRow[] | { signedUrl?: string };
  error?: string;
};

function isExpired(dateValue: string | null): boolean {
  if (!dateValue) return false;
  const expiresAt = new Date(`${dateValue}T23:59:59.999Z`).getTime();
  return Number.isFinite(expiresAt) && expiresAt < Date.now();
}

export default function MechanicReviewScreen() {
  const { user } = useAuth();
  const [rows, setRows] = useState<MechanicReviewRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [rejectionReasons, setRejectionReasons] = useState<Record<string, string>>({});
  const [licenseExpirations, setLicenseExpirations] = useState<Record<string, string>>({});
  const [insuranceExpirations, setInsuranceExpirations] = useState<Record<string, string>>({});

  const callAdminApi = async (body: Record<string, unknown>) => {
    const baseUrl = getApiBaseUrl();
    if (!baseUrl) throw new Error("API base URL is unavailable.");
    if (!user?.id) throw new Error("Sign in with an admin account first.");
    const resolved = await resolveAuthSession(user);
    if (!resolved) throw new Error("Could not resolve the current admin session.");
    const res = await fetch(`${baseUrl}/api/admin/mechanic-verifications`, {
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
      setLicenseExpirations(
        Object.fromEntries(nextRows.map((row) => [row.user_id, row.license_expires_at || ""])),
      );
      setInsuranceExpirations(
        Object.fromEntries(nextRows.map((row) => [row.user_id, row.insurance_expires_at || ""])),
      );
      setRejectionReasons(
        Object.fromEntries(nextRows.map((row) => [row.user_id, row.rejection_reason || ""])),
      );
    } catch (err: unknown) {
      Alert.alert("Could not load reviews", err instanceof Error ? err.message : "Please try again.");
    } finally {
      setLoading(false);
    }
  };

  const openDocument = async (path: string | null) => {
    if (!path) {
      Alert.alert("Document missing", "This mechanic has not uploaded this document.");
      return;
    }
    setLoading(true);
    try {
      const data = await callAdminApi({ action: "signed_url", path });
      const signedUrl = !Array.isArray(data) ? data?.signedUrl : null;
      if (!signedUrl) throw new Error("Signed URL was not returned.");
      await Linking.openURL(signedUrl);
    } catch (err: unknown) {
      Alert.alert("Could not open document", err instanceof Error ? err.message : "Please try again.");
    } finally {
      setLoading(false);
    }
  };

  const updateStatus = async (userId: string, status: "approved" | "rejected") => {
    setLoading(true);
    try {
      await callAdminApi({
        action: "update",
        userId,
        status,
        rejectionReason: rejectionReasons[userId] || "",
        licenseExpiresAt: licenseExpirations[userId] || null,
        insuranceExpiresAt: insuranceExpirations[userId] || null,
      });
      await loadRows();
    } catch (err: unknown) {
      Alert.alert("Could not update status", err instanceof Error ? err.message : "Please try again.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <ScreenContainer showBackButton title="Mechanic Review" containerClassName="bg-background">
      <ScrollView contentContainerStyle={styles.content}>
        <Text style={styles.label}>Admin access</Text>
        <Text style={styles.infoValue}>Signed in as {user?.email || "not signed in"}.</Text>
        <Pressable onPress={loadRows} disabled={loading || !user?.id} style={styles.primaryBtn}>
          <Text style={styles.primaryBtnText}>{loading ? "Working..." : "Load Reviews"}</Text>
        </Pressable>

        {rows.map((row) => {
          const missingLicense = !row.id_document_url;
          const missingInsurance = !row.insurance_document_url;
          const licenseExpired = isExpired(licenseExpirations[row.user_id] || row.license_expires_at);
          const insuranceExpired = isExpired(insuranceExpirations[row.user_id] || row.insurance_expires_at);
          return (
            <View key={row.id} style={styles.card}>
              <View style={styles.cardHeader}>
                <Text style={styles.name}>{row.display_name || row.full_name || row.email || row.user_id}</Text>
                <Text style={styles.status}>{row.verification_status || "not_submitted"}</Text>
              </View>
              <Info label="Email" value={row.email} />
              <Info label="Full name" value={row.full_name} />
              <Info label="Phone" value={`${row.phone_number || "-"} ${row.phone_verified_at ? "(verified)" : "(unverified)"}`} />
              <DocumentButton label="Driver license" path={row.id_document_url} missing={missingLicense} onPress={openDocument} />
              <DateInput
                label="License expires"
                value={licenseExpirations[row.user_id] ?? ""}
                expired={licenseExpired}
                onChangeText={(text) => setLicenseExpirations((prev) => ({ ...prev, [row.user_id]: text }))}
              />
              <DocumentButton label="Insurance" path={row.insurance_document_url} missing={missingInsurance} onPress={openDocument} />
              <DateInput
                label="Insurance expires"
                value={insuranceExpirations[row.user_id] ?? ""}
                expired={insuranceExpired}
                onChangeText={(text) => setInsuranceExpirations((prev) => ({ ...prev, [row.user_id]: text }))}
              />
              <DocumentButton label="Certification" path={row.certification_document_url} missing={false} onPress={openDocument} />
              <DocumentButton label="Business license" path={row.business_license_document_url} missing={false} onPress={openDocument} />
              <Info label="Attested" value={row.mechanic_attested_no_criminal_record ? "yes" : "no"} />
              <Info label="Reviewed" value={row.reviewed_at ? new Date(row.reviewed_at).toLocaleString() : null} />
              {missingLicense || missingInsurance || licenseExpired || insuranceExpired ? (
                <Text style={styles.warning}>
                  {[missingLicense && "missing license", missingInsurance && "missing insurance", licenseExpired && "expired license", insuranceExpired && "expired insurance"]
                    .filter(Boolean)
                    .join(" • ")}
                </Text>
              ) : null}
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
                <Pressable onPress={() => updateStatus(row.user_id, "approved")} disabled={loading} style={[styles.actionBtn, styles.approveBtn]}>
                  <Text style={styles.actionBtnText}>Approve</Text>
                </Pressable>
                <Pressable onPress={() => updateStatus(row.user_id, "rejected")} disabled={loading} style={[styles.actionBtn, styles.rejectBtn]}>
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
  missing,
  onPress,
}: {
  label: string;
  path?: string | null;
  missing: boolean;
  onPress: (path: string | null) => void;
}) {
  return (
    <View style={styles.docRow}>
      <View style={{ flex: 1 }}>
        <Text style={styles.infoLabel}>{label}</Text>
        <Text style={[styles.infoValue, missing && styles.missing]} numberOfLines={1}>
          {path || (missing ? "Missing" : "Not uploaded")}
        </Text>
      </View>
      <Pressable onPress={() => onPress(path ?? null)} disabled={!path} style={[styles.openBtn, !path && styles.openBtnDisabled]}>
        <Text style={styles.openBtnText}>Open</Text>
      </Pressable>
    </View>
  );
}

function DateInput({
  label,
  value,
  expired,
  onChangeText,
}: {
  label: string;
  value: string;
  expired: boolean;
  onChangeText: (value: string) => void;
}) {
  return (
    <View style={styles.infoRow}>
      <Text style={styles.infoLabel}>{label}</Text>
      <TextInput
        value={value}
        onChangeText={onChangeText}
        placeholder="YYYY-MM-DD"
        placeholderTextColor="#64748B"
        style={[styles.input, expired && styles.inputWarning]}
      />
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
  inputWarning: { borderColor: "#F97316" },
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
  warning: { color: "#FDBA74", fontSize: 12, fontWeight: "900" },
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
