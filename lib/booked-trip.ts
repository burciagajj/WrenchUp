const BOOKED_MARKER_PREFIX = "[[WRENCHUP_BOOKED:";
const BOOKED_MARKER_REGEX = /\[\[WRENCHUP_BOOKED:([^\]]+)\]\]/i;

export function buildBookedCustomerNote(rawNote: string | null | undefined, scheduledIso: string): string {
  const marker = `${BOOKED_MARKER_PREFIX}${scheduledIso}]]`;
  const note = (rawNote ?? "").trim();
  return note ? `${marker}\n${note}` : marker;
}

export function parseBookedCustomerNote(
  note: string | null | undefined,
): { isBooked: boolean; scheduledForMs: number | null; cleanNote: string | undefined } {
  const source = (note ?? "").trim();
  if (!source) return { isBooked: false, scheduledForMs: null, cleanNote: undefined };
  const match = source.match(BOOKED_MARKER_REGEX);
  if (!match) {
    return { isBooked: false, scheduledForMs: null, cleanNote: source || undefined };
  }
  const parsed = Date.parse(match[1]);
  const clean = source.replace(BOOKED_MARKER_REGEX, "").trim();
  return {
    isBooked: true,
    scheduledForMs: Number.isFinite(parsed) ? parsed : null,
    cleanNote: clean || undefined,
  };
}

export function deriveBookedMeta(
  scheduledForIso: string | null | undefined,
  note: string | null | undefined,
): { isBooked: boolean; scheduledForMs: number | null; cleanNote: string | undefined } {
  const parsedFromNote = parseBookedCustomerNote(note);
  const parsedFromColumn = scheduledForIso ? Date.parse(scheduledForIso) : NaN;
  const scheduledForMs = Number.isFinite(parsedFromColumn) ? parsedFromColumn : parsedFromNote.scheduledForMs;
  return {
    isBooked: Number.isFinite(parsedFromColumn) || parsedFromNote.isBooked,
    scheduledForMs: Number.isFinite(scheduledForMs) ? (scheduledForMs as number) : null,
    cleanNote: parsedFromNote.cleanNote,
  };
}
