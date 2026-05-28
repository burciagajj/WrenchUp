import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { useRouter } from "expo-router";
import { ScreenContainer } from "@/components/screen-container";
import { IconSymbol } from "@/components/ui/icon-symbol";
import { useStore } from "@/lib/store";
import { useAuth } from "@/lib/auth-context";
import { useLocaleContext } from "@/hooks/use-locale";

export default function NotificationsScreen() {
  const router = useRouter();
  const { state, dispatch } = useStore();
  const { user } = useAuth();
  const { locale } = useLocaleContext();
  const isEs = locale === "es-MX";
  const L = (en: string, es: string) => (isEs ? es : en);

  const role = user?.role ?? state.role;
  const rows = state.notificationsInbox.filter((n) => n.roleScope === "all" || n.roleScope === role);

  return (
    <ScreenContainer edges={["top", "left", "right", "bottom"]}>
      <View style={styles.header}>
        <Pressable onPress={() => router.back()} hitSlop={10}>
          <IconSymbol name="chevron.left" size={22} color="#F8FAFC" />
        </Pressable>
        <Text style={styles.title}>{L("Notifications", "Notificaciones")}</Text>
        <Pressable onPress={() => dispatch({ type: "MARK_INBOX_READ" })} hitSlop={8}>
          <Text style={styles.readAll}>{L("Read all", "Marcar todo")}</Text>
        </Pressable>
      </View>

      <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 32 }}>
        {rows.length === 0 ? (
          <View style={styles.empty}>
            <IconSymbol name="bell" size={22} color="#94A3B8" />
            <Text style={styles.emptyTitle}>{L("No notifications yet", "Aún no hay notificaciones")}</Text>
          </View>
        ) : (
          rows.map((item) => (
            <Pressable
              key={item.id}
              onPress={() => {
                dispatch({ type: "MARK_INBOX_READ", payload: { id: item.id } });
                if (item.route) router.push(item.route as any);
              }}
              style={({ pressed }) => [styles.card, !item.readAt && styles.cardUnread, pressed && { opacity: 0.9 }]}
            >
              <View style={styles.cardHead}>
                <Text style={styles.cardTitle}>{item.title}</Text>
                <Text style={styles.cardTime}>{new Date(item.createdAt).toLocaleTimeString(isEs ? "es-MX" : "en-US", { hour: "numeric", minute: "2-digit" })}</Text>
              </View>
              <Text style={styles.cardBody}>{item.body}</Text>
            </Pressable>
          ))
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
});
