/**
 * CreateUserScreen — orchestrator for the Create / Edit User flow.
 *
 * Was the 1,044-line `app/(app)/create-user.tsx` monolith. Decomposed
 * into:
 *   - hooks/useCreateUserForm.ts (state machine + IO)
 *   - components/* (RoleChipRow, PhoneField, CountryPicker, StatePicker,
 *                   AssociatePicker, PasswordSection,
 *                   ContactRosterSection / ContactCard)
 *   - styles.ts, types.ts (shared)
 */
import React from "react";
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";

import { spacing, theme } from "@/src/theme";
import { useSafeBack } from "@/src/hooks/use-safe-back";
import { BrandStrip } from "@/src/components/BrandStrip";
import { useI18n } from "@/src/i18n";

import { createUserStyles as styles } from "./styles";
import { useCreateUserForm } from "./hooks/useCreateUserForm";
import { RoleChipRow } from "./components/RoleChipRow";
import { PhoneField } from "./components/PhoneField";
import { CountryPicker } from "./components/CountryPicker";
import { StatePicker } from "./components/StatePicker";
import { AssociatePicker } from "./components/AssociatePicker";
import { PasswordSection } from "./components/PasswordSection";
import { ContactRosterSection } from "./components/ContactRosterSection";

export default function CreateUserScreen() {
  const safeBack = useSafeBack();
  const { t } = useI18n();
  const f = useCreateUserForm();

  const headerTitle = f.editMode
    ? t("create_user.eyebrow")
    : f.role === "manufacturer"
      ? t("create_user.title.manufacturer")
      : f.role === "cad_renderer"
        ? t("create_user.title.cad_renderer")
        : f.role === "admin"
          ? t("create_user.title.admin")
          : f.role === "associate"
            ? t("create_user.title.associate")
            : t("create_user.title.client");

  const nameLabel =
    f.role === "manufacturer"
      ? t("create_user.label.workshop_name")
      : f.role === "cad_renderer"
        ? t("create_user.label.studio_name")
        : t("create_user.label.full_name");

  const namePlaceholder =
    f.role === "manufacturer"
      ? "e.g. Atelier Aubert Pte. Ltd."
      : f.role === "cad_renderer"
        ? "e.g. Lumi\u00e8re Render Studio"
        : "e.g. Marc Aubert";

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
          <Text style={styles.headerEyebrow}>{headerTitle}</Text>
          <View style={{ width: 24 }} />
        </View>

        <ScrollView
          contentContainerStyle={{
            padding: spacing.lg,
            paddingBottom: spacing.xxl,
          }}
          keyboardShouldPersistTaps="handled"
        >
          <Text style={styles.formLabel}>ROLE</Text>
          <RoleChipRow
            role={f.role}
            onChange={f.setRole}
            disabled={f.editMode}
          />

          <Text style={styles.formLabel}>{nameLabel}</Text>
          <TextInput
            testID="user-name-input"
            value={f.name}
            onChangeText={f.setName}
            placeholder={namePlaceholder}
            placeholderTextColor={theme.textMuted}
            style={styles.input}
          />

          <Text style={styles.formLabel}>{t("create_user.label.email")}</Text>
          <TextInput
            testID="user-email-input"
            value={f.email}
            onChangeText={f.setEmail}
            placeholder="name@maison.com"
            placeholderTextColor={theme.textMuted}
            autoCapitalize="none"
            keyboardType="email-address"
            editable={!f.editMode}
            style={[styles.input, f.editMode && { opacity: 0.6 }]}
          />

          <Text style={styles.formLabel}>MOBILE PHONE</Text>
          <PhoneField
            dialCode={f.dialCode}
            value={f.phoneNumber}
            onChange={f.handlePhoneChange}
          />

          <Text style={styles.formLabel}>BIRTHDAY (YYYY-MM-DD)</Text>
          <TextInput
            testID="user-birthday-input"
            value={f.birthday}
            onChangeText={f.setBirthday}
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
                value={f.city}
                onChangeText={f.setCity}
                placeholder="e.g. Melbourne"
                placeholderTextColor={theme.textMuted}
                style={styles.input}
              />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.formLabel}>
                {t("create_user.label.country")}
              </Text>
              <CountryPicker
                countries={f.countries}
                selectedCode={f.country}
                onSelect={(code) => {
                  f.setCountry(code);
                  f.setShowCountryPicker(false);
                }}
                open={f.showCountryPicker}
                onToggle={() => f.setShowCountryPicker(!f.showCountryPicker)}
              />
            </View>
          </View>

          <Text style={styles.formLabel}>{f.stateLabel.toUpperCase()}</Text>
          <StatePicker
            state={f.state}
            setState={f.setState}
            stateLabel={f.stateLabel}
            options={f.stateOptions}
            selectedName={f.selectedStateName}
            open={f.showStatePicker}
            onToggle={() => f.setShowStatePicker(!f.showStatePicker)}
          />

          <Text style={styles.formLabel}>ADDRESS LINE 1</Text>
          <TextInput
            testID="user-address1-input"
            value={f.addressLine1}
            onChangeText={f.setAddressLine1}
            placeholder="Street, number"
            placeholderTextColor={theme.textMuted}
            style={styles.input}
          />

          <Text style={styles.formLabel}>ADDRESS LINE 2</Text>
          <TextInput
            testID="user-address2-input"
            value={f.addressLine2}
            onChangeText={f.setAddressLine2}
            placeholder="Apt, suite, postcode (optional)"
            placeholderTextColor={theme.textMuted}
            style={styles.input}
          />

          <PasswordSection
            editMode={f.editMode}
            password={f.password}
            setPassword={f.setPassword}
            showPasswordReset={f.showPasswordReset}
            setShowPasswordReset={f.setShowPasswordReset}
          />

          {f.role === "client" && (
            <AssociatePicker
              options={f.associates}
              selected={f.selectedAssociate}
              onSelect={f.setSelectedAssociate}
            />
          )}

          {(f.role === "manufacturer" || f.role === "cad_renderer") && (
            <ContactRosterSection
              role={f.role}
              contacts={f.contacts}
              primaryContactId={f.primaryContactId}
              expandedIdx={f.expandedContactIdx}
              setExpandedIdx={f.setExpandedContactIdx}
              setPrimaryContactId={f.setPrimaryContactId}
              updateContact={f.updateContact}
              handleContactPhone={f.handleContactPhone}
              workshopCountry={f.country}
            />
          )}

          {f.error && <Text style={styles.error}>{f.error}</Text>}

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
              onPress={f.submit}
              disabled={f.saving}
              style={[styles.primaryBtn, f.saving && { opacity: 0.6 }]}
            >
              {f.saving ? (
                <ActivityIndicator color="#0A0A0A" />
              ) : (
                <Text style={styles.primaryBtnText}>
                  {f.editMode
                    ? t("common.save")
                    : t("create_user.cta.create")}
                </Text>
              )}
            </TouchableOpacity>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}
