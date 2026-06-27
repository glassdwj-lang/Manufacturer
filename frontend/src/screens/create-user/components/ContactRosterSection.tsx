/**
 * Vendor (manufacturer / cad_renderer) contact roster section. Renders
 * exactly three `ContactCard`s with the same per-row state machine
 * (expand-one-at-a-time) the original page used.
 */
import React from "react";
import { Text, View } from "react-native";
import type { ManufacturerContact, Role } from "@/src/api/client";
import { spacing } from "@/src/theme";
import { useI18n } from "@/src/i18n";
import { ContactCard } from "./ContactCard";
import { createUserStyles as styles } from "../styles";

export function ContactRosterSection({
  role,
  contacts,
  primaryContactId,
  expandedIdx,
  setExpandedIdx,
  setPrimaryContactId,
  updateContact,
  handleContactPhone,
  workshopCountry,
}: {
  role: Role;
  contacts: ManufacturerContact[];
  primaryContactId: string | null;
  expandedIdx: number;
  setExpandedIdx: (n: number) => void;
  setPrimaryContactId: (id: string | null) => void;
  updateContact: (idx: number, patch: Partial<ManufacturerContact>) => void;
  handleContactPhone: (
    idx: number,
    field: "mobile_number" | "whatsapp_number",
    value: string,
  ) => void;
  workshopCountry: string;
}) {
  const { t } = useI18n();
  return (
    <>
      <Text style={[styles.sectionTitle, { marginTop: spacing.xl }]}>
        CONTACT PEOPLE
      </Text>
      <Text style={styles.sectionHint}>
        {role === "manufacturer"
          ? t("create_user.contacts.workshop_hint")
          : t("create_user.contacts.studio_hint")}
      </Text>
      {contacts.map((c, idx) => (
        <ContactCard
          key={c.id || idx}
          idx={idx}
          contact={c}
          open={expandedIdx === idx}
          isPrimary={primaryContactId === c.id}
          workshopCountry={workshopCountry}
          onToggleOpen={() => setExpandedIdx(expandedIdx === idx ? -1 : idx)}
          onMakePrimary={() => setPrimaryContactId(c.id || null)}
          onUpdate={(patch) => updateContact(idx, patch)}
          onPhoneChange={(field, value) =>
            handleContactPhone(idx, field, value)
          }
        />
      ))}
      <View style={{ height: spacing.sm }} />
    </>
  );
}

export default ContactRosterSection;
