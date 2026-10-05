import { useEffect, useMemo, useState } from "react";
import { Alert, Modal, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import { ScreenContainer } from "@/components/screen-container";
import { PrimaryButton } from "@/components/primary-button";
import { IconSymbol } from "@/components/ui/icon-symbol";
import { useAuth } from "@/lib/auth-context";
import { useStore } from "@/lib/store";
import { useLocaleContext, useL } from "@/hooks/use-locale";
import { resolveAuthSession } from "@/lib/resolve-auth-session";
import { fetchDispatchRequest, type DispatchRequest, updateDispatchRequest } from "@/lib/live-dispatch";
import { deriveBookedMeta, buildBookedCustomerNote } from "@/lib/booked-trip";
import { haptic } from "@/lib/haptics";
import { getServiceType } from "@/lib/seed";
import type { ServiceCode } from "@/lib/types";

const SIX_HOURS_MS = 6 * 60 * 60 * 1000;

function toTimeSlot(date: Date): string {
  const hours = date.getHours().toString().padStart(2, "0");
  const minutes = Math.floor(date.getMinutes() / 5) * 5;
  return `${hours}:${minutes.toString().padStart(2, "0")}`;
}

function formatScheduleLabel(date: Date, locale: string): string {
  const dateLocale = locale === "es-MX" ? "es-MX" : "en-US";
  const diffMinutes = Math.floor((date.getTime() - Date.now()) / 60000);
  if (diffMinutes <= -90) return locale === "es-MX" ? "Hora programada pasada" : "Scheduled time passed";
  if (diffMinutes <= 0) return locale === "es-MX" ? "Listo para salir" : "Ready to start";
  if (diffMinutes < 90) return locale === "es-MX" ? `Inicia en ${diffMinutes} min` : `Starts in ${diffMinutes} min`;

  const startOfToday = new Date();
  startOfToday.setHours(0, 0, 0, 0);
  const startOfTarget = new Date(date);
  startOfTarget.setHours(0, 0, 0, 0);
  const dayDiff = Math.round((startOfTarget.getTime() - startOfToday.getTime()) / 86400000);
  const timeLabel = new Intl.DateTimeFormat(dateLocale, { hour: "numeric", minute: "2-digit" }).format(date);
  if (dayDiff === 0) return locale === "es-MX" ? `Hoy a las ${timeLabel}` : `Today at ${timeLabel}`;
  if (dayDiff === 1) return locale === "es-MX" ? `Mañana a las ${timeLabel}` : `Tomorrow at ${timeLabel}`;
  return locale === "es-MX" ? `En ${dayDiff} días a las ${timeLabel}` : `In ${dayDiff} days at ${timeLabel}`;
}

export default function BookedServiceEditScreen() {
  const router = useRouter();
  const { requestId } = useLocalSearchParams<{ requestId?: string }>();
  const { user } = useAuth();
  const { state, dispatch } = useStore();
  const { locale } = useLocaleContext();
  const L = useL();

  const currentRequestId = typeof requestId === "string" ? requestId : null;
  const localJob = useMemo(
    () => state.jobs.find((job) => job.remoteRequestId === currentRequestId) ?? null,
    [currentRequestId, state.jobs],
  );
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [request, setRequest] = useState<DispatchRequest | null>(null);
  const [location, setLocation] = useState("");
  const [locationEdit, setLocationEdit] = useState(false);
  const [note, setNote] = useState("");
  const [dayOffset, setDayOffset] = useState(0);
  const [timeSlot, setTimeSlot] = useState("12:00");
  const [customScheduledDate, setCustomScheduledDate] = useState<Date | null>(null);
  const [showCustomTimeModal, setShowCustomTimeModal] = useState(false);
  const [pickerHour, setPickerHour] = useState(12);
  const [pickerMinute, setPickerMinute] = useState(0);

  const bookedMeta = useMemo(
    () => deriveBookedMeta(request?.scheduled_for ?? null, request?.customer_note ?? null),
    [request?.customer_note, request?.scheduled_for],
  );
  const service = request ? getServiceType(request.service_code as ServiceCode) : null;

  const scheduledFor = useMemo(() => {
    if (customScheduledDate) return customScheduledDate;
    const date = new Date();
    date.setDate(date.getDate() + dayOffset);
    const [h, m] = timeSlot.split(":").map((part) => parseInt(part, 10));
    const hh = Number.isFinite(h) ? Math.max(0, Math.min(23, h)) : 12;
    const mm = Number.isFinite(m) ? Math.max(0, Math.min(59, m)) : 0;
    date.setHours(hh, mm, 0, 0);
    return date;
  }, [customScheduledDate, dayOffset, timeSlot]);

  const baseTimeSlots = useMemo(() => ["09:00", "12:00", "15:00", "18:00"], []);
  const availableTimeSlots = useMemo(() => {
    if (dayOffset !== 0) return baseTimeSlots;
    const now = new Date();
    return baseTimeSlots.filter((slot) => {
      const [h, m] = slot.split(":").map((part) => parseInt(part, 10));
      if (!Number.isFinite(h) || !Number.isFinite(m)) return false;
      return h > now.getHours() || (h === now.getHours() && m >= now.getMinutes());
    });
  }, [baseTimeSlots, dayOffset]);
  const canSaveChanges = !!location.trim() && !saving && scheduledFor.getTime() - Date.now() >= SIX_HOURS_MS;

  useEffect(() => {
    let alive = true;
    if (!currentRequestId || !user?.id) {
      setRequest(null);
      setLoading(false);
      return () => {
        alive = false;
      };
    }

    setLoading(true);
    const load = async () => {
      try {
        const resolved = await resolveAuthSession(user);
        if (!resolved || !alive) return;
        const remote = await fetchDispatchRequest(resolved.sessionToken, currentRequestId);
        if (!alive) return;
        if (!remote || remote.customer_user_id !== user.id) {
          setRequest(null);
          return;
        }

        const meta = deriveBookedMeta(remote.scheduled_for ?? null, remote.customer_note ?? null);
        if (!meta.isBooked) {
          setRequest(null);
          return;
        }

        const scheduled = meta.scheduledForMs ? new Date(meta.scheduledForMs) : new Date();
        if (scheduled.getTime() - Date.now() < SIX_HOURS_MS) {
          Alert.alert(
            L("Modify unavailable", "Modificación no disponible"),
            L(
              "Booked services can only be modified 6 hours or more before the scheduled time.",
              "Los servicios agendados solo se pueden modificar 6 horas o más antes de la hora programada.",
            ),
          );
          router.replace("/(tabs)/booked-requests" as any);
          return;
        }

        const startOfToday = new Date();
        startOfToday.setHours(0, 0, 0, 0);
        const startOfTarget = new Date(scheduled);
        startOfTarget.setHours(0, 0, 0, 0);
        const nextDayOffset = Math.max(0, Math.round((startOfTarget.getTime() - startOfToday.getTime()) / 86400000));

        setRequest(remote);
        setLocation(remote.location_label);
        setNote(meta.cleanNote ?? "");
        setDayOffset(nextDayOffset);
        setTimeSlot(toTimeSlot(scheduled));
        setCustomScheduledDate(scheduled);
      } catch (error) {
        console.error("[BookedServiceEdit] load failed:", error);
        if (alive) setRequest(null);
      } finally {
        if (alive) setLoading(false);
      }
    };

    void load();
    return () => {
      alive = false;
    };
  }, [currentRequestId, router, user, L]);

  const openCustomTimeModal = () => {
    const baseDate = customScheduledDate || scheduledFor;
    setPickerHour(baseDate.getHours());
    setPickerMinute(Math.floor(baseDate.getMinutes() / 5) * 5);
    setShowCustomTimeModal(true);
    haptic.selection();
  };

  const confirmCustomTime = () => {
    const base = new Date();
    base.setDate(base.getDate() + dayOffset);
    base.setHours(pickerHour, pickerMinute, 0, 0);
    const startOfToday = new Date();
    startOfToday.setHours(0, 0, 0, 0);
    const startOfTarget = new Date(base);
    startOfTarget.setHours(0, 0, 0, 0);
    const nextDayOffset = Math.max(0, Math.round((startOfTarget.getTime() - startOfToday.getTime()) / 86400000));
    setCustomScheduledDate(base);
    setDayOffset(nextDayOffset);
    setTimeSlot(toTimeSlot(base));
    setShowCustomTimeModal(false);
    haptic.success();
  };

  const handleSave = async () => {
    if (!request || !currentRequestId || !user?.id) return;
    if (!location.trim()) {
      Alert.alert(L("Missing location", "Falta la ubicación"), L("Please add a service location.", "Agrega una ubicación de servicio."));
      return;
    }
    if (scheduledFor.getTime() - Date.now() < SIX_HOURS_MS) {
      Alert.alert(
        L("Modify unavailable", "Modificación no disponible"),
        L(
          "Booked services can only be modified 6 hours or more before the scheduled time.",
          "Los servicios agendados solo se pueden modificar 6 horas o más antes de la hora programada.",
        ),
      );
      return;
    }

    setSaving(true);
    try {
      const resolved = await resolveAuthSession(user);
      if (!resolved) return;
      const updated = await updateDispatchRequest(resolved.sessionToken, currentRequestId, {
        scheduled_for: scheduledFor.toISOString(),
        location_label: location.trim(),
        customer_note: buildBookedCustomerNote(note.trim() || null, scheduledFor.toISOString()),
      });
      if (!updated) {
        Alert.alert(
          L("Connection issue", "Problema de conexión"),
          L("Could not save your changes right now. Please try again.", "No se pudieron guardar tus cambios ahora. Inténtalo de nuevo."),
        );
        return;
      }

      if (localJob) {
        dispatch({
          type: "UPDATE_JOB_BOOKING_META",
          payload: {
            id: localJob.id,
            isBooked: true,
            scheduledFor: scheduledFor.getTime(),
            location: location.trim(),
            customerNote: note.trim() || null,
          },
        });
      }
      haptic.success();
      router.replace("/(tabs)/booked-requests" as any);
    } catch (error) {
      console.error("[BookedServiceEdit] save failed:", error);
      Alert.alert(
        L("Update failed", "No se pudo actualizar"),
        L("Please try again in a moment.", "Inténtalo de nuevo en un momento."),
      );
    } finally {
      setSaving(false);
    }
  };

  if (loading && !request) {
    return (
      <ScreenContainer showBackButton title={L("Modify booked service", "Modificar servicio agendado")}>
        <View style={styles.loadingWrap}>
          <Text style={styles.loadingText}>{L("Loading booked service...", "Cargando servicio agendado...")}</Text>
        </View>
      </ScreenContainer>
    );
  }

  if (!request || !bookedMeta.isBooked) {
    return (
      <ScreenContainer showBackButton title={L("Modify booked service", "Modificar servicio agendado")}>
        <View style={styles.loadingWrap}>
          <Text style={styles.loadingText}>{L("Booked service not found", "No se encontró el servicio agendado")}</Text>
        </View>
      </ScreenContainer>
    );
  }

  return (
    <ScreenContainer edges={["left", "right", "bottom"]} showBackButton title={L("Modify booked service", "Modificar servicio agendado")}>
      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <View style={styles.card}>
          <Text style={styles.cardTitle}>{L("Current booking", "Reserva actual")}</Text>
          <Text style={styles.service}>{service?.name ?? L("Booked service", "Servicio agendado")}</Text>
          <Text style={styles.meta}>{request.vehicle_label}</Text>
          <Text style={styles.meta}>{request.location_label}</Text>
          <Text style={styles.meta}>{formatScheduleLabel(new Date(bookedMeta.scheduledForMs ?? Date.now()), locale)}</Text>
        </View>

        <View style={styles.section}>
          <View style={styles.sectionHeader}>
            <Text style={styles.sectionTitle}>{L("Service location", "Ubicación del servicio")}</Text>
            <Pressable onPress={() => setLocationEdit((v) => !v)} hitSlop={10}>
              <Text style={styles.link}>{locationEdit ? L("Done", "Listo") : L("Edit", "Editar")}</Text>
            </Pressable>
          </View>
          <Text style={styles.helperText}>
            {L(
              "Use the street address where the mechanic should meet you.",
              "Usa la dirección exacta donde el mecánico debe encontrarte.",
            )}
          </Text>
          {locationEdit ? (
            <TextInput
              value={location}
              onChangeText={setLocation}
              placeholder={L("Street, city, state", "Calle, ciudad, estado")}
              placeholderTextColor="#94A3B8"
              style={styles.input}
            />
          ) : (
            <View style={styles.locationRow}>
              <IconSymbol name="location.fill" size={18} color="#FFFFFF" />
              <Text style={styles.locationValue}>{location}</Text>
            </View>
          )}
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>{L("Schedule", "Horario")}</Text>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8 }}>
            {Array.from({ length: 8 }, (_, index) => {
              const optionDate = new Date();
              optionDate.setDate(optionDate.getDate() + index);
              const label =
                index === 0
                  ? L("Today", "Hoy")
                  : index === 1
                    ? L("Tomorrow", "Mañana")
                    : optionDate.toLocaleDateString(locale === "es-MX" ? "es-MX" : "en-US", {
                        weekday: "short",
                        month: "short",
                        day: "numeric",
                      });
              return (
                <Pressable
                  key={index}
                  onPress={() => {
                    setDayOffset(index);
                    setCustomScheduledDate(null);
                  }}
                  style={[styles.dayChip, dayOffset === index && styles.dayChipOn]}
                >
                  <Text style={[styles.dayChipText, dayOffset === index && styles.dayChipTextOn]}>{label}</Text>
                </Pressable>
              );
            })}
          </ScrollView>

          <View style={styles.timeRow}>
            {availableTimeSlots.map((slot) => (
              <Pressable
                key={slot}
                onPress={() => {
                  setTimeSlot(slot);
                  setCustomScheduledDate(null);
                }}
                style={[styles.timeChip, timeSlot === slot && styles.timeChipOn]}
              >
                <Text style={[styles.timeChipText, timeSlot === slot && styles.timeChipTextOn]}>{slot}</Text>
              </Pressable>
            ))}
          </View>

          {availableTimeSlots.length === 0 ? (
            <Text style={styles.helperText}>
              {L(
                "No preset slots are left for today. Please pick another day or choose an exact time.",
                "No quedan horarios predefinidos para hoy. Selecciona otro día o elige una hora exacta.",
              )}
            </Text>
          ) : null}

          <Pressable onPress={openCustomTimeModal} style={styles.customTimeButton}>
            <IconSymbol name="clock" size={16} color="#F97316" />
            <Text style={styles.customTimeButtonText}>{L("Choose exact time", "Elegir hora exacta")}</Text>
          </Pressable>

          <View style={styles.selectedSchedule}>
            <Text style={styles.selectedLabel}>{L("Updated appointment", "Cita actualizada")}</Text>
            <Text style={styles.selectedValue}>
              {scheduledFor.toLocaleDateString(locale, { weekday: "long", month: "long", day: "numeric" })}
              {" • "}
              {scheduledFor.toLocaleTimeString(locale, { hour: "numeric", minute: "2-digit" })}
            </Text>
          </View>
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>{L("Customer note", "Nota del cliente")}</Text>
          <Text style={styles.helperText}>
            {L(
              "Update the note if you want the mechanic to see any new details.",
              "Actualiza la nota si quieres que el mecánico vea nuevos detalles.",
            )}
          </Text>
          <TextInput
            value={note}
            onChangeText={setNote}
            placeholder={L("Add a note for the mechanic", "Agrega una nota para el mecánico")}
            placeholderTextColor="#94A3B8"
            multiline
            style={[styles.input, { minHeight: 96, textAlignVertical: "top" }]}
          />
        </View>

        <View style={{ marginTop: 8 }}>
          <PrimaryButton
          title={saving ? L("Saving...", "Guardando...") : L("Save changes", "Guardar cambios")}
          loading={saving}
          disabled={!canSaveChanges}
          onPress={() => void handleSave()}
          hapticType="success"
        />
        </View>
      </ScrollView>

      <Modal visible={showCustomTimeModal} transparent animationType="fade" onRequestClose={() => setShowCustomTimeModal(false)}>
        <View style={styles.modalOverlay}>
          <View style={styles.timePickerModal}>
            <Text style={styles.modalTitle}>{L("Select exact time", "Seleccionar hora exacta")}</Text>
            <View style={styles.timePickerPreview}>
              <Text style={styles.timePickerPreviewText}>
                {pickerHour.toString().padStart(2, "0")}:{pickerMinute.toString().padStart(2, "0")}
              </Text>
            </View>
            <View style={styles.timePickerRow}>
              <View style={styles.timeColumn}>
                <Text style={styles.columnLabel}>{L("Hour", "Hora")}</Text>
                <ScrollView style={styles.timeScroll} showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: 8 }}>
                  {Array.from({ length: 24 }).map((_, hour) => (
                    <Pressable key={hour} onPress={() => setPickerHour(hour)} style={[styles.timeOption, pickerHour === hour && styles.timeOptionSelected]}>
                      <Text style={[styles.timeOptionText, pickerHour === hour && styles.timeOptionTextSelected]}>
                        {hour.toString().padStart(2, "0")}
                      </Text>
                    </Pressable>
                  ))}
                </ScrollView>
              </View>

              <View style={styles.timeColumn}>
                <Text style={styles.columnLabel}>{L("Minute", "Minuto")}</Text>
                <ScrollView style={styles.timeScroll} showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: 8 }}>
                  {Array.from({ length: 12 }).map((_, index) => {
                    const minute = index * 5;
                    return (
                      <Pressable key={minute} onPress={() => setPickerMinute(minute)} style={[styles.timeOption, pickerMinute === minute && styles.timeOptionSelected]}>
                        <Text style={[styles.timeOptionText, pickerMinute === minute && styles.timeOptionTextSelected]}>
                          {minute.toString().padStart(2, "0")}
                        </Text>
                      </Pressable>
                    );
                  })}
                </ScrollView>
              </View>
            </View>
            <View style={styles.modalActions}>
              <Pressable onPress={() => setShowCustomTimeModal(false)} style={[styles.modalBtn, styles.modalBtnSecondary]}>
                <Text style={styles.modalBtnTextSecondary}>{L("Cancel", "Cancelar")}</Text>
              </Pressable>
              <Pressable onPress={confirmCustomTime} style={[styles.modalBtn, styles.modalBtnPrimary]}>
                <Text style={styles.modalBtnTextPrimary}>{L("Use time", "Usar hora")}</Text>
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>
    </ScreenContainer>
  );
}

const styles = StyleSheet.create({
  loadingWrap: { flex: 1, alignItems: "center", justifyContent: "center", paddingHorizontal: 24 },
  loadingText: { color: "#F8FAFC", fontSize: 16, fontWeight: "700", textAlign: "center" },
  content: { padding: 16, gap: 12 },
  card: {
    backgroundColor: "#1A1A2E",
    borderColor: "#2A2A40",
    borderWidth: 1,
    borderRadius: 16,
    padding: 14,
    gap: 4,
  },
  cardTitle: { color: "#F97316", fontSize: 12, fontWeight: "900", textTransform: "uppercase", marginBottom: 2 },
  service: { color: "#F8FAFC", fontSize: 18, fontWeight: "900" },
  meta: { color: "#CBD5E1", fontSize: 13, fontWeight: "600" },
  section: {
    backgroundColor: "#1A1A2E",
    borderColor: "#2A2A40",
    borderWidth: 1,
    borderRadius: 16,
    padding: 14,
    gap: 10,
  },
  sectionHeader: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  sectionTitle: { color: "#F97316", fontSize: 14, fontWeight: "900", textTransform: "uppercase" },
  helperText: { color: "#CBD5E1", fontSize: 12, fontWeight: "600" },
  link: { color: "#F97316", fontSize: 13, fontWeight: "800" },
  locationRow: { flexDirection: "row", alignItems: "center", gap: 8 },
  locationValue: { flex: 1, color: "#F8FAFC", fontSize: 15, fontWeight: "700" },
  input: {
    borderWidth: 1,
    borderColor: "#2A2A40",
    backgroundColor: "#121212",
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 11,
    color: "#F8FAFC",
    fontSize: 14,
  },
  dayChip: {
    borderRadius: 999,
    paddingHorizontal: 14,
    paddingVertical: 10,
    backgroundColor: "#121212",
    borderWidth: 1,
    borderColor: "#2A2A40",
  },
  dayChipOn: { backgroundColor: "#F97316", borderColor: "#C2410C" },
  dayChipText: { color: "#CBD5E1", fontSize: 12, fontWeight: "800" },
  dayChipTextOn: { color: "#FFFFFF" },
  timeRow: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  timeChip: {
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 9,
    backgroundColor: "#121212",
    borderWidth: 1,
    borderColor: "#2A2A40",
  },
  timeChipOn: { backgroundColor: "#F97316", borderColor: "#C2410C" },
  timeChipText: { color: "#CBD5E1", fontSize: 12, fontWeight: "800" },
  timeChipTextOn: { color: "#FFFFFF" },
  customTimeButton: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "#155E75",
    backgroundColor: "#0B1220",
    paddingHorizontal: 12,
    paddingVertical: 11,
  },
  customTimeButtonText: { color: "#FDBA74", fontSize: 13, fontWeight: "800" },
  selectedSchedule: {
    marginTop: 2,
    borderRadius: 12,
    backgroundColor: "#121212",
    borderWidth: 1,
    borderColor: "#2A2A40",
    paddingHorizontal: 12,
    paddingVertical: 11,
    gap: 3,
  },
  selectedLabel: { color: "#94A3B8", fontSize: 11, fontWeight: "800", textTransform: "uppercase" },
  selectedValue: { color: "#F8FAFC", fontSize: 14, fontWeight: "800" },
  modalOverlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.7)",
    alignItems: "center",
    justifyContent: "center",
    padding: 20,
  },
  timePickerModal: {
    width: "100%",
    maxWidth: 420,
    borderRadius: 18,
    backgroundColor: "#0F172A",
    borderWidth: 1,
    borderColor: "#2A2A40",
    padding: 16,
    gap: 12,
  },
  modalTitle: { color: "#F8FAFC", fontSize: 16, fontWeight: "900", textAlign: "center" },
  timePickerPreview: {
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 10,
    borderRadius: 12,
    backgroundColor: "rgba(20,184,166,0.12)",
  },
  timePickerPreviewText: { color: "#FDBA74", fontSize: 24, fontWeight: "900" },
  timePickerRow: { flexDirection: "row", gap: 12 },
  timeColumn: { flex: 1, gap: 8 },
  columnLabel: { color: "#94A3B8", fontSize: 12, fontWeight: "800", textAlign: "center" },
  timeScroll: { maxHeight: 260, borderRadius: 12, backgroundColor: "#121212" },
  timeOption: {
    alignItems: "center",
    justifyContent: "center",
    height: 44,
    marginVertical: 2,
    marginHorizontal: 4,
    borderRadius: 10,
  },
  timeOptionSelected: { backgroundColor: "#F97316" },
  timeOptionText: { color: "#CBD5E1", fontSize: 15, fontWeight: "800" },
  timeOptionTextSelected: { color: "#FFFFFF" },
  modalActions: { flexDirection: "row", gap: 10, marginTop: 2 },
  modalBtn: { flex: 1, borderRadius: 12, paddingVertical: 12, alignItems: "center" },
  modalBtnSecondary: { backgroundColor: "#121212", borderWidth: 1, borderColor: "#2A2A40" },
  modalBtnPrimary: { backgroundColor: "#F97316" },
  modalBtnTextSecondary: { color: "#F8FAFC", fontSize: 13, fontWeight: "800" },
  modalBtnTextPrimary: { color: "#FFFFFF", fontSize: 13, fontWeight: "900" },
});
