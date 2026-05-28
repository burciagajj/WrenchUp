import { Pressable, StyleSheet, Text, View } from "react-native";
import { useRouter } from "expo-router";
import { ScreenContainer } from "@/components/screen-container";
import { useActiveJob } from "@/lib/store";
import { useLocaleContext } from "@/hooks/use-locale";
import { haptic } from "@/lib/haptics";

export default function RequestAnotherServiceScreen() {
  const router = useRouter();
  const job = useActiveJob();
  const { locale } = useLocaleContext();
  const isEs = locale === "es-MX";
  const L = (en: string, es: string) => (isEs ? es : en);

  return (
    <ScreenContainer edges={["top", "left", "right", "bottom"]}>
      <View style={styles.wrap}>
        <Text style={styles.title}>{L("You already have a booked service with a mechanic.", "Ya tienes un servicio agendado con un mecánico.")}</Text>
        <Text style={styles.sub}>
          {L("You can check more details ", "Puedes revisar más detalles ")}
          <Text
            style={styles.link}
            onPress={() => {
              haptic.light();
              if (job) router.push("/tracking" as any);
            }}
          >
            {L("here", "aquí")}
          </Text>
          .
        </Text>

        <Pressable
          onPress={() => {
            haptic.success();
            router.push("/(tabs)/book-service" as any);
          }}
          style={styles.primaryBtn}
        >
          <Text style={styles.primaryBtnText}>{L("Continue to Book Service", "Continuar para agendar servicio")}</Text>
        </Pressable>

        <Pressable
          onPress={() => {
            haptic.light();
            router.replace("/(tabs)" as any);
          }}
          style={styles.secondaryBtn}
        >
          <Text style={styles.secondaryBtnText}>{L("Back", "Volver")}</Text>
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
  title: {
    color: "#F8FAFC",
    fontSize: 23,
    fontWeight: "900",
    textAlign: "center",
    lineHeight: 30,
  },
  sub: {
    marginTop: 12,
    color: "#CBD5E1",
    fontSize: 15,
    textAlign: "center",
    lineHeight: 22,
  },
  link: {
    color: "#2DD4BF",
    fontWeight: "800",
  },
  primaryBtn: {
    marginTop: 20,
    borderRadius: 12,
    backgroundColor: "#F97316",
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  primaryBtnText: {
    color: "#FFFFFF",
    fontSize: 14,
    fontWeight: "800",
  },
  secondaryBtn: {
    marginTop: 10,
    borderRadius: 12,
    backgroundColor: "rgba(255,255,255,0.08)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.2)",
    paddingHorizontal: 16,
    paddingVertical: 11,
  },
  secondaryBtnText: {
    color: "#F8FAFC",
    fontSize: 14,
    fontWeight: "800",
  },
});
