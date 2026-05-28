import { ScrollView, StyleSheet, Text, View, Pressable, Dimensions, PanResponder, Animated, Alert } from "react-native";
import { useEffect, useMemo, useRef, useState, useCallback } from "react";
import { useRouter } from "expo-router";
import { HomeMap } from "@/components/home-map";
import { DrawerMenuButton } from "@/components/drawer-menu-button";
import { useStore, useMechanicActiveJob, usePendingMechanicJob } from "@/lib/store";
import { IconSymbol } from "@/components/ui/icon-symbol";
import { PrimaryButton } from "@/components/primary-button";
import { haptic } from "@/lib/haptics";
import { notifyNow, scheduleNotificationAt } from "@/lib/notifications";
import { getServiceType } from "@/lib/seed";
import type { MechanicJob } from "@/lib/types";
import { useAuth } from "@/lib/auth-context";
import { resolveAuthSession } from "@/lib/resolve-auth-session";
import { fetchOpenDispatchRequests } from "@/lib/live-dispatch";
import { useLocaleContext } from "@/hooks/use-locale";
import { deriveBookedMeta } from "@/lib/booked-trip";
import { computeMechanicMetrics } from "@/lib/mechanic-metrics";
import Svg, { Defs, LinearGradient, Rect, Stop } from "react-native-svg";

const { height: screenHeight } = Dimensions.get("window");
const MIN_SHEET_HEIGHT = 80;
const MID_SHEET_HEIGHT = screenHeight * 0.5;
const MAX_SHEET_HEIGHT = screenHeight * 0.75;
const INITIAL_SHEET_HEIGHT = MID_SHEET_HEIGHT;
const SNAP_POINTS = [MIN_SHEET_HEIGHT, MID_SHEET_HEIGHT, MAX_SHEET_HEIGHT];

function getDayStartAt4AM(nowMs: number): number {
  const d = new Date(nowMs);
  const start = new Date(d);
  start.setHours(4, 0, 0, 0);
  if (d.getTime() < start.getTime()) {
    start.setDate(start.getDate() - 1);
  }
  return start.getTime();
}

function clampSheetHeight(h: number) {
  return Math.max(MIN_SHEET_HEIGHT, Math.min(MAX_SHEET_HEIGHT, h));
}

export function MechanicHome() {
  const router = useRouter();
  const { state, dispatch } = useStore();
  const { user } = useAuth();
  const { locale, region } = useLocaleContext();
  const isEs = locale === "es-MX";
  const L = (en: string, es: string) => (isEs ? es : en);
  const pending = usePendingMechanicJob();
  const active = useMechanicActiveJob();
  const unreadCount = state.notificationsInbox.filter(
    (n) => !n.readAt && (n.roleScope === "all" || n.roleScope === "mechanic"),
  ).length;
  const lastRoutedPendingIdRef = useRef<string | null>(null);
  const sheetHeightRef = useRef(INITIAL_SHEET_HEIGHT);
  const sheetAnim = useRef(new Animated.Value(INITIAL_SHEET_HEIGHT)).current;
  const [sheetHeight, setSheetHeight] = useState(INITIAL_SHEET_HEIGHT);
  const scheduledReminderIdsRef = useRef<Set<string>>(new Set());

  const applySheetHeight = useCallback(
    (height: number, animate = true) => {
      const clamped = clampSheetHeight(height);
      sheetHeightRef.current = clamped;
      setSheetHeight(clamped);
      if (animate) {
        Animated.spring(sheetAnim, {
          toValue: clamped,
          useNativeDriver: false,
          friction: 9,
          tension: 68,
        }).start();
      } else {
        sheetAnim.setValue(clamped);
      }
    },
    [sheetAnim]
  );

  const panResponder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder: (_, gestureState) => Math.abs(gestureState.dy) > 4,
      onPanResponderTerminationRequest: () => false,
      onPanResponderGrant: () => {
        sheetAnim.stopAnimation((value) => {
          sheetHeightRef.current = value;
        });
      },
      onPanResponderMove: (_, gestureState) => {
        const next = clampSheetHeight(sheetHeightRef.current - gestureState.dy);
        sheetAnim.setValue(next);
      },
      onPanResponderRelease: (_, gestureState) => {
        const releaseHeight = clampSheetHeight(sheetHeightRef.current - gestureState.dy);
        const velocity = gestureState.vy;

        let snap = SNAP_POINTS[0];
        const speed = Math.abs(velocity);

        if (speed > 0.8) {
          snap = velocity > 0 ? MIN_SHEET_HEIGHT : MAX_SHEET_HEIGHT;
        } else {
          snap = SNAP_POINTS.reduce((prev, curr) => {
            return Math.abs(curr - releaseHeight) < Math.abs(prev - releaseHeight) ? curr : prev;
          });
        }

        applySheetHeight(snap);
      },
    })
  ).current;

  // Stats from completed mechanic jobs
  const stats = useMemo(() => {
    const completed = state.mechanicJobs.filter((j) => j.status === "completed");
    const earnings = completed.reduce((sum, j) => sum + j.payout, 0);
    const start = getDayStartAt4AM(Date.now());
    const completedToday = completed.filter((j) => (j.completedAt ?? j.receivedAt) >= start);
    const earningsToday = completedToday
      .reduce((sum, j) => sum + j.payout, 0);
    return {
      count: completed.length,
      earnings,
      earningsToday,
      servicesToday: completedToday.length,
    };
  }, [state.mechanicJobs]);
  const metrics = useMemo(() => computeMechanicMetrics(state.mechanicJobs), [state.mechanicJobs]);

  const isJobPending = useMemo(
    () => state.mechanicJobs.some((j) => j.status === "pending"),
    [state.mechanicJobs]
  );

  // Pull real customer requests while online and idle.
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  useEffect(() => {
    if (intervalRef.current) {
      clearInterval(intervalRef.current);
      intervalRef.current = null;
    }
    if (!state.mechanicOnline) return;
    if (!user?.id) return;

    const tryFetch = async () => {
      if (isJobPending) {
        return;
      }

      // CRITICAL: Block ALL new requests if mechanic has active job
      // Active job = heading_there, arrived, in_progress (pending is awaiting accept, so still allow new requests)
      const hasActiveJob = state.mechanicJobs.some(
        (j) => j.status === "heading_there" || j.status === "arrived" || j.status === "in_progress",
      );
      if (hasActiveJob) return;
      
      const hasPendingJob = state.mechanicJobs.some((j) => j.status === "pending");
      if (hasPendingJob) return;
      try {
        const resolved = await resolveAuthSession(user);
        if (!resolved) return;
        const requests = await fetchOpenDispatchRequests(resolved.sessionToken, user.id, region);
        const regionSafeRequests = requests.filter((req) => {
          if (req.region_code === region) return true;
          if (req.region_code) return false;
          const normalizedCurrency = (req.currency || "").toUpperCase();
          return region === "MX" ? normalizedCurrency === "MXN" : normalizedCurrency !== "MXN";
        });
        const next = regionSafeRequests.find((req) => !state.mechanicJobs.some((j) => j.remoteRequestId === req.id));
        if (!next) return;
        const bookedMeta = deriveBookedMeta(next.scheduled_for ?? null, next.customer_note ?? null);
        const payout = Number((next.mechanic_payout ?? next.offered_price) || 0);
        const job: MechanicJob = {
          id: next.id,
          remoteRequestId: next.id,
          isBooked: bookedMeta.isBooked,
          customerName: next.customer_name ?? "Customer",
          customerPhotoUrl: next.customer_photo_url ?? null,
          vehicle: next.vehicle_label,
          service: next.service_code as any,
          location: next.location_label,
          distanceMiles: 1.5,
          payout: Number.isFinite(payout) ? payout : 0,
          status: "pending",
          receivedAt: Date.now(),
          scheduledFor: bookedMeta.scheduledForMs,
          customerNote: bookedMeta.cleanNote,
          customerHasParts: typeof next.customer_has_parts === "boolean" ? next.customer_has_parts : null,
          issuePhotoUrl: next.issue_photo_url ?? null,
        };
        dispatch({ type: "ADD_MECHANIC_JOB", payload: job });
        const service = getServiceType(job.service);
        if (job.isBooked) {
          dispatch({
            type: "ADD_INBOX_NOTIFICATION",
            payload: {
              id: `booked-available-${job.id}`,
              title: L("Booked job available", "Servicio agendado disponible"),
              body: `${job.customerName} • ${service?.name ?? L("Service", "Servicio")} • $${job.payout.toFixed(2)}`,
              createdAt: Date.now(),
              roleScope: "mechanic",
              route: `/mechanic/incoming?id=${encodeURIComponent(job.id)}`,
            },
          });
        }
        notifyNow({
          title: job.isBooked ? L("Booked job available", "Servicio agendado disponible") : L("New job request", "Nueva solicitud de trabajo"),
          body: `${service?.name ?? "Service"} • $${job.payout.toFixed(2)}`,
          data: { kind: "mechanic_request", id: job.id },
        });
        haptic.medium();
      } catch (error) {
        console.error("[MechanicHome] Failed to fetch live requests:", error);
      }
    };

    const first = setTimeout(() => void tryFetch(), 1200);
    intervalRef.current = setInterval(() => void tryFetch(), 8000);
    return () => {
      clearTimeout(first);
      if (intervalRef.current) clearInterval(intervalRef.current);
      intervalRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state.mechanicOnline, state.mechanicJobs, isJobPending, dispatch, user]);

  // When a pending request comes in, route to incoming sheet
  useEffect(() => {
    if (pending?.id && lastRoutedPendingIdRef.current !== pending.id) {
      lastRoutedPendingIdRef.current = pending.id;
      router.push({ pathname: "/mechanic/incoming" as any, params: { id: pending.id } } as any);
      return;
    }

    if (!pending) {
      lastRoutedPendingIdRef.current = null;
    }
  }, [pending?.id, router]);

  // Schedule one-hour reminders for accepted booked jobs.
  useEffect(() => {
    const upcomingJobs = state.mechanicJobs.filter(
      (j) => j.status === "upcoming" && typeof j.scheduledFor === "number"
    );
    for (const job of upcomingJobs) {
      if (!job.scheduledFor) continue;
      if (scheduledReminderIdsRef.current.has(job.id)) continue;
      const remindAt = new Date(job.scheduledFor - 60 * 60 * 1000);
      if (remindAt.getTime() <= Date.now()) continue;
      scheduledReminderIdsRef.current.add(job.id);
      void scheduleNotificationAt({
        title: L("Upcoming booked job in 1 hour", "Trabajo agendado en 1 hora"),
        body: `${job.customerName} • ${job.vehicle}`,
        at: remindAt,
        data: { kind: "booked_job_reminder", id: job.id },
      });
    }
  }, [state.mechanicJobs, L]);

  // Safety net for stale cached state: booked/upcoming jobs should not be treated as live active trips.
  useEffect(() => {
    if (!active) return;
    const isFutureBooked =
      active.status === "upcoming" ||
      (!!active.isBooked &&
        (typeof active.scheduledFor !== "number" || active.scheduledFor > Date.now()));
    if (!isFutureBooked) return;
    dispatch({
      type: "UPDATE_MECHANIC_JOB_STATUS",
      payload: { id: active.id, status: "upcoming" },
    });
    router.replace(`/mechanic/booked?id=${encodeURIComponent(active.id)}` as any);
  }, [active?.id, active?.status, active?.scheduledFor, dispatch, router]);

  // Booked jobs should only enter live trip flow at/after scheduled time.
  useEffect(() => {
    const dueUpcoming = state.mechanicJobs.find(
      (j) =>
        j.status === "upcoming" &&
        typeof j.scheduledFor === "number" &&
        j.scheduledFor <= Date.now()
    );
    if (!dueUpcoming) return;
    dispatch({
      type: "UPDATE_MECHANIC_JOB_STATUS",
      payload: { id: dueUpcoming.id, status: "heading_there" },
    });
    notifyNow({
      title: L("Booked job ready to start", "Trabajo agendado listo para iniciar"),
      body: `${dueUpcoming.customerName} • ${dueUpcoming.vehicle}`,
      data: { kind: "booked_job_due", id: dueUpcoming.id },
    });
    router.push("/mechanic/active" as any);
  }, [state.mechanicJobs, dispatch, router, L]);

  const switchToCustomer = () => {
    haptic.selection();
    Alert.alert(
      L("Change mode", "Cambiar modo"),
      L("Are you sure you want to switch to customer mode?", "¿Seguro que quieres cambiar a modo cliente?"),
      [
        { text: L("Cancel", "Cancelar"), style: "cancel" },
        {
          text: L("Confirm", "Confirmar"),
          style: "default",
          onPress: () => {
            dispatch({ type: "SET_MECHANIC_ONLINE", payload: false });
            dispatch({ type: "SET_DASHBOARD_ROLE_OVERRIDE", payload: "customer" });
            haptic.success();
          },
        },
      ]
    );
  };

  return (
    <View style={{ flex: 1 }}>
      <View style={{ flex: 1 }}>
        <HomeMap locateBottomOffset={sheetHeight + 16} />
        <DrawerMenuButton variant="map" />
        <Pressable
          onPress={() => router.push("/notifications" as any)}
          style={styles.mapBellBtn}
        >
          <IconSymbol name="bell.fill" size={16} color="#F8FAFC" />
          {unreadCount > 0 ? (
            <View style={styles.mapBellBadge}>
              <Text style={styles.mapBellBadgeText}>{Math.min(99, unreadCount)}</Text>
            </View>
          ) : null}
        </Pressable>
        <View style={styles.earningsPillWrap} pointerEvents="none">
          <View style={styles.earningsPill}>
            <Text style={styles.earningsPillValue}>${stats.earningsToday.toFixed(2)}</Text>
            <Text style={styles.earningsPillLabel}>
              {L("Earnings", "Ganancias")} | {stats.servicesToday} {L("services done", "servicios")}
            </Text>
          </View>
        </View>
      </View>

      {/* Collapsible Bottom Sheet */}
      <Animated.View
        style={{
          position: "absolute",
          bottom: 0,
          left: 0,
          right: 0,
          height: sheetAnim,
          backgroundColor: "rgba(5, 11, 24, 0.97)",
          borderTopLeftRadius: 20,
          borderTopRightRadius: 20,
          shadowColor: "#000",
          shadowOffset: { width: 0, height: -2 },
          shadowOpacity: 0.1,
          shadowRadius: 8,
          elevation: 5,
          overflow: "hidden",
        }}
      >
        <View
          style={styles.sheetHandleZone}
          {...panResponder.panHandlers}
          collapsable={false}
        >
          <View style={styles.sheetHandle} />
        </View>
        <ScrollView
          contentContainerStyle={{ paddingBottom: 32 }}
          showsVerticalScrollIndicator={false}
          scrollEnabled={sheetHeight >= MAX_SHEET_HEIGHT * 0.85}
        >
          <View style={styles.sheetContent}>
            {/* Header */}
            <View style={styles.headerPad}>
              <Text style={styles.greeting}>{L("Mechanic dashboard", "Panel de mecánico")}</Text>
              <Text style={styles.userName}>{state.userName}</Text>
            </View>

            {/* Primary Go Online CTA */}
            <View style={{ paddingHorizontal: 20, marginBottom: 16 }}>
              <Pressable
                onPress={() => {
                  if (state.mechanicOnline) {
                    haptic.light();
                    return;
                  }
                  dispatch({ type: "SET_MECHANIC_ONLINE", payload: true });
                  haptic.success();
                }}
                style={({ pressed }) => [
                  styles.goOnlineButton,
                  pressed && { opacity: 0.92, transform: [{ scale: 0.995 }] },
                ]}
              >
                <Svg width="100%" height="100%" style={StyleSheet.absoluteFill}>
                  <Defs>
                    <LinearGradient id="goOnlineGradient" x1="0%" y1="0%" x2="100%" y2="100%">
                      <Stop offset="0%" stopColor="#35D9CC" />
                      <Stop offset="100%" stopColor="#F08B44" />
                    </LinearGradient>
                  </Defs>
                  <Rect x="0" y="0" width="100%" height="100%" rx="20" ry="20" fill="url(#goOnlineGradient)" />
                </Svg>
                <View style={styles.goOnlineContent}>
                  <View style={styles.goOnlineIcon}>
                    <IconSymbol name="bolt.fill" size={16} color="#FFFFFF" />
                  </View>
                  <View>
                    <Text style={styles.goOnlineTitle}>{L("GO ONLINE", "PONTE EN LÍNEA")}</Text>
                    <Text style={styles.goOnlineSubtitle}>
                      {L("Start receiving jobs now", "Empieza a recibir trabajos ahora")}
                    </Text>
                  </View>
                </View>
              </Pressable>
            </View>

            {/* Active job pill */}
            {active ? (
              <View style={{ paddingHorizontal: 20, marginBottom: 16 }}>
                <Pressable
                  onPress={() => {
                    haptic.light();
                    const isFutureBooked =
                      active.status === "upcoming" ||
                      (typeof active.scheduledFor === "number" && active.scheduledFor > Date.now());
                    router.push((isFutureBooked ? `/mechanic/booked?id=${encodeURIComponent(active.id)}` : "/mechanic/active") as any);
                  }}
                  style={({ pressed }) => [styles.activeBanner, pressed && { opacity: 0.9 }]}
                >
                  <View style={styles.activeIcon}>
                    <IconSymbol name="wrench.fill" size={20} color="#FFFFFF" />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.activeTitle}>{L("Active job in progress", "Trabajo activo en progreso")}</Text>
                    <Text style={styles.activeSub}>
                      {active.customerName} • ${active.payout.toFixed(2)}
                    </Text>
                  </View>
                  <IconSymbol name="chevron.right" size={20} color="#FFFFFF" />
                </Pressable>
              </View>
            ) : null}

            {/* Stats */}
            <View style={styles.section}>
              <Text style={styles.sectionTitle}>{L("Today's stats", "Estadísticas de hoy")}</Text>
              <View style={styles.statsRow}>
                <View style={styles.statBox}>
                  <Text style={styles.statValue}>${stats.earnings.toFixed(2)}</Text>
                  <Text style={styles.statLabel}>{L("Earnings", "Ganancias")}</Text>
                </View>
                <View style={styles.statDivider} />
                <View style={styles.statBox}>
                  <Text style={styles.statValue}>{stats.count}</Text>
                  <Text style={styles.statLabel}>{L("Jobs done", "Trabajos")}</Text>
                </View>
                <View style={styles.statDivider} />
                <View style={styles.statBox}>
                  <Text style={styles.statValue}>{metrics.acceptanceRate}%</Text>
                  <Text style={styles.statLabel}>{L("Acceptance", "Aceptación")}</Text>
                </View>
              </View>
            </View>

            {/* Recent activity */}
            <View style={styles.section}>
              <Text style={styles.sectionTitle}>{L("Recent activity", "Actividad reciente")}</Text>
              {state.mechanicJobs.length === 0 ? (
                <View style={styles.emptyCard}>
                  <View style={styles.emptyIcon}>
                    <IconSymbol name="bolt.fill" size={26} color="#F97316" />
                  </View>
                  <Text style={styles.emptyTitle}>{L("No jobs yet", "Aún no hay trabajos")}</Text>
                  <Text style={styles.emptyText}>
                    {L(
                      "Go online and we'll route incoming requests to you here.",
                      "Ponte en línea y te enviaremos aquí las solicitudes entrantes."
                    )}
                  </Text>
                </View>
              ) : (
                state.mechanicJobs.slice(0, 6).map((j) => <MechanicJobRow key={j.id} job={j} />)
              )}
            </View>

            <View style={{ paddingHorizontal: 20, marginTop: 16 }}>
              <PrimaryButton
                title={L("Switch to customer mode", "Cambiar a modo cliente")}
                variant="warm"
                onPress={switchToCustomer}
              />
            </View>
          </View>
        </ScrollView>
      </Animated.View>
    </View>
  );
}

function MechanicJobRow({ job }: { job: MechanicJob }) {
  const service = getServiceType(job.service);
  const time = new Date(job.receivedAt).toLocaleTimeString(undefined, {
    hour: "numeric",
    minute: "2-digit",
  });
  return (
    <View style={styles.jobRow}>
      <View style={styles.jobIcon}>
        <IconSymbol name={service?.icon ?? "wrench.fill"} size={18} color="#F97316" />
      </View>
      <View style={{ flex: 1 }}>
        <Text style={styles.jobTitle}>
          {service?.name ?? "Service"} • {job.customerName}
        </Text>
        <Text style={styles.jobMeta}>
          {time} • {statusLabel(job.status)}
        </Text>
      </View>
      <Text style={styles.jobPay}>${job.payout.toFixed(2)}</Text>
    </View>
  );
}

function statusLabel(s: string): string {
  return s.replace(/_/g, " ");
}

const styles = StyleSheet.create({
  sheetHandleZone: {
    alignItems: "center",
    justifyContent: "center",
    paddingTop: 12,
    paddingBottom: 8,
  },
  earningsPillWrap: {
    position: "absolute",
    top: 52,
    left: 0,
    right: 0,
    alignItems: "center",
    zIndex: 30,
  },
  mapBellBtn: {
    position: "absolute",
    top: 56,
    right: 18,
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: "rgba(11,19,42,0.92)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.2)",
    alignItems: "center",
    justifyContent: "center",
    zIndex: 40,
  },
  mapBellBadge: {
    position: "absolute",
    top: -4,
    right: -4,
    minWidth: 16,
    height: 16,
    paddingHorizontal: 3,
    borderRadius: 8,
    backgroundColor: "#F97316",
    alignItems: "center",
    justifyContent: "center",
  },
  mapBellBadgeText: {
    color: "#FFFFFF",
    fontSize: 10,
    fontWeight: "800",
  },
  earningsPill: {
    minWidth: 108,
    borderRadius: 999,
    backgroundColor: "rgba(15, 23, 42, 0.9)",
    borderWidth: 1,
    borderColor: "rgba(148, 163, 184, 0.35)",
    paddingHorizontal: 14,
    paddingVertical: 7,
    alignItems: "center",
  },
  earningsPillValue: {
    color: "#F8FAFC",
    fontSize: 15,
    fontWeight: "900",
  },
  earningsPillLabel: {
    color: "#FB923C",
    fontSize: 10,
    fontWeight: "700",
    marginTop: -1,
  },
  sheetHandle: {
    width: 40,
    height: 4,
    borderRadius: 2,
    backgroundColor: "#cbd5e1",
  },
  sheetContent: {},
  headerPad: { paddingHorizontal: 20, paddingTop: 8, paddingBottom: 0 },
  greeting: { color: "#C2410C", fontSize: 14, fontWeight: "600" },
  userName: { color: "#F8FAFC", fontSize: 28, fontWeight: "800", marginTop: 2 },
  goOnlineButton: {
    marginTop: 12,
    height: 92,
    borderRadius: 20,
    overflow: "hidden",
    justifyContent: "center",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.32)",
    shadowColor: "#F08B44",
    shadowOpacity: 0.52,
    shadowRadius: 18,
    shadowOffset: { width: 0, height: 8 },
    elevation: 12,
  },
  goOnlineContent: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 18,
    gap: 12,
  },
  goOnlineIcon: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: "rgba(0,0,0,0.22)",
    alignItems: "center",
    justifyContent: "center",
  },
  goOnlineTitle: {
    color: "#FFFFFF",
    fontSize: 24,
    fontWeight: "900",
    letterSpacing: 0.3,
  },
  goOnlineSubtitle: {
    color: "rgba(255,255,255,0.95)",
    fontSize: 13,
    fontWeight: "800",
    marginTop: 2,
  },
  activeBanner: {
    backgroundColor: "#10B981",
    borderRadius: 16,
    padding: 14,
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
  },
  activeIcon: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: "rgba(255,255,255,0.2)",
    alignItems: "center",
    justifyContent: "center",
  },
  activeTitle: { color: "#FFFFFF", fontWeight: "800", fontSize: 14 },
  activeSub: { color: "#D1FAE5", fontSize: 12, marginTop: 2 },
  section: { paddingHorizontal: 20, marginTop: 22 },
  sectionTitle: { fontSize: 13, color: "#F08B44", fontWeight: "800", textTransform: "uppercase", letterSpacing: 0.5, marginBottom: 10 },
  statsRow: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#0F172A",
    paddingVertical: 16,
    borderRadius: 16,
  },
  statBox: { flex: 1, alignItems: "center" },
  statValue: { fontSize: 18, fontWeight: "800", color: "#FFFFFF" },
  statLabel: { fontSize: 11, color: "#F08B44", marginTop: 4, fontWeight: "700", textTransform: "uppercase", letterSpacing: 0.5 },
  statDivider: { width: 1, height: 30, backgroundColor: "#1F2937" },
  emptyCard: {
    backgroundColor: "#0F172A",
    borderRadius: 14,
    borderWidth: 1,
    borderColor: "#334155",
    padding: 18,
    alignItems: "center",
    gap: 6,
  },
  emptyIcon: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: "#FFEDD5",
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 4,
  },
  emptyTitle: { fontSize: 16, fontWeight: "800", color: "#F8FAFC" },
  emptyText: { fontSize: 13, color: "#35D9CC", textAlign: "center", lineHeight: 18 },
  jobRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    backgroundColor: "#0F172A",
    borderRadius: 12,
    padding: 12,
    borderWidth: 1,
    borderColor: "#334155",
    marginBottom: 8,
  },
  jobIcon: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: "#FFEDD5",
    alignItems: "center",
    justifyContent: "center",
  },
  jobTitle: { fontSize: 14, fontWeight: "700", color: "#F8FAFC" },
  jobMeta: { fontSize: 12, color: "#35D9CC", marginTop: 2, textTransform: "capitalize" },
  jobPay: { fontSize: 15, fontWeight: "800", color: "#F8FAFC" },
});
