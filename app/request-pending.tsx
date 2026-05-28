import { useEffect } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { useRouter } from "expo-router";
import { ScreenContainer } from "@/components/screen-container";
import { IconSymbol } from "@/components/ui/icon-symbol";
import { useActiveJob, useStore } from "@/lib/store";
import { useLocaleContext } from "@/hooks/use-locale";
import { localizedServiceName } from "@/lib/service-i18n";
import { haptic } from "@/lib/haptics";
import { useAuth } from "@/lib/auth-context";
import { resolveAuthSession } from "@/lib/resolve-auth-session";
import { updateDispatchStatus } from "@/lib/live-dispatch";

export default function RequestPendingScreen() {
  const router = useRouter();
  const job = useActiveJob();
  const { dispatch } = useStore();
  const { user } = useAuth();
  const { locale } = useLocaleContext();
  const isEs = locale === "es-MX";
  const L = (en: string, es: string) => (isEs ? es : en);

  useEffect(() => {
    if (!job) return;
    if (job.status !== "searching") {
      router.replace("/tracking" as any);
    }
  }, [job?.id, job?.status, router]);

  if (!job) {
    return (
      <ScreenContainer>
        <View style={styles.wrap}>
          <Text style={styles.title}>{L("No active request", "No hay solicitud activa")}</Text>
          <Pressable onPress={() => router.replace("/(tabs)" as any)} style={styles.btn}>
            <Text style={styles.btnText}>{L("Back Home", "Volver al inicio")}</Text>
          </Pressable>
        </View>
      </ScreenContainer>
    );
  }

  const handleCancelRequest = async () => {
    haptic.warning();
    if (job.remoteRequestId && user?.id) {
      try {
        const resolved = await resolveAuthSession(user);
        if (resolved) {
          await updateDispatchStatus(resolved.sessionToken, job.remoteRequestId, "cancelled");
        }
      } catch (error) {
        console.error("[RequestPending] Failed to cancel remote request:", error);
      }
    }
    dispatch({
      type: "UPDATE_JOB_STATUS",
      payload: { id: job.id, status: "cancelled" },
    });
    router.replace("/(tabs)" as any);
  };

  return (
    <ScreenContainer edges={["top", "left", "right", "bottom"]}>
      <View style={styles.wrap}>
        <View style={styles.iconWrap}>
          <IconSymbol name="hourglass" size={32} color="#FF7A24" />
        </View>
        <Text style={styles.title}>
          {L("We'll let you know when you match with a mechanic!", "¡Te avisaremos cuando te emparejemos con un mecánico!")}
        </Text>
        <Text style={styles.sub}>
          {localizedServiceName(job.service, locale)}{"\n"}{job.location}
        </Text>
        <Pressable
          onPress={() => {
            haptic.light();
            router.replace("/(tabs)" as any);
          }}
          style={styles.btn}
        >
          <Text style={styles.btnText}>{L("Go to Home", "Ir al inicio")}</Text>
        </Pressable>
        <Pressable onPress={() => void handleCancelRequest()} style={styles.cancelBtn}>
          <Text style={styles.cancelBtnText}>{L("Cancel request", "Cancelar solicitud")}</Text>
        </Pressable>
      </View>
    </ScreenContainer>
  );
}

const styles = StyleSheet.create({
  wrap: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 24,
    backgroundColor: "#04122E",
  },
  iconWrap: {
    width: 74,
    height: 74,
    borderRadius: 37,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(255,122,36,0.14)",
    borderWidth: 1,
    borderColor: "rgba(255,122,36,0.45)",
    marginBottom: 16,
  },
  title: {
    color: "#F8FAFC",
    fontSize: 24,
    fontWeight: "900",
    lineHeight: 31,
    textAlign: "center",
  },
  sub: {
    color: "#CBD5E1",
    fontSize: 14,
    fontWeight: "600",
    lineHeight: 20,
    textAlign: "center",
    marginTop: 12,
  },
  btn: {
    marginTop: 18,
    borderRadius: 12,
    paddingHorizontal: 16,
    paddingVertical: 12,
    backgroundColor: "#FF6A14",
  },
  btnText: {
    color: "#FFFFFF",
    fontSize: 14,
    fontWeight: "800",
  },
  cancelBtn: {
    marginTop: 10,
    borderRadius: 12,
    paddingHorizontal: 16,
    paddingVertical: 12,
    backgroundColor: "rgba(255,255,255,0.08)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.2)",
  },
  cancelBtnText: {
    color: "#F8FAFC",
    fontSize: 14,
    fontWeight: "800",
  },
});
