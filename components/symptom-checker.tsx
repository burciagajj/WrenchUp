import { useState } from "react";
import {
  LayoutAnimation,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  UIManager,
  View,
} from "react-native";
import { IconSymbol } from "@/components/ui/icon-symbol";
import { PrimaryButton } from "@/components/primary-button";
import { diagnoseSymptoms, type SymptomDiagnosisResult } from "@/lib/symptom-diagnose";
import { haptic } from "@/lib/haptics";
import type { ServiceCode } from "@/lib/types";
import { useT } from "@/hooks/use-locale";

if (
  Platform.OS === "android" &&
  UIManager.setLayoutAnimationEnabledExperimental
) {
  UIManager.setLayoutAnimationEnabledExperimental(true);
}

function animateLayout() {
  LayoutAnimation.configureNext(
    LayoutAnimation.create(220, LayoutAnimation.Types.easeInEaseOut, LayoutAnimation.Properties.opacity)
  );
}

type SymptomCheckerProps = {
  vehicleLabel: string;
  formatPrice: (usd: number) => string;
  onBookService: (serviceCode: ServiceCode) => void;
  onExpand?: () => void;
};

export function SymptomChecker({
  vehicleLabel,
  formatPrice,
  onBookService,
  onExpand,
}: SymptomCheckerProps) {
  const t = useT();
  const [expanded, setExpanded] = useState(false);
  const [symptoms, setSymptoms] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<SymptomDiagnosisResult | null>(null);

  const toggleExpanded = () => {
    haptic.light();
    animateLayout();
    const next = !expanded;
    setExpanded(next);
    if (next) {
      onExpand?.();
    } else {
      setError(null);
    }
  };

  const handleDiagnose = async () => {
    const trimmed = symptoms.trim();
    if (trimmed.length < 8) {
      setError(t("home.symptom.error_short"));
      haptic.warning();
      return;
    }

    setLoading(true);
    setError(null);
    setResult(null);
    haptic.medium();

    try {
      const diagnosis = await diagnoseSymptoms(trimmed, vehicleLabel);
      animateLayout();
      setResult(diagnosis);
      haptic.success();
    } catch (err) {
      const message = err instanceof Error ? err.message : t("home.symptom.error_failed");
      setError(message);
      haptic.warning();
    } finally {
      setLoading(false);
    }
  };

  const handleBookNow = () => {
    if (!result) return;
    haptic.medium();
    onBookService(result.serviceCode);
  };

  const handleTryAgain = () => {
    animateLayout();
    setResult(null);
    setError(null);
  };

  return (
    <View style={styles.container}>
      <Pressable
        onPress={toggleExpanded}
        style={({ pressed }) => [styles.header, pressed && styles.headerPressed]}
        accessibilityRole="button"
        accessibilityState={{ expanded }}
      >
        <View style={styles.iconBubble}>
          <IconSymbol name="sparkles" size={22} color="#FB923C" />
        </View>
        <View style={styles.headerText}>
          <Text style={styles.cardTitle}>{t("home.symptom.title")}</Text>
          <Text style={styles.cardSubtitle}>{t("home.symptom.subtitle")}</Text>
        </View>
        <View style={styles.chevronWrap}>
          <IconSymbol
            name={expanded ? "chevron.up" : "chevron.down"}
            size={18}
            color="#94A3B8"
          />
        </View>
      </Pressable>

      {expanded ? (
        <View style={styles.body}>
          {!result ? (
            <>
              <TextInput
                style={styles.input}
                placeholder={t("home.symptom.placeholder")}
                placeholderTextColor="#64748B"
                value={symptoms}
                onChangeText={setSymptoms}
                multiline
                numberOfLines={4}
                textAlignVertical="top"
                editable={!loading}
              />
              {vehicleLabel ? (
                <Text style={styles.vehicleHint}>
                  {t("home.symptom.vehicle")}: {vehicleLabel}
                </Text>
              ) : null}
              {error ? <Text style={styles.errorText}>{error}</Text> : null}
              <PrimaryButton
                title={loading ? t("home.symptom.diagnosing") : t("home.symptom.diagnose")}
                loading={loading}
                disabled={loading || symptoms.trim().length < 8}
                onPress={handleDiagnose}
                iconLeft={
                  !loading ? (
                    <IconSymbol name="wrench.fill" size={18} color="#FFFFFF" />
                  ) : undefined
                }
              />
            </>
          ) : (
            <View style={styles.resultCard}>
              <View style={styles.resultHeader}>
                <View style={styles.resultIcon}>
                  <IconSymbol name="checkmark.circle.fill" size={22} color="#10B981" />
                </View>
                <Text style={styles.resultIssue}>{result.issue}</Text>
              </View>
              <Text style={styles.resultExplanation}>{result.explanation}</Text>
              <View style={styles.recommendRow}>
                <View>
                  <Text style={styles.recommendLabel}>{t("home.symptom.recommended")}</Text>
                  <Text style={styles.recommendService}>{result.serviceName}</Text>
                </View>
                <Text style={styles.recommendPrice}>{formatPrice(result.price)}</Text>
              </View>
              <PrimaryButton
                title={t("home.symptom.book_now")}
                onPress={handleBookNow}
                iconRight={<IconSymbol name="arrow.right" size={18} color="#FFFFFF" />}
              />
              <Pressable onPress={handleTryAgain} style={styles.tryAgain}>
                <Text style={styles.tryAgainText}>{t("home.symptom.try_again")}</Text>
              </Pressable>
            </View>
          )}
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    backgroundColor: "#0F172A",
    borderRadius: 18,
    overflow: "hidden",
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    padding: 18,
  },
  headerPressed: {
    opacity: 0.92,
  },
  headerText: {
    flex: 1,
    gap: 4,
  },
  chevronWrap: {
    width: 28,
    alignItems: "center",
    justifyContent: "center",
  },
  iconBubble: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: "rgba(249, 115, 22, 0.15)",
    alignItems: "center",
    justifyContent: "center",
  },
  cardTitle: {
    color: "#FFFFFF",
    fontSize: 17,
    fontWeight: "800",
  },
  cardSubtitle: {
    color: "#94A3B8",
    fontSize: 13,
    lineHeight: 18,
  },
  body: {
    paddingHorizontal: 18,
    paddingBottom: 18,
    paddingTop: 0,
    gap: 12,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: "#334155",
  },
  input: {
    backgroundColor: "#1E293B",
    borderRadius: 14,
    padding: 14,
    color: "#F8FAFC",
    fontSize: 15,
    minHeight: 100,
    borderWidth: 1,
    borderColor: "#334155",
  },
  vehicleHint: {
    color: "#64748B",
    fontSize: 12,
  },
  errorText: {
    color: "#F87171",
    fontSize: 13,
  },
  resultCard: {
    gap: 14,
  },
  resultHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  resultIcon: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: "rgba(16, 185, 129, 0.15)",
    alignItems: "center",
    justifyContent: "center",
  },
  resultIssue: {
    flex: 1,
    color: "#FFFFFF",
    fontSize: 18,
    fontWeight: "800",
  },
  resultExplanation: {
    color: "#CBD5E1",
    fontSize: 14,
    lineHeight: 21,
  },
  recommendRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    backgroundColor: "#1E293B",
    borderRadius: 14,
    padding: 14,
    borderWidth: 1,
    borderColor: "#F97316",
  },
  recommendLabel: {
    color: "#94A3B8",
    fontSize: 11,
    fontWeight: "600",
    textTransform: "uppercase",
    letterSpacing: 0.5,
  },
  recommendService: {
    color: "#FFFFFF",
    fontSize: 17,
    fontWeight: "700",
    marginTop: 4,
  },
  recommendPrice: {
    color: "#FB923C",
    fontSize: 22,
    fontWeight: "800",
  },
  tryAgain: {
    alignItems: "center",
    paddingVertical: 4,
  },
  tryAgainText: {
    color: "#94A3B8",
    fontSize: 14,
    fontWeight: "600",
  },
});
