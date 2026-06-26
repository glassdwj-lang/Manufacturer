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

import { CadFile } from "@/src/api/client";
import { theme, spacing } from "@/src/theme";
import { notify } from "@/src/utils/confirm";

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

export type EmailKind = "cad" | "igi" | "customs" | "airway_bill";

export type EmailSendResult = {
  ok: boolean;
  recipients: string[];
  file_count: number;
  provider_id: string | null;
};

const KIND_LABELS: Record<EmailKind, { title: string; noun: string; subjectPrefix: string }> = {
  cad: {
    title: "EMAIL CAD FILES",
    noun: "CAD file",
    subjectPrefix: "CAD files",
  },
  igi: {
    title: "EMAIL IGI CERTIFICATES",
    noun: "certificate",
    subjectPrefix: "IGI certificates",
  },
  customs: {
    title: "EMAIL CUSTOMS DOCS",
    noun: "customs file",
    subjectPrefix: "Customs documents",
  },
  airway_bill: {
    title: "EMAIL AIRWAY BILL",
    noun: "airway-bill file",
    subjectPrefix: "Airway bill",
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
  const [recipients, setRecipients] = useState<string[]>([]);
  const [draft, setDraft] = useState("");
  const [subject, setSubject] = useState("");
  const [message, setMessage] = useState("");
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [sending, setSending] = useState(false);

  const labels = KIND_LABELS[kind];

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
  }, [visible, files]);

  const allSelected = selectedIds.size === files.length && files.length > 0;
  const subjectPlaceholder = useMemo(() => {
    if (jewelryName) return `${labels.subjectPrefix} — ${jewelryName}`;
    return `Optional subject (defaults to ${labels.subjectPrefix} for commission)`;
  }, [jewelryName, labels.subjectPrefix]);

  const tryCommitDraft = (value: string): boolean => {
    const v = value.trim().replace(/[,;]+$/, "");
    if (!v) return false;
    if (!EMAIL_RE.test(v)) {
      notify(
        "Invalid email",
        `"${v}" doesn't look like a valid email address.`,
      );
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
      notify("Add a recipient", "Enter at least one email address.");
      return;
    }
    if (selectedIds.size === 0) {
      notify("Select files", `Pick at least one ${labels.noun} to forward.`);
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
        "Email sent",
        `Forwarded ${result.file_count} ${labels.noun}${result.file_count === 1 ? "" : "s"} to ${result.recipients.length} recipient${result.recipients.length === 1 ? "" : "s"}.`,
      );
      onSent?.(result);
      onClose();
    } catch (err: any) {
      notify("Send failed", err?.message || "Could not forward files.");
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
            <Text style={styles.headerTitle}>{labels.title}</Text>
            <View style={{ width: 22 }} />
          </View>

          <ScrollView
            contentContainerStyle={{ padding: spacing.lg, paddingBottom: spacing.xxl }}
            keyboardShouldPersistTaps="handled"
          >
            {/* Recipients */}
            <Text style={styles.label}>TO</Text>
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
                    ? "name@example.com (press Enter)"
                    : "add another…"
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
              Tap a chip to remove. Press Enter, space or comma to add another.
            </Text>

            {/* Subject */}
            <Text style={[styles.label, { marginTop: spacing.lg }]}>
              SUBJECT
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
              MESSAGE
            </Text>
            <TextInput
              value={message}
              onChangeText={setMessage}
              placeholder="Optional note shown above the file list…"
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
                FILES TO INCLUDE ({selectedIds.size}/{files.length})
              </Text>
              <TouchableOpacity onPress={toggleAll} testID="files-toggle-all">
                <Text style={styles.toggleAllText}>
                  {allSelected ? "DESELECT ALL" : "SELECT ALL"}
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
              Recipients receive clickable download links pointing to the
              files on Cloudinary. Nothing is attached, so very large
              files forward without issue.
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
                  <Text style={styles.sendBtnText}>SEND EMAIL</Text>
                </>
              )}
            </TouchableOpacity>
          </View>
        </KeyboardAvoidingView>
      </SafeAreaView>
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
