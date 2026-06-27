/**
 * Single expandable contact card. Used three times by
 * `ContactRosterSection` to render the workshop/studio's contact roster.
 */
import React from "react";
import { Text, TextInput, TouchableOpacity, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { theme } from "@/src/theme";
import type { ManufacturerContact } from "@/src/api/client";
import { dialCodeFor } from "@/src/utils/phone";
import { createUserStyles as styles } from "../styles";

export function ContactCard({
  idx,
  contact,
  open,
  isPrimary,
  workshopCountry,
  onToggleOpen,
  onMakePrimary,
  onUpdate,
  onPhoneChange,
}: {
  idx: number;
  contact: ManufacturerContact;
  open: boolean;
  isPrimary: boolean;
  workshopCountry: string;
  onToggleOpen: () => void;
  onMakePrimary: () => void;
  onUpdate: (patch: Partial<ManufacturerContact>) => void;
  onPhoneChange: (
    field: "mobile_number" | "whatsapp_number",
    value: string,
  ) => void;
}) {
  const previewName = contact.name?.trim() || `Contact ${idx + 1}`;
  const previewTitle = contact.company_title?.trim() || "\u2014";
  const cc = (contact.country && contact.country.trim()) || workshopCountry;

  return (
    <View style={styles.contactCard}>
      <TouchableOpacity
        style={styles.contactHeader}
        onPress={onToggleOpen}
        testID={`contact-toggle-${idx}`}
      >
        <TouchableOpacity
          onPress={onMakePrimary}
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
            {isPrimary ? "  \u00b7  PRIMARY" : ""}
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
            value={contact.name || ""}
            onChangeText={(v) => onUpdate({ name: v })}
            placeholder="Full name"
            placeholderTextColor={theme.textMuted}
            style={styles.input}
          />
          <Text style={styles.formLabel}>COMPANY TITLE</Text>
          <TextInput
            testID={`contact-title-${idx}`}
            value={contact.company_title || ""}
            onChangeText={(v) => onUpdate({ company_title: v })}
            placeholder="e.g. Production Manager"
            placeholderTextColor={theme.textMuted}
            style={styles.input}
          />
          <Text style={styles.formLabel}>COUNTRY OVERRIDE (OPTIONAL)</Text>
          <Text style={styles.contactInlineHint}>
            Leave blank to use the workshop&apos;s country ({workshopCountry}).
          </Text>
          <TextInput
            testID={`contact-country-${idx}`}
            value={contact.country || ""}
            onChangeText={(v) =>
              onUpdate({ country: v.toUpperCase().slice(0, 2) })
            }
            autoCapitalize="characters"
            maxLength={2}
            placeholder={workshopCountry}
            placeholderTextColor={theme.textMuted}
            style={styles.input}
          />
          <Text style={styles.formLabel}>
            MOBILE NUMBER ({dialCodeFor(cc) || "+?"})
          </Text>
          <TextInput
            testID={`contact-mobile-${idx}`}
            value={contact.mobile_number || ""}
            onChangeText={(v) => onPhoneChange("mobile_number", v)}
            keyboardType="phone-pad"
            placeholder="Mobile number"
            placeholderTextColor={theme.textMuted}
            style={styles.input}
          />
          <Text style={styles.formLabel}>WHATSAPP NUMBER</Text>
          <TextInput
            testID={`contact-whatsapp-${idx}`}
            value={contact.whatsapp_number || ""}
            onChangeText={(v) => onPhoneChange("whatsapp_number", v)}
            keyboardType="phone-pad"
            placeholder="WhatsApp number"
            placeholderTextColor={theme.textMuted}
            style={styles.input}
          />
          <Text style={styles.formLabel}>WECHAT ID</Text>
          <TextInput
            testID={`contact-wechat-${idx}`}
            value={contact.wechat_id || ""}
            onChangeText={(v) => onUpdate({ wechat_id: v })}
            autoCapitalize="none"
            placeholder="e.g. anna_atelier_88"
            placeholderTextColor={theme.textMuted}
            style={styles.input}
          />
          <Text style={styles.formLabel}>EMAIL</Text>
          <TextInput
            testID={`contact-email-${idx}`}
            value={contact.email || ""}
            onChangeText={(v) => onUpdate({ email: v })}
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
                value={contact.other_label || ""}
                onChangeText={(v) => onUpdate({ other_label: v })}
                placeholder="LinkedIn"
                placeholderTextColor={theme.textMuted}
                style={styles.input}
              />
            </View>
            <View style={{ flex: 1, marginLeft: 6 }}>
              <Text style={styles.formLabel}>OTHER VALUE</Text>
              <TextInput
                testID={`contact-other-value-${idx}`}
                value={contact.other_value || ""}
                onChangeText={(v) => onUpdate({ other_value: v })}
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
}

export default ContactCard;
