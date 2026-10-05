import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, TextInput, View, type TextStyle } from "react-native";
import { usePlacesAutocomplete } from "@/hooks/use-places-autocomplete";
import { IconSymbol } from "@/components/ui/icon-symbol";

type LocationAutocompleteInputProps = {
  value: string;
  onChangeText: (text: string) => void;
  placeholder?: string;
  placeholderTextColor?: string;
  style?: TextStyle;
  autoFocus?: boolean;
};

/**
 * Free-text address field with Google Places suggestions dropdown.
 * Selecting a suggestion just fills in its full description string — same
 * shape of data this field already stored before autocomplete existed, so
 * no callers needed to change how they consume the value.
 */
export function LocationAutocompleteInput({
  value,
  onChangeText,
  placeholder,
  placeholderTextColor = "#94A3B8",
  style,
  autoFocus,
}: LocationAutocompleteInputProps) {
  const { suggestions, loading, search, clear } = usePlacesAutocomplete();

  const handleChangeText = (text: string) => {
    onChangeText(text);
    search(text);
  };

  const handleSelect = (description: string) => {
    onChangeText(description);
    clear();
  };

  // Deliberately not gated on TextInput focus. Hiding this on blur raced
  // against the row's own tap on Android — the field's blur (native IME
  // focus loss, not React Native's touch system) could win and unmount the
  // row before the tap ever registered, so selecting an address silently did
  // nothing. Suggestions naturally disappear on selection (clear() above) or
  // once the query drops below the hook's minimum length, so no separate
  // "hide" trigger is needed.
  const showDropdown = suggestions.length > 0 || loading;

  return (
    <View>
      <TextInput
        value={value}
        onChangeText={handleChangeText}
        placeholder={placeholder}
        placeholderTextColor={placeholderTextColor}
        style={style}
        autoFocus={autoFocus}
      />
      {showDropdown ? (
        <View style={styles.dropdown}>
          {loading ? (
            <View style={styles.loadingRow}>
              <ActivityIndicator size="small" color="#F97316" />
            </View>
          ) : (
            <ScrollView keyboardShouldPersistTaps="handled" style={styles.list}>
              {suggestions.map((s) => (
                <Pressable
                  key={s.placeId}
                  onPress={() => handleSelect(s.description)}
                  style={({ pressed }) => [styles.row, pressed && styles.rowPressed]}
                >
                  <IconSymbol name="location.fill" size={14} color="#94A3B8" />
                  <Text style={styles.rowText} numberOfLines={2}>
                    {s.description}
                  </Text>
                </Pressable>
              ))}
            </ScrollView>
          )}
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  dropdown: {
    marginTop: 6,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.16)",
    backgroundColor: "#1F2937",
    overflow: "hidden",
  },
  loadingRow: {
    paddingVertical: 14,
    alignItems: "center",
  },
  list: {
    maxHeight: 220,
  },
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: "rgba(255,255,255,0.08)",
  },
  rowPressed: {
    backgroundColor: "rgba(255,255,255,0.06)",
  },
  rowText: {
    flex: 1,
    color: "#F8FAFC",
    fontSize: 13,
  },
});
