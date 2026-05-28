import { useEffect, useMemo, useRef, useState } from "react";
import { FlatList, Pressable, StyleSheet, Text, TextInput, View } from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import { ScreenContainer } from "@/components/screen-container";
import { IconSymbol } from "@/components/ui/icon-symbol";
import { useAuth } from "@/lib/auth-context";
import { resolveAuthSession } from "@/lib/resolve-auth-session";
import { fetchServiceMessages, sendServiceMessage, type ServiceMessage } from "@/lib/live-dispatch";
import { haptic } from "@/lib/haptics";

export default function MessagesScreen() {
  const router = useRouter();
  const { requestId, peerName } = useLocalSearchParams<{ requestId: string; peerName?: string }>();
  const { user } = useAuth();
  const [messages, setMessages] = useState<ServiceMessage[]>([]);
  const [text, setText] = useState("");
  const [sending, setSending] = useState(false);
  const inFlightRef = useRef(false);
  const backoffRef = useRef(12000);

  const role = useMemo(() => (user?.role === "mechanic" ? "mechanic" : "customer"), [user?.role]);

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

  const onSend = async () => {
    const trimmed = text.trim();
    if (!trimmed || !requestId || !user?.id || sending) return;
    setSending(true);
    try {
      const resolved = await resolveAuthSession(user);
      if (!resolved) return;
      await sendServiceMessage(resolved.sessionToken, {
        requestId,
        senderUserId: user.id,
        senderRole: role,
        message: trimmed,
      });
      setText("");
      haptic.success();
      const rows = await fetchServiceMessages(resolved.sessionToken, requestId);
      setMessages(rows);
    } catch (error) {
      console.error("[Messages] send failed:", error);
    } finally {
      setSending(false);
    }
  };

  return (
    <ScreenContainer edges={["top", "left", "right"]}>
      <View style={styles.top}>
        <Pressable onPress={() => router.back()} hitSlop={8}>
          <IconSymbol name="chevron.left" size={22} color="#E2E8F0" />
        </Pressable>
        <Text style={styles.title}>{peerName ? `Chat with ${peerName}` : "In-app chat"}</Text>
        <View style={{ width: 22 }} />
      </View>

      <FlatList
        data={messages}
        keyExtractor={(item) => item.id}
        contentContainerStyle={{ padding: 16, gap: 8 }}
        renderItem={({ item }) => {
          const mine = item.sender_user_id === user?.id;
          return (
            <View style={[styles.bubble, mine ? styles.bubbleMine : styles.bubbleOther]}>
              <Text style={styles.bubbleText}>{item.message}</Text>
              <Text style={styles.time}>
                {new Date(item.created_at).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}
              </Text>
            </View>
          );
        }}
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
    </ScreenContainer>
  );
}

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
