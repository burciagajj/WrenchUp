import { useEffect, useMemo, useState } from "react";
import { Alert, FlatList, Pressable, StyleSheet, Text, TextInput, View } from "react-native";
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
  updateDispatchStatus,
} from "@/lib/live-dispatch";
import { useStore } from "@/lib/store";
import { useLocaleContext, useL } from "@/hooks/use-locale";
import { haptic } from "@/lib/haptics";
import { localizedServiceName } from "@/lib/service-i18n";
import { notifyDispatchEvent } from "@/lib/dispatch-notifications";
import { trackAnalyticsEvent } from "@/lib/analytics";
import { formatEditableMoney, normalizeEditableMoneyInput, parseEditableMoneyInput } from "@/lib/money-input";
import { deriveServiceAndFeeFromTotal, QUICK_SERVICE_BOOKING_FEE_RATE } from "@/lib/fare";

type OfferDraft = {
  price: string;
  message: string;
};

export default function BookedRequestsScreen() {
  const router = useRouter();
  const { user } = useAuth();
  const { state, dispatch } = useStore();
  const { locale, formatPrice, t, region } = useLocaleContext();
  const L = useL();
  const [rows, setRows] = useState<DispatchRequest[]>([]);
  const [loading, setLoading] = useState(false);
  const [drafts, setDrafts] = useState<Record<string, OfferDraft>>({});
  const customerBookedJob = useMemo(
    () =>
      state.jobs.find(
        (job) => job.isBooked && job.status !== "cancelled" && job.status !== "completed",
      ) ?? null,
    [state.jobs],
  );
  const activeRole = state.dashboardRoleOverride ?? user?.role;
  const isMechanic = activeRole === "mechanic";
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
  const pendingAssigned = useMemo(
    () => scheduled.filter((r) => r.status === "searching" && r.assigned_mechanic_user_id === user?.id),
    [scheduled, user?.id],
  );
  const openForOffers = useMemo(
    () => scheduled.filter((r) => r.status === "searching" && !r.assigned_mechanic_user_id),
    [scheduled],
  );

  const load = async () => {
    if (!user?.id || !isMechanic) return;
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
  }, [user?.id, isMechanic]);

  if (!isMechanic) {
    const scheduledLabel = customerBookedJob?.scheduledFor
      ? formatBookedStartLabel(customerBookedJob.scheduledFor, locale)
      : "—";
    const liveNow = !!customerBookedJob && ["enroute", "arrived", "in_progress"].includes(customerBookedJob.status);
    const requestId = customerBookedJob?.remoteRequestId ?? null;
    const mechanicName = customerBookedJob?.mechanicName ?? L("Mechanic", "Mecánico");
    const canModifyBookedService =
      !!requestId &&
      !!customerBookedJob?.scheduledFor &&
      customerBookedJob.scheduledFor - Date.now() >= 6 * 60 * 60 * 1000;

    const handleMessageMechanic = () => {
      if (!requestId) return;
      router.push(
        `/messages?requestId=${encodeURIComponent(requestId)}&peerName=${encodeURIComponent(mechanicName)}` as any,
      );
    };

    const handleCancelBookedService = () => {
      if (!customerBookedJob) return;
      Alert.alert(
        L("Cancel booked service?", "¿Cancelar servicio agendado?"),
        L(
          "This will release your booked service. You can still message your mechanic before it is cancelled.",
          "Esto liberará tu servicio agendado. Todavía puedes enviar mensaje a tu mecánico antes de cancelarlo.",
        ),
        [
          { text: L("Keep booking", "Mantener reserva"), style: "cancel" },
          {
            text: L("Cancel booked service", "Cancelar servicio agendado"),
            style: "destructive",
            onPress: async () => {
              haptic.warning();
              if (requestId && user?.id) {
                try {
                  const resolved = await resolveAuthSession(user);
                  if (resolved) {
                    const synced = await updateDispatchStatus(resolved.sessionToken, requestId, "cancelled", {
                      cancelledByRole: "customer",
                      cancelledByUserId: user.id,
                    });
                    if (!synced.ok) {
                      Alert.alert(
                        L("Connection issue", "Problema de conexión"),
                        L("Could not cancel right now. Please try again.", "No se pudo cancelar ahora. Inténtalo de nuevo."),
                      );
                      return;
                    }
                  }
                } catch (error) {
                  console.error("[BookedRequests] Failed to cancel booked service:", error);
                  Alert.alert(
                    L("Connection issue", "Problema de conexión"),
                    L("Could not cancel right now. Please try again.", "No se pudo cancelar ahora. Inténtalo de nuevo."),
                  );
                  return;
                }
              }
              dispatch({
                type: "UPDATE_JOB_STATUS",
                payload: { id: customerBookedJob.id, status: "cancelled" },
              });
              Alert.alert(
                L("Trip canceled", "Viaje cancelado"),
                L("Your booked service has been cancelled.", "Tu servicio agendado ha sido cancelado."),
                [{ text: "OK", onPress: () => router.replace("/(tabs)" as any) }],
              );
            },
          },
        ],
      );
    };

    return (
      <ScreenContainer edges={["left", "right"]}>
        <ScreenMenuHeader title={t("tabs.booked_requests")} />
        <View style={styles.customerShell}>
          {!customerBookedJob ? (
            <View style={styles.empty}>
              <Text style={styles.emptyTitle}>{loading ? L("Loading...", "Cargando...") : L("No booked requests yet", "Aún no hay solicitudes agendadas")}</Text>
              <Text style={styles.emptyText}>{L("Scheduled customer requests will appear here.", "Las solicitudes agendadas de clientes aparecerán aquí.")}</Text>
            </View>
          ) : (
            <View style={styles.customerBody}>
              <View style={styles.sectionCard}>
                <Text style={styles.sectionTitle}>{L("Your booked service", "Tu servicio agendado")}</Text>
                <Text style={styles.service}>{localizedServiceName(customerBookedJob.service, locale)}</Text>
                <Text style={styles.meta}>{customerBookedJob.vehicleId}</Text>
                <Text style={styles.meta}>{customerBookedJob.location}</Text>
                <Text style={styles.meta}>
                  {L("Scheduled for", "Programado para")}: {scheduledLabel}
                </Text>
                {customerBookedJob.mechanicName ? (
                  <Text style={styles.meta}>
                    {L("Mechanic", "Mecánico")}: {customerBookedJob.mechanicName}
                  </Text>
                ) : null}
                <Text style={styles.upcomingPrice}>
                  {liveNow
                    ? L("Live / in progress", "En vivo / en progreso")
                    : L("Upcoming booked service", "Servicio agendado próximo")}
                </Text>
                <Text style={styles.meta}>
                  {liveNow
                    ? L("Your mechanic is heading to you.", "Tu mecánico ya se dirige a ti.")
                    : L(
                        canModifyBookedService
                          ? "You can modify or cancel this booking until 6 hours before it starts."
                          : "You can cancel this booking or message your mechanic while it is still upcoming.",
                        canModifyBookedService
                          ? "Puedes modificar o cancelar esta reserva hasta 6 horas antes de que comience."
                          : "Puedes cancelar esta reserva o enviar mensaje a tu mecánico mientras sigue próxima.",
                      )}
                </Text>
                {liveNow ? (
                  <Pressable
                    onPress={() => router.push("/tracking" as any)}
                    style={({ pressed }) => [styles.btn, pressed && { opacity: 0.9 }]}
                  >
                    <Text style={styles.btnText}>{L("View live status", "Ver estado en vivo")}</Text>
                  </Pressable>
                ) : (
                  <View style={styles.customerActions}>
                    {canModifyBookedService ? (
                      <Pressable
                        onPress={() =>
                          router.push(
                            `/booked-service-edit?requestId=${encodeURIComponent(requestId)}` as any,
                          )
                        }
                        style={({ pressed }) => [styles.customerAction, styles.modifyAction, pressed && { opacity: 0.9 }]}
                      >
                        <Text style={styles.customerActionText}>{L("Modify booked service", "Modificar servicio agendado")}</Text>
                      </Pressable>
                    ) : null}
                    <Pressable
                      onPress={handleCancelBookedService}
                      style={({ pressed }) => [styles.customerAction, styles.cancelAction, pressed && { opacity: 0.9 }]}
                    >
                      <Text style={styles.customerActionText}>{L("Cancel booked service", "Cancelar servicio agendado")}</Text>
                    </Pressable>
                    <Pressable
                      onPress={handleMessageMechanic}
                      disabled={!requestId}
                      style={({ pressed }) => [
                        styles.customerAction,
                        styles.messageAction,
                        !requestId && { opacity: 0.5 },
                        pressed && requestId ? { opacity: 0.9 } : undefined,
                      ]}
                    >
                      <Text style={styles.customerActionText}>{L("Message my mechanic", "Mensaje a mi mecánico")}</Text>
                    </Pressable>
                  </View>
                )}
              </View>
            </View>
          )}
        </View>
      </ScreenContainer>
    );
  }

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
    const price = parseEditableMoneyInput(draft?.price || formatEditableMoney(request.offered_price, region));
    if (!Number.isFinite(price) || price <= 0) return;
    try {
      const resolved = await resolveAuthSession(user);
      if (!resolved) return;
      try {
        await updateDispatchOfferedPrice(
          resolved.sessionToken,
          request.id,
          +price.toFixed(2),
          request.platform_fee_rate ?? undefined,
        );
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
      void notifyDispatchEvent({
        sessionToken: resolved.sessionToken,
        requestId: request.id,
        event: "mechanic_offer_sent",
        initiatorUserId: user.id,
        actorUserId: user.id,
      });
      void trackAnalyticsEvent({
        eventName: "mechanic_offer_sent",
        userId: user.id,
        role: "mechanic",
        sessionToken: resolved.sessionToken,
        properties: {
          request_id: request.id,
          region_code: request.region_code ?? null,
          service_code: request.service_code,
          proposed_total: +price.toFixed(2),
        },
      });
      haptic.success();
      await load();
    } catch (error) {
      console.error("[BookedRequests] send offer failed:", error);
      haptic.error();
    }
  };

  return (
    <ScreenContainer edges={["left", "right"]}>
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
                          ? new Date(item.scheduled_for).toLocaleString(locale === "es-MX" ? "es-MX" : "en-US")
                          : "—"}
                      </Text>
                      <Text style={styles.upcomingPrice}>
                        {L("Final price", "Precio final")}: {formatPrice(item.offered_price)}
                      </Text>
                    </Pressable>
                  ))}
                </View>
              ) : null}
              {pendingAssigned.length > 0 ? (
                <View style={styles.sectionCard}>
                  <Text style={styles.sectionTitle}>{L("Awaiting your confirmation", "Esperando tu confirmación")}</Text>
                  {pendingAssigned.map((item) => (
                    <Pressable
                      key={`pending-${item.id}`}
                      style={({ pressed }) => [styles.upcomingRow, pressed && { opacity: 0.85 }]}
                      onPress={() => router.push(`/mechanic/incoming?id=${encodeURIComponent(item.id)}` as any)}
                    >
                      <Text style={styles.service}>{localizedServiceName(item.service_code as any, locale)}</Text>
                      <Text style={styles.meta}>{item.vehicle_label}</Text>
                      <Text style={styles.meta}>{item.location_label}</Text>
                      <Text style={styles.meta}>
                        {L("Customer accepted your offer", "El cliente aceptó tu oferta")}
                      </Text>
                      <Text style={styles.upcomingPrice}>
                        {L("Quoted total", "Total cotizado")}: {formatPrice(item.offered_price)}
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
          contentContainerStyle={{ padding: 16, gap: 12, paddingBottom: 20 }}
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
                    ? new Date(item.scheduled_for).toLocaleString(locale === "es-MX" ? "es-MX" : "en-US")
                    : "—"}
                </Text>
                <Text style={styles.meta}>
                  {L("Base booked price", "Precio base agendado")}: {formatPrice(item.offered_price)}
                </Text>
                <TextInput
                  value={d?.price ?? ""}
                  onChangeText={(v) => setDraft(item.id, { price: normalizeEditableMoneyInput(v) })}
                  placeholder={formatEditableMoney(0, region)}
                  placeholderTextColor="#64748B"
                  keyboardType="decimal-pad"
                  style={styles.input}
                />
                {(() => {
                  // The number typed above is the TOTAL the customer would
                  // pay — show what it actually splits into so the mechanic
                  // knows their real take-home isn't the full amount.
                  const parsedPrice = parseEditableMoneyInput(d?.price || "");
                  if (!Number.isFinite(parsedPrice) || parsedPrice <= 0) return null;
                  const { service, fee } = deriveServiceAndFeeFromTotal(parsedPrice);
                  return (
                    <Text style={styles.priceBreakdown}>
                      {L(
                        `You'll receive ${formatPrice(service)} — dispatch fee (${Math.round(QUICK_SERVICE_BOOKING_FEE_RATE * 100)}%): ${formatPrice(fee)}`,
                        `Recibirás ${formatPrice(service)} — tarifa de despacho (${Math.round(QUICK_SERVICE_BOOKING_FEE_RATE * 100)}%): ${formatPrice(fee)}`,
                      )}
                    </Text>
                  );
                })()}
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

function formatBookedStartLabel(startMs: number, locale: string): string {
  const startAt = new Date(startMs);
  const now = new Date();
  const dateLocale = locale === "es-MX" ? "es-MX" : "en-US";
  const diffMinutes = Math.floor((startAt.getTime() - now.getTime()) / 60000);
  if (diffMinutes <= -90) return locale === "es-MX" ? "Hora programada pasada" : "Scheduled time passed";
  if (diffMinutes <= 0) return locale === "es-MX" ? "Listo para salir" : "Ready to start";
  if (diffMinutes < 90) return locale === "es-MX" ? `Inicia en ${diffMinutes} min` : `Starts in ${diffMinutes} min`;

  const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const startOfTarget = new Date(startAt.getFullYear(), startAt.getMonth(), startAt.getDate());
  const dayDiff = Math.round((startOfTarget.getTime() - startOfToday.getTime()) / 86400000);
  const timeLabel = new Intl.DateTimeFormat(dateLocale, { hour: "numeric", minute: "2-digit" }).format(startAt);

  if (dayDiff === 0) return locale === "es-MX" ? `Hoy a las ${timeLabel}` : `Today at ${timeLabel}`;
  if (dayDiff === 1) return locale === "es-MX" ? `Mañana a las ${timeLabel}` : `Tomorrow at ${timeLabel}`;
  return locale === "es-MX" ? `En ${dayDiff} días a las ${timeLabel}` : `In ${dayDiff} days at ${timeLabel}`;
}

const styles = StyleSheet.create({
  customerShell: {
    flex: 1,
  },
  customerBody: {
    flex: 1,
    padding: 16,
  },
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
  priceBreakdown: {
    fontSize: 11,
    color: "#94A3B8",
    marginTop: -2,
  },
  btn: {
    backgroundColor: "#F97316",
    borderRadius: 10,
    alignItems: "center",
    paddingVertical: 11,
  },
  btnText: { color: "#FFFFFF", fontSize: 13, fontWeight: "800" },
  customerActions: { gap: 10, marginTop: 4 },
  customerAction: {
    borderRadius: 12,
    alignItems: "center",
    paddingVertical: 13,
    paddingHorizontal: 14,
    borderWidth: 1,
  },
  modifyAction: {
    backgroundColor: "#C2410C",
    borderColor: "#115E59",
  },
  cancelAction: {
    backgroundColor: "#FB923C",
    borderColor: "#C2410C",
  },
  messageAction: {
    backgroundColor: "#121212",
    borderColor: "#2A2A40",
  },
  customerActionText: { color: "#FFFFFF", fontSize: 14, fontWeight: "800" },
});
