/**
 * EmailFilesModal — generic chip-recipient composer for forwarding any
 * Cloudinary-hosted file collection via Resend. Currently powers CAD
 * files, IGI certificates, and customs / airway-bill docs — the only
 * thing that varies per surface is the API endpoint and the kind label
 * shown in the header.
 *
 * UX choices
 * ----------
 * • Recipients use a chip input: type an address, hit Enter / space /
 *   comma to commit. Tap a chip to remove. This avoids the ambiguity
 *   of comma-separated free text and shows the user exactly who will
 *   receive the email before they hit send.
 * • Subject and message are both optional with quiet placeholders so
 *   the form doesn't feel mandatory.
 * • Files are listed with checkboxes, defaulting to all-selected.
 *   Tap to toggle individual files; a header chip lets the user
 *   "Select all" / "Deselect all" in one tap.
 * • The send action is the only primary CTA. It locks while the
 *   request is in flight and surfaces server-side error messages
 *   verbatim so configuration problems are visible.
 */
import React, { useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { SafeAreaView } from "react-native-safe-area-context";

import { api, CadFile, User } from "@/src/api/client";
import { theme, spacing } from "@/src/theme";
import { notify } from "@/src/utils/confirm";
import { useI18n } from "@/src/i18n";

/** Minimum file shape needed by the modal. Compatible with `CadFile`,
 *  `CustomsFile`, and any other Cloudinary-backed record. */
export type EmailFile = Pick<CadFile, "id" | "name"> & {
  bytes?: number | null;
};

// RFC-5322 light: just enough to catch obvious typos. The server
// re-validates so we never trust this fully.
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function formatBytes(b?: number | null): string {
  if (!b && b !== 0) return "";
  if (b < 1024) return `${b} B`;
  if (b < 1024 * 1024) return `${(b / 1024).toFixed(1)} KB`;
  if (b < 1024 * 1024 * 1024) return `${(b / (1024 * 1024)).toFixed(1)} MB`;
  return `${(b / (1024 * 1024 * 1024)).toFixed(2)} GB`;
}

export type EmailKind = "cad" | "igi" | "customs" | "airway_bill" | "step_photos";

export type EmailSendResult = {
  ok: boolean;
  recipients: string[];
  file_count: number;
  provider_id: string | null;
};

const KIND_LABELS: Record<EmailKind, { titleKey: any; nounKey: any; subjectPrefixKey: any }> = {
  cad: {
    titleKey: "email.title.cad",
    nounKey: "email.noun.cad",
    subjectPrefixKey: "email.subject_prefix.cad",
  },
  igi: {
    titleKey: "email.title.igi",
    nounKey: "email.noun.igi",
    subjectPrefixKey: "email.subject_prefix.igi",
  },
  customs: {
    titleKey: "email.title.customs",
    nounKey: "email.noun.customs",
    subjectPrefixKey: "email.subject_prefix.customs",
  },
  airway_bill: {
    titleKey: "email.title.airway_bill",
    nounKey: "email.noun.airway_bill",
    subjectPrefixKey: "email.subject_prefix.airway_bill",
  },
  step_photos: {
    titleKey: "email.title.step_photos",
    nounKey: "email.noun.step_photos",
    subjectPrefixKey: "email.subject_prefix.step_photos",
  },
};

export interface EmailFilesModalProps {
  visible: boolean;
  kind: EmailKind;
  files: EmailFile[];
  /** Used for the placeholder subject line, e.g. "Heritage Ring". */
  jewelryName?: string | null;
  /** Concrete API call. Returns the provider response on success. */
  send: (payload: {
    recipients: string[];
    file_ids: string[];
    subject: string | null;
    message: string | null;
  }) => Promise<EmailSendResult>;
  onClose: () => void;
  onSent?: (info: EmailSendResult) => void;
}

export function EmailFilesModal({
  visible,
  kind,
  files,
  jewelryName,
  send,
  onClose,
  onSent,
}: EmailFilesModalProps) {
  const { t } = useI18n();
  const [recipients, setRecipients] = useState<string[]>([]);
  const [draft, setDraft] = useState("");
  const [subject, setSubject] = useState("");
  const [message, setMessage] = useState("");
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [sending, setSending] = useState(false);
  // Directory picker state — lazy-loaded the first time the sheet opens.
  const [directoryOpen, setDirectoryOpen] = useState(false);
  const [directoryUsers, setDirectoryUsers] = useState<User[] | null>(null);
  const [directoryLoading, setDirectoryLoading] = useState(false);
  const [directoryQuery, setDirectoryQuery] = useState("");

  const labels = KIND_LABELS[kind];
  const nounText = t(labels.nounKey);
  const subjectPrefixText = t(labels.subjectPrefixKey);

  // Reset state every time the sheet opens so a previous send doesn't
  // leak into the next.
  useEffect(() => {
    if (!visible) return;
    setRecipients([]);
    setDraft("");
    setSubject("");
    setMessage("");
    setSelectedIds(new Set(files.map((f) => f.id)));
    setSending(false);
    setDirectoryOpen(false);
    setDirectoryQuery("");
  }, [visible, files]);

  // ---- Directory picker -----------------------------------------------------
  // Lazy-fetch the vendor roster (manufacturers + CAD/render vendors) the
  // first time the picker opens. Cached for the lifetime of the modal.
  const openDirectory = async () => {
    setDirectoryOpen(true);
    if (directoryUsers) return;
    try {
      setDirectoryLoading(true);
      const [mfg, cad] = await Promise.all([
        api.listUsers("manufacturer"),
        api.listUsers("cad_renderer"),
      ]);
      // Sort by role-then-name so workshops + vendors are visually grouped.
      const merged = [...mfg, ...cad].sort((a, b) =>
        a.role === b.role
          ? (a.name || a.email).localeCompare(b.name || b.email)
          : a.role.localeCompare(b.role),
      );
      setDirectoryUsers(merged);
    } catch (err: any) {
      notify("Directory error", err?.message || "Could not load directory.");
      setDirectoryOpen(false);
    } finally {
      setDirectoryLoading(false);
    }
  };

  const addEmailsFromUser = (u: User) => {
    // Pull the primary email plus any contact-roster emails (Phase 1 vendor
    // records keep the same 3-slot contacts roster as workshops).
    const candidates: string[] = [u.email];
    const contacts = (u as any).contacts as
      | { email?: string | null }[]
      | undefined;
    if (Array.isArray(contacts)) {
      for (const c of contacts) {
        const e = (c.email || "").trim();
        if (e) candidates.push(e);
      }
    }
    setRecipients((prev) => {
      const next = [...prev];
      for (const raw of candidates) {
        const v = raw.trim();
        if (!v || !EMAIL_RE.test(v)) continue;
        if (next.some((r) => r.toLowerCase() === v.toLowerCase())) continue;
        next.push(v);
      }
      return next;
    });
  };

  const allSelected = selectedIds.size === files.length && files.length > 0;
  const subjectPlaceholder = useMemo(() => {
    if (jewelryName)
      return t("email.subject.placeholder_with_jewel", { prefix: subjectPrefixText, name: jewelryName });
    return t("email.subject.placeholder_generic", { prefix: subjectPrefixText });
  }, [jewelryName, subjectPrefixText, t]);

  const tryCommitDraft = (value: string): boolean => {
    const v = value.trim().replace(/[,;]+$/, "");
    if (!v) return false;
    if (!EMAIL_RE.test(v)) {
      notify(t("email.error.invalid_email"), t("email.error.invalid_email_msg", { value: v }));
      return false;
    }
    if (recipients.some((r) => r.toLowerCase() === v.toLowerCase())) {
      setDraft("");
      return true;
    }
    setRecipients((prev) => [...prev, v]);
    setDraft("");
    return true;
  };

  const handleDraftChange = (text: string) => {
    // Auto-commit on comma, semicolon, or whitespace separators.
    if (/[,;\s]$/.test(text)) {
      if (tryCommitDraft(text)) return;
    }
    setDraft(text);
  };

  const removeRecipient = (email: string) =>
    setRecipients((prev) => prev.filter((r) => r !== email));

  const toggleFile = (id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const toggleAll = () => {
    if (allSelected) setSelectedIds(new Set());
    else setSelectedIds(new Set(files.map((f) => f.id)));
  };

  const handleSend = async () => {
    // Commit any draft text the user forgot to confirm.
    let finalRecipients = recipients;
    if (draft.trim()) {
      const committed = tryCommitDraft(draft);
      if (!committed) return;
      finalRecipients = [...recipients];
      const v = draft.trim().replace(/[,;]+$/, "");
      if (
        v &&
        EMAIL_RE.test(v) &&
        !finalRecipients.some((r) => r.toLowerCase() === v.toLowerCase())
      ) {
        finalRecipients.push(v);
      }
    }
    if (finalRecipients.length === 0) {
      notify(t("email.error.no_recipient_title"), t("email.error.no_recipient_msg"));
      return;
    }
    if (selectedIds.size === 0) {
      notify(t("email.error.no_files_title"), t("email.error.no_files_msg", { noun: nounText }));
      return;
    }

    try {
      setSending(true);
      const result = await send({
        recipients: finalRecipients,
        file_ids: Array.from(selectedIds),
        subject: subject.trim() || null,
        message: message.trim() || null,
      });
      notify(
        t("email.success.title"),
        t("email.success.msg", {
          fileCount: result.file_count,
          noun: nounText,
          ps: result.file_count === 1 ? "" : "s",
          recipCount: result.recipients.length,
          rs: result.recipients.length === 1 ? "" : "s",
        }),
      );
      onSent?.(result);
      onClose();
    } catch (err: any) {
      notify(t("email.error.send_title"), err?.message || t("email.error.send_msg"));
    } finally {
      setSending(false);
    }
  };

  return (
    <Modal
      visible={visible}
      animationType="slide"
      presentationStyle="formSheet"
      onRequestClose={onClose}
    >
      <SafeAreaView style={styles.safe} edges={["top", "bottom"]}>
        <KeyboardAvoidingView
          style={{ flex: 1 }}
          behavior={Platform.OS === "ios" ? "padding" : undefined}
        >
          <View style={styles.header}>
            <TouchableOpacity
              onPress={onClose}
              disabled={sending}
              testID="email-modal-close"
            >
              <Ionicons name="close" size={22} color={theme.textPrimary} />
            </TouchableOpacity>
            <Text style={styles.headerTitle}>{t(labels.titleKey)}</Text>
            <View style={{ width: 22 }} />
          </View>

          <ScrollView
            contentContainerStyle={{ padding: spacing.lg, paddingBottom: spacing.xxl }}
            keyboardShouldPersistTaps="handled"
          >
            {/* Recipients */}
            <Text style={styles.label}>{t("email.field.to")}</Text>
            <View style={styles.chipWrap}>
              {recipients.map((r) => (
                <TouchableOpacity
                  key={r}
                  style={styles.chip}
                  onPress={() => removeRecipient(r)}
                  testID={`recipient-chip-${r}`}
                >
                  <Text style={styles.chipText} numberOfLines={1}>
                    {r}
                  </Text>
                  <Ionicons name="close" size={12} color={theme.primary} />
                </TouchableOpacity>
              ))}
              <TextInput
                value={draft}
                onChangeText={handleDraftChange}
                onSubmitEditing={() => tryCommitDraft(draft)}
                onBlur={() => {
                  if (draft.trim()) tryCommitDraft(draft);
                }}
                placeholder={
                  recipients.length === 0
                    ? t("email.recipient.placeholder_first")
                    : t("email.recipient.placeholder_more")
                }
                placeholderTextColor={theme.textMuted}
                autoCapitalize="none"
                autoCorrect={false}
                keyboardType="email-address"
                style={styles.chipInput}
                testID="recipient-input"
                returnKeyType="done"
                blurOnSubmit={false}
              />
            </View>
            <Text style={styles.helper}>
              {t("email.recipient.helper")}
            </Text>
            <TouchableOpacity
              testID="email-directory-picker"
              onPress={openDirectory}
              style={styles.directoryBtn}
            >
              <Ionicons name="book-outline" size={14} color={theme.primary} />
              <Text style={styles.directoryBtnText}>
                {t("email.directory.button")}
              </Text>
            </TouchableOpacity>

            {/* Subject */}
            <Text style={[styles.label, { marginTop: spacing.lg }]}>
              {t("email.field.subject")}
            </Text>
            <TextInput
              value={subject}
              onChangeText={setSubject}
              placeholder={subjectPlaceholder}
              placeholderTextColor={theme.textMuted}
              style={styles.input}
              testID="email-subject-input"
            />

            {/* Message */}
            <Text style={[styles.label, { marginTop: spacing.lg }]}>
              {t("email.field.message")}
            </Text>
            <TextInput
              value={message}
              onChangeText={setMessage}
              placeholder={t("email.message.placeholder")}
              placeholderTextColor={theme.textMuted}
              multiline
              numberOfLines={4}
              style={[styles.input, styles.inputMultiline]}
              textAlignVertical="top"
              testID="email-message-input"
            />

            {/* Files */}
            <View style={styles.filesHeader}>
              <Text style={[styles.label, { marginBottom: 0 }]}>
                {t("email.field.files", { selected: selectedIds.size, total: files.length })}
              </Text>
              <TouchableOpacity onPress={toggleAll} testID="files-toggle-all">
                <Text style={styles.toggleAllText}>
                  {allSelected ? t("email.toggle.deselect_all") : t("email.toggle.select_all")}
                </Text>
              </TouchableOpacity>
            </View>
            <View style={styles.fileList}>
              {files.map((f) => {
                const checked = selectedIds.has(f.id);
                return (
                  <Pressable
                    key={f.id}
                    style={styles.fileRow}
                    onPress={() => toggleFile(f.id)}
                    testID={`email-file-${f.id}`}
                  >
                    <View
                      style={[
                        styles.checkbox,
                        checked && styles.checkboxOn,
                      ]}
                    >
                      {checked && (
                        <Ionicons name="checkmark" size={14} color="#0A0A0A" />
                      )}
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text style={styles.fileName} numberOfLines={2}>
                        {f.name}
                      </Text>
                      {f.bytes ? (
                        <Text style={styles.fileMeta}>{formatBytes(f.bytes)}</Text>
                      ) : null}
                    </View>
                  </Pressable>
                );
              })}
            </View>

            <Text style={styles.disclaimer}>
              {t("email.disclaimer")}
            </Text>
          </ScrollView>

          <View style={styles.footer}>
            <TouchableOpacity
              onPress={handleSend}
              disabled={sending}
              style={[styles.sendBtn, sending && styles.sendBtnDim]}
              testID="email-send-button"
            >
              {sending ? (
                <ActivityIndicator color="#0A0A0A" />
              ) : (
                <>
                  <Ionicons name="paper-plane-outline" size={16} color="#0A0A0A" />
                  <Text style={styles.sendBtnText}>{t("email.send")}</Text>
                </>
              )}
            </TouchableOpacity>
          </View>
        </KeyboardAvoidingView>
      </SafeAreaView>

      {/* Directory picker sub-modal — shows manufacturers + CAD/render
          vendors. Tap a row to add the user's primary email (and any
          contact-roster emails) to the chips above. */}
      <Modal
        visible={directoryOpen}
        animationType="slide"
        presentationStyle="formSheet"
        onRequestClose={() => setDirectoryOpen(false)}
      >
        <SafeAreaView style={styles.safe} edges={["top", "bottom"]}>
          <View style={styles.header}>
            <TouchableOpacity onPress={() => setDirectoryOpen(false)}>
              <Ionicons name="close" size={22} color={theme.textPrimary} />
            </TouchableOpacity>
            <Text style={styles.headerTitle}>{t("email.directory.title")}</Text>
            <View style={{ width: 22 }} />
          </View>
          <View style={{ paddingHorizontal: spacing.lg, paddingTop: spacing.md }}>
            <TextInput
              value={directoryQuery}
              onChangeText={setDirectoryQuery}
              placeholder={t("email.directory.search")}
              placeholderTextColor={theme.textMuted}
              autoCapitalize="none"
              autoCorrect={false}
              style={styles.input}
              testID="directory-search"
            />
          </View>
          <ScrollView contentContainerStyle={{ padding: spacing.lg }}>
            {directoryLoading ? (
              <View style={{ paddingVertical: spacing.xxl }}>
                <ActivityIndicator color={theme.primary} />
              </View>
            ) : (
              (directoryUsers || [])
                .filter((u) => {
                  const q = directoryQuery.trim().toLowerCase();
                  if (!q) return true;
                  const alias = ((u as any).alias as string | undefined) || "";
                  return (
                    (u.name || "").toLowerCase().includes(q) ||
                    u.email.toLowerCase().includes(q) ||
                    alias.toLowerCase().includes(q)
                  );
                })
                .map((u) => {
                  const alias = ((u as any).alias as string | undefined) || "";
                  const contactCount = Array.isArray((u as any).contacts)
                    ? ((u as any).contacts as { email?: string | null }[]).filter(
                        (c) => (c.email || "").trim().length > 0,
                      ).length
                    : 0;
                  return (
                    <Pressable
                      key={u.id}
                      style={styles.dirRow}
                      onPress={() => {
                        addEmailsFromUser(u);
                        setDirectoryOpen(false);
                      }}
                      testID={`directory-user-${u.id}`}
                    >
                      <View
                        style={[
                          styles.dirRoleBadge,
                          u.role === "cad_renderer" && styles.dirRoleBadgeAlt,
                        ]}
                      >
                        <Text style={styles.dirRoleBadgeText}>
                          {u.role === "cad_renderer" ? "CAD" : "WS"}
                        </Text>
                      </View>
                      <View style={{ flex: 1 }}>
                        <Text style={styles.dirName} numberOfLines={1}>
                          {u.name || u.email}
                        </Text>
                        <Text style={styles.dirMeta} numberOfLines={1}>
                          {alias ? `${alias} • ` : ""}
                          {u.email}
                          {contactCount > 0
                            ? ` • +${contactCount} contact${contactCount === 1 ? "" : "s"}`
                            : ""}
                        </Text>
                      </View>
                      <Ionicons
                        name="add-circle-outline"
                        size={20}
                        color={theme.primary}
                      />
                    </Pressable>
                  );
                })
            )}
            {!directoryLoading && (directoryUsers || []).length === 0 && (
              <Text style={styles.emptyDir}>
                {t("email.directory.empty")}
              </Text>
            )}
          </ScrollView>
        </SafeAreaView>
      </Modal>
    </Modal>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: theme.bg || theme.background },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: theme.border,
  },
  headerTitle: {
    color: theme.textPrimary,
    fontSize: 13,
    letterSpacing: 4,
    fontWeight: "600",
  },
  label: {
    color: theme.textMuted,
    fontSize: 10,
    letterSpacing: 2.5,
    fontWeight: "700",
    marginBottom: spacing.sm,
  },
  chipWrap: {
    flexDirection: "row",
    flexWrap: "wrap",
    alignItems: "center",
    borderWidth: 1,
    borderColor: theme.border,
    padding: 6,
    gap: 6,
    minHeight: 44,
  },
  chip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderWidth: 1,
    borderColor: theme.primary,
    backgroundColor: "rgba(184,115,51,0.08)",
    borderRadius: 4,
  },
  chipText: {
    color: theme.primary,
    fontSize: 12,
    fontWeight: "600",
    maxWidth: 200,
  },
  chipInput: {
    flexGrow: 1,
    minWidth: 160,
    color: theme.textPrimary,
    fontSize: 13,
    paddingHorizontal: 6,
    paddingVertical: 6,
  },
  helper: {
    color: theme.textMuted,
    fontSize: 11,
    marginTop: 6,
    lineHeight: 16,
  },
  directoryBtn: {
    flexDirection: "row",
    alignItems: "center",
    alignSelf: "flex-start",
    gap: 6,
    marginTop: spacing.sm,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderWidth: 1,
    borderColor: theme.primary,
  },
  directoryBtnText: {
    color: theme.primary,
    fontSize: 10,
    fontWeight: "700",
    letterSpacing: 2,
  },
  dirRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    paddingVertical: spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: theme.border,
  },
  dirRoleBadge: {
    width: 36,
    paddingVertical: 4,
    borderWidth: 1,
    borderColor: theme.primary,
    alignItems: "center",
    justifyContent: "center",
  },
  dirRoleBadgeAlt: {
    borderColor: "#9BB0FF",
  },
  dirRoleBadgeText: {
    color: theme.primary,
    fontSize: 9,
    fontWeight: "700",
    letterSpacing: 1.5,
  },
  dirName: {
    color: theme.textPrimary,
    fontSize: 13,
    fontWeight: "600",
  },
  dirMeta: {
    color: theme.textMuted,
    fontSize: 11,
    marginTop: 2,
  },
  emptyDir: {
    color: theme.textMuted,
    fontSize: 12,
    textAlign: "center",
    paddingVertical: spacing.xxl,
    lineHeight: 18,
  },
  input: {
    borderWidth: 1,
    borderColor: theme.border,
    color: theme.textPrimary,
    paddingHorizontal: spacing.md,
    paddingVertical: 10,
    fontSize: 13,
    minHeight: 44,
  },
  inputMultiline: { minHeight: 96 },
  filesHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginTop: spacing.lg,
    marginBottom: spacing.sm,
  },
  toggleAllText: {
    color: theme.primary,
    fontSize: 10,
    letterSpacing: 2,
    fontWeight: "700",
  },
  fileList: {
    borderTopWidth: 1,
    borderTopColor: theme.border,
  },
  fileRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    paddingVertical: spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: theme.border,
  },
  checkbox: {
    width: 22,
    height: 22,
    borderWidth: 1.5,
    borderColor: theme.border,
    alignItems: "center",
    justifyContent: "center",
  },
  checkboxOn: {
    backgroundColor: theme.primary,
    borderColor: theme.primary,
  },
  fileName: { color: theme.textPrimary, fontSize: 13, fontWeight: "500" },
  fileMeta: { color: theme.textMuted, fontSize: 11, marginTop: 2 },
  disclaimer: {
    marginTop: spacing.lg,
    color: theme.textMuted,
    fontSize: 11,
    lineHeight: 16,
  },
  footer: {
    borderTopWidth: 1,
    borderTopColor: theme.border,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    backgroundColor: theme.bg || theme.background,
  },
  sendBtn: {
    backgroundColor: theme.primary,
    paddingVertical: 14,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
  },
  sendBtnDim: { opacity: 0.6 },
  sendBtnText: {
    color: "#0A0A0A",
    fontSize: 12,
    fontWeight: "700",
    letterSpacing: 3,
  },
});

export default EmailFilesModal;
