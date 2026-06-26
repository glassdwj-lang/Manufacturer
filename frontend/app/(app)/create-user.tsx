import React, { useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useLocalSearchParams, useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";

import { api, Role, User } from "@/src/api/client";
import { ROLE_LABELS, spacing, theme } from "@/src/theme";
import { useSafeBack } from "@/src/hooks/use-safe-back";
import { notify } from "@/src/utils/confirm";
import { dialCodeFor, formatAsYouType, formatStored } from "@/src/utils/phone";

const ROLE_OPTIONS: Role[] = ["manufacturer", "client"];

type StateEntry = { code: string; name: string };

type Country = {
  code: string;
  name: string;
  language: string;
  language_name: string;
  dial_code?: string;
  state_label?: string;
  phone_format?: string;
  states?: StateEntry[];
};

// Fallback dial codes for the rare case a country slips into the dropdown
// without ``dial_code`` from the server. The server is the source of truth.
const DIAL_CODE_FALLBACK: Record<string, string> = {
  AU: "+61", CN: "+86", FR: "+33", IT: "+39", JP: "+81", KR: "+82",
  GB: "+44", US: "+1", CA: "+1", DE: "+49", ES: "+34", CH: "+41",
  SG: "+65", HK: "+852", AE: "+971", NZ: "+64", IN: "+91",
};

export default function CreateUserScreen() {
  const router = useRouter();
  const safeBack = useSafeBack();
  const { role: initialRole, userId } = useLocalSearchParams<{
    role?: string;
    userId?: string;
  }>();
  const editMode = !!userId;

  const [role, setRole] = useState<Role>((initialRole as Role) || "manufacturer");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [phoneNumber, setPhoneNumber] = useState("");
  const [birthday, setBirthday] = useState("");
  const [city, setCity] = useState("");
  const [state, setState] = useState("");
  const [addressLine1, setAddressLine1] = useState("");
  const [addressLine2, setAddressLine2] = useState("");
  const [password, setPassword] = useState("");
  const [showPasswordReset, setShowPasswordReset] = useState(false);
  const [country, setCountry] = useState<string>("AU");
  const [countries, setCountries] = useState<Country[]>([]);
  const [associates, setAssociates] = useState<User[]>([]);
  const [selectedAssociate, setSelectedAssociate] = useState<User | null>(null);
  const [showCountryPicker, setShowCountryPicker] = useState(false);
  const [showStatePicker, setShowStatePicker] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      try {
        const [a, c] = await Promise.all([
          api.listUsers("associate"),
          api.listCountries(),
        ]);
        setAssociates(a);
        setCountries(c);
        if (editMode && userId) {
          const u = await api.getUser(userId);
          setRole(u.role);
          setName(u.name || "");
          setEmail(u.email || "");
          setPhoneNumber(formatStored(u.phone_number || "", u.country || "AU"));
          setBirthday(u.birthday || "");
          setCity(u.city || "");
          setState(u.state || "");
          setAddressLine1(u.address_line1 || "");
          setAddressLine2(u.address_line2 || "");
          setCountry(u.country || "AU");
          if (u.role === "client" && u.associate_id) {
            const owner = a.find((x: User) => x.id === u.associate_id);
            if (owner) setSelectedAssociate(owner);
          }
        }
      } catch {
        /* non-fatal: form still works without picker */
      }
    })();
  }, [editMode, userId]);

  const selectedCountry = useMemo(
    () => countries.find((c) => c.code === country),
    [countries, country],
  );
  const dialCode =
    selectedCountry?.dial_code || dialCodeFor(country) || DIAL_CODE_FALLBACK[country] || "";
  const stateLabel = selectedCountry?.state_label || "State / Region";
  const stateOptions = useMemo<StateEntry[]>(
    () => selectedCountry?.states || [],
    [selectedCountry],
  );
  const hasStateDropdown = stateOptions.length > 0;
  const selectedStateName = useMemo(() => {
    if (!hasStateDropdown || !state) return "";
    const hit = stateOptions.find(
      (s) => s.code === state || s.name === state,
    );
    return hit ? hit.name : state;
  }, [hasStateDropdown, state, stateOptions]);

  // When a country with a dropdown is chosen but the stored value doesn't
  // map to any state code/name, clear it so the user doesn't see a stale
  // free-text value masquerading as a selection.
  useEffect(() => {
    if (!hasStateDropdown) return;
    if (!state) return;
    const valid = stateOptions.some(
      (s) => s.code === state || s.name === state,
    );
    if (!valid) setState("");
  }, [hasStateDropdown, stateOptions, state]);

  // Whenever the country changes by user action, re-format the existing
  // phone digits with the newly-selected country mask. Without this,
  // switching from US to AU keeps the parentheses.
  useEffect(() => {
    if (!phoneNumber) return;
    setPhoneNumber(formatAsYouType(phoneNumber, country));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [country]);

  const handlePhoneChange = (next: string) => {
    setPhoneNumber(formatAsYouType(next, country));
  };

  const submit = async () => {
    if (!name.trim() || !email.trim()) {
      setError("Name and email are required.");
      return;
    }
    if (!editMode && (!password.trim() || password.length < 6)) {
      setError("Password must be at least 6 characters.");
      return;
    }
    if (editMode && showPasswordReset && password.trim() && password.length < 6) {
      setError("Password must be at least 6 characters.");
      return;
    }
    if (birthday && !/^\d{4}-\d{2}-\d{2}$/.test(birthday)) {
      setError("Birthday must be in YYYY-MM-DD format.");
      return;
    }
    setSaving(true);
    setError(null);
    try {
      if (editMode && userId) {
        await api.updateUserProfile(userId, {
          name: name.trim(),
          associate_id: role === "client" ? selectedAssociate?.id ?? null : null,
          country,
          phone_dial_code: dialCode || null,
          phone_number: phoneNumber.trim() || null,
          birthday: birthday.trim() || null,
          city: city.trim() || null,
          state: state.trim() || null,
          address_line1: addressLine1.trim() || null,
          address_line2: addressLine2.trim() || null,
        });
        if (showPasswordReset && password.trim()) {
          await api.setUserPassword(userId, password);
        }
        notify(
          "User updated",
          showPasswordReset && password.trim()
            ? `${name.trim()} has been updated and password reset.`
            : `${name.trim()} has been updated.`,
        );
      } else {
        await api.createUser({
          name: name.trim(),
          email: email.trim().toLowerCase(),
          password,
          role,
          associate_id: role === "client" ? selectedAssociate?.id ?? null : null,
          country,
          phone_dial_code: dialCode || null,
          phone_number: phoneNumber.trim() || null,
          birthday: birthday.trim() || null,
          city: city.trim() || null,
          state: state.trim() || null,
          address_line1: addressLine1.trim() || null,
          address_line2: addressLine2.trim() || null,
        } as any);
        notify(
          `${role === "manufacturer" ? "Workshop" : "Client"} created`,
          `${name.trim()} has been added.`,
        );
      }
      router.back();
    } catch (e: any) {
      setError(e?.message ?? "Failed");
    } finally {
      setSaving(false);
    }
  };

  return (
    <SafeAreaView style={styles.safe} edges={["top", "bottom"]}>
      <KeyboardAvoidingView
        behavior={Platform.OS === "ios" ? "padding" : undefined}
        style={{ flex: 1 }}
      >
        <View style={styles.header}>
          <TouchableOpacity testID="create-user-close" onPress={safeBack}>
            <Ionicons name="close" size={24} color={theme.textPrimary} />
          </TouchableOpacity>
          <Text style={styles.headerEyebrow}>{editMode ? "EDIT USER" : "NEW USER"}</Text>
          <View style={{ width: 24 }} />
        </View>

        <ScrollView
          contentContainerStyle={{ padding: spacing.lg, paddingBottom: spacing.xxl }}
          keyboardShouldPersistTaps="handled"
        >
          <Text style={styles.formLabel}>ROLE</Text>
          <View style={styles.roleRow}>
            {ROLE_OPTIONS.map((r) => {
              const isSel = role === r;
              return (
                <TouchableOpacity
                  key={r}
                  testID={`role-chip-${r}`}
                  onPress={() => !editMode && setRole(r)}
                  disabled={editMode}
                  style={[
                    styles.roleChip,
                    isSel && styles.roleChipSel,
                    editMode && !isSel && { opacity: 0.4 },
                  ]}
                >
                  <Text style={[styles.roleChipText, isSel && styles.roleChipTextSel]}>
                    {ROLE_LABELS[r]?.toUpperCase() || r.toUpperCase()}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </View>

          <Text style={styles.formLabel}>FULL NAME</Text>
          <TextInput
            testID="user-name-input"
            value={name}
            onChangeText={setName}
            placeholder="e.g. Marc Aubert"
            placeholderTextColor={theme.textMuted}
            style={styles.input}
          />

          <Text style={styles.formLabel}>EMAIL</Text>
          <TextInput
            testID="user-email-input"
            value={email}
            onChangeText={setEmail}
            placeholder="name@maison.com"
            placeholderTextColor={theme.textMuted}
            autoCapitalize="none"
            keyboardType="email-address"
            editable={!editMode}
            style={[styles.input, editMode && { opacity: 0.6 }]}
          />

          <Text style={styles.formLabel}>MOBILE PHONE</Text>
          <View style={styles.phoneRow}>
            <View style={styles.dialCodeBox}>
              <Text
                style={[
                  styles.dialCodeText,
                  !dialCode && { color: theme.textMuted },
                ]}
              >
                {dialCode || "—"}
              </Text>
            </View>
            <TextInput
              testID="user-phone-input"
              value={phoneNumber}
              onChangeText={handlePhoneChange}
              placeholder={
                dialCode ? "Mobile number" : "Select a country first"
              }
              placeholderTextColor={theme.textMuted}
              keyboardType="phone-pad"
              editable={!!dialCode}
              style={[styles.input, styles.phoneInput, !dialCode && { opacity: 0.6 }]}
            />
          </View>

          <Text style={styles.formLabel}>BIRTHDAY (YYYY-MM-DD)</Text>
          <TextInput
            testID="user-birthday-input"
            value={birthday}
            onChangeText={setBirthday}
            placeholder="e.g. 1985-04-12"
            placeholderTextColor={theme.textMuted}
            style={styles.input}
            autoCapitalize="none"
          />

          <View style={styles.rowTwo}>
            <View style={{ flex: 1 }}>
              <Text style={styles.formLabel}>CITY</Text>
              <TextInput
                testID="user-city-input"
                value={city}
                onChangeText={setCity}
                placeholder="e.g. Melbourne"
                placeholderTextColor={theme.textMuted}
                style={styles.input}
              />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.formLabel}>COUNTRY</Text>
              <TouchableOpacity
                testID="country-toggle"
                style={[styles.input, styles.countrySelectRow]}
                onPress={() => setShowCountryPicker((v) => !v)}
              >
                <Text style={styles.countrySelectText}>
                  {selectedCountry?.name || "Select a country…"}
                </Text>
                <Ionicons
                  name={showCountryPicker ? "chevron-up" : "chevron-down"}
                  size={16}
                  color={theme.textMuted}
                />
              </TouchableOpacity>
            </View>
          </View>

          {showCountryPicker && (
            <View style={styles.selectorBox}>
              <ScrollView style={{ maxHeight: 220 }} nestedScrollEnabled>
                {countries.map((c) => {
                  const isSel = country === c.code;
                  return (
                    <TouchableOpacity
                      key={c.code}
                      testID={`country-${c.code}`}
                      onPress={() => {
                        setCountry(c.code);
                        setShowCountryPicker(false);
                      }}
                      style={[styles.selectorRow, isSel && styles.selectorRowSel]}
                    >
                      <View style={{ flex: 1 }}>
                        <Text
                          style={[
                            styles.selectorName,
                            isSel && { color: theme.primary },
                          ]}
                        >
                          {c.name}
                        </Text>
                        <Text style={styles.selectorEmail}>
                          {c.language_name}
                          {c.dial_code
                            ? `  ·  ${c.dial_code}`
                            : DIAL_CODE_FALLBACK[c.code]
                              ? `  ·  ${DIAL_CODE_FALLBACK[c.code]}`
                              : ""}
                        </Text>
                      </View>
                      {isSel && <Ionicons name="checkmark" size={18} color={theme.primary} />}
                    </TouchableOpacity>
                  );
                })}
              </ScrollView>
            </View>
          )}

          <Text style={styles.formLabel}>{stateLabel.toUpperCase()}</Text>
          {hasStateDropdown ? (
            <>
              <TouchableOpacity
                testID="state-toggle"
                style={[styles.input, styles.countrySelectRow]}
                onPress={() => setShowStatePicker((v) => !v)}
              >
                <Text
                  style={[
                    styles.countrySelectText,
                    !selectedStateName && { color: theme.textMuted },
                  ]}
                >
                  {selectedStateName || `Select a ${stateLabel.toLowerCase()}…`}
                </Text>
                <Ionicons
                  name={showStatePicker ? "chevron-up" : "chevron-down"}
                  size={16}
                  color={theme.textMuted}
                />
              </TouchableOpacity>
              {showStatePicker && (
                <View style={styles.selectorBox}>
                  <ScrollView style={{ maxHeight: 240 }} nestedScrollEnabled>
                    {stateOptions.map((s) => {
                      const isSel = state === s.code || state === s.name;
                      return (
                        <TouchableOpacity
                          key={s.code}
                          testID={`state-${s.code}`}
                          onPress={() => {
                            setState(s.name);
                            setShowStatePicker(false);
                          }}
                          style={[
                            styles.selectorRow,
                            isSel && styles.selectorRowSel,
                          ]}
                        >
                          <View style={{ flex: 1 }}>
                            <Text
                              style={[
                                styles.selectorName,
                                isSel && { color: theme.primary },
                              ]}
                            >
                              {s.name}
                            </Text>
                            <Text style={styles.selectorEmail}>{s.code}</Text>
                          </View>
                          {isSel && (
                            <Ionicons name="checkmark" size={18} color={theme.primary} />
                          )}
                        </TouchableOpacity>
                      );
                    })}
                  </ScrollView>
                </View>
              )}
            </>
          ) : (
            <TextInput
              testID="user-state-input"
              value={state}
              onChangeText={setState}
              placeholder={`e.g. ${stateLabel}`}
              placeholderTextColor={theme.textMuted}
              style={styles.input}
            />
          )}

          <Text style={styles.formLabel}>ADDRESS LINE 1</Text>
          <TextInput
            testID="user-address1-input"
            value={addressLine1}
            onChangeText={setAddressLine1}
            placeholder="Street, number"
            placeholderTextColor={theme.textMuted}
            style={styles.input}
          />

          <Text style={styles.formLabel}>ADDRESS LINE 2</Text>
          <TextInput
            testID="user-address2-input"
            value={addressLine2}
            onChangeText={setAddressLine2}
            placeholder="Apt, suite, postcode (optional)"
            placeholderTextColor={theme.textMuted}
            style={styles.input}
          />

          {!editMode && (
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
          )}

          {editMode && (
            <>
              <TouchableOpacity
                testID="toggle-password-reset"
                onPress={() => {
                  setShowPasswordReset((v) => !v);
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
          )}

          {role === "client" && associates.length > 0 && (
            <>
              <Text style={styles.formLabel}>ASSIGNED ASSOCIATE</Text>
              <View style={styles.selectorBox}>
                {associates.map((a) => {
                  const isSel = selectedAssociate?.id === a.id;
                  return (
                    <TouchableOpacity
                      key={a.id}
                      testID={`assoc-${a.id}`}
                      onPress={() => setSelectedAssociate(a)}
                      style={[styles.selectorRow, isSel && styles.selectorRowSel]}
                    >
                      <View style={{ flex: 1 }}>
                        <Text style={[styles.selectorName, isSel && { color: theme.primary }]}>
                          {a.name}
                        </Text>
                        <Text style={styles.selectorEmail}>{a.email}</Text>
                      </View>
                      {isSel && <Ionicons name="checkmark" size={18} color={theme.primary} />}
                    </TouchableOpacity>
                  );
                })}
              </View>
            </>
          )}

          {error && <Text style={styles.error}>{error}</Text>}

          <View style={styles.actionRow}>
            <TouchableOpacity
              testID="create-user-cancel"
              onPress={safeBack}
              style={styles.secondaryBtn}
            >
              <Text style={styles.secondaryBtnText}>CANCEL</Text>
            </TouchableOpacity>
            <TouchableOpacity
              testID="create-user-submit"
              onPress={submit}
              disabled={saving}
              style={[styles.primaryBtn, saving && { opacity: 0.6 }]}
            >
              {saving ? (
                <ActivityIndicator color="#0A0A0A" />
              ) : (
                <Text style={styles.primaryBtnText}>{editMode ? "SAVE" : "CREATE"}</Text>
              )}
            </TouchableOpacity>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: theme.bg },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    padding: spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: theme.border,
  },
  headerEyebrow: { color: theme.primary, fontSize: 11, letterSpacing: 3 },
  formLabel: {
    color: theme.primary,
    fontSize: 10,
    letterSpacing: 3,
    marginTop: spacing.lg,
    marginBottom: spacing.sm,
  },
  roleRow: { flexDirection: "row", flexWrap: "wrap", gap: spacing.sm },
  roleChip: {
    borderWidth: 1,
    borderColor: theme.border,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
  },
  roleChipSel: { borderColor: theme.primary, backgroundColor: "rgba(212,175,55,0.08)" },
  roleChipText: { color: theme.textSecondary, fontSize: 10, letterSpacing: 2 },
  roleChipTextSel: { color: theme.primary },
  input: {
    color: theme.textPrimary,
    fontSize: 14,
    borderWidth: 1,
    borderColor: theme.border,
    padding: spacing.md,
  },
  phoneRow: { flexDirection: "row", gap: spacing.sm },
  dialCodeBox: {
    minWidth: 78,
    borderWidth: 1,
    borderColor: theme.border,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.md,
    alignItems: "center",
    justifyContent: "center",
  },
  dialCodeText: { color: theme.textPrimary, fontSize: 14 },
  phoneInput: { flex: 1 },
  rowTwo: { flexDirection: "row", gap: spacing.sm },
  countrySelectRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  countrySelectText: { color: theme.textPrimary, fontSize: 14 },
  selectorBox: { borderWidth: 1, borderColor: theme.border, marginTop: spacing.sm },
  selectorRow: {
    flexDirection: "row",
    alignItems: "center",
    padding: spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: theme.borderSubtle,
  },
  selectorRowSel: { backgroundColor: "rgba(212,175,55,0.08)" },
  selectorName: { color: theme.textPrimary, fontSize: 14 },
  selectorEmail: { color: theme.textMuted, fontSize: 11, marginTop: 2 },
  error: { color: theme.error, fontSize: 12, marginTop: spacing.md },
  actionRow: { flexDirection: "row", gap: spacing.md, marginTop: spacing.xl },
  secondaryBtn: {
    flex: 1,
    paddingVertical: 16,
    alignItems: "center",
    borderWidth: 1,
    borderColor: theme.border,
  },
  secondaryBtnText: { color: theme.textPrimary, fontSize: 12, fontWeight: "700", letterSpacing: 3 },
  primaryBtn: {
    flex: 1,
    backgroundColor: theme.primary,
    paddingVertical: 16,
    alignItems: "center",
  },
  primaryBtnText: { color: "#0A0A0A", fontSize: 12, fontWeight: "700", letterSpacing: 3 },
  pwdToggleRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    marginTop: spacing.lg,
    paddingVertical: spacing.sm,
  },
  pwdToggleText: { color: theme.primary, fontSize: 11, letterSpacing: 2 },
  pwdHint: {
    color: theme.textMuted,
    fontSize: 11,
    marginTop: spacing.sm,
    fontStyle: "italic",
  },
});
