import { useMemo, useState, type Dispatch, type SetStateAction } from "react";
import { Alert, Linking, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";
import { ScreenContainer } from "@/components/screen-container";
import { getApiBaseUrl } from "@/constants/oauth";
import { useAuth } from "@/lib/auth-context";
import { resolveAuthSession } from "@/lib/resolve-auth-session";

type AdminQueueItem = {
  id: string;
  created_at: string;
  request_id: string | null;
  user_id?: string | null;
  role?: string | null;
  status: string;
  reason?: string | null;
  report_type?: string | null;
  flag_type?: string | null;
  severity?: string | null;
  message?: string | null;
  admin_notes?: string | null;
};

type ServiceRequestSummary = {
  id: string;
  customer_name: string | null;
  assigned_mechanic_name: string | null;
  service_code: string | null;
  vehicle_label: string | null;
  location_label: string | null;
  status: string | null;
  payment_state: string | null;
  offered_price: number | null;
  currency: string | null;
  before_photo_signed_url?: string | null;
  after_photo_signed_url?: string | null;
  mechanic_accepted_at: string | null;
  customer_accepted_quote_at: string | null;
  mechanic_enroute_at: string | null;
  mechanic_arrived_at: string | null;
  job_started_at: string | null;
  job_completed_at: string | null;
};

type QueueResponse = {
  disputes: AdminQueueItem[];
  safetyReports: AdminQueueItem[];
  safetyFlags: AdminQueueItem[];
  requests: ServiceRequestSummary[];
};

type AdminApiResponse = {
  data?: QueueResponse;
  error?: string;
};

export default function AdminSafetyScreen() {
  const { user } = useAuth();
  const [loading, setLoading] = useState(false);
  const [queue, setQueue] = useState<QueueResponse | null>(null);
  const [notes, setNotes] = useState<Record<string, string>>({});

  const requestsById = useMemo(() => {
    const entries = (queue?.requests ?? []).map((request) => [request.id, request] as const);
    return new Map(entries);
  }, [queue?.requests]);

  const callAdminApi = async (body: Record<string, unknown>) => {
    const baseUrl = getApiBaseUrl();
    if (!baseUrl) throw new Error("API base URL is unavailable.");
    if (!user?.id) throw new Error("Sign in with an admin account first.");
    const resolved = await resolveAuthSession(user);
    if (!resolved) throw new Error("Could not resolve the current admin session.");
    const res = await fetch(`${baseUrl}/api/admin/safety`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${resolved.sessionToken}`,
      },
      body: JSON.stringify(body),
    });
    const data = (await res.json().catch(() => ({}))) as AdminApiResponse;
    if (!res.ok) throw new Error(data.error || "Admin safety request failed");
    return data.data;
  };

  const loadQueue = async () => {
    setLoading(true);
    try {
      const data = await callAdminApi({ action: "list" });
      if (!data) throw new Error("No queue data returned");
      setQueue(data);
      const allRows = [...data.disputes, ...data.safetyReports, ...data.safetyFlags];
      setNotes(Object.fromEntries(allRows.map((row) => [row.id, row.admin_notes || ""])));
    } catch (error) {
      Alert.alert("Could not load safety queue", error instanceof Error ? error.message : "Please try again.");
    } finally {
      setLoading(false);
    }
  };

  const updateItem = async (action: string, id: string, status: string) => {
    setLoading(true);
    try {
      await callAdminApi({ action, id, status, adminNotes: notes[id] || "" });
      await loadQueue();
    } catch (error) {
      Alert.alert("Could not update item", error instanceof Error ? error.message : "Please try again.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <ScreenContainer showBackButton title="Safety Queue" containerClassName="bg-background">
      <ScrollView contentContainerStyle={styles.content}>
        <View style={styles.headerCard}>
          <Text style={styles.label}>Admin access</Text>
          <Text style={styles.value}>Signed in as {user?.email || "not signed in"}.</Text>
          <Pressable onPress={loadQueue} disabled={loading || !user?.id} style={styles.primaryBtn}>
            <Text style={styles.primaryBtnText}>{loading ? "Working..." : "Load queue"}</Text>
          </Pressable>
        </View>

        <QueueSection
          title="Disputes"
          rows={queue?.disputes ?? []}
          requestsById={requestsById}
          notes={notes}
          setNotes={setNotes}
          loading={loading}
          statuses={["reviewing", "resolved", "rejected"]}
          action="update_dispute"
          onUpdate={updateItem}
        />
        <QueueSection
          title="Safety reports"
          rows={queue?.safetyReports ?? []}
          requestsById={requestsById}
          notes={notes}
          setNotes={setNotes}
          loading={loading}
          statuses={["reviewing", "resolved"]}
          action="update_safety_report"
          onUpdate={updateItem}
        />
        <QueueSection
          title="Safety flags"
          rows={queue?.safetyFlags ?? []}
          requestsById={requestsById}
          notes={notes}
          setNotes={setNotes}
          loading={loading}
          statuses={["reviewing", "resolved", "dismissed"]}
          action="update_safety_flag"
          onUpdate={updateItem}
        />
      </ScrollView>
    </ScreenContainer>
  );
}

function QueueSection({
  title,
  rows,
  requestsById,
  notes,
  setNotes,
  loading,
  statuses,
  action,
  onUpdate,
}: {
  title: string;
  rows: AdminQueueItem[];
  requestsById: Map<string, ServiceRequestSummary>;
  notes: Record<string, string>;
  setNotes: Dispatch<SetStateAction<Record<string, string>>>;
  loading: boolean;
  statuses: string[];
  action: string;
  onUpdate: (action: string, id: string, status: string) => void;
}) {
  return (
    <View style={styles.section}>
      <Text style={styles.sectionTitle}>{title}</Text>
      {rows.length === 0 ? <Text style={styles.emptyText}>No items.</Text> : null}
      {rows.map((row) => {
        const request = row.request_id ? requestsById.get(row.request_id) : null;
        return (
          <View key={row.id} style={styles.card}>
            <View style={styles.cardHeader}>
              <Text style={styles.cardTitle}>{row.reason || row.report_type || row.flag_type || "Review item"}</Text>
              <Text style={styles.status}>{row.status}</Text>
            </View>
            <Info label="Created" value={new Date(row.created_at).toLocaleString()} />
            <Info label="Role" value={row.role || "-"} />
            <Info label="Severity" value={row.severity || "-"} />
            <Info label="Message" value={row.message || "-"} />
            {request ? <RequestSummary request={request} /> : <Info label="Request" value={row.request_id || "-"} />}
            <TextInput
              value={notes[row.id] ?? ""}
              onChangeText={(text) => setNotes((prev) => ({ ...prev, [row.id]: text }))}
              placeholder="Admin notes"
              placeholderTextColor="#64748B"
              multiline
              style={styles.input}
            />
            <View style={styles.actions}>
              {statuses.map((status) => (
                <Pressable key={status} onPress={() => onUpdate(action, row.id, status)} disabled={loading} style={styles.actionBtn}>
                  <Text style={styles.actionText}>{status}</Text>
                </Pressable>
              ))}
            </View>
          </View>
        );
      })}
    </View>
  );
}

function RequestSummary({ request }: { request: ServiceRequestSummary }) {
  return (
    <View style={styles.requestBox}>
      <Info label="Service request" value={request.id} />
      <Info label="Customer" value={request.customer_name || "-"} />
      <Info label="Mechanic" value={request.assigned_mechanic_name || "-"} />
      <Info label="Service" value={request.service_code || "-"} />
      <Info label="Vehicle" value={request.vehicle_label || "-"} />
      <Info label="Location" value={request.location_label || "-"} />
      <Info label="Status" value={`${request.status || "-"} / payment ${request.payment_state || "-"}`} />
      <Info label="Amount" value={request.offered_price !== null ? `${request.currency || "USD"} ${request.offered_price}` : "-"} />
      <Info label="Timeline" value={[
        request.mechanic_accepted_at && "mechanic accepted",
        request.customer_accepted_quote_at && "customer accepted",
        request.mechanic_enroute_at && "en route",
        request.mechanic_arrived_at && "arrived",
        request.job_started_at && "started",
        request.job_completed_at && "completed",
      ].filter(Boolean).join(" -> ") || "-"} />
      <View style={styles.evidenceRow}>
        <EvidenceButton label="Before photo" url={request.before_photo_signed_url} />
        <EvidenceButton label="After photo" url={request.after_photo_signed_url} />
      </View>
    </View>
  );
}

function EvidenceButton({ label, url }: { label: string; url?: string | null }) {
  return (
    <Pressable disabled={!url} onPress={() => url && Linking.openURL(url)} style={[styles.evidenceBtn, !url && styles.evidenceBtnDisabled]}>
      <Text style={styles.evidenceText}>{label}</Text>
    </Pressable>
  );
}

function Info({ label, value }: { label: string; value?: string | null }) {
  return (
    <View style={styles.infoRow}>
      <Text style={styles.infoLabel}>{label}</Text>
      <Text style={styles.value}>{value || "-"}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  content: { padding: 20, gap: 16, paddingBottom: 40 },
  headerCard: { backgroundColor: "#111827", borderWidth: 1, borderColor: "#243044", borderRadius: 12, padding: 14, gap: 10 },
  label: { color: "#94A3B8", fontSize: 13, fontWeight: "800" },
  value: { color: "#E5E7EB", fontSize: 12 },
  primaryBtn: { backgroundColor: "#F97316", borderRadius: 10, paddingVertical: 12, alignItems: "center" },
  primaryBtnText: { color: "#FFFFFF", fontWeight: "800" },
  section: { gap: 10 },
  sectionTitle: { color: "#F8FAFC", fontSize: 18, fontWeight: "900" },
  emptyText: { color: "#94A3B8", fontSize: 13 },
  card: { backgroundColor: "#111827", borderWidth: 1, borderColor: "#243044", borderRadius: 12, padding: 14, gap: 8 },
  cardHeader: { flexDirection: "row", justifyContent: "space-between", gap: 12 },
  cardTitle: { color: "#F8FAFC", fontSize: 16, fontWeight: "900", flex: 1 },
  status: { color: "#F97316", fontSize: 12, fontWeight: "900" },
  infoRow: { gap: 2 },
  infoLabel: { color: "#94A3B8", fontSize: 11, fontWeight: "800" },
  requestBox: { borderWidth: 1, borderColor: "#334155", borderRadius: 10, padding: 10, gap: 6 },
  input: {
    borderWidth: 1,
    borderColor: "#374151",
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    color: "#F8FAFC",
    minHeight: 70,
    textAlignVertical: "top",
  },
  actions: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  actionBtn: { backgroundColor: "#C2410C", borderRadius: 8, paddingHorizontal: 12, paddingVertical: 8 },
  actionText: { color: "#FFFFFF", fontSize: 12, fontWeight: "900" },
  evidenceRow: { flexDirection: "row", gap: 8, flexWrap: "wrap" },
  evidenceBtn: { backgroundColor: "#7C2D12", borderRadius: 8, paddingHorizontal: 12, paddingVertical: 8 },
  evidenceBtnDisabled: { backgroundColor: "#334155" },
  evidenceText: { color: "#FFFFFF", fontSize: 12, fontWeight: "900" },
});
