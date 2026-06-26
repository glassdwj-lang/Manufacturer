/**
 * Cross-platform date picker — surfaces as a tappable "field" that opens
 * the native iOS/Android wheel/calendar on mobile, and a real HTML
 * ``<input type="date">`` on web. The value contract is a stable
 * ``YYYY-MM-DD`` string (or empty), to match what the backend filters
 * already expect.
 */
import React, { useRef, useState } from "react";
import {
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import DateTimePicker, {
  type DateTimePickerEvent,
} from "@react-native-community/datetimepicker";

import { theme } from "../theme";

type Props = {
  value: string; // "YYYY-MM-DD" or ""
  onChange: (next: string) => void;
  placeholder?: string;
  testID?: string;
  minimumDate?: Date;
  maximumDate?: Date;
};

function toIso(d: Date): string {
  // Local-time YYYY-MM-DD so the date the user picks doesn't drift across
  // the dateline. ``Date.toISOString`` would use UTC.
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function parseIso(value: string): Date {
  if (value && /^\d{4}-\d{2}-\d{2}$/.test(value)) {
    const [y, m, d] = value.split("-").map(Number);
    return new Date(y, m - 1, d);
  }
  return new Date();
}

export function DateField({
  value,
  onChange,
  placeholder = "Select a date…",
  testID,
  minimumDate,
  maximumDate,
}: Props) {
  if (Platform.OS === "web") {
    return <WebDate value={value} onChange={onChange} placeholder={placeholder} testID={testID} />;
  }
  return (
    <NativeDate
      value={value}
      onChange={onChange}
      placeholder={placeholder}
      testID={testID}
      minimumDate={minimumDate}
      maximumDate={maximumDate}
    />
  );
}

// ----------------------------------------------------------------------------
// Native (iOS/Android): tap field -> show inline / modal native picker.
// ----------------------------------------------------------------------------
function NativeDate({
  value,
  onChange,
  placeholder,
  testID,
  minimumDate,
  maximumDate,
}: Props) {
  const [open, setOpen] = useState(false);
  const handlePicked = (_event: DateTimePickerEvent, picked?: Date) => {
    setOpen(false);
    if (picked) onChange(toIso(picked));
  };
  return (
    <View>
      <Pressable
        testID={testID}
        onPress={() => setOpen(true)}
        style={styles.field}
      >
        <Text style={[styles.fieldText, !value && styles.placeholder]}>
          {value || placeholder}
        </Text>
        {value ? (
          <Pressable
            onPress={() => onChange("")}
            hitSlop={8}
            testID={testID ? `${testID}-clear` : undefined}
          >
            <Ionicons name="close-circle" size={16} color={theme.textMuted} />
          </Pressable>
        ) : (
          <Ionicons name="calendar-outline" size={14} color={theme.textMuted} />
        )}
      </Pressable>
      {open && (
        <DateTimePicker
          value={parseIso(value)}
          mode="date"
          display={Platform.OS === "ios" ? "inline" : "default"}
          onChange={handlePicked}
          minimumDate={minimumDate}
          maximumDate={maximumDate}
        />
      )}
    </View>
  );
}

// ----------------------------------------------------------------------------
// Web: tap field -> programmatically focus a real <input type="date">. We
// keep the underlying input visually hidden behind the tappable shell so
// users get the OS picker (Edge/Chrome calendar, Safari mobile wheel, …).
// ----------------------------------------------------------------------------
function WebDate({ value, onChange, placeholder, testID }: Props) {
  const inputRef = useRef<TextInput | null>(null);
  const openPicker = () => {
    const el = inputRef.current as unknown as HTMLInputElement | null;
    if (!el) return;
    // ``showPicker`` exists on Chrome 99+/Edge/Safari16; ``focus`` is the
    // universal fallback that still opens the calendar on most browsers.
    if (typeof (el as any).showPicker === "function") {
      try {
        (el as any).showPicker();
        return;
      } catch {
        /* fall through */
      }
    }
    el.focus();
  };
  return (
    <Pressable testID={testID} onPress={openPicker} style={styles.field}>
      <Text style={[styles.fieldText, !value && styles.placeholder]}>
        {value || placeholder}
      </Text>
      {value ? (
        <Pressable
          onPress={() => onChange("")}
          hitSlop={8}
          testID={testID ? `${testID}-clear` : undefined}
        >
          <Ionicons name="close-circle" size={16} color={theme.textMuted} />
        </Pressable>
      ) : (
        <Ionicons name="calendar-outline" size={14} color={theme.textMuted} />
      )}
      {/* Off-screen native input. RN Web maps ``TextInput`` to a real DOM
          ``<input>`` and forwards unknown DOM props, so ``type="date"``
          works without an additional library. */}
      <TextInput
        ref={(r) => {
          inputRef.current = r;
        }}
        value={value}
        onChangeText={(next) => {
          // Browsers emit YYYY-MM-DD for type="date" inputs, but if the
          // user clears the field we still get "".
          if (!next) onChange("");
          else if (/^\d{4}-\d{2}-\d{2}$/.test(next)) onChange(next);
        }}
        // @ts-expect-error – RN Web forwards extra props to the DOM input.
        type="date"
        style={styles.hiddenInput}
      />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  field: {
    flexDirection: "row",
    alignItems: "center",
    borderWidth: 1,
    borderColor: theme.border,
    paddingHorizontal: 12,
    paddingVertical: 10,
    minHeight: 40,
    gap: 8,
  },
  fieldText: { flex: 1, color: theme.textPrimary, fontSize: 13 },
  placeholder: { color: theme.textMuted },
  hiddenInput: Platform.select({
    web: {
      position: "absolute",
      width: 1,
      height: 1,
      opacity: 0,
      pointerEvents: "none",
    },
    default: { display: "none" },
  }) as any,
});
