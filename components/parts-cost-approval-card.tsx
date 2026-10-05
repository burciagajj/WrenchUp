import { useState } from "react";
import { ActivityIndicator, Image, Modal, Pressable, StyleSheet, Text, View } from "react-native";
import { IconSymbol } from "@/components/ui/icon-symbol";
import { PrimaryButton } from "@/components/primary-button";
import { haptic } from "@/lib/haptics";
import { useL } from "@/hooks/use-locale";
import { getApiUrl } from "@/lib/api-base-url";
import { usePaymentSheet } from "@/hooks/use-payment-sheet";
import { confirmPartsPaymentAuthorized, declinePartsCost } from "@/lib/live-dispatch";
import type { StripeCurrency } from "@/lib/stripe";

type PartsCostApprovalCardProps = {
  requestId: string;
  partsCost: number;
  currency: StripeCurrency;
  sessionToken: string;
  formatPrice: (usd: number) => string;
  onApproved?: () => void;
  onDeclined?: () => void;
};

export function PartsCostApprovalCard({
  requestId,
  partsCost,
  currency,
  sessionToken,
  formatPrice,
  onApproved,
  onDeclined,
}: PartsCostApprovalCardProps) {
  const L = useL();
  const paymentSheet = usePaymentSheet();
  const [approving, setApproving] = useState(false);
  const [declining, setDeclining] = useState(false);
  const [receiptUrl, setReceiptUrl] = useState<string | null>(null);
  const [receiptLoading, setReceiptLoading] = useState(false);
  const [receiptVisible, setReceiptVisible] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleViewReceipt = async () => {
    setError(null);
    if (receiptUrl) {
      setReceiptVisible(true);
      return;
    }
    setReceiptLoading(true);
    try {
      const res = await fetch(getApiUrl("/api/parts-receipt-url"), {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${sessionToken}` },
        body: JSON.stringify({ requestId }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data?.signedUrl) {
        throw new Error(data?.error || "Could not load receipt");
      }
      setReceiptUrl(data.signedUrl);
      setReceiptVisible(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not load receipt");
    } finally {
      setReceiptLoading(false);
    }
  };

  const handleApprove = async () => {
    if (approving || declining) return;
    setApproving(true);
    setError(null);
    haptic.medium();
    try {
      const result = await paymentSheet.present({
        amount: Math.round(partsCost * 100),
        currency,
        sessionToken,
        endpoint: "/api/parts-payment-intent",
        extraParams: { requestId },
      });
      if (result.status === "canceled") {
        return;
      }
      if (result.status !== "completed") {
        haptic.error();
        setError(result.status === "failed" ? result.message : L("Payment authorization is unavailable right now.", "La autorización de pago no está disponible ahora."));
        return;
      }
      await confirmPartsPaymentAuthorized(sessionToken, requestId);
      haptic.success();
      onApproved?.();
    } catch (err) {
      haptic.error();
      setError(err instanceof Error ? err.message : L("Could not authorize the parts hold.", "No se pudo autorizar la retención de piezas."));
    } finally {
      setApproving(false);
    }
  };

  const handleDecline = async () => {
    if (approving || declining) return;
    setDeclining(true);
    haptic.light();
    try {
      await declinePartsCost(sessionToken, requestId);
      onDeclined?.();
    } catch (err) {
      setError(err instanceof Error ? err.message : L("Could not decline right now.", "No se pudo rechazar ahora."));
    } finally {
      setDeclining(false);
    }
  };

  return (
    <View style={styles.card}>
      <View style={styles.header}>
        <View style={styles.iconBubble}>
          <IconSymbol name="wrench.fill" size={20} color="#FB923C" />
        </View>
        <View style={{ flex: 1 }}>
          <Text style={styles.title}>{L("Parts needed for this job", "Piezas necesarias para este trabajo")}</Text>
          <Text style={styles.subtitle}>
            {L("Your mechanic bought parts and wants to be reimbursed.", "Tu mecánico compró piezas y quiere que se le reembolsen.")}
          </Text>
        </View>
      </View>

      <View style={styles.amountRow}>
        <Text style={styles.amountLabel}>{L("Parts cost", "Costo de piezas")}</Text>
        <Text style={styles.amountValue}>{formatPrice(partsCost)}</Text>
      </View>

      <Pressable onPress={() => void handleViewReceipt()} style={styles.receiptLink} disabled={receiptLoading}>
        {receiptLoading ? (
          <ActivityIndicator size="small" color="#94A3B8" />
        ) : (
          <IconSymbol name="doc.text.fill" size={16} color="#94A3B8" />
        )}
        <Text style={styles.receiptLinkText}>{L("View receipt", "Ver recibo")}</Text>
      </Pressable>

      {error ? <Text style={styles.errorText}>{error}</Text> : null}

      <View style={styles.actionsRow}>
        <Pressable onPress={() => void handleDecline()} disabled={approving || declining} style={styles.declineBtn}>
          <Text style={styles.declineBtnText}>{L("Decline", "Rechazar")}</Text>
        </Pressable>
        <View style={{ flex: 1 }}>
          <PrimaryButton
            title={approving ? L("Authorizing…", "Autorizando…") : L("Approve & authorize hold", "Aprobar y autorizar retención")}
            loading={approving}
            disabled={approving || declining}
            onPress={() => void handleApprove()}
          />
        </View>
      </View>

      <Modal visible={receiptVisible} transparent animationType="fade" onRequestClose={() => setReceiptVisible(false)}>
        <Pressable style={styles.modalBackdrop} onPress={() => setReceiptVisible(false)}>
          {receiptUrl ? (
            <Image source={{ uri: receiptUrl }} style={styles.modalImage} resizeMode="contain" />
          ) : null}
        </Pressable>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: "#0F172A",
    borderRadius: 18,
    borderWidth: 1,
    borderColor: "#F97316",
    padding: 16,
    gap: 12,
  },
  header: { flexDirection: "row", alignItems: "flex-start", gap: 12 },
  iconBubble: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: "rgba(249,115,22,0.15)",
    alignItems: "center",
    justifyContent: "center",
  },
  title: { color: "#FFFFFF", fontSize: 16, fontWeight: "800" },
  subtitle: { color: "#94A3B8", fontSize: 13, marginTop: 2, lineHeight: 18 },
  amountRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    backgroundColor: "#1E293B",
    borderRadius: 14,
    padding: 14,
  },
  amountLabel: { color: "#94A3B8", fontSize: 13, fontWeight: "600" },
  amountValue: { color: "#FB923C", fontSize: 20, fontWeight: "800" },
  receiptLink: { flexDirection: "row", alignItems: "center", gap: 6 },
  receiptLinkText: { color: "#94A3B8", fontSize: 13, fontWeight: "600" },
  errorText: { color: "#F87171", fontSize: 13 },
  actionsRow: { flexDirection: "row", gap: 10, alignItems: "center" },
  declineBtn: {
    paddingHorizontal: 16,
    paddingVertical: 14,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: "#334155",
  },
  declineBtnText: { color: "#CBD5E1", fontWeight: "700", fontSize: 14 },
  modalBackdrop: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.85)",
    alignItems: "center",
    justifyContent: "center",
    padding: 20,
  },
  modalImage: { width: "100%", height: "80%" },
});
