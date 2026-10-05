import { Alert, Pressable, View, Text, StyleSheet, Animated } from "react-native";
import { IconSymbol } from "@/components/ui/icon-symbol";
import { useStore } from "@/lib/store";
import { useRef, useEffect, useState } from "react";
import { useAuth } from "@/lib/auth-context";
import { setMechanicOnlineState } from "@/lib/mechanic-online";
import { useLocaleContext } from "@/hooks/use-locale";
import { haptic } from "@/lib/haptics";

/**
 * Sleek, unique online/offline toggle for mechanic dashboard
 */
export function MechanicSleekToggle() {
  const { state, dispatch } = useStore();
  const { user } = useAuth();
  const isOnline = state.mechanicOnline;
  const { locale, region } = useLocaleContext();
  const isEs = locale === "es-MX";
  const L = (en: string, es: string) => (isEs ? es : en);
  const [isProcessing, setIsProcessing] = useState(false);
  const [processingTarget, setProcessingTarget] = useState<"online" | "offline" | null>(null);
  const slideAnim = useRef(new Animated.Value(isOnline ? 1 : 0)).current;

  useEffect(() => {
    Animated.spring(slideAnim, {
      toValue: isOnline ? 1 : 0,
      useNativeDriver: false,
      tension: 90,
      friction: 14,
    }).start();
  }, [isOnline, slideAnim]);

  const handleToggle = async () => {
    if (isProcessing) return;
    const nextOnline = !isOnline;
    setProcessingTarget(nextOnline ? "online" : "offline");
    setIsProcessing(true);
    try {
      await setMechanicOnlineState({
        user,
        state,
        dispatch,
        nextOnline,
        region,
        labels: {
          verificationRequired: L("Waiting for verification", "Esperando verificación"),
          verificationRequiredBody: L(
            "Your account is still under review. We’ll let you know when you’re approved to go online.",
            "Tu cuenta aún está en revisión. Te avisaremos cuando estés aprobado para ponerte en línea.",
          ),
          vehicleRequired: L("Vehicle documents required", "Se requieren documentos del vehículo"),
          vehicleRequiredBody: L(
            "Upload insurance and registration sticker for at least one vehicle before going online.",
            "Sube el seguro y la calcomanía de registro de al menos un vehículo antes de ponerte en línea.",
          ),
          suspended: L("Account suspended", "Cuenta suspendida"),
          suspendedBody: L(
            "Your average rating is below 4.2. Your mechanic account is temporarily suspended pending review.",
            "Tu calificación promedio está por debajo de 4.2. Tu cuenta de mecánico está suspendida temporalmente.",
          ),
          connectionIssue: L("Connection issue", "Problema de conexión"),
          verifyFailed: L("Could not verify account", "No se pudo verificar la cuenta"),
          locationRequired: L("Location access required", "Se requiere acceso a la ubicación"),
          locationRequiredBody: L(
            "Turn on location access so customers can be matched to you and see an accurate ETA. Enable it in your device settings, then try again.",
            "Activa el acceso a la ubicación para que los clientes puedan ser emparejados contigo y vean un ETA preciso. Actívalo en la configuración de tu dispositivo e inténtalo de nuevo.",
          ),
        },
      });
    } catch (error) {
      console.error("[MechanicSleekToggle] Toggle failed:", error);
      haptic.error();
      Alert.alert(
        L("Could not update status", "No se pudo actualizar el estado"),
        L("Please try again.", "Inténtalo de nuevo."),
      );
    } finally {
      setIsProcessing(false);
      setProcessingTarget(null);
    }
  };

  const slideInterpolation = slideAnim.interpolate({
    inputRange: [0, 1],
    outputRange: [2, 28],
  });

  return (
    <Pressable
      onPress={handleToggle}
      onPressIn={() => haptic.selection()}
      hitSlop={12}
      accessibilityRole="button"
      disabled={isProcessing}
      style={({ pressed }) => [
        styles.container,
        isOnline ? styles.containerOnline : styles.containerOffline,
        (pressed || isProcessing) && { opacity: 0.75 },
      ]}
    >
      <View style={styles.content}>
        <View style={styles.leftSection}>
          <View
            style={[
              styles.statusDot,
              isOnline ? styles.statusDotOnline : styles.statusDotOffline,
            ]}
          >
            <IconSymbol
              name={isOnline ? "bolt.fill" : "pause.fill"}
              size={11}
              color={isOnline ? "#FFFFFF" : "#94A3B8"}
            />
          </View>
          <View>
            <Text style={[styles.label, isOnline ? styles.labelOnline : styles.labelOffline]}>
              {isProcessing
                ? processingTarget === "offline"
                  ? L("Going offline...", "Poniéndote fuera de línea...")
                  : L("Going online...", "Poniéndote en línea...")
                : isOnline
                  ? L("Online", "En línea")
                  : L("Offline", "Fuera de línea")}
            </Text>
            <Text style={[styles.sublabel, isOnline ? styles.sublabelOnline : styles.sublabelOffline]}>
              {isProcessing
                ? L("Please wait a moment", "Espera un momento")
                : isOnline
                  ? L("Receiving requests", "Recibiendo solicitudes")
                  : L("Paused", "Pausado")}
            </Text>
          </View>
        </View>

        <View style={[styles.toggleSwitch, isOnline ? styles.toggleSwitchOnline : styles.toggleSwitchOffline]}>
          <Animated.View
            style={[
              styles.toggleThumb,
              isOnline ? styles.toggleThumbOnline : styles.toggleThumbOffline,
              {
                transform: [{ translateX: slideInterpolation }],
              },
            ]}
          />
        </View>
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  container: {
    borderRadius: 14,
    borderWidth: 1,
    paddingHorizontal: 14,
    paddingVertical: 10,
  },
  containerOnline: {
    backgroundColor: "#171E2C",
    borderColor: "#253149",
  },
  containerOffline: {
    backgroundColor: "#141A24",
    borderColor: "#273246",
  },
  content: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  leftSection: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    flex: 1,
  },
  statusDot: {
    width: 24,
    height: 24,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
  },
  statusDotOnline: {
    backgroundColor: "#F97316",
  },
  statusDotOffline: {
    backgroundColor: "#1F2937",
  },
  label: {
    fontSize: 13,
    fontWeight: "700",
  },
  labelOnline: {
    color: "#F8FAFC",
  },
  labelOffline: {
    color: "#D1D5DB",
  },
  sublabel: {
    fontSize: 11,
    fontWeight: "500",
    marginTop: 1,
  },
  sublabelOnline: {
    color: "#94A3B8",
  },
  sublabelOffline: {
    color: "#6B7280",
  },
  toggleSwitch: {
    width: 56,
    height: 28,
    borderRadius: 14,
    padding: 2,
    justifyContent: "center",
    borderWidth: 1,
  },
  toggleSwitchOnline: {
    backgroundColor: "rgba(249, 115, 22, 0.18)",
    borderColor: "rgba(249, 115, 22, 0.35)",
  },
  toggleSwitchOffline: {
    backgroundColor: "#1F2937",
    borderColor: "#374151",
  },
  toggleThumb: {
    width: 24,
    height: 24,
    borderRadius: 12,
    justifyContent: "center",
    alignItems: "center",
  },
  toggleThumbOnline: {
    backgroundColor: "#FB923C",
  },
  toggleThumbOffline: {
    backgroundColor: "#9CA3AF",
  },
});
