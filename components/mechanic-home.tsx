import {
  ScrollView,
  StyleSheet,
  Text,
  View,
  Pressable,
  Dimensions,
  PanResponder,
  Animated,
  Alert,
  Platform,
} from "react-native";
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
import type { LocaleCode, MechanicJob } from "@/lib/types";
import { useAuth } from "@/lib/auth-context";
import { resolveAuthSession } from "@/lib/resolve-auth-session";
import { fetchOpenDispatchRequests } from "@/lib/live-dispatch";
import {
  buildMechanicJobFromDispatchRequest,
  isIncomingDispatchForMechanic,
  mechanicAlreadyHasRequest,
  mechanicHasBlockingJob,
  matchesMechanicRegion,
} from "@/lib/mechanic-dispatch-job";
import { MechanicSleekToggle } from "@/components/mechanic-sleek-toggle";
import { useLocaleContext } from "@/hooks/use-locale";
import { computeMechanicMetrics } from "@/lib/mechanic-metrics";
import { localizedServiceName } from "@/lib/service-i18n";

const cardShadow = Platform.select({
  ios: {
    shadowColor: "#000000",
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.22,
    shadowRadius: 18,
  },
  android: { elevation: 6 },
  default: {},
});

function getTimeGreeting(locale: string): string {
  const hour = new Date().getHours();
  if (locale === "es-MX") {
    if (hour < 12) return "Buenos días";
    if (hour < 18) return "Buenas tardes";
    return "Buenas noches";
  }
  if (hour < 12) return "Good morning";
  if (hour < 18) return "Good afternoon";
  return "Good evening";
}

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

function getMechanicActivityTimestamp(job: MechanicJob): number {
  return (
    job.completedAt ??
    job.mechanicMarkedDoneAt ??
    job.acceptedAt ??
    job.cancelledAt ??
    job.mechanicOfferSentAt ??
    job.receivedAt
  );
}

function clampSheetHeight(h: number) {
  return Math.max(MIN_SHEET_HEIGHT, Math.min(MAX_SHEET_HEIGHT, h));
}

function parseDateMs(value: string | null | undefined): number | null {
  if (!value) return null;
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) ? parsed : null;
}

export function MechanicHome() {
  const router = useRouter();
  const { state, dispatch } = useStore();
  const { user } = useAuth();
  const { locale, region, formatPrice } = useLocaleContext();
  const isEs = locale === "es-MX";
  const L = useCallback((en: string, es: string) => (isEs ? es : en), [isEs]);
  const greeting = useMemo(() => getTimeGreeting(locale), [locale]);
  const pending = usePendingMechanicJob();
  const active = useMechanicActiveJob();
  const unreadCount = state.notificationsInbox.filter(
    (n) => !n.readAt && (n.roleScope === "all" || n.roleScope === "mechanic"),
  ).length;
  const lastRoutedPendingIdRef = useRef<string | null>(null);
  const sheetHeightRef = useRef(INITIAL_SHEET_HEIGHT);
  const sheetAnim = useRef(new Animated.Value(INITIAL_SHEET_HEIGHT)).current;
  const [sheetHeight, setSheetHeight] = useState(INITIAL_SHEET_HEIGHT);
  const [showTodayActivity, setShowTodayActivity] = useState(false);
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
  const todayActivity = useMemo(() => {
    const todayLabel = new Date().toDateString();
    return [...state.mechanicJobs]
      .filter((job) => {
        const activityAt = getMechanicActivityTimestamp(job);
        return new Date(activityAt).toDateString() === todayLabel;
      })
      .sort((a, b) => getMechanicActivityTimestamp(b) - getMechanicActivityTimestamp(a));
  }, [state.mechanicJobs]);

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
        const requests = await fetchOpenDispatchRequests(
          resolved.sessionToken,
          user.id,
          state.userName || "Mechanic",
          region,
        );
        const regionSafeRequests = requests.filter((req) => matchesMechanicRegion(req, region));
        const next = regionSafeRequests.find(
          (req) =>
            isIncomingDispatchForMechanic(req, user.id, region) &&
            !mechanicAlreadyHasRequest(state.mechanicJobs, req.id),
        );
        if (!next) return;
        if (mechanicHasBlockingJob(state.mechanicJobs)) return;
        const job = buildMechanicJobFromDispatchRequest(next, state.userCoords);
        dispatch({ type: "ADD_MECHANIC_JOB", payload: job });
        const service = getServiceType(job.service);
        if (next.customer_quote_accepted_at) {
          const customerName = next.customer_name?.trim() || "Customer";
          const body = `${customerName} has offered you their requested service, accept or decline`;
          const route = `/mechanic/incoming?id=${encodeURIComponent(job.id)}`;
          dispatch({
            type: "UPDATE_MECHANIC_JOB_STATUS",
            payload: {
              id: job.id,
              status: job.status,
              customerQuoteAcceptedAt: parseDateMs(next.customer_quote_accepted_at),
            },
          });
          dispatch({
            type: "ADD_INBOX_NOTIFICATION",
            payload: {
              id: `customer-service-offer-${next.id}`,
              title: "Service offered",
              body,
              createdAt: Date.now(),
              roleScope: "mechanic",
              route,
              actionType: "customer_service_offer",
              requestId: next.id,
            },
          });
          notifyNow({
            title: "Service offered",
            body,
            data: {
              kind: "customer_service_offer",
              requestId: next.id,
              route,
            },
          });
        }
        if (job.isBooked) {
          dispatch({
            type: "ADD_INBOX_NOTIFICATION",
            payload: {
              id: `booked-available-${job.id}`,
              title: L("Booked job available", "Servicio agendado disponible"),
              body: `${job.customerName} • ${service?.name ?? L("Service", "Servicio")} • ${formatPrice(job.payout)}`,
              createdAt: Date.now(),
              roleScope: "mechanic",
              route: `/mechanic/incoming?id=${encodeURIComponent(job.id)}`,
            },
          });
        }
        notifyNow({
          title: job.isBooked ? L("Booked job available", "Servicio agendado disponible") : L("New job request", "Nueva solicitud de trabajo"),
          body: `${service?.name ?? "Service"} • ${formatPrice(job.payout)}`,
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
  }, [pending, router]);

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
  }, [active, dispatch, router]);

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
    if (state.mechanicOnline) {
      haptic.warning();
      Alert.alert(
        L("Go offline first", "Primero ponte fuera de línea"),
        L(
          "Turn off online mode before switching to customer mode.",
          "Desactiva el modo en línea antes de cambiar a modo cliente.",
        ),
      );
      return;
    }
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
          style={({ pressed }) => [styles.mapBellBtn, pressed && { opacity: 0.9 }]}
        >
          <IconSymbol name="bell.fill" size={18} color="#F8FAFC" />
          {unreadCount > 0 ? (
            <View style={styles.mapBellBadge}>
              <Text style={styles.mapBellBadgeText}>{Math.min(99, unreadCount)}</Text>
            </View>
          ) : null}
        </Pressable>
        <View style={styles.earningsPillWrap} pointerEvents="none">
          <View style={styles.earningsPill}>
            <View style={styles.earningsPillIcon}>
              <IconSymbol name="dollarsign.circle.fill" size={14} color="#FDBA74" />
            </View>
            <View>
              <Text style={styles.earningsPillValue}>{formatPrice(stats.earningsToday)}</Text>
              <Text style={styles.earningsPillLabel}>
                {L("Today", "Hoy")} • {stats.servicesToday}{" "}
                {stats.servicesToday === 1 ? L("job", "trabajo") : L("jobs", "trabajos")}
              </Text>
            </View>
          </View>
        </View>
      </View>

      {/* Collapsible Bottom Sheet */}
      <Animated.View style={[styles.sheet, { height: sheetAnim }]}>
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
            <View style={styles.headerPad}>
              <View style={styles.headerRow}>
                <View style={{ flex: 1, gap: 2 }}>
                  <Text style={styles.greetingEyebrow}>{greeting}</Text>
                  <Text style={styles.userName}>{state.userName || L("Mechanic", "Mecánico")}</Text>
                  <Text style={styles.greetingSub}>
                    {L("Your mechanic command center", "Tu centro de control de mecánico")}
                  </Text>
                </View>
                <View
                  style={[
                    styles.statusPill,
                    state.mechanicOnline ? styles.statusPillOnline : styles.statusPillOffline,
                  ]}
                >
                  <View
                    style={[
                      styles.statusDot,
                      state.mechanicOnline ? styles.statusDotOnline : styles.statusDotOffline,
                    ]}
                  />
                  <Text style={styles.statusPillText}>
                    {state.mechanicOnline ? L("ONLINE", "EN LÍNEA") : L("OFFLINE", "FUERA DE LÍNEA")}
                  </Text>
                </View>
              </View>
            </View>

            <View style={styles.toggleSection}>
              <MechanicSleekToggle />
            </View>

            {pending ? (
              <View style={styles.bannerSection}>
                <Pressable
                  onPress={() => {
                    haptic.light();
                    router.push({ pathname: "/mechanic/incoming" as any, params: { id: pending.id } } as any);
                  }}
                  style={({ pressed }) => [styles.jobBanner, pressed && { opacity: 0.92 }]}
                >
                  <View style={styles.bannerIconWrap}>
                    <IconSymbol name="bell.badge.fill" size={18} color="#FDBA74" />
                  </View>
                  <View style={{ flex: 1, gap: 4 }}>
                    <View style={styles.livePill}>
                      <View style={styles.liveDot} />
                      <Text style={styles.livePillText}>{L("INCOMING REQUEST", "SOLICITUD ENTRANTE")}</Text>
                    </View>
                    <Text style={styles.bannerTitle}>
                      {pending.isBooked
                        ? L("New booked job offer", "Nueva oferta de trabajo agendado")
                        : L("New service request", "Nueva solicitud de servicio")}
                    </Text>
                    <Text style={styles.bannerSubtitle}>
                      {pending.customerName} • {formatPrice(pending.payout)}
                    </Text>
                  </View>
                  <IconSymbol name="chevron.right" size={16} color="#94A3B8" />
                </Pressable>
              </View>
            ) : null}

            {active ? (
              <View style={styles.bannerSection}>
                <Pressable
                  onPress={() => {
                    haptic.light();
                    const isFutureBooked =
                      active.status === "upcoming" ||
                      (typeof active.scheduledFor === "number" && active.scheduledFor > Date.now());
                    router.push((isFutureBooked ? `/mechanic/booked?id=${encodeURIComponent(active.id)}` : "/mechanic/active") as any);
                  }}
                  style={({ pressed }) => [styles.jobBanner, pressed && { opacity: 0.92 }]}
                >
                  <View style={styles.bannerIconWrap}>
                    <IconSymbol
                      name={active.status === "upcoming" ? "clock.fill" : "wrench.fill"}
                      size={18}
                      color="#FDBA74"
                    />
                  </View>
                  <View style={{ flex: 1, gap: 4 }}>
                    <View style={styles.livePill}>
                      <View style={styles.liveDot} />
                      <Text style={styles.livePillText}>
                        {active.status === "upcoming"
                          ? L("UPCOMING JOB", "TRABAJO PRÓXIMO")
                          : L("ACTIVE JOB", "TRABAJO ACTIVO")}
                      </Text>
                    </View>
                    <Text style={styles.bannerTitle}>
                      {active.status === "upcoming"
                        ? L("Booked job on your schedule", "Trabajo agendado en tu horario")
                        : L("Job in progress", "Trabajo en progreso")}
                    </Text>
                    <Text style={styles.bannerSubtitle}>
                      {active.customerName} • {formatPrice(active.payout)}
                    </Text>
                  </View>
                  <IconSymbol name="chevron.right" size={16} color="#94A3B8" />
                </Pressable>
              </View>
            ) : null}

            <View style={styles.summaryRow}>
              <View style={styles.summaryCard}>
                <Text style={styles.summaryLabel}>{L("Lifetime earnings", "Ganancias totales")}</Text>
                <Text style={styles.summaryValue}>{formatPrice(stats.earnings)}</Text>
              </View>
              <View style={styles.summaryCard}>
                <Text style={styles.summaryLabel}>{L("Jobs completed", "Trabajos completados")}</Text>
                <Text style={styles.summaryValue}>{stats.count}</Text>
              </View>
            </View>

            <View style={styles.section}>
              <Text style={styles.sectionEyebrow}>{L("Driver stats", "Estadísticas del conductor")}</Text>
              <View style={styles.driverStatsGrid}>
                <DriverStatCard
                  icon="wrench.fill"
                  iconColor="#F97316"
                  label={L("Jobs done", "Trabajos")}
                  value={`${stats.count}`}
                />
                <DriverStatCard
                  icon="star.fill"
                  iconColor="#35D9CC"
                  label={L("Acceptance", "Aceptación")}
                  value={`${metrics.acceptanceRate}%`}
                />
                <DriverStatCard
                  icon="xmark"
                  iconColor="#FB7185"
                  label={L("Cancellation", "Cancelación")}
                  value={`${metrics.cancellationRate}%`}
                />
                <DriverStatCard
                  icon="checkmark.circle.fill"
                  iconColor="#2FDFC4"
                  label={L("Completion", "Finalización")}
                  value={`${metrics.completionRate}%`}
                />
              </View>
            </View>

            <View style={styles.section}>
              <Pressable
                onPress={() => {
                  haptic.selection();
                  setShowTodayActivity((current) => !current);
                }}
                style={({ pressed }) => [styles.todayActivityHeader, pressed && { opacity: 0.9 }]}
              >
                <View style={{ flex: 1 }}>
                  <Text style={styles.sectionEyebrow}>{L("Today's activity", "Actividad de hoy")}</Text>
                  <Text style={styles.todayActivityHint}>
                    {showTodayActivity
                      ? L("Tap to hide today's jobs", "Toca para ocultar los trabajos de hoy")
                      : L("Tap to show today's jobs", "Toca para mostrar los trabajos de hoy")}
                  </Text>
                </View>
                <View style={styles.todayActivityMeta}>
                  <View style={styles.todayActivityCountBadge}>
                    <Text style={styles.todayActivityCount}>{todayActivity.length}</Text>
                  </View>
                  <IconSymbol
                    name={showTodayActivity ? "chevron.up" : "chevron.down"}
                    size={14}
                    color="#F97316"
                  />
                </View>
              </Pressable>
              {showTodayActivity ? (
                todayActivity.length === 0 ? (
                  <View style={styles.emptyCard}>
                    <View style={styles.emptyIcon}>
                      <IconSymbol name="bolt.fill" size={24} color="#F97316" />
                    </View>
                    <Text style={styles.emptyTitle}>{L("No activity yet today", "Aún no hay actividad hoy")}</Text>
                    <Text style={styles.emptyText}>
                      {L(
                        "Completed jobs and updates will appear here throughout the day.",
                        "Los trabajos completados y actualizaciones aparecerán aquí durante el día.",
                      )}
                    </Text>
                  </View>
                ) : (
                  <View style={styles.activityList}>
                    {todayActivity.slice(0, 6).map((j) => (
                      <MechanicJobRow
                        key={j.id}
                        job={j}
                        activityAt={getMechanicActivityTimestamp(j)}
                        locale={locale}
                        formatPrice={formatPrice}
                        L={L}
                      />
                    ))}
                  </View>
                )
              ) : null}
            </View>

            <View style={styles.switchSection}>
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

function MechanicJobRow({
  job,
  activityAt,
  locale,
  formatPrice,
  L,
}: {
  job: MechanicJob;
  activityAt: number;
  locale: LocaleCode;
  formatPrice: (amount: number) => string;
  L: (en: string, es: string) => string;
}) {
  const service = getServiceType(job.service);
  const dateLocale = locale === "es-MX" ? "es-MX" : "en-US";
  const time = new Intl.DateTimeFormat(dateLocale, { hour: "numeric", minute: "2-digit" }).format(
    new Date(activityAt),
  );
  const serviceName = service
    ? localizedServiceName(service.code, locale)
    : L("Service", "Servicio");
  return (
    <View style={styles.jobRow}>
      <View style={styles.jobIcon}>
        <IconSymbol name={service?.icon ?? "wrench.fill"} size={18} color="#F97316" />
      </View>
      <View style={{ flex: 1 }}>
        <Text style={styles.jobTitle}>
          {serviceName} • {job.customerName}
        </Text>
        <Text style={styles.jobMeta}>
          {time} • {localizedStatusLabel(job.status, L)}
        </Text>
      </View>
      <Text style={styles.jobPay}>{formatPrice(job.payout)}</Text>
    </View>
  );
}

function DriverStatCard({
  icon,
  iconColor,
  label,
  value,
}: {
  icon: string;
  iconColor: string;
  label: string;
  value: string;
}) {
  return (
    <View style={styles.driverStatCard}>
      <View style={[styles.driverStatIcon, { backgroundColor: `${iconColor}22` }]}>
        <IconSymbol name={icon} size={14} color={iconColor} />
      </View>
      <Text style={styles.driverStatLabel}>{label}</Text>
      <Text style={[styles.driverStatValue, { color: iconColor }]}>{value}</Text>
    </View>
  );
}

function localizedStatusLabel(status: string, L: (en: string, es: string) => string): string {
  const labels: Record<string, [string, string]> = {
    pending: ["Pending", "Pendiente"],
    upcoming: ["Upcoming", "Próximo"],
    heading_there: ["Heading there", "En camino"],
    arrived: ["Arrived", "Llegó"],
    in_progress: ["In progress", "En progreso"],
    completed: ["Completed", "Completado"],
    cancelled: ["Cancelled", "Cancelado"],
    declined: ["Declined", "Rechazado"],
  };
  const pair = labels[status];
  return pair ? L(pair[0], pair[1]) : status.replace(/_/g, " ");
}

const styles = StyleSheet.create({
  sheet: {
    position: "absolute",
    bottom: 0,
    left: 0,
    right: 0,
    backgroundColor: "rgba(11, 15, 22, 0.98)",
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    borderWidth: 1,
    borderBottomWidth: 0,
    borderColor: "rgba(255,255,255,0.08)",
    overflow: "hidden",
    ...Platform.select({
      ios: {
        shadowColor: "#000000",
        shadowOffset: { width: 0, height: -8 },
        shadowOpacity: 0.28,
        shadowRadius: 20,
      },
      android: { elevation: 12 },
      default: {},
    }),
  },
  sheetHandleZone: {
    alignItems: "center",
    justifyContent: "center",
    paddingTop: 10,
    paddingBottom: 6,
  },
  sheetHandle: {
    width: 44,
    height: 4,
    borderRadius: 2,
    backgroundColor: "rgba(148,163,184,0.45)",
  },
  sheetContent: {},
  earningsPillWrap: {
    position: "absolute",
    top: 56,
    left: 0,
    right: 0,
    alignItems: "center",
    zIndex: 30,
  },
  mapBellBtn: {
    position: "absolute",
    top: 56,
    right: 18,
    width: 44,
    height: 44,
    borderRadius: 14,
    backgroundColor: "#0B1220",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.08)",
    alignItems: "center",
    justifyContent: "center",
    zIndex: 40,
    ...cardShadow,
  },
  mapBellBadge: {
    position: "absolute",
    top: -2,
    right: -2,
    minWidth: 18,
    height: 18,
    paddingHorizontal: 4,
    borderRadius: 9,
    backgroundColor: "#F97316",
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 2,
    borderColor: "#0B1220",
  },
  mapBellBadgeText: {
    color: "#FFFFFF",
    fontSize: 10,
    fontWeight: "800",
  },
  earningsPill: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    borderRadius: 999,
    backgroundColor: "rgba(11,18,32,0.92)",
    borderWidth: 1,
    borderColor: "rgba(249,115,22,0.28)",
    paddingHorizontal: 14,
    paddingVertical: 8,
    ...cardShadow,
  },
  earningsPillIcon: {
    width: 28,
    height: 28,
    borderRadius: 999,
    backgroundColor: "rgba(249,115,22,0.14)",
    alignItems: "center",
    justifyContent: "center",
  },
  earningsPillValue: {
    color: "#F8FAFC",
    fontSize: 16,
    fontWeight: "900",
    lineHeight: 20,
  },
  earningsPillLabel: {
    color: "#FDBA74",
    fontSize: 11,
    fontWeight: "700",
    marginTop: 1,
  },
  headerPad: { paddingHorizontal: 20, paddingTop: 4, paddingBottom: 0 },
  headerRow: { flexDirection: "row", alignItems: "flex-start", gap: 12 },
  greetingEyebrow: {
    color: "#FDBA74",
    fontSize: 12,
    fontWeight: "800",
    textTransform: "uppercase",
    letterSpacing: 0.6,
  },
  userName: { color: "#F8FAFC", fontSize: 24, fontWeight: "800", lineHeight: 30 },
  greetingSub: { color: "#94A3B8", fontSize: 13, marginTop: 2 },
  statusPill: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderWidth: 1,
  },
  statusPillOnline: {
    backgroundColor: "rgba(16,185,129,0.12)",
    borderColor: "rgba(16,185,129,0.35)",
  },
  statusPillOffline: {
    backgroundColor: "rgba(148,163,184,0.10)",
    borderColor: "rgba(148,163,184,0.25)",
  },
  statusDot: {
    width: 7,
    height: 7,
    borderRadius: 4,
  },
  statusDotOnline: { backgroundColor: "#10B981" },
  statusDotOffline: { backgroundColor: "#94A3B8" },
  statusPillText: {
    color: "#F8FAFC",
    fontSize: 10,
    fontWeight: "800",
    letterSpacing: 0.5,
  },
  toggleSection: { paddingHorizontal: 20, marginTop: 14, marginBottom: 4 },
  bannerSection: { paddingHorizontal: 20, marginTop: 12 },
  jobBanner: {
    borderRadius: 20,
    backgroundColor: "#0B1220",
    borderWidth: 1,
    borderColor: "rgba(249,115,22,0.28)",
    padding: 16,
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    ...cardShadow,
  },
  bannerIconWrap: {
    width: 42,
    height: 42,
    borderRadius: 14,
    backgroundColor: "rgba(249,115,22,0.14)",
    alignItems: "center",
    justifyContent: "center",
  },
  livePill: {
    alignSelf: "flex-start",
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    backgroundColor: "rgba(249,115,22,0.14)",
    borderRadius: 999,
    paddingHorizontal: 8,
    paddingVertical: 3,
  },
  liveDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: "#F97316",
  },
  livePillText: {
    color: "#FDBA74",
    fontSize: 10,
    fontWeight: "800",
    letterSpacing: 0.6,
  },
  bannerTitle: { color: "#F8FAFC", fontSize: 16, fontWeight: "800" },
  bannerSubtitle: { color: "#94A3B8", fontSize: 13, lineHeight: 18 },
  summaryRow: {
    flexDirection: "row",
    gap: 10,
    paddingHorizontal: 20,
    marginTop: 16,
  },
  summaryCard: {
    flex: 1,
    borderRadius: 16,
    backgroundColor: "#111827",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.08)",
    padding: 14,
    ...cardShadow,
  },
  summaryLabel: {
    color: "#94A3B8",
    fontSize: 11,
    fontWeight: "700",
    textTransform: "uppercase",
    letterSpacing: 0.5,
  },
  summaryValue: {
    color: "#FDBA74",
    fontSize: 20,
    fontWeight: "900",
    marginTop: 6,
  },
  section: { paddingHorizontal: 20, marginTop: 20 },
  sectionEyebrow: {
    fontSize: 18,
    color: "#F8FAFC",
    fontWeight: "800",
    marginBottom: 10,
  },
  emptyCard: {
    backgroundColor: "#111827",
    borderRadius: 18,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.08)",
    padding: 20,
    alignItems: "center",
    gap: 6,
    ...cardShadow,
  },
  emptyIcon: {
    width: 52,
    height: 52,
    borderRadius: 16,
    backgroundColor: "rgba(249,115,22,0.12)",
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 4,
  },
  emptyTitle: { fontSize: 16, fontWeight: "800", color: "#F8FAFC" },
  emptyText: { fontSize: 13, color: "#94A3B8", textAlign: "center", lineHeight: 18 },
  activityList: { gap: 8 },
  jobRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    backgroundColor: "#111827",
    borderRadius: 16,
    padding: 12,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.08)",
    ...cardShadow,
  },
  jobIcon: {
    width: 38,
    height: 38,
    borderRadius: 12,
    backgroundColor: "rgba(249,115,22,0.12)",
    alignItems: "center",
    justifyContent: "center",
  },
  jobTitle: { fontSize: 14, fontWeight: "700", color: "#F8FAFC" },
  jobMeta: { fontSize: 12, color: "#94A3B8", marginTop: 2 },
  jobPay: { fontSize: 15, fontWeight: "800", color: "#FDBA74" },
  driverStatsGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 10,
  },
  driverStatCard: {
    width: "48%",
    backgroundColor: "#111827",
    borderRadius: 16,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.08)",
    padding: 14,
    minHeight: 100,
    justifyContent: "space-between",
    ...cardShadow,
  },
  driverStatIcon: {
    width: 30,
    height: 30,
    borderRadius: 10,
    alignItems: "center",
    justifyContent: "center",
  },
  driverStatLabel: {
    color: "#94A3B8",
    fontSize: 11,
    fontWeight: "700",
    textTransform: "uppercase",
    letterSpacing: 0.4,
    marginTop: 10,
  },
  driverStatValue: {
    fontSize: 22,
    fontWeight: "900",
    marginTop: 4,
  },
  todayActivityHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 12,
    paddingVertical: 4,
    marginBottom: 4,
  },
  todayActivityHint: {
    color: "#94A3B8",
    fontSize: 12,
    fontWeight: "600",
    marginTop: 4,
  },
  todayActivityMeta: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  todayActivityCountBadge: {
    minWidth: 28,
    height: 28,
    borderRadius: 999,
    backgroundColor: "rgba(249,115,22,0.14)",
    borderWidth: 1,
    borderColor: "rgba(249,115,22,0.22)",
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 8,
  },
  todayActivityCount: {
    color: "#FDBA74",
    fontSize: 14,
    fontWeight: "800",
  },
  switchSection: { paddingHorizontal: 20, marginTop: 18, marginBottom: 8 },
});

 
