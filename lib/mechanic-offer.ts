export type MechanicOffer = {
  mechanicUserId: string;
  mechanicName: string;
  proposedTotal: number;
  note?: string;
  messageId: string;
  createdAt: string;
};

export type MechanicOfferMessage = {
  id: string;
  request_id: string;
  sender_user_id: string;
  sender_role: "customer" | "mechanic";
  message: string;
  created_at: string;
};

export function parseMechanicOfferMessage(message: MechanicOfferMessage): MechanicOffer | null {
  if (!message.message.startsWith("OFFER_JSON:")) return null;
  const raw = message.message.slice("OFFER_JSON:".length);
  try {
    const parsed = JSON.parse(raw) as {
      kind?: string;
      mechanic_user_id?: string;
      mechanic_name?: string;
      proposed_total?: number;
      note?: string;
    };
    if (
      parsed.kind !== "mechanic_offer" ||
      !parsed.mechanic_user_id ||
      !parsed.mechanic_name ||
      !Number.isFinite(parsed.proposed_total)
    ) {
      return null;
    }
    return {
      mechanicUserId: parsed.mechanic_user_id,
      mechanicName: parsed.mechanic_name,
      proposedTotal: Number(parsed.proposed_total),
      note: parsed.note?.trim() || undefined,
      messageId: message.id,
      createdAt: message.created_at,
    };
  } catch {
    return null;
  }
}
