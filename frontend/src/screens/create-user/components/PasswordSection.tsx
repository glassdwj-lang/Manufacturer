/**
 * Create-vs-edit password section.
 *
 *   - Create flow → always show a temp-password field (required).
 *   - Edit flow   → show a collapsible "reset password" row that reveals
 *                   a new-password field on toggle.
 */
import React from "react";
import { Text, TextInput, TouchableOpacity } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { theme } from "@/src/theme";
import { createUserStyles as styles } from "../styles";

export function PasswordSection({
  editMode,
  password,
  setPassword,
  showPasswordReset,
  setShowPasswordReset,
}: {
  editMode: boolean;
  password: string;
  setPassword: (v: string) => void;
  showPasswordReset: boolean;
  setShowPasswordReset: (v: boolean) => void;
}) {
  if (!editMode) {
    return (
      <>
        <Text style={styles.formLabel}>TEMPORARY PASSWORD (MIN 6)</Text>
        <TextInput
          testID="user-password-input"
          value={password}
          onChangeText={setPassword}
          placeholder="••••••••"
          placeholderTextColor={theme.textMuted}
          secureTextEntry
          style={styles.input}
        />
      </>
    );
  }
  return (
    <>
      <TouchableOpacity
        testID="toggle-password-reset"
        onPress={() => {
          setShowPasswordReset(!showPasswordReset);
          setPassword("");
        }}
        style={styles.pwdToggleRow}
      >
        <Ionicons
          name={showPasswordReset ? "chevron-down" : "chevron-forward"}
          size={14}
          color={theme.primary}
        />
        <Text style={styles.pwdToggleText}>
          {showPasswordReset ? "CANCEL PASSWORD RESET" : "RESET PASSWORD"}
        </Text>
      </TouchableOpacity>
      {showPasswordReset && (
        <>
          <Text style={styles.formLabel}>NEW PASSWORD (MIN 6)</Text>
          <TextInput
            testID="user-password-input"
            value={password}
            onChangeText={setPassword}
            placeholder="••••••••"
            placeholderTextColor={theme.textMuted}
            secureTextEntry
            style={styles.input}
          />
          <Text style={styles.pwdHint}>
            The user will need this new password to sign in next time.
          </Text>
        </>
      )}
    </>
  );
}

export default PasswordSection;
