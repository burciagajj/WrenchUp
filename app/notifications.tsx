import { useEffect, useMemo, useState } from "react";
import { Alert, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { useRouter } from "expo-router";
import { ScreenContainer } from "@/components/screen-container";
import { IconSymbol } from "@/components/ui/icon-symbol";
import { useStore } from "@/lib/store";
import { useAuth } from "@/lib/auth-context";
import { useL, useLocaleContext } from "@/hooks/use-locale";
import { acceptDispatchRequest, AwaitingCustomerPriceConfirmationError, fetchDispatchRequest, routeDispatchRequestToNextMechanic, updateDispatchStatus, type DispatchRequest } from "@/lib/live-dispatch";
import { buildMechanicJobFromDispatchRequest } from "@/lib/mechanic-dispatch-job";
import { deriveBookedMeta } from "@/lib/booked-trip";
import { notifyDispatchEvent } from "@/lib/dispatch-notifications";
import { resolveAuthSession } from "@/lib/resolve-auth-session";
import { trackAnalyticsEvent } from "@/lib/analytics";
import { haptic } from "@/lib/haptics";
import { supabaseUserData } from "@/lib/_core/supabase-user-data";
import { useConnectPayouts } from "@/hooks/use-connect-payouts";
import type { InAppNotification } from "@/lib/types";

function parseDateMs(value: string | null | undefined): number | null {
  if (!value) return null;
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) ? parsed : null;
}

type OfferAvailability = "checking" | "active" | "expired";

function isCustomerServiceOfferExpired(remote: DispatchRequest | null, mechanicUserId: string): boolean {
  if (!remote) return true;
  if (remote.status !== "searching") return true;
  if (remote.assigned_mechanic_user_id !== mechanicUserId) return true;
  if (!remote.customer_quote_accepted_at) return true;

  if (remote.offer_expires_at && !remote.mechanic_accepted_at) {
    const expiresAt = Date.parse(remote.offer_expires_at);
    if (Number.isFinite(expiresAt) && expiresAt <= Date.now()) return true;
  }

  return false;
}

function isDispatchUnavailableForMechanic(remote: DispatchRequest | null, mechanicUserId: string): boolean {
  if (!remote) return true;
  if (remote.status === "cancelled" || remote.status === "completed") return true;
  return remote.assigned_mechanic_user_id !== mechanicUserId;
}

export default function NotificationsScreen() {
  const router = useRouter();
  const { state, dispatch } = useStore();
  const { user } = useAuth();
  const L = useL();
  const { locale, region } = useLocaleContext();
  const [actingNotificationId, setActingNotificationId] = useState<string | null>(null);
  const [offerAvailabilityById, setOfferAvailabilityById] = useState<Record<string, OfferAvailability>>({});

  const role = state.dashboardRoleOverride ?? user?.role ?? state.role;
  // Same gate as mechanic/incoming.tsx — this screen is a second path to
  // accept a job offer (from a push notification) that would otherwise
  // bypass it entirely.
  const { status: payoutStatus, loadingStatus: payoutStatusLoading } = useConnectPayouts(user, role === "mechanic");
  const rows = useMemo(
    () => state.notificationsInbox.filter((n) => n.roleScope === "all" || n.roleScope === role),
    [role, state.notificationsInbox],
  );
  const serviceOfferRows = useMemo(
    () =>
      rows.filter(
        (n) => role === "mechanic" && n.actionType === "customer_service_offer" && !!n.requestId,
      ),
    [role, rows],
  );
  const serviceOfferKey = serviceOfferRows.map((n) => `${n.id}:${n.requestId}`).join("|");
  const isActing = actingNotificationId !== null;

  const findMechanicJob = (requestId: string) =>
    state.mechanicJobs.find((job) => job.id === requestId || job.remoteRequestId === requestId) ?? null;

  const refreshOfferAvailability = async (item: InAppNotification): Promise<OfferAvailability | null> => {
    if (!item.requestId || !user?.id) return null;
    try {
      const resolved = await resolveAuthSession(user);
      if (!resolved) return null;
      const remote = await fetchDispatchRequest(resolved.sessionToken, item.requestId);
      const next: OfferAvailability = isCustomerServiceOfferExpired(remote, user.id) ? "expired" : "active";
      setOfferAvailabilityById((current) => ({ ...current, [item.id]: next }));
      return next;
    } catch (error) {
      console.warn("[Notifications] Offer availability check failed:", error);
      return null;
    }
  };

  useEffect(() => {
    if (role !== "mechanic" || !user?.id || serviceOfferRows.length === 0) return;
    let alive = true;

    const refresh = async () => {
      setOfferAvailabilityById((current) => {
        const next = { ...current };
        for (const item of serviceOfferRows) {
          if (!next[item.id]) next[item.id] = "checking";
        }
        return next;
      });

      const resolved = await resolveAuthSession(user);
      if (!resolved || !alive) return;

      const entries = await Promise.all(
        serviceOfferRows.map(async (item) => {
          if (!item.requestId) return [item.id, "expired"] as const;
          try {
            const remote = await fetchDispatchRequest(resolved.sessionToken, item.requestId);
            return [
              item.id,
              isCustomerServiceOfferExpired(remote, user.id) ? "expired" : "active",
            ] as const;
          } catch (error) {
            console.warn("[Notifications] Offer availability check failed:", error);
            return [item.id, null] as const;
          }
        }),
      );

      if (!alive) return;
      setOfferAvailabilityById((current) => {
        const next = { ...current };
        for (const [id, availability] of entries) {
          if (availability) next[id] = availability;
        }
        return next;
      });
    };

    void refresh();
    const timer = setInterval(() => void refresh(), 7000);
    return () => {
      alive = false;
      clearInterval(timer);
    };
  }, [role, serviceOfferKey, serviceOfferRows, user?.id]);

  const handleOpen = (item: InAppNotification) => {
    dispatch({ type: "MARK_INBOX_READ", payload: { id: item.id } });
    if (item.actionType === "customer_service_offer" && offerAvailabilityById[item.id] === "expired") return;
    if (item.route) router.push(item.route as any);
  };

  const handleAcceptOffer = async (item: InAppNotification) => {
    if (!item.requestId || !user?.id || actingNotificationId) return;
    setActingNotificationId(item.id);
    try {
      const resolved = await resolveAuthSession(user);
      if (!resolved) {
        Alert.alert(L("Connection issue", "Problema de conexión"), L("Could not accept right now. Please try again.", "No se pudo aceptar ahora. Inténtalo de nuevo."));
        return;
      }

      const profile = await supabaseUserData.getOrCreateProfile(user.id, "mechanic", resolved.sessionToken);
      if (profile.verification_status !== "approved") {
        Alert.alert(
          L("Verification required", "Verificación requerida"),
          L(
            "Your mechanic documents must be approved before you can accept jobs.",
            "Tus documentos de mecánico deben estar aprobados antes de aceptar trabajos.",
          ),
        );
        return;
      }
      if (!payoutStatusLoading && !payoutStatus.payoutsEnabled) {
        Alert.alert(
          L("Set up payouts first", "Configura tus pagos primero"),
          L(
            "You need to connect a bank account before accepting jobs, so you actually get paid once this one completes.",
            "Debes conectar una cuenta bancaria antes de aceptar trabajos, para que realmente recibas el pago al completarlo.",
          ),
          [
            { text: L("Not now", "Ahora no"), style: "cancel" },
            { text: L("Set up payouts", "Configurar pagos"), onPress: () => router.push("/(tabs)/earnings" as any) },
          ],
        );
        return;
      }

      const beforeAccept = await fetchDispatchRequest(resolved.sessionToken, item.requestId);
      if (isCustomerServiceOfferExpired(beforeAccept, user.id)) {
        setOfferAvailabilityById((current) => ({ ...current, [item.id]: "expired" }));
        Alert.alert(
          L("Offer expired", "Oferta expirada"),
          L("This service is no longer available.", "Este servicio ya no está disponible."),
        );
        return;
      }

      const accepted = await acceptDispatchRequest(
        resolved.sessionToken,
        item.requestId,
        user.id,
        state.userName || "Mechanic",
      );
      let remote = accepted;
      if (!remote) {
        const current = await fetchDispatchRequest(resolved.sessionToken, item.requestId);
        if (current?.status === "accepted" && current.assigned_mechanic_user_id === user.id) {
          remote = current;
        } else if (isDispatchUnavailableForMechanic(current, user.id)) {
          setOfferAvailabilityById((currentState) => ({ ...currentState, [item.id]: "expired" }));
          Alert.alert(
            L("Offer expired", "Oferta expirada"),
            L("This service is no longer available.", "Este servicio ya no está disponible."),
          );
          return;
        } else {
          Alert.alert(L("Connection issue", "Problema de conexión"), L("Could not accept right now. Please try again.", "No se pudo aceptar ahora. Inténtalo de nuevo."));
          return;
        }
      }

      const sourceRemote = remote ?? beforeAccept;
      if (isDispatchUnavailableForMechanic(sourceRemote, user.id)) {
        setOfferAvailabilityById((current) => ({ ...current, [item.id]: "expired" }));
        Alert.alert(L("Request unavailable", "Solicitud no disponible"), L("This service request is no longer available.", "Esta solicitud ya no está disponible."));
        return;
      }

      let job = findMechanicJob(item.requestId);
      if (!job) {
        job = buildMechanicJobFromDispatchRequest(sourceRemote, state.userCoords);
        dispatch({ type: "ADD_MECHANIC_JOB", payload: job });
      }

      const bookedMeta = deriveBookedMeta(sourceRemote.scheduled_for ?? null, sourceRemote.customer_note ?? null);
      const nextStatus = bookedMeta.isBooked ? "upcoming" : "heading_there";
      dispatch({
        type: "UPDATE_MECHANIC_JOB_STATUS",
        payload: {
          id: job.id,
          status: nextStatus,
          customerQuoteAcceptedAt: parseDateMs(sourceRemote.customer_quote_accepted_at),
          mechanicAcceptedAt: parseDateMs(sourceRemote.mechanic_accepted_at) ?? Date.now(),
          stripePaymentIntentId: sourceRemote.stripe_payment_intent_id ?? null,
          // Carry the freshest negotiated price through — this job may already
          // exist locally with a stale payout from before a counter-offer was
          // accepted.
          payout: Number((sourceRemote.mechanic_payout ?? sourceRemote.offered_price) || 0),
        },
      });
      dispatch({ type: "MARK_INBOX_READ", payload: { id: item.id } });
      void notifyDispatchEvent({
        sessionToken: resolved.sessionToken,
        requestId: item.requestId,
        event: "mechanic_accepted_request",
        initiatorUserId: user.id,
        actorUserId: user.id,
      });
      void trackAnalyticsEvent({
        eventName: "mechanic_accepted_request",
        userId: user.id,
        role: "mechanic",
        sessionToken: resolved.sessionToken,
        properties: {
          request_id: item.requestId,
          region_code: region,
          service_code: sourceRemote.service_code,
          customer_name: sourceRemote.customer_name,
          source: "notification_action",
        },
      });
      haptic.success();
      router.replace((bookedMeta.isBooked ? `/mechanic/booked?id=${encodeURIComponent(job.id)}` : "/mechanic/active") as any);
    } catch (error) {
      if (error instanceof AwaitingCustomerPriceConfirmationError) {
        Alert.alert(
          L("Waiting on customer", "Esperando al cliente"),
          L(
            "Your counteroffer hasn't been confirmed by the customer yet, so it can't be accepted as final. You can wait for them to confirm it, or decline.",
            "El cliente aún no ha confirmado tu contraoferta, así que no se puede aceptar como definitiva. Puedes esperar a que la confirme o rechazar.",
          ),
        );
        return;
      }
      console.error("[Notifications] Accept service offer failed:", error);
      haptic.error();
      Alert.alert(L("Connection issue", "Problema de conexión"), L("Could not accept right now. Please try again.", "No se pudo aceptar ahora. Inténtalo de nuevo."));
    } finally {
      setActingNotificationId(null);
    }
  };

  const handleDeclineOffer = async (item: InAppNotification) => {
    if (!item.requestId || !user?.id || actingNotificationId) return;
    setActingNotificationId(item.id);
    try {
      const availability = await refreshOfferAvailability(item);
      if (availability === "expired") {
        Alert.alert(
          L("Offer expired", "Oferta expirada"),
          L("This service is no longer available.", "Este servicio ya no está disponible."),
        );
        return;
      }

      const resolved = await resolveAuthSession(user);
      if (!resolved) {
        Alert.alert(L("Connection issue", "Problema de conexión"), L("Could not decline right now. Please try again.", "No se pudo rechazar ahora. Inténtalo de nuevo."));
        return;
      }
      const synced = await updateDispatchStatus(resolved.sessionToken, item.requestId, "searching");
      if (!synced.ok) {
        Alert.alert(L("Connection issue", "Problema de conexión"), L("Could not decline right now. Please try again.", "No se pudo rechazar ahora. Inténtalo de nuevo."));
        return;
      }
      await routeDispatchRequestToNextMechanic(resolved.sessionToken, item.requestId, {
        excludeMechanicUserId: user.id,
        regionCode: region,
        initiatorUserId: user.id,
      });
      const job = findMechanicJob(item.requestId);
      if (job) {
        dispatch({
          type: "UPDATE_MECHANIC_JOB_STATUS",
          payload: { id: job.id, status: "declined" },
        });
      }
      dispatch({ type: "MARK_INBOX_READ", payload: { id: item.id } });
      haptic.warning();
    } catch (error) {
      console.error("[Notifications] Decline service offer failed:", error);
      haptic.error();
      Alert.alert(L("Connection issue", "Problema de conexión"), L("Could not decline right now. Please try again.", "No se pudo rechazar ahora. Inténtalo de nuevo."));
    } finally {
      setActingNotificationId(null);
    }
  };

  return (
    <ScreenContainer 
      edges={["left", "right", "bottom"]} 
      showBackButton 
      title={L("Notifications", "Notificaciones")}
      headerRight={
        <Pressable onPress={() => dispatch({ type: "MARK_INBOX_READ" })} hitSlop={8}>
          <Text style={{ color: "#F97316", fontWeight: "700" }}>{L("Read all", "Marcar todo")}</Text>
        </Pressable>
      }
    >
      {/* Content starts below consistent header */}

      <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 32 }}>
        {rows.length === 0 ? (
          <View style={styles.empty}>
            <IconSymbol name="bell" size={22} color="#94A3B8" />
            <Text style={styles.emptyTitle}>{L("No notifications yet", "Aún no hay notificaciones")}</Text>
          </View>
        ) : (
          rows.map((item) => {
            const showOfferActions = role === "mechanic" && item.actionType === "customer_service_offer" && !!item.requestId;
            const offerAvailability = offerAvailabilityById[item.id] ?? "checking";
            const offerExpired = showOfferActions && offerAvailability === "expired";
            const actionDisabled = isActing || offerAvailability === "checking";
            return (
              <View key={item.id} style={[styles.card, !item.readAt && styles.cardUnread]}>
                <Pressable
                  onPress={() => handleOpen(item)}
                  style={({ pressed }) => [pressed && { opacity: 0.9 }]}
                >
                  <View style={styles.cardHead}>
                    <Text style={styles.cardTitle}>{item.title}</Text>
                    <Text style={styles.cardTime}>{new Date(item.createdAt).toLocaleTimeString(locale === "es-MX" ? "es-MX" : "en-US", { hour: "numeric", minute: "2-digit" })}</Text>
                  </View>
                  <Text style={styles.cardBody}>{item.body}</Text>
                </Pressable>
                {offerExpired ? (
                  <View style={styles.expiredOfferBadge}>
                    <IconSymbol name="exclamationmark.triangle.fill" size={14} color="#FBBF24" />
                    <Text style={styles.expiredOfferText}>{L("Offer Expired*", "Oferta expirada*")}</Text>
                  </View>
                ) : showOfferActions ? (
                  <View style={styles.actionRow}>
                    <Pressable
                      disabled={actionDisabled}
                      onPress={() => void handleAcceptOffer(item)}
                      style={({ pressed }) => [
                        styles.actionButton,
                        styles.acceptButton,
                        actionDisabled && styles.actionButtonDisabled,
                        pressed && { opacity: 0.88 },
                      ]}
                    >
                      <Text style={styles.acceptButtonText}>
                        {actingNotificationId === item.id
                          ? L("Accepting...", "Aceptando...")
                          : offerAvailability === "checking"
                          ? L("Checking...", "Revisando...")
                          : L("Accept", "Aceptar")}
                      </Text>
                    </Pressable>
                    <Pressable
                      disabled={actionDisabled}
                      onPress={() => void handleDeclineOffer(item)}
                      style={({ pressed }) => [
                        styles.actionButton,
                        styles.declineButton,
                        actionDisabled && styles.actionButtonDisabled,
                        pressed && { opacity: 0.88 },
                      ]}
                    >
                      <Text style={styles.declineButtonText}>{L("Decline", "Rechazar")}</Text>
                    </Pressable>
                  </View>
                ) : null}
              </View>
            );
          })
        )}
      </ScrollView>
    </ScreenContainer>
  );
}

const styles = StyleSheet.create({
  header: {
    paddingHorizontal: 16,
    paddingTop: 10,
    paddingBottom: 8,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  title: { color: "#F8FAFC", fontWeight: "800", fontSize: 20 },
  readAll: { color: "#FB923C", fontWeight: "700", fontSize: 13 },
  empty: {
    marginTop: 30,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: "#334155",
    backgroundColor: "#0F172A",
    padding: 18,
    alignItems: "center",
    gap: 8,
  },
  emptyTitle: { color: "#94A3B8", fontWeight: "700", fontSize: 14 },
  card: {
    backgroundColor: "#111827",
    borderRadius: 14,
    borderWidth: 1,
    borderColor: "#334155",
    padding: 12,
    marginBottom: 10,
  },
  cardUnread: {
    borderColor: "#FB923C",
    backgroundColor: "#1E293B",
  },
  cardHead: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", gap: 8 },
  cardTitle: { color: "#F8FAFC", fontSize: 14, fontWeight: "800", flex: 1 },
  cardTime: { color: "#94A3B8", fontSize: 12, fontWeight: "600" },
  cardBody: { marginTop: 4, color: "#CBD5E1", fontSize: 13, lineHeight: 18 },
  actionRow: {
    flexDirection: "row",
    gap: 8,
    marginTop: 12,
  },
  actionButton: {
    flex: 1,
    borderRadius: 10,
    paddingVertical: 9,
    alignItems: "center",
    justifyContent: "center",
  },
  acceptButton: {
    backgroundColor: "#F97316",
  },
  declineButton: {
    backgroundColor: "#0F172A",
    borderWidth: 1,
    borderColor: "#475569",
  },
  expiredOfferBadge: {
    alignSelf: "flex-start",
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    marginTop: 12,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: "rgba(251, 191, 36, 0.42)",
    backgroundColor: "rgba(251, 191, 36, 0.12)",
    paddingHorizontal: 10,
    paddingVertical: 7,
  },
  expiredOfferText: {
    color: "#FBBF24",
    fontSize: 12,
    fontWeight: "900",
    letterSpacing: 0.2,
    textTransform: "uppercase",
  },
  actionButtonDisabled: {
    opacity: 0.55,
  },
  acceptButtonText: { color: "#FFFFFF", fontWeight: "800", fontSize: 12 },
  declineButtonText: { color: "#E2E8F0", fontWeight: "800", fontSize: 12 },
});
