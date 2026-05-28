import { useEffect, useMemo, useState } from "react";
import { FlatList, Pressable, StyleSheet, Text, TextInput, View } from "react-native";
import { useRouter } from "expo-router";
import { ScreenContainer } from "@/components/screen-container";
import { ScreenMenuHeader } from "@/components/screen-menu-header";
import { useAuth } from "@/lib/auth-context";
import { resolveAuthSession } from "@/lib/resolve-auth-session";
import {
  fetchMechanicBookedRequests,
  sendServiceMessage,
  type DispatchRequest,
  updateDispatchOfferedPrice,
} from "@/lib/live-dispatch";
import { useLocaleContext } from "@/hooks/use-locale";
import { haptic } from "@/lib/haptics";
import { localizedServiceName } from "@/lib/service-i18n";

type OfferDraft = {
  price: string;
  message: string;
};

export default function BookedRequestsScreen() {
  const router = useRouter();
  const { user } = useAuth();
  const { locale, formatPrice, t, region } = useLocaleContext();
  const isEs = locale === "es-MX";
  const L = (en: string, es: string) => (isEs ? es : en);
  const [rows, setRows] = useState<DispatchRequest[]>([]);
  const [loading, setLoading] = useState(false);
  const [drafts, setDrafts] = useState<Record<string, OfferDraft>>({});

  const load = async () => {
    if (!user?.id || user.role !== "mechanic") return;
    setLoading(true);
    try {
      const resolved = await resolveAuthSession(user);
      if (!resolved) return;
      const list = await fetchMechanicBookedRequests(resolved.sessionToken, user.id, region);
      const regionSafe = list.filter((req) => {
        if (req.region_code === region) return true;
        if (req.region_code) return false;
        const normalizedCurrency = (req.currency || "").toUpperCase();
        return region === "MX" ? normalizedCurrency === "MXN" : normalizedCurrency !== "MXN";
      });
      setRows(regionSafe);
    } catch (error) {
      console.error("[BookedRequests] load failed:", error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void load();
    const timer = setInterval(() => void load(), 12000);
    return () => clearInterval(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.id, user?.role]);

  const scheduled = useMemo(() => rows.filter((r) => !!r.scheduled_for), [rows]);
  const upcoming = useMemo(
    () =>
      scheduled.filter(
        (r) =>
          r.status === "accepted" &&
          !!r.assigned_mechanic_user_id &&
          r.assigned_mechanic_user_id === user?.id,
      ),
    [scheduled, user?.id],
  );
  const openForOffers = useMemo(
    () => scheduled.filter((r) => r.status === "searching" && !r.assigned_mechanic_user_id),
    [scheduled],
  );

  const setDraft = (id: string, next: Partial<OfferDraft>) => {
    setDrafts((prev) => ({
      ...prev,
      [id]: {
        price: prev[id]?.price ?? "",
        message: prev[id]?.message ?? "",
        ...next,
      },
    }));
  };

  const sendOffer = async (request: DispatchRequest) => {
    if (!user?.id) return;
    const draft = drafts[request.id];
    const price = Number(draft?.price || request.offered_price);
    if (!Number.isFinite(price) || price <= 0) return;
    try {
      const resolved = await resolveAuthSession(user);
      if (!resolved) return;
      try {
        await updateDispatchOfferedPrice(resolved.sessionToken, request.id, +price.toFixed(2));
      } catch (err) {
        console.warn("[BookedRequests] Could not update offered price column:", err);
      }
      const payload = JSON.stringify({
        kind: "mechanic_offer",
        mechanic_user_id: user.id,
        mechanic_name: user.email.split("@")[0] || "Mechanic",
        proposed_total: +price.toFixed(2),
        note: draft?.message?.trim() || "",
      });
      await sendServiceMessage(resolved.sessionToken, {
        requestId: request.id,
        senderUserId: user.id,
        senderRole: "mechanic",
        message: `OFFER_JSON:${payload}`,
      });
      haptic.success();
      await load();
    } catch (error) {
      console.error("[BookedRequests] send offer failed:", error);
      haptic.error();
    }
  };

  return (
    <ScreenContainer edges={["left", "right", "bottom"]}>
      <ScreenMenuHeader title={t("tabs.booked_requests")} />
      {scheduled.length === 0 ? (
        <View style={styles.empty}>
          <Text style={styles.emptyTitle}>{loading ? L("Loading...", "Cargando...") : L("No booked requests yet", "Aún no hay solicitudes agendadas")}</Text>
          <Text style={styles.emptyText}>{L("Scheduled customer requests will appear here.", "Las solicitudes agendadas de clientes aparecerán aquí.")}</Text>
        </View>
      ) : (
        <FlatList
          data={openForOffers}
          keyExtractor={(item) => item.id}
          ListHeaderComponent={
            <View style={{ gap: 10, marginBottom: 10 }}>
              {upcoming.length > 0 ? (
                <View style={styles.sectionCard}>
                  <Text style={styles.sectionTitle}>{L("Upcoming Job", "Próximo trabajo")}</Text>
                  {upcoming.map((item) => (
                    <Pressable
                      key={`upcoming-${item.id}`}
                      style={({ pressed }) => [styles.upcomingRow, pressed && { opacity: 0.85 }]}
                      onPress={() => router.push(`/mechanic/booked?id=${encodeURIComponent(item.id)}` as any)}
                    >
                      <Text style={styles.service}>{localizedServiceName(item.service_code as any, locale)}</Text>
                      <Text style={styles.meta}>{item.vehicle_label}</Text>
                      <Text style={styles.meta}>{item.location_label}</Text>
                      <Text style={styles.meta}>
                        {L("Date/Time", "Fecha/Hora")}:{" "}
                        {item.scheduled_for
                          ? new Date(item.scheduled_for).toLocaleString(isEs ? "es-MX" : "en-US")
                          : "—"}
                      </Text>
                      <Text style={styles.upcomingPrice}>
                        {L("Final price", "Precio final")}: {formatPrice(item.offered_price)}
                      </Text>
                    </Pressable>
                  ))}
                </View>
              ) : null}
              <Text style={styles.listHeading}>{L("Booked requests to review", "Solicitudes agendadas para revisar")}</Text>
            </View>
          }
          ListEmptyComponent={
            <View style={styles.emptyInline}>
              <Text style={styles.emptyText}>{L("No pending booked requests right now.", "No hay solicitudes agendadas pendientes ahora.")}</Text>
            </View>
          }
          contentContainerStyle={{ padding: 16, gap: 12, paddingBottom: 28 }}
          renderItem={({ item }) => {
            const d = drafts[item.id];
            return (
              <View style={styles.card}>
                <Text style={styles.service}>{localizedServiceName(item.service_code as any, locale)}</Text>
                <Text style={styles.meta}>{item.vehicle_label}</Text>
                <Text style={styles.meta}>{item.location_label}</Text>
                <Text style={styles.meta}>
                  {L("Date/Time", "Fecha/Hora")}:{" "}
                  {item.scheduled_for
                    ? new Date(item.scheduled_for).toLocaleString(isEs ? "es-MX" : "en-US")
                    : "—"}
                </Text>
                <Text style={styles.meta}>
                  {L("Base booked price", "Precio base agendado")}: {formatPrice(item.offered_price)}
                </Text>
                <TextInput
                  value={d?.price ?? ""}
                  onChangeText={(v) => setDraft(item.id, { price: v.replace(/[^0-9.]/g, "") })}
                  placeholder={L("Final total offer", "Oferta total final")}
                  placeholderTextColor="#64748B"
                  keyboardType="decimal-pad"
                  style={styles.input}
                />
                <TextInput
                  value={d?.message ?? ""}
                  onChangeText={(v) => setDraft(item.id, { message: v })}
                  placeholder={L("Message for customer (parts/adjustment details)", "Mensaje para cliente (detalle de ajuste/refacciones)")}
                  placeholderTextColor="#64748B"
                  multiline
                  style={[styles.input, { minHeight: 78, textAlignVertical: "top" }]}
                />
                <Pressable onPress={() => void sendOffer(item)} style={styles.btn}>
                  <Text style={styles.btnText}>{L("Send Offer", "Enviar oferta")}</Text>
                </Pressable>
              </View>
            );
          }}
        />
      )}
    </ScreenContainer>
  );
}

const styles = StyleSheet.create({
  empty: { flex: 1, alignItems: "center", justifyContent: "center", paddingHorizontal: 24 },
  emptyTitle: { color: "#F8FAFC", fontSize: 18, fontWeight: "800", textAlign: "center" },
  emptyText: { color: "#CBD5E1", fontSize: 13, marginTop: 6, textAlign: "center" },
  emptyInline: {
    paddingVertical: 10,
  },
  listHeading: {
    color: "#C2410C",
    fontSize: 13,
    fontWeight: "800",
    marginBottom: 2,
  },
  sectionCard: {
    backgroundColor: "#1A1A2E",
    borderColor: "#2A2A40",
    borderWidth: 1,
    borderRadius: 14,
    padding: 12,
    gap: 8,
  },
  sectionTitle: {
    color: "#F97316",
    fontSize: 14,
    fontWeight: "900",
    textTransform: "uppercase",
  },
  upcomingRow: {
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: "#2A2A40",
    paddingTop: 8,
    gap: 4,
  },
  upcomingPrice: {
    color: "#FB923C",
    fontSize: 13,
    fontWeight: "800",
  },
  card: {
    backgroundColor: "#1A1A2E",
    borderColor: "#2A2A40",
    borderWidth: 1,
    borderRadius: 14,
    padding: 12,
    gap: 8,
  },
  service: { color: "#F8FAFC", fontSize: 16, fontWeight: "800" },
  meta: { color: "#CBD5E1", fontSize: 12, fontWeight: "600" },
  input: {
    borderWidth: 1,
    borderColor: "#2A2A40",
    backgroundColor: "#121212",
    borderRadius: 10,
    paddingHorizontal: 10,
    paddingVertical: 9,
    color: "#F8FAFC",
    fontSize: 14,
  },
  btn: {
    backgroundColor: "#F97316",
    borderRadius: 10,
    alignItems: "center",
    paddingVertical: 11,
  },
  btnText: { color: "#FFFFFF", fontSize: 13, fontWeight: "800" },
});
