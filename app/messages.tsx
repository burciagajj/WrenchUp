import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Alert, FlatList, KeyboardAvoidingView, Platform, Pressable, StyleSheet, Text, TextInput, View } from "react-native";
import { useLocalSearchParams } from "expo-router";
import type { RealtimeChannel } from "@supabase/supabase-js";
import { ScreenContainer } from "@/components/screen-container";
import { IconSymbol } from "@/components/ui/icon-symbol";
import { useAuth } from "@/lib/auth-context";
import { resolveAuthSession } from "@/lib/resolve-auth-session";
import { assignDispatchToMechanic, fetchServiceMessages, sendServiceMessage, type ServiceMessage } from "@/lib/live-dispatch";
import { haptic } from "@/lib/haptics";
import { notifyChatRecipient } from "@/lib/chat-notifications";
import { useLocaleContext, useL } from "@/hooks/use-locale";
import { trackAnalyticsEvent } from "@/lib/analytics";
import { useStore } from "@/lib/store";
import { parseMechanicOfferMessage } from "@/lib/mechanic-offer";
import { notifyDispatchEvent } from "@/lib/dispatch-notifications";
import { getSupabaseRealtimeClient } from "@/lib/supabase-realtime";

function mergeIncomingMessage(current: ServiceMessage[], incoming: ServiceMessage): ServiceMessage[] {
  if (current.some((m) => m.id === incoming.id)) return current;
  const next = [...current, incoming];
  next.sort((a, b) => Date.parse(a.created_at) - Date.parse(b.created_at));
  return next;
}

export default function MessagesScreen() {
  const { requestId, peerName } = useLocalSearchParams<{ requestId: string; peerName?: string }>();
  const { user } = useAuth();
  const { state, dispatch } = useStore();
  const { region } = useLocaleContext();
  const L = useL();
  const [messages, setMessages] = useState<ServiceMessage[]>([]);
  const [text, setText] = useState("");
  const [sending, setSending] = useState(false);
  const [offeringService, setOfferingService] = useState(false);
  const inFlightRef = useRef(false);
  const backoffRef = useRef(12000);
  const openedTrackedRef = useRef<string | null>(null);
  const realtimeChannelRef = useRef<RealtimeChannel | null>(null);

  const role = useMemo(
    () => state.dashboardRoleOverride ?? user?.role ?? state.role,
    [state.dashboardRoleOverride, state.role, user?.role],
  );
  const renderMessage = useCallback(({ item }: { item: ServiceMessage }) => (
    <MessageBubble item={item} userId={user?.id} />
  ), [user?.id]);
  const activeCustomerJob = useMemo(
    () =>
      requestId
        ? state.jobs.find(
            (job) =>
              job.remoteRequestId === requestId &&
              job.status === "searching" &&
              !job.customerQuoteAcceptedAt,
          ) ?? null
        : null,
    [requestId, state.jobs],
  );
  const latestMechanicOffer = useMemo(() => {
    for (const message of [...messages].reverse()) {
      const offer = parseMechanicOfferMessage(message);
      if (offer) return offer;
    }
    return null;
  }, [messages]);
  const targetMechanicId =
    activeCustomerJob?.mechanicId && activeCustomerJob.mechanicId !== "unassigned"
      ? activeCustomerJob.mechanicId
      : latestMechanicOffer?.mechanicUserId ?? null;
  const targetMechanicName =
    activeCustomerJob?.mechanicName?.trim() ||
    latestMechanicOffer?.mechanicName?.trim() ||
    peerName?.trim() ||
    "Mechanic";
  const showOfferRequestedService =
    role === "customer" &&
    !!requestId &&
    !!activeCustomerJob &&
    !!targetMechanicId;

  useEffect(() => {
    if (!requestId || !user?.id) return;
    if (openedTrackedRef.current === requestId) return;

    let alive = true;
    const emitOpen = async () => {
      try {
        const resolved = await resolveAuthSession(user);
        if (!resolved || !alive) return;
        openedTrackedRef.current = requestId;
        void trackAnalyticsEvent({
          eventName: "chat_opened",
          userId: user.id,
          role,
          sessionToken: resolved.sessionToken,
          properties: {
            request_id: requestId,
            peer_name: peerName ?? null,
            region_code: region,
            source: "screen",
          },
        });
      } catch (error) {
        console.warn("[Messages] chat open tracking failed:", error);
      }
    };

    void emitOpen();
    return () => {
      alive = false;
    };
  }, [requestId, peerName, region, role, user]);

  useEffect(() => {
    if (!requestId || !user?.id) return;
    let alive = true;
    const load = async () => {
      if (inFlightRef.current) return;
      inFlightRef.current = true;
      try {
        const resolved = await resolveAuthSession(user);
        if (!resolved || !alive) return;
        const rows = await fetchServiceMessages(resolved.sessionToken, requestId);
        if (alive) setMessages(rows);
        backoffRef.current = 12000;
      } catch (error) {
        console.error("[Messages] load failed:", error);
        backoffRef.current = Math.min(60000, Math.round(backoffRef.current * 1.5));
      } finally {
        inFlightRef.current = false;
      }
    };
    let timer: ReturnType<typeof setTimeout> | null = null;
    const loop = async () => {
      await load();
      if (!alive) return;
      timer = setTimeout(() => void loop(), backoffRef.current);
    };
    void loop();
    return () => {
      alive = false;
      if (timer) clearTimeout(timer);
    };
  }, [requestId, user]);

  // Realtime: push new messages in immediately instead of waiting on the next
  // poll tick. The polling loop above stays as a fallback (same
  // belt-and-suspenders pattern used in components/mechanic-live-job-sync.tsx)
  // in case the realtime socket drops or never connects.
  useEffect(() => {
    if (!requestId || !user?.id) return;
    const client = getSupabaseRealtimeClient();
    if (!client) return;

    let cancelled = false;

    const setupRealtime = async () => {
      try {
        const resolved = await resolveAuthSession(user);
        if (!resolved || cancelled) return;

        client.realtime.setAuth(resolved.sessionToken);
        const channelName = `service_messages:${requestId}`;
        const channel = client
          .channel(channelName)
          .on(
            "postgres_changes",
            {
              event: "INSERT",
              schema: "public",
              table: "service_messages",
              filter: `request_id=eq.${requestId}`,
            },
            (payload: any) => {
              const remote = (payload.new ?? payload.record) as ServiceMessage | undefined;
              if (!remote) return;
              setMessages((current) => mergeIncomingMessage(current, remote));
            },
          )
          .subscribe();

        realtimeChannelRef.current = channel;
      } catch (error) {
        console.warn("[Messages] Realtime setup failed:", error);
      }
    };

    void setupRealtime();

    return () => {
      cancelled = true;
      if (realtimeChannelRef.current) {
        client.removeChannel(realtimeChannelRef.current);
        realtimeChannelRef.current = null;
      }
    };
  }, [requestId, user]);

  const onSend = async () => {
    const trimmed = text.trim();
    if (!trimmed || !requestId || !user?.id || sending) return;
    setSending(true);
    let sessionToken: string | null = null;
    try {
      const resolved = await resolveAuthSession(user);
      if (!resolved) return;
      sessionToken = resolved.sessionToken;
      await sendServiceMessage(resolved.sessionToken, {
        requestId,
        senderUserId: user.id,
        senderRole: role,
        message: trimmed,
      });
      void notifyChatRecipient({
        sessionToken: resolved.sessionToken,
        requestId,
        senderUserId: user.id,
        senderRole: role,
        message: trimmed,
      });
      setText("");
      haptic.success();
      const rows = await fetchServiceMessages(resolved.sessionToken, requestId).catch((error) => {
        console.warn("[Messages] reload after send failed:", error);
        return null;
      });
      if (rows) setMessages(rows);
    } catch (error) {
      console.error("[Messages] send failed:", error);
      void trackAnalyticsEvent({
        eventName: "chat_send_failed",
        userId: user.id,
        role,
        sessionToken,
        properties: {
          request_id: requestId,
          region_code: region,
          message: trimmed.slice(0, 160),
        },
      });
    } finally {
      setSending(false);
    }
  };

  const handleOfferRequestedService = async () => {
    if (!requestId || !activeCustomerJob || !targetMechanicId || !user?.id || offeringService) return;
    setOfferingService(true);
    try {
      const resolved = await resolveAuthSession(user);
      if (!resolved) {
        Alert.alert(L("Connection issue", "Problema de conexión"), L("Could not offer your service request right now. Please try again.", "No se pudo ofrecer tu solicitud de servicio ahora. Inténtalo de nuevo."));
        return;
      }

      // If the mechanic already sent a priced offer in this chat, accepting
      // here must lock in that negotiated total — not silently keep the
      // request's original (possibly stale) price.
      const acceptedOfferPrice =
        latestMechanicOffer && latestMechanicOffer.mechanicUserId === targetMechanicId
          ? latestMechanicOffer.proposedTotal
          : undefined;

      const assigned = await assignDispatchToMechanic(
        resolved.sessionToken,
        requestId,
        targetMechanicId,
        targetMechanicName,
        acceptedOfferPrice ? { offeredPrice: acceptedOfferPrice } : undefined,
      );

      if (!assigned) {
        haptic.error();
        Alert.alert(L("Could not offer service", "No se pudo ofrecer el servicio"), L("This mechanic is no longer available for this request.", "Este mecánico ya no está disponible para esta solicitud."));
        return;
      }

      void notifyDispatchEvent({
        sessionToken: resolved.sessionToken,
        requestId,
        event: "customer_accepted_quote",
        initiatorUserId: user.id,
        actorUserId: user.id,
      });
      void trackAnalyticsEvent({
        eventName: "customer_accepted_quote",
        userId: user.id,
        role: "customer",
        sessionToken: resolved.sessionToken,
        properties: {
          request_id: requestId,
          region_code: region,
          service_code: activeCustomerJob.service,
          customer_name: state.userName,
          mechanic_name: targetMechanicName,
          source: "messages",
        },
      });
      dispatch({
        type: "UPDATE_JOB_ASSIGNMENT",
        payload: {
          id: activeCustomerJob.id,
          mechanicId: targetMechanicId,
          mechanicName: targetMechanicName,
          customerQuoteAcceptedAt: Date.now(),
          fare: acceptedOfferPrice
            ? { service: acceptedOfferPrice, bookingFee: 0, total: acceptedOfferPrice }
            : undefined,
        },
      });
      haptic.success();
      Alert.alert(
        L("Service offered", "Servicio ofrecido"),
        L(`Your requested service was offered to ${targetMechanicName}.`, `Tu solicitud de servicio fue ofrecida a ${targetMechanicName}.`),
      );
    } catch (error) {
      console.error("[Messages] offer requested service failed:", error);
      haptic.error();
      Alert.alert(L("Could not offer service", "No se pudo ofrecer el servicio"), L("Please try again in a moment.", "Inténtalo de nuevo en un momento."));
    } finally {
      setOfferingService(false);
    }
  };

  return (
    <ScreenContainer 
      edges={["left", "right"]} 
      showBackButton 
      title={peerName ? `Chat with ${peerName}` : "In-app chat"}
      headerRight={
        showOfferRequestedService ? (
          <Pressable
            onPress={() => void handleOfferRequestedService()}
            disabled={offeringService}
            style={({ pressed }) => [
              styles.offerButton,
              offeringService && styles.offerButtonDisabled,
              pressed && { opacity: 0.82 },
            ]}
          >
            <Text style={styles.offerButtonText} numberOfLines={2}>
              {offeringService ? "Offering..." : "Offer my requested service"}
            </Text>
          </Pressable>
        ) : null
      }
    >
      {/* Content starts below consistent header */}

      <KeyboardAvoidingView
        style={styles.keyboardWrap}
        behavior={Platform.OS === "ios" ? "padding" : "height"}
        keyboardVerticalOffset={Platform.OS === "ios" ? 8 : 0}
      >
        <View style={styles.contactNote}>
          <IconSymbol name="lock.fill" size={12} color="#94A3B8" />
          <Text style={styles.contactNoteText}>
            {L(
              "Phone numbers, emails, and payment apps are hidden in chat. Keeping payment in WrenchUp keeps your refund, dispute, and payout protections.",
              "Los teléfonos, correos y apps de pago se ocultan en el chat. Pagar dentro de WrenchUp mantiene tus protecciones de reembolso, disputas y pagos.",
            )}
          </Text>
        </View>
        <FlatList
          data={messages}
          keyExtractor={(item) => item.id}
          contentContainerStyle={{ padding: 16, gap: 8 }}
          renderItem={renderMessage}
          keyboardShouldPersistTaps="handled"
        />

        <View style={styles.composer}>
          <TextInput
            value={text}
            onChangeText={setText}
            placeholder="Type a message..."
            placeholderTextColor="#94A3B8"
            style={styles.input}
          />
          <Pressable onPress={onSend} style={({ pressed }) => [styles.send, pressed && { opacity: 0.8 }]}>
            <IconSymbol name="paperplane.fill" size={16} color="#FFFFFF" />
          </Pressable>
        </View>
      </KeyboardAvoidingView>
    </ScreenContainer>
  );
}

const MessageBubble = React.memo(function MessageBubble({ item, userId }: any) {
  const mine = item.sender_user_id === userId;
  return (
    <View style={[styles.bubble, mine ? styles.bubbleMine : styles.bubbleOther]}>
      <Text style={styles.bubbleText}>{item.message}</Text>
      <Text style={styles.time}>
        {new Date(item.created_at).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}
      </Text>
    </View>
  );
});

const styles = StyleSheet.create({
  top: {
    paddingHorizontal: 16,
    paddingTop: 12,
    paddingBottom: 10,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  title: { color: "#F8FAFC", fontSize: 16, fontWeight: "800" },
  keyboardWrap: {
    flex: 1,
  },
  contactNote: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    marginHorizontal: 16,
    marginTop: 8,
    paddingHorizontal: 10,
    paddingVertical: 8,
    borderRadius: 10,
    backgroundColor: "rgba(148,163,184,0.12)",
  },
  contactNoteText: {
    flex: 1,
    color: "#94A3B8",
    fontSize: 11,
    lineHeight: 15,
  },
  offerButton: {
    maxWidth: 150,
    minHeight: 36,
    borderRadius: 11,
    paddingHorizontal: 10,
    paddingVertical: 6,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#F97316",
  },
  offerButtonDisabled: {
    opacity: 0.72,
  },
  offerButtonText: {
    color: "#FFFFFF",
    fontSize: 11,
    lineHeight: 13,
    fontWeight: "900",
    textAlign: "center",
  },
  bubble: { maxWidth: "82%", borderRadius: 12, padding: 10, gap: 4 },
  bubbleMine: { alignSelf: "flex-end", backgroundColor: "#F97316" },
  bubbleOther: { alignSelf: "flex-start", backgroundColor: "#1A1A2E", borderWidth: 1, borderColor: "#2A2A40" },
  bubbleText: { color: "#F8FAFC", fontSize: 14, fontWeight: "600" },
  time: { color: "#CBD5E1", fontSize: 10 },
  composer: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    padding: 12,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: "#2A2A40",
  },
  input: {
    flex: 1,
    backgroundColor: "#1A1A2E",
    borderWidth: 1,
    borderColor: "#2A2A40",
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
    color: "#F8FAFC",
  },
  send: {
    width: 40,
    height: 40,
    borderRadius: 10,
    backgroundColor: "#F97316",
    alignItems: "center",
    justifyContent: "center",
  },
});
