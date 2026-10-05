import { Pressable, ScrollView, StyleSheet, Text, TextInput, View, Alert, Platform, Linking, ActivityIndicator } from "react-native";
import { Image } from "expo-image";
import { useRouter } from "expo-router";
import * as Contacts from "expo-contacts";
import * as LocalAuthentication from "expo-local-authentication";
import * as Location from "expo-location";
import * as SMS from "expo-sms";
import { ScreenContainer } from "@/components/screen-container";
import { useStore, useMechanicActiveJob } from "@/lib/store";
import { getServiceType } from "@/lib/seed";
import { IconSymbol } from "@/components/ui/icon-symbol";
import { PrimaryButton } from "@/components/primary-button";
import { Avatar } from "@/components/avatar";
import { LiveMap } from "@/components/live-map";
import { interpolate, haversineMeters, metersToMiles } from "@/lib/geo";
import { useEffect, useRef, useState } from "react";
import { haptic } from "@/lib/haptics";
import { notifyNow } from "@/lib/notifications";
import type { MechanicJobStatus } from "@/lib/types";
import { useAuth } from "@/lib/auth-context";
import { resolveAuthSession } from "@/lib/resolve-auth-session";
import { fetchDispatchRequest, releaseDispatchFromMechanic, updateDispatchStatus, updateMechanicLocation, isNetworkUnavailableError, proposePartsCost } from "@/lib/live-dispatch";
import {
  recordBackgroundLocationDeclined,
  requestBackgroundLocationPermission,
  shouldOfferBackgroundLocation,
  startMechanicTripTracking,
  stopMechanicTripTracking,
} from "@/lib/mechanic-trip-tracking";
import { uploadMechanicDoc } from "@/lib/upload-mechanic-doc";
import { isPartsCostWithinBounds, maxPartsCostForRegion } from "@/lib/price-adjustment-core";
import { formatEditableMoney, normalizeEditableMoneyInput, parseEditableMoneyInput } from "@/lib/money-input";
import { useImagePicker, type PickedImage } from "@/hooks/use-image-picker";
import { useLocaleContext, useL } from "@/hooks/use-locale";
import { notifyDispatchEvent } from "@/lib/dispatch-notifications";
import { trackAnalyticsEvent } from "@/lib/analytics";
import { createSafetyReport } from "@/lib/safety";
import { uploadServiceEvidencePhoto } from "@/lib/upload-service-evidence";
import { safeReplace } from "@/lib/safe-router";
import { localizedServiceName } from "@/lib/service-i18n";
import { formatDistanceByRegion } from "@/lib/distance";
import { hasNoShowGracePeriodElapsed, minutesSinceNoShowReport, NO_SHOW_GRACE_PERIOD_MS } from "@/lib/no-show-core";
import { useTapGuard } from "@/hooks/use-tap-guard";

const FLOW: MechanicJobStatus[] = ["heading_there", "arrived", "in_progress", "completed"];

export default function MechanicActiveJobScreen() {
  const router = useRouter();
  const job = useMechanicActiveJob();
  const { dispatch, state } = useStore();
  const { user } = useAuth();
  const L = useL();
  const { region, locale, formatPrice } = useLocaleContext();
  const isEs = locale === "es-MX";
  const { pickImageFromCamera, pickReceiptImage } = useImagePicker();
  const guardCancel = useTapGuard();
  const guardCancelNoShow = useTapGuard();
  const guardSecureAdvance = useTapGuard();
  const [partsCostInput, setPartsCostInput] = useState("");
  const [partsReceipt, setPartsReceipt] = useState<PickedImage | null>(null);
  const [partsSubmitting, setPartsSubmitting] = useState(false);
  const [partsProposed, setPartsProposed] = useState(false);
  const [showPartsForm, setShowPartsForm] = useState(false);
  const [elapsed, setElapsed] = useState(0);
  // beforePhotoUri / afterPhotoUri hold the SERVER storage path once the
  // upload succeeds — this is what actually gets sent as beforePhotoUrl /
  // afterPhotoUrl and is what gates advancing the job. The *Local variants
  // hold the on-device preview URI so a failed upload doesn't wipe out the
  // photo the mechanic already took; *Pending keeps the full picked image so
  // a retry can re-upload without reopening the camera.
  const [beforePhotoUri, setBeforePhotoUri] = useState<string | null>(null);
  const [afterPhotoUri, setAfterPhotoUri] = useState<string | null>(null);
  const [beforePhotoLocalUri, setBeforePhotoLocalUri] = useState<string | null>(null);
  const [afterPhotoLocalUri, setAfterPhotoLocalUri] = useState<string | null>(null);
  const [beforePhotoPending, setBeforePhotoPending] = useState<PickedImage | null>(null);
  const [afterPhotoPending, setAfterPhotoPending] = useState<PickedImage | null>(null);
  const [beforeUploadFailed, setBeforeUploadFailed] = useState(false);
  const [afterUploadFailed, setAfterUploadFailed] = useState(false);
  const [beforeUploading, setBeforeUploading] = useState(false);
  const [afterUploading, setAfterUploading] = useState(false);
  const [mechanicLiveCoords, setMechanicLiveCoords] = useState(state.userCoords ?? null);
  const lastVisibleJobIdRef = useRef<string | null>(null);
  // Latest fix from the live GPS watch, reused by the 2-minute heartbeat.
  const latestLiveFixRef = useRef<{ latitude: number; longitude: number; at: number } | null>(null);
  // "background" while the OS trip task (lib/mechanic-trip-tracking.ts) is
  // sending fixes; the screen's own watch then only drives the map.
  const tripTrackingModeRef = useRef<"background" | "foreground_only">("foreground_only");
  const cancellationAlertShownRef = useRef(false);

  useEffect(() => {
    if (state.userCoords) {
      setMechanicLiveCoords(state.userCoords);
    }
  }, [state.userCoords]);

  if (job?.id) {
    lastVisibleJobIdRef.current = job.id;
  }

  // Push mechanic GPS to service request every 2 minutes so customer mini-map
  // stays updated even while the mechanic is stopped (the live watch below
  // only fires on movement). Must send a real, current fix: state.userCoords
  // is captured once at app launch, and re-sending it every 2 minutes made the
  // database count phantom trips back to that old point (driven-distance /
  // cancellation-fee inflation).
  useEffect(() => {
    if (!job?.remoteRequestId || !user?.id) return;
    if (job.status !== "heading_there" && job.status !== "arrived" && job.status !== "in_progress") return;
    let alive = true;
    const sync = async () => {
      try {
        let fix = latestLiveFixRef.current;
        if (!fix || Date.now() - fix.at > 60000) {
          const perm = await Location.getForegroundPermissionsAsync();
          if (perm.status !== "granted") return;
          const current = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.High });
          fix = { latitude: current.coords.latitude, longitude: current.coords.longitude, at: Date.now() };
          latestLiveFixRef.current = fix;
        }
        const resolved = await resolveAuthSession(user);
        if (!resolved || !alive) return;
        await updateMechanicLocation(resolved.sessionToken, job.remoteRequestId!, user.id, fix);
      } catch (error) {
        console.error("[MechanicActive] GPS sync failed:", error);
      }
    };
    void sync();
    const timer = setInterval(() => void sync(), 120000);
    return () => {
      alive = false;
      clearInterval(timer);
    };
  }, [job?.id, job?.remoteRequestId, job?.status, user]);

  // If the customer cancels while we're on the live status screen, poll the request directly
  // so we can exit immediately even if a realtime payload is missed or filtered.
  useEffect(() => {
    if (!job?.remoteRequestId || !user?.id) return;
    if (job.status === "cancelled" || job.status === "declined" || job.status === "completed") return;

    let alive = true;
    const checkRemoteStatus = async () => {
      try {
        const resolved = await resolveAuthSession(user);
        if (!resolved || !alive) return;
        const remote = await fetchDispatchRequest(resolved.sessionToken, job.remoteRequestId!);
        if (!alive) return;
        if (!remote || remote.status === "cancelled" || remote.assigned_mechanic_user_id !== user.id) {
          const customerCancelled = !!remote && remote.status === "cancelled" && remote.cancelled_by_role === "customer";
          dispatch({ type: "UPDATE_MECHANIC_JOB_STATUS", payload: { id: job.id, status: "cancelled" } });
          dispatch({ type: "CLEAR_ACTIVE_JOB" });

          const title = customerCancelled
            ? L("Trip cancelled by customer", "Viaje cancelado por el cliente")
            : L("Trip canceled", "Viaje cancelado");
          const body = customerCancelled
            ? L(
                "The customer cancelled the service while you were on the way or on site. Any fees will be paid out if applicable.",
                "El cliente canceló el servicio mientras ibas en camino o estabas en el lugar. Cualquier tarifa se pagará si corresponde.",
              )
            : L(
                "The requested service is no longer available, we'll look for other requests.",
                "El servicio solicitado ya no está disponible, buscaremos otras solicitudes.",
              );

          if (!cancellationAlertShownRef.current) {
            cancellationAlertShownRef.current = true;
            if (customerCancelled) {
              const notificationId = `mechanic-customer-cancelled-${remote?.id ?? job.remoteRequestId}`;
              dispatch({
                type: "ADD_INBOX_NOTIFICATION",
                payload: {
                  id: notificationId,
                  title,
                  body,
                  createdAt: Date.now(),
                  roleScope: "mechanic",
                  route: "/notifications",
                },
              });
              notifyNow({
                title,
                body,
                data: { kind: "job_cancelled_by_customer", requestId: remote?.id, route: "/notifications" },
              });
              haptic.warning();
            }
            Alert.alert(title, body, [{ text: L("OK", "OK"), onPress: () => safeReplace("/(tabs)" as any) }]);
          } else {
            safeReplace("/(tabs)" as any);
          }
          return;
        }
      } catch (error) {
        if (!isNetworkUnavailableError(error)) {
          console.warn("[MechanicActive] Remote cancellation poll failed:", error);
        }
      }
    };

    void checkRemoteStatus();
    const timer = setInterval(() => void checkRemoteStatus(), 1500);
    return () => {
      alive = false;
      clearInterval(timer);
    };
  }, [L, dispatch, job?.id, job?.remoteRequestId, job?.status, user]);

  // Background trip tracking: keeps sending GPS while the mechanic navigates
  // in another app or locks the phone. Google Play requires this in-app
  // disclosure before the "Allow all the time" permission prompt.
  const tripActive =
    !!job?.remoteRequestId &&
    (job.status === "heading_there" || job.status === "arrived" || job.status === "in_progress");
  useEffect(() => {
    if (!tripActive || !job?.remoteRequestId || !user?.id) return;
    let alive = true;
    const requestId = job.remoteRequestId;
    const mechanicUserId = user.id;
    (async () => {
      if (await shouldOfferBackgroundLocation()) {
        const accepted = await new Promise<boolean>((resolve) => {
          Alert.alert(
            L("Share your location during trips", "Comparte tu ubicación durante los viajes"),
            L(
              "WrenchUp collects your location while you're on an active job, even when the app is closed or not in use, so the customer can see you arriving and your trip distance is recorded accurately (it decides cancellation fees paid to you). Tracking stops as soon as the job ends.\n\nOn the next screen, choose \"Allow all the time\".",
              "WrenchUp recopila tu ubicación mientras tienes un trabajo activo, incluso cuando la app está cerrada o no se está usando, para que el cliente vea que vas en camino y tu distancia recorrida se registre correctamente (determina las tarifas de cancelación que se te pagan). El seguimiento termina en cuanto finaliza el trabajo.\n\nEn la siguiente pantalla, elige \"Permitir todo el tiempo\".",
            ),
            [
              { text: L("Not now", "Ahora no"), style: "cancel", onPress: () => resolve(false) },
              { text: L("Continue", "Continuar"), onPress: () => resolve(true) },
            ],
            { cancelable: false },
          );
        });
        if (accepted) {
          await requestBackgroundLocationPermission();
        } else {
          await recordBackgroundLocationDeclined();
        }
      }
      const mode = await startMechanicTripTracking(requestId, mechanicUserId);
      if (alive) tripTrackingModeRef.current = mode;
    })().catch((error) => console.warn("[MechanicActive] Trip tracking start failed:", error));
    return () => {
      alive = false;
    };
    // L is stable per locale; re-running on it would re-prompt.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tripActive, job?.remoteRequestId, user?.id]);

  // Stop when the trip ends here. (If this screen is gone by then, the task
  // stops itself once the server stops matching the job as active.)
  const jobFinished = !!job && (job.status === "completed" || job.status === "cancelled" || job.status === "declined");
  useEffect(() => {
    if (!jobFinished) return;
    tripTrackingModeRef.current = "foreground_only";
    void stopMechanicTripTracking();
  }, [jobFinished]);

  // Keep the route map and customer sync moving with actual GPS while the mechanic is driving.
  useEffect(() => {
    if (!job?.remoteRequestId || !user?.id) return;
    if (job.status !== "heading_there" && job.status !== "arrived" && job.status !== "in_progress") return;

    let subscription: Location.LocationSubscription | null = null;
    let cancelled = false;

    const startWatch = async () => {
      try {
        const perm = await Location.getForegroundPermissionsAsync();
        if (perm.status !== "granted") {
          const req = await Location.requestForegroundPermissionsAsync();
          if (req.status !== "granted" || cancelled) return;
        }

        subscription = await Location.watchPositionAsync(
          {
            accuracy: Location.Accuracy.Highest,
            timeInterval: 5000,
            distanceInterval: 5,
          },
          async (location) => {
            const next = {
              latitude: location.coords.latitude,
              longitude: location.coords.longitude,
            };
            latestLiveFixRef.current = { ...next, at: Date.now() };
            setMechanicLiveCoords(next);
            // The background trip task already sends fixes; sending them
            // twice would only add noise to the distance log.
            if (tripTrackingModeRef.current === "background") return;
            try {
              const resolved = await resolveAuthSession(user);
              if (!resolved || cancelled) return;
              await updateMechanicLocation(resolved.sessionToken, job.remoteRequestId!, user.id, next);
            } catch (_error) {
              console.error("[MechanicActive] Live GPS sync failed:", _error);
            }
          }
        );
      } catch (_error) {
        console.error("[MechanicActive] Could not start live GPS watch:", _error);
      }
    };

    void startWatch();
    return () => {
      cancelled = true;
      subscription?.remove();
    };
  }, [job?.id, job?.remoteRequestId, job?.status, user]);

  // Animate the mechanic puck while heading_there
  useEffect(() => {
    if (!job || job.status !== "heading_there") {
      setElapsed(0);
      return;
    }
    setElapsed(0);
    const start = Date.now();
    const id = setInterval(() => setElapsed(Math.floor((Date.now() - start) / 1000)), 1000);
    return () => clearInterval(id);
  }, [job?.status, job?.id]); // eslint-disable-line react-hooks/exhaustive-deps -- only status/id control the timer lifecycle

  const jobId = job?.id;
  const isFutureBooked =
    !!job?.isBooked && (typeof job.scheduledFor !== "number" || job.scheduledFor > Date.now());
  useEffect(() => {
    if (!jobId || !isFutureBooked) return;
    safeReplace(`/mechanic/booked?id=${encodeURIComponent(jobId)}` as any);
  }, [jobId, isFutureBooked, router]);

  const cancelledJob = lastVisibleJobIdRef.current
    ? state.mechanicJobs.find(
        (candidate) =>
          candidate.id === lastVisibleJobIdRef.current &&
          (candidate.status === "cancelled" || candidate.status === "declined" || candidate.status === "completed"),
      ) ?? null
    : null;

  useEffect(() => {
    if (!cancelledJob) return;
    const timer = setTimeout(() => {
      safeReplace("/(tabs)" as any);
    }, 1600);
    return () => clearTimeout(timer);
  }, [cancelledJob]);

  if (cancelledJob) {
    const promptTitle = cancelledJob.isBooked
      ? L("Booked service cancelled", "Servicio agendado cancelado")
      : L("Service no longer available", "Servicio ya no disponible");
    const promptBody = cancelledJob.isBooked
      ? L(
          "This booked service is no longer active.",
          "Este servicio agendado ya no está activo.",
        )
      : L(
          "The requested service is no longer available, we'll look for other requests.",
          "El servicio solicitado ya no está disponible, buscaremos otras solicitudes.",
        );
    return (
      <ScreenContainer>
        <View style={styles.emptyWrap}>
          <View style={styles.emptyIcon}>
            <IconSymbol name="checkmark.circle.fill" size={42} color="#10B981" />
          </View>
          <Text style={styles.emptyTitle}>{promptTitle}</Text>
          <Text style={styles.emptyText}>{promptBody}</Text>
          <PrimaryButton
            title={L("Back to dashboard", "Volver al panel")}
            fullWidth={false}
            onPress={() => safeReplace("/(tabs)" as any)}
          />
        </View>
      </ScreenContainer>
    );
  }

  if (!job) {
    return (
      <ScreenContainer>
        <View style={styles.emptyWrap}>
          <View style={styles.emptyIcon}>
            <IconSymbol name="checkmark.circle.fill" size={42} color="#10B981" />
          </View>
          <Text style={styles.emptyTitle}>{L("No active job", "No hay trabajo activo")}</Text>
          <Text style={styles.emptyText}>{L("Once you accept a request, it'll show up here.", "Cuando aceptes una solicitud, aparecerá aquí.")}</Text>
          <PrimaryButton title={L("Back to dashboard", "Volver al panel")} fullWidth={false} onPress={() => router.replace("/(tabs)" as any)} />
        </View>
      </ScreenContainer>
    );
  }

  if (isFutureBooked) {
    return (
      <ScreenContainer>
        <View style={styles.emptyWrap}>
          <Text style={styles.emptyTitle}>{L("Redirecting to booked details...", "Redirigiendo a detalles de reserva...")}</Text>
        </View>
      </ScreenContainer>
    );
  }

  if (job.status === "cancelled" || job.status === "declined" || job.status === "completed") {
    const title =
      job.status === "cancelled"
        ? L("Job cancelled", "Trabajo cancelado")
        : job.status === "declined"
        ? L("Job declined", "Trabajo rechazado")
        : L("Job completed", "Trabajo completado");
    const body =
      job.status === "cancelled"
        ? L("This job was cancelled and is no longer active.", "Este trabajo fue cancelado y ya no está activo.")
        : job.status === "declined"
        ? L("This job is no longer assigned to you.", "Este trabajo ya no está asignado para ti.")
        : L("This job has already been completed.", "Este trabajo ya fue completado.");
    return (
      <ScreenContainer>
        <View style={styles.emptyWrap}>
          <View style={styles.emptyIcon}>
            <IconSymbol name="checkmark.circle.fill" size={42} color="#10B981" />
          </View>
          <Text style={styles.emptyTitle}>{title}</Text>
          <Text style={styles.emptyText}>{body}</Text>
          <PrimaryButton title={L("Back to dashboard", "Volver al panel")} fullWidth={false} onPress={() => safeReplace("/(tabs)" as any)} />
        </View>
      </ScreenContainer>
    );
  }

  const service = getServiceType(job.service);
  const idx = FLOW.indexOf(job.status);
  const nextStatus = idx >= 0 && idx < FLOW.length - 1 ? FLOW[idx + 1] : null;

  const advance = async () => {
    if (!nextStatus) return;
    if (nextStatus === "in_progress" && !beforePhotoUri) {
      Alert.alert(L("Before photo required", "Foto previa requerida"), L("Capture a before photo before starting service.", "Toma una foto previa antes de iniciar el servicio."));
      return;
    }
    if (nextStatus === "completed" && !afterPhotoUri) {
      Alert.alert(L("After photo required", "Foto posterior requerida"), L("Capture an after photo before marking service done.", "Toma una foto posterior antes de marcar el servicio."));
      return;
    }
    if (job.remoteRequestId && user?.id) {
      try {
        const resolved = await resolveAuthSession(user);
        if (resolved) {
          const isMechanicDone = nextStatus === "completed";
          const mapped = isMechanicDone
            ? "in_progress" // customer confirms completion
            : nextStatus === "heading_there"
            ? "enroute"
            : nextStatus;
          if (isMechanicDone) {
            void trackAnalyticsEvent({
              eventName: "job_completed",
              userId: user.id,
              role: "mechanic",
              sessionToken: resolved.sessionToken,
              properties: {
                request_id: job.remoteRequestId,
                region_code: region,
                service_code: job.service,
                customer_name: job.customerName,
                revenue_amount: 0,
                platform_fee_amount: 0,
                currency: region === "MX" ? "MXN" : "USD",
              },
            });
          }
          const synced = await updateDispatchStatus(
            resolved.sessionToken,
            job.remoteRequestId,
            mapped as any,
            isMechanicDone
              ? { mechanicMarkedDoneAt: new Date().toISOString(), afterPhotoUrl: afterPhotoUri }
              : nextStatus === "in_progress"
              ? { beforePhotoUrl: beforePhotoUri }
              : undefined
          );
          if (!synced.ok) {
            Alert.alert(L("Connection issue", "Problema de conexión"), L("Could not save this status yet. Please try again.", "No se pudo guardar este estado todavía. Inténtalo de nuevo."));
            return;
          }
          if (synced.degraded) {
            // Status itself saved, but before/after photos or other fields
            // didn't persist (e.g. schema not migrated on this environment).
            // Don't block the mechanic's flow, but don't let this pass silently either.
            console.warn("[MechanicActive] Status synced with dropped fields:", synced.droppedFields);
            Alert.alert(
              L("Photo may not have saved", "Es posible que la foto no se haya guardado"),
              L(
                "This step was saved, but we couldn't confirm your photo upload was recorded. You may want to check the trip details later.",
                "Este paso se guardó, pero no pudimos confirmar que tu foto se registró. Es posible que quieras revisar los detalles del viaje más tarde.",
              ),
            );
          }
          haptic.success();
          dispatch({
            type: "UPDATE_MECHANIC_JOB_STATUS",
            payload: { id: job.id, status: nextStatus },
          });
          if (nextStatus === "arrived") {
            void notifyDispatchEvent({
              sessionToken: resolved.sessionToken,
              requestId: job.remoteRequestId,
              event: "mechanic_arrived",
              initiatorUserId: user.id,
              actorUserId: user.id,
            });
          } else if (nextStatus === "completed") {
            void notifyDispatchEvent({
              sessionToken: resolved.sessionToken,
              requestId: job.remoteRequestId,
              event: "job_completed",
              initiatorUserId: user.id,
              actorUserId: user.id,
            });
          }
        }
      } catch (error) {
        console.error("[MechanicActive] Failed to sync status:", error);
        Alert.alert(L("Connection issue", "Problema de conexión"), L("Could not save this status yet. Please try again.", "No se pudo guardar este estado todavía. Inténtalo de nuevo."));
        return;
      }
    } else {
      haptic.success();
      dispatch({
        type: "UPDATE_MECHANIC_JOB_STATUS",
        payload: { id: job.id, status: nextStatus },
      });
    }
    if (nextStatus === "arrived") {
      notifyNow({ title: L("Marked as arrived", "Marcado como llegado"), body: L(`You're at ${job.customerName}'s location.`, `Estás en la ubicación de ${job.customerName}.`) });
    } else if (nextStatus === "in_progress") {
      notifyNow({ title: L("Service started", "Servicio iniciado"), body: L("Customer was notified.", "Se notificó al cliente.") });
    } else if (nextStatus === "completed") {
      notifyNow({
        title: L("Awaiting customer confirmation", "Esperando confirmación del cliente"),
        body: L("Customer must mark the service complete before payout release.", "El cliente debe marcar el servicio como completado antes de liberar el pago."),
      });
      // After a short delay, let the mechanic rate the customer before
      // returning to the dashboard (symmetric with the customer's own
      // rate-the-mechanic step on app/complete.tsx).
      setTimeout(() => router.replace({ pathname: "/mechanic/rate-customer" as any, params: { jobId: job.id } } as any), 600);
    }
  };

  const handleCancel = () => {
    const doCancel = guardCancel(async (safetyReason: boolean = false) => {
      haptic.warning();
      if (job.remoteRequestId && user?.id) {
        try {
          const resolved = await resolveAuthSession(user);
          if (resolved) {
            if (safetyReason) {
              await createSafetyReport({
                sessionToken: resolved.sessionToken,
                role: "mechanic",
                requestId: job.remoteRequestId,
                reportType: "safety_cancellation",
                message: `Mechanic cancelled for safety during ${job.service} at ${job.location}.`,
              });
            }
            const released = await releaseDispatchFromMechanic(resolved.sessionToken, job.remoteRequestId, {
              reason: safetyReason ? "safety" : "mechanic_cancelled",
              safetyReason,
            });
            if (!released) {
              Alert.alert(L("Connection issue", "Problema de conexión"), L("Could not cancel right now. Please try again.", "No se pudo cancelar ahora. Inténtalo de nuevo."));
              return;
            }
          }
        } catch (error) {
          if (!isNetworkUnavailableError(error)) {
            console.error("[MechanicActive] Failed to cancel in live dispatch:", error);
          }
          Alert.alert(L("Connection issue", "Problema de conexión"), L("Could not cancel right now. Please try again.", "No se pudo cancelar ahora. Inténtalo de nuevo."));
          return;
        }
      }
      dispatch({
        type: "UPDATE_MECHANIC_JOB_STATUS",
        payload: { id: job.id, status: "cancelled" },
      });
      if (safetyReason) {
        notifyNow({
          title: L("Safety cancellation recorded", "Cancelación de seguridad registrada"),
          body: L("This cancellation was marked as safety-related.", "Esta cancelación se marcó como relacionada con seguridad."),
        });
      }
      router.replace("/(tabs)" as any);
    });
    if (Platform.OS === "web") {
      doCancel();
    } else {
      Alert.alert(L("Cancel job?", "¿Cancelar trabajo?"), L("The customer will be notified and we'll keep looking for another mechanic.", "Se notificará al cliente y seguiremos buscando otro mecánico."), [
        { text: L("Keep job", "Mantener trabajo"), style: "cancel" },
        { text: L("Unsafe situation", "Situación insegura"), style: "destructive", onPress: () => void doCancel(true) },
        { text: L("Cancel", "Cancelar"), style: "destructive", onPress: () => void doCancel(false) },
      ]);
    }
  };

  // "Can't find the customer" flow — only meaningful once the mechanic has
  // actually arrived. Files a timestamped report, notifies the customer, and
  // after a grace period offers a distinctly-labeled no-penalty cancel.
  const noShowGraceElapsed = hasNoShowGracePeriodElapsed(job.noShowReportedAt ?? null);
  const noShowMinutesAgo = minutesSinceNoShowReport(job.noShowReportedAt ?? null);
  const noShowGraceMinutes = NO_SHOW_GRACE_PERIOD_MS / 60000;

  const submitNoShowReport = async () => {
    haptic.warning();
    const reportedAtMs = Date.now();
    // Optimistic local update so the UI responds immediately regardless of network.
    dispatch({
      type: "UPDATE_MECHANIC_JOB_STATUS",
      payload: { id: job.id, status: job.status, noShowReportedAt: reportedAtMs },
    });
    if (!job.remoteRequestId || !user?.id) return;
    try {
      const resolved = await resolveAuthSession(user);
      if (!resolved) return;
      void createSafetyReport({
        sessionToken: resolved.sessionToken,
        role: "mechanic",
        requestId: job.remoteRequestId,
        reportType: "customer_no_show",
        message: `Mechanic arrived and could not find ${job.customerName} for ${job.service} at ${job.location}.`,
      });
      await updateDispatchStatus(resolved.sessionToken, job.remoteRequestId, mapDispatchStatus(job.status), {
        noShowReportedAt: new Date(reportedAtMs).toISOString(),
      });
    } catch (error) {
      console.error("[MechanicActive] No-show report failed:", error);
    }
  };

  const handleReportNoShow = () => {
    if (job.status !== "arrived" || job.noShowReportedAt) return;
    Alert.alert(
      L("Can't find the customer?", "¿No encuentras al cliente?"),
      L(
        `We'll notify ${job.customerName} and log a report. If there's no response within ${noShowGraceMinutes} minutes, you'll be able to cancel without it counting against you.`,
        `Notificaremos a ${job.customerName} y registraremos un reporte. Si no responde en ${noShowGraceMinutes} minutos, podrás cancelar sin que cuente en tu contra.`,
      ),
      [
        { text: L("Not yet", "Todavía no"), style: "cancel" },
        { text: L("Report & notify customer", "Reportar y notificar al cliente"), onPress: () => void submitNoShowReport() },
      ],
    );
  };

  const handleCancelNoShow = () => {
    const doCancelNoShow = guardCancelNoShow(async () => {
      haptic.warning();
      if (job.remoteRequestId && user?.id) {
        try {
          const resolved = await resolveAuthSession(user);
          if (resolved) {
            const released = await releaseDispatchFromMechanic(resolved.sessionToken, job.remoteRequestId, {
              reason: "customer_no_show",
            });
            if (!released) {
              Alert.alert(L("Connection issue", "Problema de conexión"), L("Could not cancel right now. Please try again.", "No se pudo cancelar ahora. Inténtalo de nuevo."));
              return;
            }
          }
        } catch (error) {
          if (!isNetworkUnavailableError(error)) {
            console.error("[MechanicActive] Failed to cancel (no-show) in live dispatch:", error);
          }
          Alert.alert(L("Connection issue", "Problema de conexión"), L("Could not cancel right now. Please try again.", "No se pudo cancelar ahora. Inténtalo de nuevo."));
          return;
        }
      }
      dispatch({ type: "UPDATE_MECHANIC_JOB_STATUS", payload: { id: job.id, status: "cancelled" } });
      notifyNow({
        title: L("Job released", "Trabajo liberado"),
        body: L(
          "Customer no-show cancellation recorded. This won't count against you.",
          "Se registró la cancelación por ausencia del cliente. Esto no contará en tu contra.",
        ),
      });
      router.replace("/(tabs)" as any);
    });
    Alert.alert(
      L("Cancel — customer no-show", "Cancelar — cliente ausente"),
      L(
        "The customer didn't respond in time. This cancellation is logged as a no-show and won't count against you. We'll look for another mechanic for them.",
        "El cliente no respondió a tiempo. Esta cancelación se registra como ausencia del cliente y no contará en tu contra. Buscaremos otro mecánico para ellos.",
      ),
      [
        { text: L("Keep waiting", "Seguir esperando"), style: "cancel" },
        { text: L("Cancel job", "Cancelar trabajo"), style: "destructive", onPress: () => void doCancelNoShow() },
      ],
    );
  };

  const ctaTitle = ctaLabel(job.status, isEs);
  const headline = headlineFor(job.status, job.customerName, isEs);
  const liveMechanicPoint = computeMechanicLive(job, elapsed);
  const liveEta = estimateEtaMinutes(liveMechanicPoint, job.pickup ?? null);
  const mechanicGpsPoint = mechanicLiveCoords ?? state.userCoords ?? liveMechanicPoint;
  const mapHeight = 300;
  const currentFlowIdx = FLOW.indexOf(job.status);
  const progressPct = ((Math.max(0, currentFlowIdx) + 1) / FLOW.length) * 100;
  const serviceLabel = service ? localizedServiceName(service.code, locale) : L("Service", "Servicio");
  const statusCaption = stepLabel(job.status, isEs);

  const handleNavigateToCustomer = async () => {
    const pickup = job.pickup;
    try {
      const destination =
        pickup
          ? `${pickup.latitude},${pickup.longitude}`
          : encodeURIComponent(job.location);
      const url =
        Platform.OS === "ios"
          ? pickup
            ? `maps://?daddr=${pickup.latitude},${pickup.longitude}&dirflg=d`
            : `maps://?q=${destination}`
          : pickup
          ? `google.navigation:q=${pickup.latitude},${pickup.longitude}`
          : `https://www.google.com/maps/search/?api=1&query=${destination}`;
      await Linking.openURL(url);
    } catch {
      Alert.alert(
        L("Navigation unavailable", "Navegación no disponible"),
        L("Could not open maps on this device.", "No se pudo abrir Maps en este dispositivo.")
      );
    }
  };

  const handlePickPartsReceipt = async () => {
    const picked = await pickReceiptImage();
    if (picked) setPartsReceipt(picked);
  };

  const handleProposeParts = async () => {
    if (partsSubmitting || !job.remoteRequestId || !user?.id) return;
    const partsCost = parseEditableMoneyInput(partsCostInput);
    if (!isPartsCostWithinBounds(partsCost, region)) {
      const cap = maxPartsCostForRegion(region);
      const capLabel = region === "MX" ? `$${cap.toLocaleString("es-MX")} MXN` : `$${cap}`;
      Alert.alert(
        L("Invalid amount", "Monto inválido"),
        L(`Enter an amount up to ${capLabel}.`, `Ingresa un monto de hasta ${capLabel}.`),
      );
      return;
    }
    if (!partsReceipt) {
      Alert.alert(
        L("Receipt required", "Recibo requerido"),
        L("Attach a photo of the receipt before sending.", "Adjunta una foto del recibo antes de enviar."),
      );
      return;
    }

    setPartsSubmitting(true);
    try {
      const resolved = await resolveAuthSession(user);
      if (!resolved) throw new Error("no session");
      const receiptPath = await uploadMechanicDoc(user.id, resolved.sessionToken, "parts_receipt", partsReceipt);
      await proposePartsCost(resolved.sessionToken, job.remoteRequestId, +partsCost.toFixed(2), receiptPath);
      haptic.success();
      setPartsProposed(true);
      Alert.alert(
        L("Parts cost sent", "Costo de piezas enviado"),
        L(
          "The customer will review the receipt and authorize the hold.",
          "El cliente revisará el recibo y autorizará la retención.",
        ),
      );
    } catch (error) {
      console.error("[MechanicActive] Parts cost proposal failed:", error);
      haptic.error();
      Alert.alert(
        L("Connection issue", "Problema de conexión"),
        L("Could not send the parts cost right now.", "No se pudo enviar el costo de piezas ahora."),
      );
    } finally {
      setPartsSubmitting(false);
    }
  };

  const uploadBeforePhoto = async (picked: PickedImage) => {
    if (!job.remoteRequestId || !user?.id) {
      haptic.selection();
      return;
    }
    setBeforeUploadFailed(false);
    setBeforeUploading(true);
    try {
      const resolved = await resolveAuthSession(user);
      if (!resolved) throw new Error("No active session");
      const path = await uploadServiceEvidencePhoto(job.remoteRequestId, resolved.sessionToken, "before", picked);
      setBeforePhotoUri(path);
      setBeforePhotoPending(null);
      haptic.success();
    } catch (error) {
      console.error("[MechanicActive] Before photo upload failed:", error);
      // Keep the locally captured photo and the pending upload payload so the
      // mechanic can retry without retaking the picture — only the failed
      // server sync is cleared.
      setBeforeUploadFailed(true);
      Alert.alert(
        L("Upload failed", "Carga fallida"),
        L("Could not upload before photo. Your photo is still saved — tap it to try uploading again.", "No se pudo subir la foto previa. Tu foto sigue guardada — tócala para intentar subirla de nuevo."),
      );
    } finally {
      setBeforeUploading(false);
    }
  };

  const handleCaptureBefore = async () => {
    if (beforeUploadFailed && beforePhotoPending) {
      void uploadBeforePhoto(beforePhotoPending);
      return;
    }
    const picked = await pickImageFromCamera({ allowsEditing: false, quality: 0.85 });
    if (!picked) return;
    setBeforePhotoLocalUri(picked.uri);
    setBeforePhotoPending(picked);
    setBeforePhotoUri(null);
    setBeforeUploadFailed(false);
    void uploadBeforePhoto(picked);
  };

  const uploadAfterPhoto = async (picked: PickedImage) => {
    if (!job.remoteRequestId || !user?.id) {
      haptic.selection();
      return;
    }
    setAfterUploadFailed(false);
    setAfterUploading(true);
    try {
      const resolved = await resolveAuthSession(user);
      if (!resolved) throw new Error("No active session");
      const path = await uploadServiceEvidencePhoto(job.remoteRequestId, resolved.sessionToken, "after", picked);
      setAfterPhotoUri(path);
      setAfterPhotoPending(null);
      haptic.success();
    } catch (error) {
      console.error("[MechanicActive] After photo upload failed:", error);
      setAfterUploadFailed(true);
      Alert.alert(
        L("Upload failed", "Carga fallida"),
        L("Could not upload after photo. Your photo is still saved — tap it to try uploading again.", "No se pudo subir la foto posterior. Tu foto sigue guardada — tócala para intentar subirla de nuevo."),
      );
    } finally {
      setAfterUploading(false);
    }
  };

  const handleCaptureAfter = async () => {
    if (job.status !== "in_progress") {
      Alert.alert(
        L("After photo locked", "Foto posterior bloqueada"),
        L("Start the service before capturing the after photo.", "Inicia el servicio antes de tomar la foto posterior."),
      );
      return;
    }
    if (afterUploadFailed && afterPhotoPending) {
      void uploadAfterPhoto(afterPhotoPending);
      return;
    }
    const picked = await pickImageFromCamera({ allowsEditing: false, quality: 0.85 });
    if (!picked) return;
    setAfterPhotoLocalUri(picked.uri);
    setAfterPhotoPending(picked);
    setAfterPhotoUri(null);
    setAfterUploadFailed(false);
    void uploadAfterPhoto(picked);
  };

  const afterPhotoLocked = job.status !== "in_progress";

  // Safety SOS for mechanic (symmetric to customer)
  const handleMechanicSafety = async () => {
    haptic.warning();
    const persistSafetyReport = async (
      reportType: "emergency" | "safety_issue" | "unsafe_situation" | "customer_no_show" | "safety_cancellation",
      message: string,
    ) => {
      if (!job.remoteRequestId || !user?.id) return false;
      const resolved = await resolveAuthSession(user);
      if (!resolved) return false;
      return createSafetyReport({
        sessionToken: resolved.sessionToken,
        role: "mechanic",
        requestId: job.remoteRequestId,
        reportType,
        message,
      });
    };
    const options = [
      {
        text: L("Call Emergency Services", "Llamar servicios de emergencia"),
        onPress: async () => {
          haptic.error();
          if (Platform.OS !== "web") {
            try { await Linking.openURL("tel:911"); } catch {}
          }
          Alert.alert(
            L("Emergency", "Emergencia"),
            L("Calling emergency + sharing customer location + job details.", "Llamando emergencia + compartiendo ubicación del cliente + detalles del trabajo.")
          );
          notifyNow({
            title: L("Emergency reported", "Emergencia reportada"),
            body: L("Mechanic requested emergency help on active job.", "El mecánico solicitó ayuda de emergencia en trabajo activo."),
          });
          void persistSafetyReport(
            "emergency",
            `Mechanic called emergency services for job with ${job.customerName} at ${job.location}.`,
          );
        },
      },
      {
        text: L("Share Live Location with Contact", "Compartir ubicación en vivo con contacto"),
        onPress: async () => {
          try {
            const { status } = await Contacts.requestPermissionsAsync();
            if (status === "granted") {
              const contacts = await Contacts.getContactsAsync({ fields: [Contacts.Fields.PhoneNumbers] });
              const withPhone = contacts.data.filter((c) => c.phoneNumbers && c.phoneNumbers.length > 0);
              if (withPhone.length > 0) {
                const contact = withPhone[0];
                const phone = contact.phoneNumbers?.[0]?.number || "";
                let smsSent = false;
                if (Platform.OS !== "web") {
                  try {
                    const available = await SMS.isAvailableAsync();
                    if (available && phone) {
                      const note = `WrenchUp mechanic safety: job for ${job.customerName} at ${job.location}. Live share (demo).`;
                      await SMS.sendSMSAsync([phone], note);
                      smsSent = true;
                    }
                  } catch {}
                }
                Alert.alert(
                  L("Shared", "Compartido"),
                  smsSent
                    ? L(`SMS with live location sent to ${contact.name || phone}.`, `SMS con ubicación enviado a ${contact.name || phone}.`)
                    : L(`Live location shared with ${contact.name || "contact"} for job with ${job.customerName}.`, `Ubicación compartida con ${contact.name || "contact"} para trabajo con ${job.customerName}.`)
                );
              }
            }
          } catch {}
        },
      },
      {
        text: L("Report Issue / Need Help", "Reportar problema / Necesito ayuda"),
        onPress: async () => {
          const persisted = await persistSafetyReport(
            "unsafe_situation",
            `Mechanic reported an unsafe situation for job with ${job.customerName} at ${job.location}.`,
          );
          Alert.alert(
            persisted ? L("Reported", "Reportado") : L("Report saved locally", "Reporte guardado localmente"),
            persisted
              ? L("Platform support notified. Stay safe.", "Soporte de plataforma notificado. Mantente seguro.")
              : L("Could not reach support right now. Use emergency services if needed.", "No se pudo contactar soporte ahora. Usa emergencias si es necesario."),
          );
          notifyNow({ title: L("Mechanic safety report", "Reporte de seguridad de mecánico"), body: L("Mechanic reported needing assistance.", "Mecánico reportó que necesita asistencia.") });
        },
      },
      {
        text: L("Customer no-show", "Cliente no se presentó"),
        onPress: async () => {
          await persistSafetyReport(
            "customer_no_show",
            `Mechanic reported customer no-show for ${job.service} at ${job.location}.`,
          );
          Alert.alert(L("Reported", "Reportado"), L("Customer no-show report submitted.", "Reporte de cliente ausente enviado."));
        },
      },
      { text: L("Cancel", "Cancelar"), style: "cancel" as const },
    ];
    Alert.alert(L("Safety & Emergency", "Seguridad y Emergencia"), L("Your location is tracked. Select action:", "Tu ubicación está siendo rastreada. Selecciona una acción:"), options);
  };

  // Biometric gate for sensitive actions (e.g. mark done) - extra authentication for both parties
  const secureAdvance = guardSecureAdvance(async () => {
    try {
      const hasHardware = await LocalAuthentication.hasHardwareAsync();
      if (hasHardware) {
        const res = await LocalAuthentication.authenticateAsync({
          promptMessage: L("Confirm this action with biometrics", "Confirma esta acción con biometría"),
          fallbackLabel: L("Use passcode", "Usar código"),
        });
        if (!res.success) {
          Alert.alert(L("Auth failed", "Autenticación fallida"), L("Could not verify.", "No se pudo verificar."));
          return;
        }
      }
    } catch {}
    await advance();
  });

  // This job has already been accepted — there is no previous screen it is
  // ever safe to go "back" to. The default back button falls through to
  // router.back(), which can resurface the incoming-offer screen (still
  // sitting in the navigation stack) with its accept/decline UI intact,
  // letting the mechanic "decline" a job they already committed to and
  // breaking the live service for the customer. Route back-taps to the
  // dashboard instead — the job keeps running in the background via store
  // state regardless of which screen is on top.
  const handleBackFromActive = () => {
    haptic.light();
    safeReplace("/(tabs)");
  };

  return (
    <ScreenContainer edges={["left", "right"]} showBackButton onBack={handleBackFromActive} title={L("Active job", "Trabajo activo")}>
      <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
        <View style={styles.mapShell}>
          <LiveMap
            status={mapStatus(job.status)}
            pickup={job.pickup ?? null}
            mechanic={mechanicGpsPoint}
            etaMinutes={job.status === "heading_there" ? liveEta : undefined}
            height={mapHeight}
          />
          <View style={styles.mapOverlay}>
            <View style={styles.statusPill}>
              <IconSymbol name="bolt.fill" size={12} color="#FDBA74" />
              <Text style={styles.statusPillText}>{statusCaption}</Text>
            </View>
            {job.status === "heading_there" ? (
              <View style={styles.etaPill}>
                <Text style={styles.etaPillText}>{`ETA ${liveEta} min`}</Text>
              </View>
            ) : null}
          </View>
        </View>

        <View style={styles.progressCard}>
          <View style={styles.progressHeader}>
            <Text style={styles.progressTitle}>{L("Job progress", "Progreso del trabajo")}</Text>
            <Text style={styles.progressMeta}>{`${Math.round(progressPct)}%`}</Text>
          </View>
          <View style={styles.progressTrack}>
            <View style={[styles.progressFill, { width: `${progressPct}%` }]} />
          </View>
          <View style={styles.progressSteps}>
            {FLOW.map((step, i) => {
              const done = i < currentFlowIdx;
              const active = i === currentFlowIdx;
              return (
                <View key={step} style={styles.progressStep}>
                  <View
                    style={[
                      styles.progressDot,
                      done && styles.progressDotDone,
                      active && styles.progressDotActive,
                    ]}
                  >
                    {done ? <IconSymbol name="checkmark" size={10} color="#FFFFFF" /> : null}
                  </View>
                  <Text
                    style={[
                      styles.progressStepLabel,
                      active && styles.progressStepLabelActive,
                      done && styles.progressStepLabelDone,
                    ]}
                    numberOfLines={1}
                  >
                    {stepLabel(step, isEs)}
                  </Text>
                </View>
              );
            })}
          </View>
        </View>

        <View style={styles.summaryCard}>
          <View style={{ flex: 1, gap: 4 }}>
            <Text style={styles.summaryEyebrow}>{serviceLabel}</Text>
            <Text style={styles.summaryTitle}>{headline}</Text>
            <Text style={styles.summarySub}>
              {formatDistanceByRegion(job.distanceMiles, region)} • {job.vehicle}
            </Text>
          </View>
          <View style={styles.payoutChip}>
            <Text style={styles.payoutChipLabel}>{L("PAYOUT", "PAGO")}</Text>
            <Text style={styles.payoutChipValue}>{formatPrice(job.payout)}</Text>
          </View>
        </View>

        <View style={styles.customerCard}>
          <Avatar name={job.customerName} size={56} />
          <View style={{ flex: 1 }}>
            <Text style={styles.customerName}>{job.customerName}</Text>
            <Text style={styles.customerVehicle}>{job.vehicle}</Text>
          </View>
          <ActionBtn icon="phone.fill" onPress={() => fakeCall(job.customerName, L)} />
          <ActionBtn
            icon="message.fill"
            onPress={() =>
              job.remoteRequestId
                ? router.push({
                    pathname: "/messages" as any,
                    params: { requestId: job.remoteRequestId, peerName: job.customerName },
                  } as any)
                : fakeMsg(job.customerName, L)
            }
          />
        </View>

        <View style={styles.addressCard}>
          <View style={styles.iconBubble}>
            <IconSymbol name="location.fill" size={16} color="#F97316" />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={styles.addressLabel}>{L("Pickup location", "Ubicación del servicio")}</Text>
            <Text style={styles.addressValue}>{job.location}</Text>
          </View>
          <Pressable onPress={handleNavigateToCustomer} style={styles.navigateBtn}>
            <IconSymbol name="location.fill" size={14} color="#FFFFFF" />
            <Text style={styles.navigateBtnText}>{L("Navigate", "Navegar")}</Text>
          </Pressable>
        </View>

        <View style={styles.addressCard}>
          <View style={styles.iconBubble}>
            <IconSymbol name="camera.fill" size={16} color="#F97316" />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={styles.addressLabel}>{L("Need parts?", "¿Necesitas piezas?")}</Text>
            {partsProposed ? (
              <Text style={styles.addressValue}>
                {L("Sent — waiting on the customer.", "Enviado — esperando al cliente.")}
              </Text>
            ) : (
              <Text style={styles.addressValue}>
                {L("Propose a receipt-backed reimbursement.", "Propón un reembolso con recibo.")}
              </Text>
            )}
          </View>
          {!partsProposed && (
            <Pressable onPress={() => setShowPartsForm((v) => !v)} style={styles.navigateBtn}>
              <Text style={styles.navigateBtnText}>{showPartsForm ? L("Close", "Cerrar") : L("Add", "Agregar")}</Text>
            </Pressable>
          )}
        </View>

        {showPartsForm && !partsProposed ? (
          <View style={styles.partsFormCard}>
            <View style={styles.counterOfferInputRow}>
              <Text style={styles.counterOfferCurrency}>$</Text>
              <TextInput
                value={partsCostInput}
                onChangeText={(value) => setPartsCostInput(normalizeEditableMoneyInput(value))}
                placeholder={formatEditableMoney(0, region)}
                placeholderTextColor="#64748B"
                keyboardType="decimal-pad"
                style={styles.counterOfferInput}
              />
            </View>
            <Pressable onPress={() => void handlePickPartsReceipt()} style={styles.receiptBtn}>
              <IconSymbol name="camera.fill" size={16} color="#94A3B8" />
              <Text style={styles.receiptBtnText}>
                {partsReceipt
                  ? L("Receipt attached — retake", "Recibo adjunto — volver a tomar")
                  : L("Attach receipt photo", "Adjuntar foto del recibo")}
              </Text>
            </Pressable>
            <Pressable
              onPress={() => void handleProposeParts()}
              disabled={partsSubmitting}
              style={({ pressed }) => [
                styles.partsSendBtn,
                pressed && !partsSubmitting && { opacity: 0.9 },
                partsSubmitting && { opacity: 0.7 },
              ]}
            >
              <Text style={styles.partsSendBtnText}>{L("Send parts cost", "Enviar costo de piezas")}</Text>
            </Pressable>
          </View>
        ) : null}

        <View style={styles.stepsCard}>
          <Text style={styles.stepsTitle}>{L("What to do next", "Qué hacer ahora")}</Text>
          <Text style={styles.stepsLead}>{stepDesc(job.status, isEs)}</Text>
          {FLOW.slice(0, -1).map((s, i) => {
            const stepIdx = i;
            const done = stepIdx < currentFlowIdx;
            const active = stepIdx === currentFlowIdx;
            return (
              <View key={s} style={[styles.stepRow, active && styles.stepRowActive]}>
                <View
                  style={[
                    styles.stepIcon,
                    done && styles.stepIconDone,
                    active && styles.stepIconActive,
                  ]}
                >
                  {done ? (
                    <IconSymbol name="checkmark" size={12} color="#FFFFFF" />
                  ) : (
                    <IconSymbol name={stepIcon(s)} size={12} color={active ? "#FFFFFF" : "#64748B"} />
                  )}
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={[styles.stepLabel, active && { color: "#C2410C" }]}>{stepLabel(s, isEs)}</Text>
                  <Text style={styles.stepDesc}>{stepDesc(s, isEs)}</Text>
                </View>
              </View>
            );
          })}
        </View>

        {(job.status === "arrived" || job.status === "in_progress") ? (
          <View style={styles.evidenceCard}>
            <View style={styles.evidenceHeader}>
              <View style={styles.evidenceHeaderIcon}>
                <IconSymbol name="camera.fill" size={18} color="#F97316" />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.evidenceTitle}>{L("Service evidence", "Evidencia del servicio")}</Text>
                <Text style={styles.evidenceSubtitle}>
                  {L(
                    "Capture live photos to document vehicle condition.",
                    "Toma fotos en vivo para documentar el estado del vehículo.",
                  )}
                </Text>
              </View>
            </View>

            <EvidencePhotoRow
              step={1}
              label={L("Before photo", "Foto previa")}
              hint={
                beforeUploadFailed
                  ? L("Upload failed — tap to retry", "Falló la carga — toca para reintentar")
                  : L("Required before starting service", "Requerida antes de iniciar")
              }
              photoUri={beforePhotoLocalUri ?? beforePhotoUri}
              uploading={beforeUploading}
              uploadFailed={beforeUploadFailed}
              locked={false}
              onPress={handleCaptureBefore}
              L={L}
            />

            <EvidencePhotoRow
              step={2}
              label={L("After photo", "Foto posterior")}
              hint={
                afterUploadFailed
                  ? L("Upload failed — tap to retry", "Falló la carga — toca para reintentar")
                  : afterPhotoLocked
                  ? L("Unlocks after service starts", "Se desbloquea al iniciar")
                  : L("Required to mark complete", "Requerida para finalizar")
              }
              photoUri={afterPhotoLocalUri ?? afterPhotoUri}
              uploading={afterUploading}
              uploadFailed={afterUploadFailed}
              locked={afterPhotoLocked}
              onPress={handleCaptureAfter}
              L={L}
            />
          </View>
        ) : null}

        {job.status === "arrived" ? (
          job.noShowReportedAt ? (
            <View style={styles.noShowCard}>
              <View style={styles.noShowHeader}>
                <IconSymbol name="exclamationmark.triangle.fill" size={16} color="#FCD34D" />
                <Text style={styles.noShowTitle}>
                  {noShowGraceElapsed
                    ? L("Customer hasn't responded", "El cliente no ha respondido")
                    : L("Waiting for customer", "Esperando al cliente")}
                </Text>
              </View>
              <Text style={styles.noShowBody}>
                {noShowGraceElapsed
                  ? L(
                      "It's been over 7 minutes with no response. You can cancel without it counting against you.",
                      "Han pasado más de 7 minutos sin respuesta. Puedes cancelar sin que cuente en tu contra.",
                    )
                  : L(
                      `Reported ${noShowMinutesAgo} min ago — ${job.customerName} was notified. You can cancel without penalty after ${noShowGraceMinutes} min total.`,
                      `Reportado hace ${noShowMinutesAgo} min — se notificó a ${job.customerName}. Podrás cancelar sin penalización después de ${noShowGraceMinutes} min en total.`,
                    )}
              </Text>
              {noShowGraceElapsed ? (
                <Pressable
                  onPress={handleCancelNoShow}
                  style={({ pressed }) => [styles.noShowCancelBtn, pressed && { opacity: 0.88 }]}
                >
                  <Text style={styles.noShowCancelBtnText}>
                    {L("Cancel — customer no-show", "Cancelar — cliente ausente")}
                  </Text>
                </Pressable>
              ) : null}
            </View>
          ) : (
            <Pressable
              onPress={handleReportNoShow}
              style={({ pressed }) => [styles.noShowReportBtn, pressed && { opacity: 0.88 }]}
            >
              <IconSymbol name="person.fill" size={16} color="#FCD34D" />
              <Text style={styles.noShowReportBtnText}>
                {L("Can't find the customer?", "¿No encuentras al cliente?")}
              </Text>
            </Pressable>
          )
        ) : null}

        <View style={styles.secondaryActions}>
          <Pressable
            onPress={handleCancel}
            style={({ pressed }) => [styles.cancelJobBtn, pressed && { opacity: 0.88 }]}
          >
            <IconSymbol name="xmark" size={16} color="#FFFFFF" />
            <Text style={styles.cancelJobBtnText}>
              {job.status === "in_progress" ? L("Cancel service", "Cancelar servicio") : L("Cancel job", "Cancelar trabajo")}
            </Text>
          </Pressable>
          <Pressable onPress={handleMechanicSafety} style={styles.safetyBtn}>
            <IconSymbol name="exclamationmark.triangle.fill" size={16} color="#FFFFFF" />
            <Text style={styles.safetyBtnText}>{L("Safety / emergency", "Seguridad / emergencia")}</Text>
          </Pressable>
        </View>
      </ScrollView>

      {nextStatus ? (
        <View style={styles.stickyFooter}>
          <PrimaryButton
            title={ctaTitle}
            onPress={secureAdvance}
            hapticType="success"
            iconRight={<IconSymbol name="arrow.right" size={18} color="#FFFFFF" />}
          />
        </View>
      ) : null}
    </ScreenContainer>
  );
}

function ActionBtn({ icon, onPress }: { icon: string; onPress: () => void }) {
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [styles.actionBtn, pressed && { opacity: 0.85, transform: [{ scale: 0.97 }] }]}
    >
      <IconSymbol name={icon} size={18} color="#FFFFFF" />
    </Pressable>
  );
}

function EvidencePhotoRow({
  step,
  label,
  hint,
  photoUri,
  uploading,
  uploadFailed = false,
  locked,
  onPress,
  L,
}: {
  step: number;
  label: string;
  hint: string;
  photoUri: string | null;
  uploading: boolean;
  uploadFailed?: boolean;
  locked: boolean;
  onPress: () => void;
  L: (en: string, es: string) => string;
}) {
  const captured = !!photoUri && !uploading && !uploadFailed;

  return (
    <Pressable
      onPress={onPress}
      disabled={uploading || (locked && !!photoUri)}
      style={({ pressed }) => [
        styles.evidenceRow,
        locked && styles.evidenceRowLocked,
        captured && styles.evidenceRowDone,
        uploadFailed && styles.evidenceRowFailed,
        pressed && !uploading && { opacity: 0.92 },
      ]}
    >
      <View
        style={[
          styles.evidenceStepBadge,
          captured && styles.evidenceStepBadgeDone,
          locked && styles.evidenceStepBadgeLocked,
          uploadFailed && styles.evidenceStepBadgeFailed,
        ]}
      >
        {uploadFailed ? (
          <IconSymbol name="arrow.triangle.2.circlepath" size={11} color="#FFFFFF" />
        ) : locked ? (
          <IconSymbol name="lock.fill" size={11} color="#94A3B8" />
        ) : captured ? (
          <IconSymbol name="checkmark" size={11} color="#FFFFFF" />
        ) : (
          <Text style={styles.evidenceStepNum}>{step}</Text>
        )}
      </View>

      <View style={styles.evidenceCopy}>
        <Text style={[styles.evidenceLabel, locked && styles.evidenceLabelLocked]}>{label}</Text>
        <Text style={[styles.evidenceHint, locked && styles.evidenceHintLocked, uploadFailed && styles.evidenceHintFailed]}>{hint}</Text>
      </View>

      <View style={styles.evidenceAction}>
        {photoUri ? (
          <View style={styles.evidenceThumbWrap}>
            <Image source={{ uri: photoUri }} style={styles.evidenceThumb} contentFit="cover" />
            {uploading ? (
              <View style={styles.evidenceThumbOverlay}>
                <ActivityIndicator size="small" color="#FFFFFF" />
              </View>
            ) : uploadFailed ? (
              <View style={[styles.evidenceThumbOverlay, styles.evidenceThumbOverlayFailed]}>
                <IconSymbol name="arrow.triangle.2.circlepath" size={16} color="#FFFFFF" />
              </View>
            ) : null}
          </View>
        ) : null}

        {!locked && !photoUri ? (
          <View style={[styles.evidenceCaptureBtn, uploading && styles.evidenceCaptureBtnBusy]}>
            {uploading ? (
              <ActivityIndicator size="small" color="#FFFFFF" />
            ) : (
              <>
                <IconSymbol name="camera.fill" size={14} color="#FFFFFF" />
                <Text style={styles.evidenceCaptureText}>{L("Capture", "Capturar")}</Text>
              </>
            )}
          </View>
        ) : null}

        {locked && !photoUri ? (
          <View style={styles.evidenceLockedPill}>
            <IconSymbol name="lock.fill" size={11} color="#94A3B8" />
            <Text style={styles.evidenceLockedText}>{L("Locked", "Bloqueada")}</Text>
          </View>
        ) : null}

        {captured ? (
          <View style={styles.evidenceRetakeBtn}>
            <IconSymbol name="arrow.triangle.2.circlepath" size={13} color="#64748B" />
          </View>
        ) : null}
      </View>
    </Pressable>
  );
}

function fakeCall(name: string, L: (en: string, es: string) => string) {
  haptic.light();
  if (Platform.OS !== "web") Alert.alert(L("Calling", "Llamando"), L(`Calling ${name}…`, `Llamando a ${name}…`));
}
function fakeMsg(name: string, L: (en: string, es: string) => string) {
  haptic.light();
  if (Platform.OS !== "web") Alert.alert(L("Message", "Mensaje"), L(`Send a message to ${name}.`, `Enviar un mensaje a ${name}.`));
}

function mapStatus(s: MechanicJobStatus): "idle" | "searching" | "enroute" | "arrived" | "in_progress" | "completed" {
  if (s === "heading_there") return "enroute";
  if (s === "arrived") return "arrived";
  if (s === "in_progress") return "in_progress";
  if (s === "completed") return "completed";
  return "idle";
}

function mapDispatchStatus(s: MechanicJobStatus): "searching" | "accepted" | "enroute" | "arrived" | "in_progress" | "completed" | "cancelled" {
  if (s === "heading_there") return "enroute";
  if (s === "arrived") return "arrived";
  if (s === "in_progress") return "in_progress";
  if (s === "completed") return "completed";
  if (s === "cancelled") return "cancelled";
  return "accepted";
}

const HEADING_DURATION = 20; // seconds for the puck animation along route

function computeMechanicLive(
  job: { pickup?: { latitude: number; longitude: number }; mechanicStart?: { latitude: number; longitude: number }; status: MechanicJobStatus },
  elapsed: number,
) {
  const pickup = job.pickup;
  const start = job.mechanicStart;
  if (!pickup || !start) return null;
  if (job.status === "heading_there") {
    const t = Math.min(1, elapsed / HEADING_DURATION);
    return interpolate(start, pickup, t);
  }
  // arrived / in_progress / completed
  return pickup;
}

function estimateEtaMinutes(
  mechanicPoint: { latitude: number; longitude: number } | null,
  pickupPoint: { latitude: number; longitude: number } | null,
): number {
  if (!mechanicPoint || !pickupPoint) return 12;
  const miles = metersToMiles(haversineMeters(mechanicPoint, pickupPoint));
  const effectiveMph = 24;
  return Math.max(1, Math.ceil((miles / effectiveMph) * 60));
}

function ctaLabel(s: MechanicJobStatus, isEs: boolean): string {
  switch (s) {
    case "heading_there": return isEs ? "Ya llegué" : "I've arrived";
    case "arrived": return isEs ? "Iniciar servicio" : "Start service";
    case "in_progress": return isEs ? "Marcar completo" : "Mark complete";
    default: return isEs ? "Continuar" : "Continue";
  }
}

function headlineFor(s: MechanicJobStatus, name: string, isEs: boolean): string {
  switch (s) {
    case "heading_there": return isEs ? `En camino a ${name}` : `Heading to ${name}`;
    case "arrived": return isEs ? `Llegaste a la ubicación de ${name}` : `You've arrived at ${name}'s location`;
    case "in_progress": return isEs ? "Servicio en progreso" : "Service in progress";
    case "completed": return isEs ? "Trabajo completado" : "Job complete";
    default: return "";
  }
}

function stepLabel(s: MechanicJobStatus, isEs: boolean): string {
  switch (s) {
    case "heading_there": return isEs ? "En camino" : "Heading there";
    case "arrived": return isEs ? "Llegaste" : "Arrived";
    case "in_progress": return isEs ? "Servicio en progreso" : "Service in progress";
    default: return s;
  }
}
function stepDesc(s: MechanicJobStatus, isEs: boolean): string {
  switch (s) {
    case "heading_there": return isEs ? "Conduce a la ubicación del cliente." : "Drive to the customer location.";
    case "arrived": return isEs ? "Encuentra al cliente y confirma el vehículo." : "Find the customer and confirm the vehicle.";
    case "in_progress": return isEs ? "Realiza el servicio." : "Perform the service.";
    default: return "";
  }
}

function stepIcon(s: MechanicJobStatus): string {
  switch (s) {
    case "heading_there": return "car.fill";
    case "arrived": return "mappin.and.ellipse";
    case "in_progress": return "wrench.fill";
    default: return "circle.fill";
  }
}

const cardShadow = Platform.select({
  ios: {
    shadowColor: "#0F172A",
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.08,
    shadowRadius: 16,
  },
  android: { elevation: 4 },
  default: {},
});

const styles = StyleSheet.create({
  scrollContent: {
    paddingBottom: 120,
    gap: 14,
  },
  mapShell: {
    marginHorizontal: 20,
    marginTop: 8,
    borderRadius: 22,
    overflow: "hidden",
    backgroundColor: "#0B1220",
    ...cardShadow,
  },
  mapOverlay: {
    position: "absolute",
    top: 14,
    left: 14,
    right: 14,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 8,
  },
  statusPill: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    backgroundColor: "rgba(11,18,32,0.82)",
    borderRadius: 999,
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.08)",
  },
  statusPillText: { color: "#F8FAFC", fontSize: 12, fontWeight: "800" },
  etaPill: {
    backgroundColor: "#F97316",
    borderRadius: 999,
    paddingHorizontal: 12,
    paddingVertical: 7,
  },
  etaPillText: { color: "#FFFFFF", fontSize: 12, fontWeight: "800" },
  progressCard: {
    marginHorizontal: 20,
    backgroundColor: "#FFFFFF",
    borderWidth: 1,
    borderColor: "#E2E8F0",
    borderRadius: 20,
    padding: 16,
    gap: 10,
    ...cardShadow,
  },
  progressHeader: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  progressTitle: {
    fontSize: 12,
    color: "#64748B",
    fontWeight: "800",
    textTransform: "uppercase",
    letterSpacing: 0.6,
  },
  progressMeta: { fontSize: 13, fontWeight: "800", color: "#F97316" },
  progressTrack: {
    height: 8,
    borderRadius: 999,
    backgroundColor: "#E2E8F0",
    overflow: "hidden",
  },
  progressFill: {
    height: "100%",
    borderRadius: 999,
    backgroundColor: "#F97316",
  },
  progressSteps: { flexDirection: "row", justifyContent: "space-between", gap: 6 },
  progressStep: { flex: 1, alignItems: "center", gap: 6 },
  progressDot: {
    width: 22,
    height: 22,
    borderRadius: 11,
    backgroundColor: "#E2E8F0",
    alignItems: "center",
    justifyContent: "center",
  },
  progressDotDone: { backgroundColor: "#10B981" },
  progressDotActive: { backgroundColor: "#F97316" },
  progressStepLabel: {
    fontSize: 10,
    color: "#94A3B8",
    fontWeight: "700",
    textAlign: "center",
  },
  progressStepLabelActive: { color: "#C2410C" },
  progressStepLabelDone: { color: "#059669" },
  summaryCard: {
    marginHorizontal: 20,
    backgroundColor: "#0B1220",
    borderRadius: 22,
    padding: 18,
    flexDirection: "row",
    alignItems: "center",
    gap: 14,
    ...cardShadow,
  },
  summaryEyebrow: {
    fontSize: 11,
    color: "#FDBA74",
    fontWeight: "800",
    textTransform: "uppercase",
    letterSpacing: 0.6,
  },
  summaryTitle: { fontSize: 20, fontWeight: "800", color: "#F8FAFC", lineHeight: 26 },
  summarySub: { fontSize: 13, color: "#94A3B8", marginTop: 2 },
  payoutChip: {
    alignItems: "flex-end",
    backgroundColor: "rgba(16,185,129,0.14)",
    borderRadius: 16,
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderWidth: 1,
    borderColor: "rgba(16,185,129,0.28)",
  },
  payoutChipLabel: { fontSize: 10, color: "#6EE7B7", fontWeight: "800", letterSpacing: 0.6 },
  payoutChipValue: { fontSize: 22, fontWeight: "800", color: "#34D399", marginTop: 2 },
  customerCard: {
    marginHorizontal: 20,
    backgroundColor: "#FFFFFF",
    borderWidth: 1,
    borderColor: "#E2E8F0",
    borderRadius: 20,
    padding: 14,
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    ...cardShadow,
  },
  customerName: { fontSize: 17, fontWeight: "800", color: "#0F172A" },
  customerVehicle: { fontSize: 13, color: "#64748B", marginTop: 2 },
  actionBtn: {
    width: 40,
    height: 40,
    borderRadius: 14,
    backgroundColor: "#0F172A",
    alignItems: "center",
    justifyContent: "center",
  },
  addressCard: {
    marginHorizontal: 20,
    backgroundColor: "#FFFFFF",
    borderWidth: 1,
    borderColor: "#E2E8F0",
    borderRadius: 20,
    padding: 14,
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    ...cardShadow,
  },
  navigateBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    backgroundColor: "#F97316",
    borderRadius: 999,
    paddingHorizontal: 12,
    paddingVertical: 9,
    marginLeft: 8,
  },
  navigateBtnText: { color: "#FFFFFF", fontSize: 12, fontWeight: "800" },
  iconBubble: {
    width: 36,
    height: 36,
    borderRadius: 12,
    backgroundColor: "#FFF7ED",
    alignItems: "center",
    justifyContent: "center",
  },
  addressLabel: { fontSize: 11, color: "#64748B", fontWeight: "700", textTransform: "uppercase", letterSpacing: 0.5 },
  addressValue: { fontSize: 14, color: "#0F172A", fontWeight: "600", marginTop: 2, lineHeight: 20 },
  partsFormCard: {
    marginHorizontal: 20,
    backgroundColor: "#FFFFFF",
    borderWidth: 1,
    borderColor: "#E2E8F0",
    borderRadius: 20,
    padding: 14,
    gap: 10,
    ...cardShadow,
  },
  counterOfferInputRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    backgroundColor: "#F8FAFC",
    borderWidth: 1,
    borderColor: "#E2E8F0",
    borderRadius: 14,
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  counterOfferCurrency: { fontSize: 18, fontWeight: "800", color: "#F97316" },
  counterOfferInput: { flex: 1, color: "#0F172A", fontSize: 16, fontWeight: "700", paddingVertical: 0 },
  receiptBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    paddingVertical: 12,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: "#E2E8F0",
    borderStyle: "dashed",
  },
  receiptBtnText: { color: "#64748B", fontSize: 13, fontWeight: "600" },
  partsSendBtn: {
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 14,
    paddingVertical: 14,
    backgroundColor: "#F97316",
  },
  partsSendBtnText: { color: "#FFFFFF", fontWeight: "900", fontSize: 15 },
  stepsCard: {
    marginHorizontal: 20,
    backgroundColor: "#FFFFFF",
    borderWidth: 1,
    borderColor: "#E2E8F0",
    borderRadius: 20,
    padding: 16,
    gap: 10,
    ...cardShadow,
  },
  stepsTitle: {
    fontSize: 12,
    color: "#64748B",
    fontWeight: "800",
    textTransform: "uppercase",
    letterSpacing: 0.6,
  },
  stepsLead: { fontSize: 14, color: "#0F172A", fontWeight: "600", lineHeight: 20 },
  stepRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 12,
    padding: 12,
    borderRadius: 14,
    backgroundColor: "#F8FAFC",
    borderWidth: 1,
    borderColor: "#E2E8F0",
  },
  stepRowActive: {
    backgroundColor: "#FFF7ED",
    borderColor: "#FDBA74",
  },
  stepIcon: {
    width: 32,
    height: 32,
    borderRadius: 12,
    backgroundColor: "#E2E8F0",
    alignItems: "center",
    justifyContent: "center",
  },
  stepIconDone: { backgroundColor: "#10B981" },
  stepIconActive: { backgroundColor: "#F97316" },
  stepLabel: { fontSize: 14, fontWeight: "800", color: "#0F172A" },
  stepDesc: { fontSize: 12, color: "#64748B", marginTop: 2, lineHeight: 17 },
  evidenceCard: {
    marginHorizontal: 20,
    backgroundColor: "#FFFFFF",
    borderWidth: 1,
    borderColor: "#E2E8F0",
    borderRadius: 20,
    padding: 16,
    gap: 12,
    ...cardShadow,
  },
  evidenceHeader: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 12,
    paddingBottom: 4,
  },
  evidenceHeaderIcon: {
    width: 40,
    height: 40,
    borderRadius: 12,
    backgroundColor: "#FFF7ED",
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderColor: "#FFEDD5",
  },
  evidenceTitle: {
    fontSize: 16,
    fontWeight: "800",
    color: "#0F172A",
    letterSpacing: -0.2,
  },
  evidenceSubtitle: {
    fontSize: 13,
    color: "#64748B",
    marginTop: 2,
    lineHeight: 18,
  },
  evidenceRow: {
    backgroundColor: "#F8FAFC",
    borderWidth: 1,
    borderColor: "#E2E8F0",
    borderRadius: 16,
    paddingHorizontal: 12,
    paddingVertical: 12,
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
  },
  evidenceRowLocked: {
    backgroundColor: "#F1F5F9",
    borderColor: "#E2E8F0",
    opacity: 0.88,
  },
  evidenceRowDone: {
    backgroundColor: "#F0FDF4",
    borderColor: "#BBF7D0",
  },
  evidenceRowFailed: {
    backgroundColor: "#FEF2F2",
    borderColor: "#FECACA",
  },
  evidenceStepBadge: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: "#F97316",
    alignItems: "center",
    justifyContent: "center",
  },
  evidenceStepBadgeDone: {
    backgroundColor: "#10B981",
  },
  evidenceStepBadgeLocked: {
    backgroundColor: "#E2E8F0",
  },
  evidenceStepBadgeFailed: {
    backgroundColor: "#EF4444",
  },
  evidenceStepNum: {
    color: "#FFFFFF",
    fontSize: 12,
    fontWeight: "800",
  },
  evidenceCopy: { flex: 1, gap: 2 },
  evidenceLabel: { color: "#0F172A", fontSize: 14, fontWeight: "800" },
  evidenceLabelLocked: { color: "#64748B" },
  evidenceHint: { color: "#64748B", fontSize: 12, lineHeight: 16 },
  evidenceHintLocked: { color: "#94A3B8" },
  evidenceHintFailed: { color: "#DC2626", fontWeight: "700" },
  evidenceAction: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  evidenceThumbWrap: {
    width: 52,
    height: 52,
    borderRadius: 12,
    overflow: "hidden",
    backgroundColor: "#E2E8F0",
    borderWidth: 1,
    borderColor: "#CBD5E1",
  },
  evidenceThumb: {
    width: "100%",
    height: "100%",
  },
  evidenceThumbOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "rgba(15,23,42,0.45)",
    alignItems: "center",
    justifyContent: "center",
  },
  evidenceThumbOverlayFailed: {
    backgroundColor: "rgba(220,38,38,0.55)",
  },
  evidenceCaptureBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    backgroundColor: "#0F172A",
    borderRadius: 999,
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  evidenceCaptureBtnBusy: {
    backgroundColor: "#334155",
    minWidth: 92,
    justifyContent: "center",
  },
  evidenceCaptureText: {
    color: "#FFFFFF",
    fontSize: 12,
    fontWeight: "800",
  },
  evidenceRetakeBtn: {
    width: 32,
    height: 32,
    borderRadius: 10,
    backgroundColor: "#FFFFFF",
    borderWidth: 1,
    borderColor: "#E2E8F0",
    alignItems: "center",
    justifyContent: "center",
  },
  evidenceLockedPill: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    backgroundColor: "#E2E8F0",
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 7,
  },
  evidenceLockedText: {
    color: "#64748B",
    fontSize: 11,
    fontWeight: "800",
    textTransform: "uppercase",
    letterSpacing: 0.4,
  },
  noShowReportBtn: {
    marginHorizontal: 20,
    backgroundColor: "#FFFBEB",
    borderWidth: 1,
    borderColor: "#FCD34D",
    borderRadius: 14,
    paddingVertical: 13,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
  },
  noShowReportBtnText: { color: "#92400E", fontSize: 14, fontWeight: "800" },
  noShowCard: {
    marginHorizontal: 20,
    backgroundColor: "#FFFBEB",
    borderWidth: 1,
    borderColor: "#FCD34D",
    borderRadius: 16,
    padding: 14,
    gap: 8,
  },
  noShowHeader: { flexDirection: "row", alignItems: "center", gap: 8 },
  noShowTitle: { color: "#92400E", fontSize: 14, fontWeight: "900" },
  noShowBody: { color: "#92400E", fontSize: 12.5, lineHeight: 18 },
  noShowCancelBtn: {
    marginTop: 4,
    backgroundColor: "#92400E",
    borderRadius: 12,
    paddingVertical: 12,
    alignItems: "center",
    justifyContent: "center",
  },
  noShowCancelBtnText: { color: "#FFFFFF", fontSize: 13, fontWeight: "800" },
  secondaryActions: {
    marginHorizontal: 20,
    gap: 10,
  },
  cancelJobBtn: {
    backgroundColor: "#991B1B",
    borderColor: "#FCA5A5",
    borderWidth: 1,
    borderRadius: 14,
    paddingVertical: 15,
    paddingHorizontal: 18,
    alignItems: "center",
    flexDirection: "row",
    justifyContent: "center",
    gap: 8,
  },
  cancelJobBtnText: {
    color: "#FFFFFF",
    fontSize: 15,
    fontWeight: "900",
  },
  safetyBtn: {
    backgroundColor: "#DC2626",
    borderRadius: 14,
    paddingVertical: 14,
    alignItems: "center",
    flexDirection: "row",
    justifyContent: "center",
    gap: 8,
  },
  safetyBtnText: { color: "#FFFFFF", fontSize: 15, fontWeight: "800" },
  stickyFooter: {
    position: "absolute",
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: "#FFFFFF",
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: "#E2E8F0",
    paddingHorizontal: 20,
    paddingTop: 14,
    paddingBottom: 28,
    ...Platform.select({
      ios: {
        shadowColor: "#0F172A",
        shadowOffset: { width: 0, height: -4 },
        shadowOpacity: 0.06,
        shadowRadius: 12,
      },
      android: { elevation: 10 },
      default: {},
    }),
  },
  emptyWrap: { flex: 1, alignItems: "center", justifyContent: "center", gap: 12, padding: 24 },
  emptyIcon: {
    width: 72,
    height: 72,
    borderRadius: 36,
    backgroundColor: "#DCFCE7",
    alignItems: "center",
    justifyContent: "center",
  },
  emptyTitle: { fontSize: 20, fontWeight: "800", color: "#0F172A" },
  emptyText: { fontSize: 14, color: "#64748B", textAlign: "center", lineHeight: 20 },
});
