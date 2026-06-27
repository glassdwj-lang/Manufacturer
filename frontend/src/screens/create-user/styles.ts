/**
 * Shared StyleSheet for the Create / Edit User screen module.
 *
 * Lifted as-is from the original 1,044-line monolithic file so the
 * decomposed components (RoleChipRow, PhoneField, CountryPicker, etc.)
 * all render against the exact same visual tokens.
 */
import { StyleSheet } from "react-native";
import { theme, spacing } from "@/src/theme";

export const createUserStyles = StyleSheet.create({
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
  roleChipSel: {
    borderColor: theme.primary,
    backgroundColor: "rgba(212,175,55,0.08)",
  },
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
  selectorBox: {
    borderWidth: 1,
    borderColor: theme.border,
    marginTop: spacing.sm,
  },
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
  secondaryBtnText: {
    color: theme.textPrimary,
    fontSize: 12,
    fontWeight: "700",
    letterSpacing: 3,
  },
  primaryBtn: {
    flex: 1,
    backgroundColor: theme.primary,
    paddingVertical: 16,
    alignItems: "center",
  },
  primaryBtnText: {
    color: "#0A0A0A",
    fontSize: 12,
    fontWeight: "700",
    letterSpacing: 3,
  },
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
