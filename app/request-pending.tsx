import { useEffect, useState } from "react";
import { ActivityIndicator, Pressable, StyleSheet, Text, View, Alert } from "react-native";
import { useRouter } from "expo-router";
import { ScreenContainer } from "@/components/screen-container";
import { IconSymbol } from "@/components/ui/icon-symbol";
import { useActiveJob, useStore } from "@/lib/store";
import { useLocaleContext, useL } from "@/hooks/use-locale";
import { localizedServiceName } from "@/lib/service-i18n";
import { haptic } from "@/lib/haptics";
import { notifyNow } from "@/lib/notifications";
import { safeReplace } from "@/lib/safe-router";
import { useAuth } from "@/lib/auth-context";
import { resolveAuthSession } from "@/lib/resolve-auth-session";
import { updateDispatchStatus } from "@/lib/live-dispatch";
import { useMechanicOffers } from "@/hooks/use-mechanic-offers";
import { saveUserHistory } from "@/lib/user-history-cache";
import { useTapGuard } from "@/hooks/use-tap-guard";

export default function RequestPendingScreen() {
  const router = useRouter();
  const job = useActiveJob();
  const { state, dispatch } = useStore();
  const { user } = useAuth();
  const { locale } = useLocaleContext();
  const L = useL();
  const { offers: mechanicOffers } = useMechanicOffers(job);
  const guardCancelRequest = useTapGuard();
  // The badge/banner should only ever reflect offers the customer can
  // actually act on right now — mechanicOffers accumulates every offer ever
  // sent on this request (including from mechanics who later declined/were
  // reassigned away), so a raw count would stay stuck showing a stale number
  // forever once the offering mechanic is no longer on the job.
  const actionableOfferCount = mechanicOffers.filter((o) => o.mechanicUserId === job?.mechanicId).length;
  const waitingOnMechanicConfirmation = !!job?.customerQuoteAcceptedAt && job.status === "searching";

  // Ticks every 20s just to force a re-render so the "taking longer than
  // usual" banner below can appear once enough time has passed — otherwise
  // this screen only re-renders on job/offer changes and could sit showing
  // "we'll let you know!" indefinitely with no signal that the search is
  // running long, even though the unmatched-request sweep may eventually
  // auto-cancel it server-side.
  const [, forceTick] = useState(0);
  useEffect(() => {
    const timer = setInterval(() => forceTick((n) => n + 1), 20000);
    return () => clearInterval(timer);
  }, []);
  const SEARCH_TAKING_LONG_MS = 3 * 60 * 1000;
  const searchingTooLong =
    job?.status === "searching" &&
    !waitingOnMechanicConfirmation &&
    actionableOfferCount === 0 &&
    Date.now() - job.createdAt >= SEARCH_TAKING_LONG_MS;

  useEffect(() => {
    if (!job) return;
    if (job.status !== "searching") {
      safeReplace("/tracking");
    }
  }, [job?.id, job?.status, router]); // eslint-disable-line react-hooks/exhaustive-deps -- only id/status matter for routing away

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

  // Never render the interactive "cancel request" UI once the job has moved
  // past searching (e.g. this screen resurfacing via the back button after
  // already being matched/accepted) — the effect above redirects to
  // /tracking immediately, but this closes the window where "Cancel
  // request" could still be tapped and cancel an already-active job.
  if (job.status !== "searching") {
    return (
      <ScreenContainer>
        <View style={styles.wrap}>
          <ActivityIndicator color="#FF7A24" />
        </View>
      </ScreenContainer>
    );
  }

  const handleCancelRequest = guardCancelRequest(async () => {
    haptic.warning();
    if (job.remoteRequestId && user?.id) {
      try {
        const resolved = await resolveAuthSession(user);
        if (resolved) {
          const synced = await updateDispatchStatus(resolved.sessionToken, job.remoteRequestId, "cancelled", {
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
        console.error("[RequestPending] Failed to cancel remote request:", error);
        Alert.alert(
          L("Connection issue", "Problema de conexión"),
          L("Could not cancel right now. Please try again.", "No se pudo cancelar ahora. Inténtalo de nuevo."),
        );
        return;
      }
    }
    dispatch({
      type: "UPDATE_JOB_STATUS",
      payload: { id: job.id, status: "cancelled" },
    });
    await saveUserHistory(user.id, {
      jobs: state.jobs.map((item) =>
        item.id === job.id
          ? {
              ...item,
              status: "cancelled",
              cancelledAt: Date.now(),
              cancelledByRole: "customer",
            }
          : item,
      ),
      activeJobId: null,
      mechanicJobs: state.mechanicJobs,
      mechanicActiveJobId: state.mechanicActiveJobId,
      paymentMethods: state.paymentMethods,
      defaultPaymentMethodId: state.defaultPaymentMethodId,
    });

    // Explicit notification for the cancellation
    const cancelTitle = L("Request cancelled", "Solicitud cancelada");
    const cancelBody = L(
      "Your service request has been cancelled while still searching. No fee applies.",
      "Tu solicitud de servicio fue cancelada mientras seguía buscando. No aplica cargo.",
    );
    dispatch({
      type: "ADD_INBOX_NOTIFICATION",
      payload: {
        id: `cancel-${job.id}-${Date.now()}`,
        title: cancelTitle,
        body: cancelBody,
        createdAt: Date.now(),
        roleScope: "customer",
        route: "/(tabs)/activity",
      },
    });
    notifyNow({ title: cancelTitle, body: cancelBody });

    Alert.alert(L("Trip canceled", "Viaje cancelado"), cancelBody, [
      { text: L("OK", "OK"), onPress: () => router.replace("/(tabs)" as any) },
    ]);
  });

  return (
    <ScreenContainer edges={["left", "right", "bottom"]} showBackButton title={L("Finding mechanic...", "Buscando mecánico...")}>
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

        {searchingTooLong ? (
          <View style={styles.longWaitCard}>
            <Text style={styles.longWaitText}>
              {L(
                "This is taking longer than usual — we're still looking for an available mechanic nearby. You can keep waiting or cancel with no charge.",
                "Esto está tardando más de lo usual — seguimos buscando un mecánico disponible cerca. Puedes seguir esperando o cancelar sin cargo.",
              )}
            </Text>
          </View>
        ) : null}

        {waitingOnMechanicConfirmation ? (
          <View style={styles.waitingCard}>
            <Text style={styles.waitingTitle}>
              {L("Offer accepted", "Oferta aceptada")}
            </Text>
            <Text style={styles.waitingText}>
              {job.mechanicName ? `${job.mechanicName} ${L("has not confirmed yet.", "todavía no ha confirmado.")}` : L("Waiting for mechanic confirmation.", "Esperando confirmación del mecánico.")}
            </Text>
            <Text style={styles.waitingAccent}>
              {L("We’ll update you as soon as they accept.", "Te avisaremos cuando confirme.")}
            </Text>
          </View>
        ) : job.status === "searching" && actionableOfferCount > 0 ? (
          <Pressable
            onPress={() => {
              haptic.light();
              router.push("/mechanic-offers" as any);
            }}
            style={({ pressed }) => [styles.offersButton, pressed && { opacity: 0.9 }]}
          >
            <IconSymbol name="tag.fill" size={16} color="#FFFFFF" />
            <Text style={styles.offersButtonText}>
              {L("Offers from mechanics", "Ofertas de mecánicos")} ({actionableOfferCount})
            </Text>
            <IconSymbol name="chevron.right" size={14} color="#FFFFFF" />
          </Pressable>
        ) : null}

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
    backgroundColor: "rgba(249,115,22,0.18)",
    borderWidth: 1,
    borderColor: "rgba(253,186,116,0.58)",
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
    color: "#E2E8F0",
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
    backgroundColor: "#111827",
    borderWidth: 1,
    borderColor: "#475569",
  },
  cancelBtnText: {
    color: "#F8FAFC",
    fontSize: 14,
    fontWeight: "800",
  },
  longWaitCard: {
    marginTop: 20,
    padding: 14,
    backgroundColor: "rgba(249,115,22,0.12)",
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "rgba(253,186,116,0.5)",
    width: "100%",
  },
  longWaitText: {
    color: "#FDBA74",
    fontSize: 13,
    lineHeight: 19,
    fontWeight: "700",
    textAlign: "center",
  },
  waitingCard: {
    marginTop: 20,
    padding: 16,
    backgroundColor: "#0B2545",
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "#60A5FA",
    width: "100%",
  },
  waitingTitle: { color: "#EFF6FF", fontWeight: "900", fontSize: 15 },
  waitingText: { color: "#DBEAFE", marginTop: 6, lineHeight: 19, fontWeight: "600" },
  waitingAccent: { color: "#BFDBFE", marginTop: 8, fontWeight: "900" },
  offersButton: {
    marginTop: 20,
    width: "100%",
    backgroundColor: "#F97316",
    borderRadius: 12,
    paddingVertical: 14,
    paddingHorizontal: 16,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
  },
  offersButtonText: { color: "#FFFFFF", fontSize: 14, fontWeight: "800" },
});
