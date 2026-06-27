/**
 * Country-aware phone field: read-only dial-code box on the left, a
 * formatted phone input on the right. Disabled until a country is
 * selected (dial code drives the keyboard hint + formatting).
 */
import React from "react";
import { Text, TextInput, View } from "react-native";
import { theme } from "@/src/theme";
import { createUserStyles as styles } from "../styles";

export function PhoneField({
  dialCode,
  value,
  onChange,
  testID = "user-phone-input",
}: {
  dialCode: string;
  value: string;
  onChange: (next: string) => void;
  testID?: string;
}) {
  return (
    <View style={styles.phoneRow}>
      <View style={styles.dialCodeBox}>
        <Text
          style={[
            styles.dialCodeText,
            !dialCode && { color: theme.textMuted },
          ]}
        >
          {dialCode || "\u2014"}
        </Text>
      </View>
      <TextInput
        testID={testID}
        value={value}
        onChangeText={onChange}
        placeholder={dialCode ? "Mobile number" : "Select a country first"}
        placeholderTextColor={theme.textMuted}
        keyboardType="phone-pad"
        editable={!!dialCode}
        style={[
          styles.input,
          styles.phoneInput,
          !dialCode && { opacity: 0.6 },
        ]}
      />
    </View>
  );
}

export default PhoneField;
