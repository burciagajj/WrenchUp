import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import type { RealtimeChannel } from "@supabase/supabase-js";
import { IconSymbol } from "@/components/ui/icon-symbol";
import { useAuth } from "@/lib/auth-context";
import { useStore } from "@/lib/store";
import { fetchServiceMessages, type ServiceMessage } from "@/lib/live-dispatch";
import { resolveAuthSession } from "@/lib/resolve-auth-session";
import { buildChatNotificationBody, buildChatNotificationRoute } from "@/lib/chat-notifications";
import { notifyNow } from "@/lib/notifications";
import { getSupabaseRealtimeClient } from "@/lib/supabase-realtime";
import { safePush } from "@/lib/safe-router";

const POLL_MS = 5000;
const FIRST_LOAD_GRACE_MS = 5000;

type ParticipantRole = "customer" | "mechanic";

type WatchedChat = {
  key: string;
  requestId: string;
  roleScope: ParticipantRole;
  peerName: string;
  route: string;
};

type BannerState = {
  id: string;
  body: string;
  route: string;
};

function isCustomerWatchable(status: string): boolean {
  return status !== "completed" && status !== "cancelled";
}

function isMechanicWatchable(status: string): boolean {
  return status !== "completed" && status !== "cancelled" && status !== "declined";
}

function messageCreatedAt(message: ServiceMessage): number {
  const parsed = Date.parse(message.created_at);
  return Number.isFinite(parsed) ? parsed : Date.now();
}

function messagePreview(message: string, senderRole: ParticipantRole): string {
  return (
    buildChatNotificationBody(message) ||
    (senderRole === "mechanic" ? "Mechanic sent you a message." : "Customer sent you a message.")
  );
}

export function ChatMessageSync() {
  const { user } = useAuth();
  const { state, dispatch } = useStore();
  const insets = useSafeAreaInsets();
  const [banner, setBanner] = useState<BannerState | null>(null);

  const watchedChats = useMemo(() => {
    const map = new Map<string, WatchedChat>();

    for (const job of state.jobs) {
      if (!job.remoteRequestId || !isCustomerWatchable(job.status)) continue;
      const peerName = job.mechanicName?.trim() || "Mechanic";
      const key = `customer:${job.remoteRequestId}`;
      map.set(key, {
        key,
        requestId: job.remoteRequestId,
        roleScope: "customer",
        peerName,
        route: buildChatNotificationRoute(job.remoteRequestId, peerName),
      });
    }

    for (const job of state.mechanicJobs) {
      if (!job.remoteRequestId || !isMechanicWatchable(job.status)) continue;
      const peerName = job.customerName?.trim() || "Customer";
      const key = `mechanic:${job.remoteRequestId}`;
      map.set(key, {
        key,
        requestId: job.remoteRequestId,
        roleScope: "mechanic",
        peerName,
        route: buildChatNotificationRoute(job.remoteRequestId, peerName),
      });
    }

    return Array.from(map.values());
  }, [state.jobs, state.mechanicJobs]);

  const watchedKey = useMemo(
    () => watchedChats.map((chat) => chat.key).sort().join("|"),
    [watchedChats],
  );
  const watchedChatsRef = useRef(watchedChats);
  const seenMessageIdsRef = useRef<Set<string>>(new Set());
  const initializedChatKeysRef = useRef<Set<string>>(new Set());
  const chatStartedAtRef = useRef<Map<string, number>>(new Map());
  const realtimeChannelsRef = useRef<Map<string, RealtimeChannel>>(new Map());

  watchedChatsRef.current = watchedChats;

  useEffect(() => {
    const activeKeys = new Set(watchedChats.map((chat) => chat.key));
    for (const chat of watchedChats) {
      if (!chatStartedAtRef.current.has(chat.key)) {
        chatStartedAtRef.current.set(chat.key, Date.now());
      }
    }
    for (const key of Array.from(chatStartedAtRef.current.keys())) {
      if (!activeKeys.has(key)) {
        chatStartedAtRef.current.delete(key);
        initializedChatKeysRef.current.delete(key);
      }
    }
  }, [watchedChats]);

  useEffect(() => {
    if (!banner) return;
    const timer = setTimeout(() => setBanner(null), 3500);
    return () => clearTimeout(timer);
  }, [banner]);

  const handleIncomingMessage = useCallback(
    (chat: WatchedChat, message: ServiceMessage, fromInitialLoad = false) => {
      if (!user?.id || !message.id) return;
      const messageId = String(message.id);
      if (seenMessageIdsRef.current.has(messageId)) return;

      if (message.sender_user_id === user.id) {
        seenMessageIdsRef.current.add(messageId);
        return;
      }

      if (fromInitialLoad) {
        const startedAt = chatStartedAtRef.current.get(chat.key) ?? Date.now();
        if (messageCreatedAt(message) < startedAt - FIRST_LOAD_GRACE_MS) {
          seenMessageIdsRef.current.add(messageId);
          return;
        }
      }

      seenMessageIdsRef.current.add(messageId);
      const body = messagePreview(message.message, message.sender_role);
      const notification = {
        id: `chat-message-${messageId}`,
        title: "New Message",
        body,
        createdAt: messageCreatedAt(message),
        roleScope: chat.roleScope,
        route: chat.route,
      };

      dispatch({ type: "ADD_INBOX_NOTIFICATION", payload: notification });
      setBanner({ id: messageId, body, route: chat.route });
      void notifyNow({
        title: "New Message",
        body,
        data: {
          kind: "chat_message",
          messageId,
          requestId: chat.requestId,
          route: chat.route,
          peerName: chat.peerName,
        },
      });
    },
    [dispatch, user?.id],
  );

  useEffect(() => {
    if (!user?.id || watchedChats.length === 0) return;

    let alive = true;
    let inFlight = false;
    let timer: ReturnType<typeof setTimeout> | null = null;

    const run = async () => {
      if (inFlight) return;
      const chats = watchedChatsRef.current;
      if (!chats.length) return;
      inFlight = true;
      try {
        const resolved = await resolveAuthSession(user);
        if (!resolved || !alive) return;

        await Promise.all(
          chats.map(async (chat) => {
            const rows = await fetchServiceMessages(resolved.sessionToken, chat.requestId);
            if (!alive) return;
            const isInitialLoad = !initializedChatKeysRef.current.has(chat.key);
            for (const row of rows) {
              handleIncomingMessage(chat, row, isInitialLoad);
            }
            initializedChatKeysRef.current.add(chat.key);
          }),
        );
      } catch (error) {
        console.warn("[ChatMessageSync] Poll failed:", error);
      } finally {
        inFlight = false;
      }
    };

    const loop = async () => {
      await run();
      if (!alive) return;
      timer = setTimeout(() => void loop(), POLL_MS);
    };

    void loop();
    return () => {
      alive = false;
      if (timer) clearTimeout(timer);
    };
  }, [handleIncomingMessage, user?.id, watchedChats.length, watchedKey]);

  useEffect(() => {
    const client = getSupabaseRealtimeClient();
    if (!client || !user?.id || watchedChats.length === 0) {
      for (const channel of realtimeChannelsRef.current.values()) {
        client?.removeChannel(channel);
      }
      realtimeChannelsRef.current.clear();
      return;
    }

    let cancelled = false;
    const channels = realtimeChannelsRef.current;

    const setupRealtime = async () => {
      try {
        const resolved = await resolveAuthSession(user);
        if (!resolved || cancelled) return;

        client.realtime.setAuth(resolved.sessionToken);
        const activeKeys = new Set(watchedChatsRef.current.map((chat) => chat.key));

        for (const [key, channel] of channels.entries()) {
          if (!activeKeys.has(key)) {
            client.removeChannel(channel);
            channels.delete(key);
          }
        }

        for (const chat of watchedChatsRef.current) {
          if (channels.has(chat.key)) continue;
          const channel = client
            .channel(`service_messages:${chat.key}`)
            .on(
              "postgres_changes",
              {
                event: "INSERT",
                schema: "public",
                table: "service_messages",
                filter: `request_id=eq.${chat.requestId}`,
              },
              (payload: any) => {
                const incoming = (payload.new ?? payload.record) as ServiceMessage | undefined;
                if (incoming) {
                  handleIncomingMessage(chat, incoming);
                }
              },
            )
            .subscribe();
          channels.set(chat.key, channel);
        }
      } catch (error) {
        console.warn("[ChatMessageSync] Realtime setup failed:", error);
      }
    };

    void setupRealtime();

    return () => {
      cancelled = true;
      for (const channel of channels.values()) {
        client.removeChannel(channel);
      }
      channels.clear();
    };
  }, [handleIncomingMessage, user?.id, watchedChats.length, watchedKey]);

  if (!banner) return null;

  return (
    <Pressable
      onPress={() => {
        const route = banner.route;
        setBanner(null);
        safePush(route as never);
      }}
      style={[styles.banner, { top: insets.top + 10 }]}
    >
      <View style={styles.iconWrap}>
        <IconSymbol name="message.fill" size={18} color="#FFFFFF" />
      </View>
      <View style={styles.bannerText}>
        <Text style={styles.bannerTitle}>New Message</Text>
        <Text style={styles.bannerBody} numberOfLines={1}>
          {banner.body}
        </Text>
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  banner: {
    position: "absolute",
    left: 16,
    right: 16,
    zIndex: 10000,
    elevation: 20,
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: "rgba(45, 212, 191, 0.35)",
    backgroundColor: "#111827",
    paddingHorizontal: 14,
    paddingVertical: 12,
    shadowColor: "#000",
    shadowOpacity: 0.25,
    shadowRadius: 18,
    shadowOffset: { width: 0, height: 8 },
  },
  iconWrap: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#F97316",
  },
  bannerText: {
    flex: 1,
  },
  bannerTitle: {
    color: "#F8FAFC",
    fontSize: 15,
    fontWeight: "900",
  },
  bannerBody: {
    color: "#CBD5E1",
    fontSize: 13,
    fontWeight: "600",
    marginTop: 2,
  },
});
