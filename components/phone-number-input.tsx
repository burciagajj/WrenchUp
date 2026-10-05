import { useEffect, useState } from "react";
import { Pressable, StyleSheet, Text, TextInput, View } from "react-native";
import { IconSymbol } from "@/components/ui/icon-symbol";
import { haptic } from "@/lib/haptics";

export type PhoneCountry = "US" | "MX";

const COUNTRIES: Record<PhoneCountry, { dialCode: string; flag: string; label: string }> = {
  US: { dialCode: "+1", flag: "🇺🇸", label: "United States" },
  MX: { dialCode: "+52", flag: "🇲🇽", label: "México" },
};

/** Strips everything but digits, capped at 10 (both US and modern MX mobile numbers are 10 national digits). */
function toDigits(value: string): string {
  return value.replace(/\D/g, "").slice(0, 10);
}

/** Progressive (XXX) XXX-XXXX formatting as the user types. */
function formatNational(digits: string): string {
  if (digits.length === 0) return "";
  if (digits.length <= 3) return `(${digits}`;
  if (digits.length <= 6) return `(${digits.slice(0, 3)}) ${digits.slice(3)}`;
  return `(${digits.slice(0, 3)}) ${digits.slice(3, 6)}-${digits.slice(6)}`;
}

/** Splits a full "+1XXXXXXXXXX" / "+52XXXXXXXXXX" value into {country, digits} for prefilling from saved data. */
function parseE164(value: string): { country: PhoneCountry; digits: string } {
  const trimmed = value.trim();
  if (trimmed.startsWith("+52")) return { country: "MX", digits: toDigits(trimmed.slice(3)) };
  if (trimmed.startsWith("+1")) return { country: "US", digits: toDigits(trimmed.slice(2)) };
  return { country: "US", digits: toDigits(trimmed) };
}

type PhoneNumberInputProps = {
  /** Full E.164 value, e.g. "+15551234567". Empty string when nothing entered yet. */
  value: string;
  /** Called with the full E.164 value on every change (country switch or digit typed). */
  onChangeValue: (e164: string) => void;
  editable?: boolean;
  defaultCountry?: PhoneCountry;
};

export function PhoneNumberInput({
  value,
  onChangeValue,
  editable = true,
  defaultCountry = "US",
}: PhoneNumberInputProps) {
  const initial = value ? parseE164(value) : { country: defaultCountry, digits: "" };
  const [country, setCountry] = useState<PhoneCountry>(initial.country);
  const [digits, setDigits] = useState(initial.digits);
  const [menuOpen, setMenuOpen] = useState(false);

  // Stay in sync if the parent resets/prefills `value` from outside (e.g. loading a saved profile).
  useEffect(() => {
    if (!value) return;
    const parsed = parseE164(value);
    setCountry(parsed.country);
    setDigits(parsed.digits);
    // Only react to external value changes, not our own onChangeValue echoes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value]);

  const emit = (nextCountry: PhoneCountry, nextDigits: string) => {
    onChangeValue(nextDigits ? `${COUNTRIES[nextCountry].dialCode}${nextDigits}` : "");
  };

  const handleSelectCountry = (next: PhoneCountry) => {
    haptic.selection();
    setCountry(next);
    setMenuOpen(false);
    emit(next, digits);
  };

  const handleChangeText = (text: string) => {
    const nextDigits = toDigits(text);
    setDigits(nextDigits);
    emit(country, nextDigits);
  };

  return (
    <View>
      <View style={styles.row}>
        <Pressable
          onPress={() => {
            if (!editable) return;
            haptic.light();
            setMenuOpen((prev) => !prev);
          }}
          disabled={!editable}
          style={({ pressed }) => [styles.countryChip, pressed && { opacity: 0.85 }]}
        >
          <Text style={styles.countryChipText}>
            {COUNTRIES[country].flag} {COUNTRIES[country].dialCode}
          </Text>
          <IconSymbol name={menuOpen ? "chevron.up" : "chevron.down"} size={14} color="#94A3B8" />
        </Pressable>

        <TextInput
          value={formatNational(digits)}
          onChangeText={handleChangeText}
          placeholder="(555) 123-4567"
          placeholderTextColor="#64748B"
          keyboardType="phone-pad"
          editable={editable}
          style={styles.input}
        />
      </View>

      {menuOpen ? (
        <View style={styles.menu}>
          {(Object.keys(COUNTRIES) as PhoneCountry[]).map((code) => (
            <Pressable
              key={code}
              onPress={() => handleSelectCountry(code)}
              style={({ pressed }) => [styles.menuItem, pressed && { backgroundColor: "#1F2937" }]}
            >
              <Text style={styles.menuItemText}>
                {COUNTRIES[code].flag} {COUNTRIES[code].label} ({COUNTRIES[code].dialCode})
              </Text>
              {code === country ? <IconSymbol name="checkmark" size={16} color="#F97316" /> : null}
            </Pressable>
          ))}
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: "row",
    gap: 8,
  },
  countryChip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    borderWidth: 1,
    borderColor: "#374151",
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 10,
    backgroundColor: "#1F2937",
  },
  countryChipText: {
    color: "#F8FAFC",
    fontSize: 14,
    fontWeight: "700",
  },
  input: {
    flex: 1,
    borderWidth: 1,
    borderColor: "#374151",
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 14,
    color: "#F8FAFC",
  },
  menu: {
    marginTop: 6,
    borderWidth: 1,
    borderColor: "#374151",
    borderRadius: 8,
    backgroundColor: "#1F2937",
    overflow: "hidden",
  },
  menuItem: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 12,
    paddingVertical: 12,
  },
  menuItemText: {
    color: "#F8FAFC",
    fontSize: 14,
    fontWeight: "600",
  },
});
