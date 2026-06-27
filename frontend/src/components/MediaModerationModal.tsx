/**
 * MediaModerationModal — shown when an Admin / Associate taps HOLD or
 * REJECT on a media-approval row. Pre-fills a courteous (hold) or stern
 * (reject) email body addressed to the original uploader (manufacturer)
 * and, on send, the backend atomically performs the underlying hold /
 * reject mutation so the queue stays in sync.
 *
 * The REJECT variant always includes a hard 24-hour deadline computed
 * from `now`, displayed prominently in both the modal UI and the email
 * body the manufacturer receives.
 */
import React, { useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  Image,
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
import { theme, spacing } from "@/src/theme";
import { api } from "@/src/api/client";
import { isVideoUrl } from "@/src/api/cloudinaryUpload";

export type ModerationKind = "hold" | "reject";

/** What is being moderated — drives the API endpoint, copy + meta rows. */
export type ModerationMode = "step" | "render";

export type ModerationTarget = {
  order_id: string;
  order_ref: string;
  jewelry_name: string;
  /** Step photo only — ignored when mode === "render". */
  step_number?: number;
  step_title?: string;
  photo_url: string;
  manufacturer_email?: string;
  manufacturer_name?: string;
  /** Render only — the render's UUID and filename when mode === "render". */
  render_id?: string;
  render_name?: string;
};

/** Build the default email body (recipient sees this verbatim). The HOLD
 *  copy is soft — "please redo or re-select". The REJECT copy is firm and
 *  carries a 24-hour replacement deadline computed from the local clock. */
function defaultBody(
  kind: ModerationKind,
  mode: ModerationMode,
  target: ModerationTarget,
  sentAtLocal: string,
  deadlineLocal: string,
): string {
  const nameLine = target.manufacturer_name
    ? `Hi ${target.manufacturer_name},`
    : "Hi,";
  let stepLine: string;
  if (mode === "render") {
    stepLine = target.render_name
      ? `Render: ${target.render_name}`
      : "Render upload";
  } else {
    stepLine = target.step_title
      ? `Step ${String(target.step_number ?? 0).padStart(2, "0")} — ${target.step_title}`
      : `Step ${String(target.step_number ?? 0).padStart(2, "0")}`;
  }
  const commLine = `Commission: ${target.jewelry_name} (${target.order_ref})`;

  if (kind === "hold") {
    return `${nameLine}

We've placed one of your recent uploads ON HOLD. The image isn't quite
clearing our review — please either redo this shot or select an
alternative image, then upload it again so we can keep this step moving.

${stepLine}
${commLine}

Reviewed at: ${sentAtLocal}

Thank you,
Somnio Atelier — Media Review`;
  }

  // reject
  return `${nameLine}

This is to advise that one of your recent uploads has FAILED our internal
QA/QC standards. Please upload an alternative image WITHIN THE NEXT
24 HOURS — after that window the rejection is final.

${stepLine}
${commLine}

Email sent at:        ${sentAtLocal}
Replacement deadline: ${deadlineLocal}

If you have any questions, reply directly to this email.

Regards,
Somnio Atelier — Media Review`;
}

function defaultSubject(
  kind: ModerationKind,
  mode: ModerationMode,
  target: ModerationTarget,
): string {
  const tail =
    mode === "render"
      ? `Render${target.render_name ? " — " + target.render_name : ""}`
      : `Step ${String(target.step_number ?? 0).padStart(2, "0")}`;
  if (kind === "reject") {
    return `REJECTED — replacement required in 24h · ${target.jewelry_name} (${target.order_ref}) · ${tail}`;
  }
  return `On hold — please redo or re-select · ${target.jewelry_name} (${target.order_ref}) · ${tail}`;
}

function formatLocal(d: Date): string {
  // "27 Jun 2026, 19:42" — kept short for the body header line.
  const months = [
    "Jan", "Feb", "Mar", "Apr", "May", "Jun",
    "Jul", "Aug", "Sep", "Oct", "Nov", "Dec",
  ];
  const dd = String(d.getDate()).padStart(2, "0");
  const mm = months[d.getMonth()];
  const yyyy = d.getFullYear();
  const hh = String(d.getHours()).padStart(2, "0");
  const mn = String(d.getMinutes()).padStart(2, "0");
  return `${dd} ${mm} ${yyyy}, ${hh}:${mn}`;
}

export function MediaModerationModal({
  visible,
  kind,
  mode = "step",
  target,
  onClose,
  onCompleted,
}: {
  visible: boolean;
  kind: ModerationKind;
  /** Defaults to "step" for the legacy photo-moderation flow. Pass
   *  "render" to wire the modal against the renders moderation endpoint. */
  mode?: ModerationMode;
  target: ModerationTarget | null;
  onClose: () => void;
  /** Called on successful send (after the backend has also performed the
   *  underlying hold/reject mutation). Parent should refresh its queue. */
  onCompleted: (info: {
    kind: ModerationKind;
    recipient: string;
    sent_at: string;
    deadline: string | null;
  }) => void;
}) {
  // Snapshot "now" the first time the modal opens for this target so the
  // timestamps don't drift while the moderator is typing.
  const [openedAt, setOpenedAt] = useState<Date>(() => new Date());
  const [recipient, setRecipient] = useState("");
  const [subject, setSubject] = useState("");
  const [body, setBody] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!visible || !target) return;
    const now = new Date();
    setOpenedAt(now);
    setRecipient(target.manufacturer_email || "");
    setSubject(defaultSubject(kind, mode, target));
    const deadline = new Date(now.getTime() + 24 * 60 * 60 * 1000);
    setBody(
      defaultBody(kind, mode, target, formatLocal(now), formatLocal(deadline)),
    );
    setBusy(false);
    setError(null);
  }, [visible, kind, mode, target]);

  const deadlineLocal = useMemo(
    () => formatLocal(new Date(openedAt.getTime() + 24 * 60 * 60 * 1000)),
    [openedAt],
  );
  const sentAtLocal = useMemo(() => formatLocal(openedAt), [openedAt]);

  const accentColor = kind === "reject" ? "#D9362C" : "#D89A3F";
  const isReject = kind === "reject";

  const send = async () => {
    if (!target) return;
    if (!recipient.trim()) {
      setError("Please enter a recipient email.");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      if (mode === "render") {
        if (!target.render_id) {
          setError("Render id missing — cannot send.");
          setBusy(false);
          return;
        }
        const res = await api.sendRenderModerationEmail(
          target.order_id,
          target.render_id,
          {
            kind,
            recipient_email: recipient.trim(),
            subject: subject.trim() || undefined,
            message: body.trim() || undefined,
            also_action: true,
          },
        );
        onCompleted({
          kind,
          recipient: res.recipient,
          sent_at: res.sent_at,
          deadline: res.deadline,
        });
      } else {
        const res = await api.sendModerationEmail({
          order_id: target.order_id,
          step_number: target.step_number ?? 0,
          photo_url: target.photo_url,
          kind,
          recipient_email: recipient.trim(),
          subject: subject.trim() || undefined,
          message: body.trim() || undefined,
          also_action: true,
        });
        onCompleted({
          kind,
          recipient: res.recipient,
          sent_at: res.sent_at,
          deadline: res.deadline,
        });
      }
    } catch (e: any) {
      console.warn("[moderation-email]", e);
      setError(e?.message || "Failed to send. Try again.");
    } finally {
      setBusy(false);
    }
  };

  const renderPreview = () => {
    if (!target) return null;
    const isVid = isVideoUrl(target.photo_url);
    return (
      <View style={styles.previewWrap}>
        <View style={[styles.previewPill, { backgroundColor: accentColor }]}>
          <Ionicons
            name={isReject ? "close-circle" : "pause-circle"}
            size={12}
            color="#FFFFFF"
          />
          <Text style={styles.previewPillText}>
            {isReject ? "REJECTING" : "HOLDING"}
          </Text>
        </View>
        {isVid ? (
          <View style={[styles.previewImg, styles.previewVideoBox]}>
            <Ionicons name="play-circle-outline" size={36} color="#FFF" />
            <Text style={styles.previewVideoText}>VIDEO</Text>
          </View>
        ) : (
          <Image
            source={{ uri: target.photo_url }}
            style={styles.previewImg}
            resizeMode="cover"
          />
        )}
      </View>
    );
  };

  return (
    <Modal
      visible={visible}
      animationType="slide"
      transparent
      onRequestClose={() => {
        if (!busy) onClose();
      }}
    >
      <KeyboardAvoidingView
        style={styles.backdrop}
        behavior={Platform.OS === "ios" ? "padding" : undefined}
      >
        <Pressable
          style={StyleSheet.absoluteFill}
          onPress={() => {
            if (!busy) onClose();
          }}
          testID="moderation-modal-backdrop"
        />
        <View style={styles.sheet}>
          <View style={styles.headerRow}>
            <View style={[styles.kindPill, { backgroundColor: accentColor }]}>
              <Text style={styles.kindPillText}>
                {isReject ? "REJECT · 24H DEADLINE" : "HOLD · REDO REQUESTED"}
              </Text>
            </View>
            <TouchableOpacity
              onPress={() => {
                if (!busy) onClose();
              }}
              testID="moderation-modal-close"
              hitSlop={8}
            >
              <Ionicons name="close" size={22} color={theme.textPrimary} />
            </TouchableOpacity>
          </View>

          <ScrollView
            keyboardShouldPersistTaps="handled"
            contentContainerStyle={{ padding: spacing.lg, gap: spacing.md }}
          >
            <Text style={styles.title}>
              {isReject
                ? "Reject media — send 24h notice"
                : "Hold media — ask uploader to redo"}
            </Text>
            <Text style={styles.subtitle}>
              {isReject
                ? "An email will inform the uploader the image has failed our QA/QC. The manufacturer must upload a replacement within 24 hours."
                : "An email will ask the uploader to either re-shoot or pick a different image. The current image will be moved to the on-hold queue."}
            </Text>

            {renderPreview()}

            {target && (
              <View style={styles.metaCard}>
                <MetaRow label="COMMISSION" value={target.order_ref} />
                <MetaRow label="JEWELRY" value={target.jewelry_name} />
                {mode === "render" ? (
                  <MetaRow
                    label="RENDER"
                    value={target.render_name || "file"}
                  />
                ) : (
                  <MetaRow
                    label="STEP"
                    value={`${String(target.step_number ?? 0).padStart(2, "0")}${
                      target.step_title ? " · " + target.step_title : ""
                    }`}
                  />
                )}
                <MetaRow label="SENT" value={sentAtLocal} />
                {isReject && (
                  <MetaRow
                    label="DEADLINE"
                    value={deadlineLocal}
                    valueColor={accentColor}
                    bold
                  />
                )}
              </View>
            )}

            <View>
              <Text style={styles.fieldLabel}>TO</Text>
              <TextInput
                testID="moderation-modal-recipient"
                style={styles.input}
                value={recipient}
                onChangeText={setRecipient}
                keyboardType="email-address"
                autoCapitalize="none"
                autoCorrect={false}
                placeholder="recipient@example.com"
                placeholderTextColor={theme.textMuted}
              />
            </View>

            <View>
              <Text style={styles.fieldLabel}>SUBJECT</Text>
              <TextInput
                testID="moderation-modal-subject"
                style={styles.input}
                value={subject}
                onChangeText={setSubject}
              />
            </View>

            <View>
              <Text style={styles.fieldLabel}>MESSAGE</Text>
              <TextInput
                testID="moderation-modal-body"
                style={[styles.input, styles.bodyInput]}
                value={body}
                onChangeText={setBody}
                multiline
                textAlignVertical="top"
              />
            </View>

            {error && <Text style={styles.error}>{error}</Text>}
          </ScrollView>

          <View style={styles.footer}>
            <TouchableOpacity
              testID="moderation-modal-cancel"
              onPress={() => {
                if (!busy) onClose();
              }}
              style={styles.cancelBtn}
            >
              <Text style={styles.cancelText}>CANCEL</Text>
            </TouchableOpacity>
            <TouchableOpacity
              testID="moderation-modal-send"
              onPress={send}
              disabled={busy}
              style={[
                styles.primaryBtn,
                { backgroundColor: accentColor },
                busy && { opacity: 0.7 },
              ]}
            >
              {busy ? (
                <ActivityIndicator size="small" color="#FFFFFF" />
              ) : (
                <>
                  <Ionicons
                    name={isReject ? "warning" : "pause"}
                    size={14}
                    color="#FFFFFF"
                  />
                  <Text style={styles.primaryText}>
                    {isReject ? "SEND & REJECT" : "SEND & HOLD"}
                  </Text>
                </>
              )}
            </TouchableOpacity>
          </View>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

function MetaRow({
  label,
  value,
  valueColor,
  bold,
}: {
  label: string;
  value: string;
  valueColor?: string;
  bold?: boolean;
}) {
  return (
    <View style={styles.metaRow}>
      <Text style={styles.metaLabel}>{label}</Text>
      <Text
        style={[
          styles.metaValue,
          valueColor ? { color: valueColor } : null,
          bold ? { fontWeight: "700" } : null,
        ]}
        numberOfLines={2}
      >
        {value}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.72)",
    justifyContent: "flex-end",
  },
  sheet: {
    backgroundColor: theme.bg,
    maxHeight: "92%",
    borderTopWidth: 1,
    borderColor: theme.divider,
  },
  headerRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    borderBottomWidth: 1,
    borderColor: theme.divider,
  },
  kindPill: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    flexDirection: "row",
    alignItems: "center",
  },
  kindPillText: {
    color: "#FFFFFF",
    fontSize: 10,
    fontWeight: "700",
    letterSpacing: 2,
  },
  title: {
    color: theme.textPrimary,
    fontSize: 18,
    fontWeight: "600",
  },
  subtitle: {
    color: theme.textMuted,
    fontSize: 12,
    lineHeight: 18,
  },
  previewWrap: {
    position: "relative",
    backgroundColor: theme.surface,
    borderWidth: 1,
    borderColor: theme.divider,
  },
  previewImg: {
    width: "100%",
    height: 180,
    backgroundColor: "#000",
  },
  previewVideoBox: {
    alignItems: "center",
    justifyContent: "center",
  },
  previewVideoText: {
    color: "#FFF",
    fontSize: 10,
    letterSpacing: 2,
    marginTop: 4,
  },
  previewPill: {
    position: "absolute",
    top: 8,
    left: 8,
    paddingHorizontal: 8,
    paddingVertical: 4,
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    zIndex: 2,
  },
  previewPillText: {
    color: "#FFFFFF",
    fontSize: 9,
    fontWeight: "700",
    letterSpacing: 2,
  },
  metaCard: {
    backgroundColor: theme.surface,
    borderWidth: 1,
    borderColor: theme.divider,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    gap: 6,
  },
  metaRow: {
    flexDirection: "row",
    gap: 12,
    alignItems: "center",
  },
  metaLabel: {
    color: theme.textMuted,
    fontSize: 9,
    letterSpacing: 2,
    width: 90,
  },
  metaValue: {
    color: theme.textPrimary,
    fontSize: 12,
    flex: 1,
  },
  fieldLabel: {
    color: theme.textMuted,
    fontSize: 9,
    letterSpacing: 2,
    marginBottom: 4,
  },
  input: {
    backgroundColor: theme.surface,
    borderWidth: 1,
    borderColor: theme.divider,
    color: theme.textPrimary,
    paddingHorizontal: spacing.md,
    paddingVertical: 10,
    fontSize: 13,
  },
  bodyInput: {
    minHeight: 160,
  },
  error: {
    color: "#D9362C",
    fontSize: 12,
  },
  footer: {
    flexDirection: "row",
    gap: spacing.sm,
    padding: spacing.lg,
    borderTopWidth: 1,
    borderColor: theme.divider,
  },
  cancelBtn: {
    flex: 1,
    borderWidth: 1,
    borderColor: theme.divider,
    paddingVertical: 12,
    alignItems: "center",
    justifyContent: "center",
  },
  cancelText: {
    color: theme.textMuted,
    fontSize: 11,
    letterSpacing: 2,
    fontWeight: "600",
  },
  primaryBtn: {
    flex: 2,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    paddingVertical: 12,
  },
  primaryText: {
    color: "#FFFFFF",
    fontSize: 11,
    letterSpacing: 2,
    fontWeight: "700",
  },
});

export default MediaModerationModal;
