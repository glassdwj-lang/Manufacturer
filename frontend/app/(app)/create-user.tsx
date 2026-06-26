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

import { api, ManufacturerContact, Role, User } from "@/src/api/client";
import { ROLE_LABELS, spacing, theme } from "@/src/theme";
import { useSafeBack } from "@/src/hooks/use-safe-back";
import { notify } from "@/src/utils/confirm";
import { dialCodeFor, formatAsYouType, formatStored } from "@/src/utils/phone";
import { BrandStrip } from "@/src/components/BrandStrip";

const ROLE_OPTIONS: Role[] = ["manufacturer", "cad_renderer", "client"];

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

  // Manufacturer-only: 3 contact people + primary selector.
  // We seed three empty slots so the UI is rendered identically whether
  // creating a new manufacturer or editing an existing one.
  const emptyContact = (): ManufacturerContact => ({
    id: `tmp-${Math.random().toString(36).slice(2, 10)}`,
    name: "",
    company_title: "",
    country: "",
    mobile_number: "",
    whatsapp_number: "",
    wechat_id: "",
    other_label: "",
    other_value: "",
    email: "",
  });
  const [contacts, setContacts] = useState<ManufacturerContact[]>(() => [
    emptyContact(),
    emptyContact(),
    emptyContact(),
  ]);
  const [primaryContactId, setPrimaryContactId] = useState<string | null>(null);
  const [expandedContactIdx, setExpandedContactIdx] = useState<number>(0);

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
          // Hydrate the contacts roster for vendor-type users (manufacturer
          // and cad_renderer share the same 3-slot roster). The backend always
          // returns three slots — we just trust it.
          if ((u.role === "manufacturer" || u.role === "cad_renderer") && Array.isArray(u.contacts)) {
            const padded: ManufacturerContact[] = [...u.contacts];
            while (padded.length < 3) padded.push(emptyContact());
            setContacts(padded.slice(0, 3));
            setPrimaryContactId(u.primary_contact_id || padded[0]?.id || null);
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

  // Helpers for the manufacturer contact roster -------------------------------
  const updateContact = (
    idx: number,
    patch: Partial<ManufacturerContact>,
  ): void => {
    setContacts((prev) =>
      prev.map((c, i) => (i === idx ? { ...c, ...patch } : c)),
    );
  };

  /** Apply phone-format reformatting using the contact's own country (or the
   * manufacturer's country as fallback) so each row's mobile / WhatsApp
   * display obeys libphonenumber's rules without overwriting the digits. */
  const contactPhoneCountry = (c: ManufacturerContact): string =>
    (c.country && c.country.trim()) || country;

  const handleContactPhone = (
    idx: number,
    field: "mobile_number" | "whatsapp_number",
    value: string,
  ) => {
    const cc = contactPhoneCountry(contacts[idx]);
    updateContact(idx, { [field]: formatAsYouType(value, cc) } as any);
  };

  const persistContacts = async (uid: string) => {
    // Strip the throw-away ``tmp-…`` ids we used to keep React happy so the
    // backend assigns real uuids on first save.
    const cleaned: ManufacturerContact[] = contacts.map((c) => ({
      id: c.id && !String(c.id).startsWith("tmp-") ? c.id : undefined,
      name: c.name || null,
      company_title: c.company_title || null,
      country: c.country || null,
      mobile_number: c.mobile_number || null,
      whatsapp_number: c.whatsapp_number || null,
      wechat_id: c.wechat_id || null,
      other_label: c.other_label || null,
      other_value: c.other_value || null,
      email: c.email || null,
    }));
    // Map the local primary id to the resolved id (post backend sanitization
    // it'll be either the original uuid or a freshly generated one).
    const primaryIdx = contacts.findIndex((c) => c.id === primaryContactId);
    let primaryToSend: string | null = null;
    if (primaryIdx >= 0 && cleaned[primaryIdx]?.id) {
      primaryToSend = cleaned[primaryIdx]!.id!;
    }
    const res = await api.setManufacturerContacts(uid, {
      contacts: cleaned,
      primary_contact_id: primaryToSend,
    });
    // Keep our local copy in sync with the server's canonical (id-assigned)
    // form so subsequent saves work even on fresh creates.
    setContacts(res.contacts);
    setPrimaryContactId(res.primary_contact_id);
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
        if (role === "manufacturer" || role === "cad_renderer") {
          await persistContacts(userId);
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
        // For a freshly created manufacturer / CAD-renderer, re-fetch by
        // email to get the server-assigned id and then write the contacts.
        if (role === "manufacturer" || role === "cad_renderer") {
          try {
            const all = await api.listUsers(role);
            const just = all.find(
              (u: User) => u.email.toLowerCase() === email.trim().toLowerCase(),
            );
            if (just) await persistContacts(just.id);
          } catch {
            /* contacts will be empty until the admin re-opens the edit screen */
          }
        }
        notify(
          `${role === "manufacturer" ? "Workshop" : role === "cad_renderer" ? "CAD & Render vendor" : "Client"} created`,
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
        <BrandStrip />
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

          <Text style={styles.formLabel}>
            {role === "manufacturer"
              ? "BUSINESS NAME"
              : role === "cad_renderer"
              ? "STUDIO / VENDOR NAME"
              : "FULL NAME"}
          </Text>
          <TextInput
            testID="user-name-input"
            value={name}
            onChangeText={setName}
            placeholder={
              role === "manufacturer"
                ? "e.g. Atelier Aubert Pte. Ltd."
                : role === "cad_renderer"
                ? "e.g. Lumière Render Studio"
                : "e.g. Marc Aubert"
            }
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

          {(role === "manufacturer" || role === "cad_renderer") && (
            <>
              <Text style={[styles.sectionTitle, { marginTop: spacing.xl }]}>
                CONTACT PEOPLE
              </Text>
              <Text style={styles.sectionHint}>
                Add up to 3 contacts at the {role === "manufacturer" ? "workshop" : "studio"}. Tap the star to choose
                which one is the primary contact for orders & escalations.
              </Text>
              {contacts.map((c, idx) => {
                const open = expandedContactIdx === idx;
                const isPrimary = primaryContactId === c.id;
                const previewName = c.name?.trim() || `Contact ${idx + 1}`;
                const previewTitle = c.company_title?.trim() || "—";
                const cc = contactPhoneCountry(c);
                return (
                  <View key={c.id || idx} style={styles.contactCard}>
                    <TouchableOpacity
                      style={styles.contactHeader}
                      onPress={() => setExpandedContactIdx(open ? -1 : idx)}
                      testID={`contact-toggle-${idx}`}
                    >
                      <TouchableOpacity
                        onPress={() => setPrimaryContactId(c.id || null)}
                        testID={`contact-primary-${idx}`}
                        hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                        style={styles.primaryStar}
                      >
                        <Ionicons
                          name={isPrimary ? "star" : "star-outline"}
                          size={18}
                          color={isPrimary ? theme.primary : theme.textMuted}
                        />
                      </TouchableOpacity>
                      <View style={{ flex: 1 }}>
                        <Text style={styles.contactName} numberOfLines={1}>
                          {previewName}
                        </Text>
                        <Text style={styles.contactTitle} numberOfLines={1}>
                          {previewTitle}
                          {isPrimary ? "  ·  PRIMARY" : ""}
                        </Text>
                      </View>
                      <Ionicons
                        name={open ? "chevron-up" : "chevron-down"}
                        size={16}
                        color={theme.textMuted}
                      />
                    </TouchableOpacity>
                    {open && (
                      <View style={styles.contactBody}>
                        <Text style={styles.formLabel}>NAME</Text>
                        <TextInput
                          testID={`contact-name-${idx}`}
                          value={c.name || ""}
                          onChangeText={(v) => updateContact(idx, { name: v })}
                          placeholder="Full name"
                          placeholderTextColor={theme.textMuted}
                          style={styles.input}
                        />
                        <Text style={styles.formLabel}>COMPANY TITLE</Text>
                        <TextInput
                          testID={`contact-title-${idx}`}
                          value={c.company_title || ""}
                          onChangeText={(v) =>
                            updateContact(idx, { company_title: v })
                          }
                          placeholder="e.g. Production Manager"
                          placeholderTextColor={theme.textMuted}
                          style={styles.input}
                        />
                        <Text style={styles.formLabel}>COUNTRY OVERRIDE (OPTIONAL)</Text>
                        <Text style={styles.contactInlineHint}>
                          Leave blank to use the workshop&apos;s country ({country}).
                        </Text>
                        <TextInput
                          testID={`contact-country-${idx}`}
                          value={c.country || ""}
                          onChangeText={(v) =>
                            updateContact(idx, {
                              country: v.toUpperCase().slice(0, 2),
                            })
                          }
                          autoCapitalize="characters"
                          maxLength={2}
                          placeholder={country}
                          placeholderTextColor={theme.textMuted}
                          style={styles.input}
                        />
                        <Text style={styles.formLabel}>
                          MOBILE NUMBER ({dialCodeFor(cc) || "+?"})
                        </Text>
                        <TextInput
                          testID={`contact-mobile-${idx}`}
                          value={c.mobile_number || ""}
                          onChangeText={(v) =>
                            handleContactPhone(idx, "mobile_number", v)
                          }
                          keyboardType="phone-pad"
                          placeholder="Mobile number"
                          placeholderTextColor={theme.textMuted}
                          style={styles.input}
                        />
                        <Text style={styles.formLabel}>WHATSAPP NUMBER</Text>
                        <TextInput
                          testID={`contact-whatsapp-${idx}`}
                          value={c.whatsapp_number || ""}
                          onChangeText={(v) =>
                            handleContactPhone(idx, "whatsapp_number", v)
                          }
                          keyboardType="phone-pad"
                          placeholder="WhatsApp number"
                          placeholderTextColor={theme.textMuted}
                          style={styles.input}
                        />
                        <Text style={styles.formLabel}>WECHAT ID</Text>
                        <TextInput
                          testID={`contact-wechat-${idx}`}
                          value={c.wechat_id || ""}
                          onChangeText={(v) => updateContact(idx, { wechat_id: v })}
                          autoCapitalize="none"
                          placeholder="e.g. anna_atelier_88"
                          placeholderTextColor={theme.textMuted}
                          style={styles.input}
                        />
                        <Text style={styles.formLabel}>EMAIL</Text>
                        <TextInput
                          testID={`contact-email-${idx}`}
                          value={c.email || ""}
                          onChangeText={(v) => updateContact(idx, { email: v })}
                          autoCapitalize="none"
                          keyboardType="email-address"
                          placeholder="name@workshop.com"
                          placeholderTextColor={theme.textMuted}
                          style={styles.input}
                        />
                        <View style={styles.contactOtherRow}>
                          <View style={{ flex: 1, marginRight: 6 }}>
                            <Text style={styles.formLabel}>OTHER LABEL</Text>
                            <TextInput
                              testID={`contact-other-label-${idx}`}
                              value={c.other_label || ""}
                              onChangeText={(v) =>
                                updateContact(idx, { other_label: v })
                              }
                              placeholder="LinkedIn"
                              placeholderTextColor={theme.textMuted}
                              style={styles.input}
                            />
                          </View>
                          <View style={{ flex: 1, marginLeft: 6 }}>
                            <Text style={styles.formLabel}>OTHER VALUE</Text>
                            <TextInput
                              testID={`contact-other-value-${idx}`}
                              value={c.other_value || ""}
                              onChangeText={(v) =>
                                updateContact(idx, { other_value: v })
                              }
                              placeholder="linkedin.com/in/…"
                              placeholderTextColor={theme.textMuted}
                              autoCapitalize="none"
                              style={styles.input}
                            />
                          </View>
                        </View>
                      </View>
                    )}
                  </View>
                );
              })}
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
  sectionTitle: {
    color: theme.primary,
    fontSize: 12,
    letterSpacing: 4,
    marginBottom: spacing.sm,
  },
  sectionHint: {
    color: theme.textMuted,
    fontSize: 11,
    marginBottom: spacing.md,
    fontStyle: "italic",
  },
  contactCard: {
    borderWidth: 1,
    borderColor: theme.border,
    marginBottom: spacing.md,
  },
  contactHeader: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.md,
    gap: spacing.sm,
  },
  primaryStar: { paddingRight: 4 },
  contactName: { color: theme.textPrimary, fontSize: 13, fontWeight: "600" },
  contactTitle: { color: theme.textMuted, fontSize: 11, marginTop: 2 },
  contactBody: {
    paddingHorizontal: spacing.md,
    paddingBottom: spacing.md,
    borderTopWidth: 1,
    borderTopColor: theme.border,
  },
  contactOtherRow: { flexDirection: "row", justifyContent: "space-between" },
  contactInlineHint: {
    color: theme.textMuted,
    fontSize: 10,
    marginBottom: 6,
    fontStyle: "italic",
  },
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
