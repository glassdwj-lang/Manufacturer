import React, { useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Modal,
  Platform,
  StyleSheet,
  Switch,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { api } from "@/src/api/client";
import { theme, spacing } from "@/src/theme";

export interface DigitalDnaModalProps {
  visible: boolean;
  orderId: string;
  orderRef: string;
  onClose: () => void;
}

/**
 * Self-contained options sheet for the "VIEW DIGITAL DNA" button. Lets the
 * user toggle whether the generated PDF should embed manufacturer notes and
 * thumbnail photos, then downloads/opens the file in a new tab.
 */
export function DigitalDnaModal({ visible, orderId, orderRef, onClose }: DigitalDnaModalProps) {
  const [includeNotes, setIncludeNotes] = useState(false);
  const [includePhotos, setIncludePhotos] = useState(false);
  const [generating, setGenerating] = useState(false);

  // Reset toggles whenever the sheet opens.
  React.useEffect(() => {
    if (visible) {
      setIncludeNotes(false);
      setIncludePhotos(false);
    }
  }, [visible]);

  const handleGenerate = async () => {
    setGenerating(true);
    try {
      const blob = await api.fetchDigitalDna(orderId, {
        includeNotes,
        includePhotos,
      });
      const suffix = [
        includeNotes ? "notes" : null,
        includePhotos ? "photos" : null,
      ]
        .filter(Boolean)
        .join("-");
      const filename = `Somnio.Co-DigitalDNA-${orderRef}${suffix ? "-" + suffix : ""}.pdf`;
      if (Platform.OS === "web") {
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.target = "_blank";
        a.rel = "noopener,noreferrer";
        a.download = filename;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        setTimeout(() => URL.revokeObjectURL(url), 60_000);
      } else {
        const reader = new FileReader();
        reader.onload = () => {
          const dataUrl = reader.result as string;
          import("expo-linking").then(({ openURL }) => openURL(dataUrl));
        };
        reader.readAsDataURL(blob);
      }
      onClose();
    } catch (e) {
      Alert.alert(
        "Digital DNA",
        e instanceof Error ? e.message : "Failed to load certificate"
      );
      console.warn("digital dna error", e);
    } finally {
      setGenerating(false);
    }
  };

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <View style={styles.backdrop}>
        <View style={styles.card}>
          <Text style={styles.eyebrow}>DIGITAL DNA · OPTIONS</Text>
          <Text style={styles.title}>Generate certificate</Text>
          <Text style={styles.sub}>
            Choose what to embed alongside the localized 26-step journey.
          </Text>

          <View style={styles.row}>
            <View style={{ flex: 1 }}>
              <Text style={styles.rowTitle}>Include notes</Text>
              <Text style={styles.rowSub}>
                Atelier notes per completed step (auto-translated).
              </Text>
            </View>
            <Switch
              testID="dna-toggle-notes"
              value={includeNotes}
              onValueChange={setIncludeNotes}
              trackColor={{ false: theme.border, true: theme.primary }}
              thumbColor={Platform.OS === "android" ? "#0A0A0A" : undefined}
            />
          </View>

          <View style={styles.row}>
            <View style={{ flex: 1 }}>
              <Text style={styles.rowTitle}>Include thumbnails</Text>
              <Text style={styles.rowSub}>
                Up to two small photos per step. Larger file size.
              </Text>
            </View>
            <Switch
              testID="dna-toggle-photos"
              value={includePhotos}
              onValueChange={setIncludePhotos}
              trackColor={{ false: theme.border, true: theme.primary }}
              thumbColor={Platform.OS === "android" ? "#0A0A0A" : undefined}
            />
          </View>

          <View style={styles.actions}>
            <TouchableOpacity
              testID="dna-cancel"
              style={styles.ghost}
              onPress={onClose}
              disabled={generating}
            >
              <Text style={styles.ghostText}>CANCEL</Text>
            </TouchableOpacity>
            <TouchableOpacity
              testID="dna-generate"
              style={[styles.primary, generating && { opacity: 0.6 }]}
              onPress={handleGenerate}
              disabled={generating}
            >
              {generating ? (
                <ActivityIndicator color="#0A0A0A" />
              ) : (
                <Text style={styles.primaryText}>GENERATE PDF</Text>
              )}
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.7)",
    justifyContent: "center",
    alignItems: "center",
    padding: spacing.lg,
  },
  card: {
    width: "100%",
    maxWidth: 420,
    backgroundColor: theme.surface,
    borderWidth: 1,
    borderColor: theme.border,
    padding: spacing.lg,
  },
  eyebrow: { color: theme.primary, fontSize: 10, letterSpacing: 2 },
  title: { color: theme.textPrimary, fontSize: 20, fontWeight: "300", marginTop: 6 },
  sub: { color: theme.textSecondary, fontSize: 12, marginTop: 6, lineHeight: 18 },
  row: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: spacing.md,
    borderTopWidth: 1,
    borderTopColor: theme.border,
    marginTop: spacing.md,
  },
  rowTitle: { color: theme.textPrimary, fontSize: 14 },
  rowSub: { color: theme.textMuted, fontSize: 11, marginTop: 2, lineHeight: 15 },
  actions: { flexDirection: "row", gap: spacing.sm, marginTop: spacing.lg },
  ghost: {
    flex: 1,
    paddingVertical: spacing.md,
    borderWidth: 1,
    borderColor: theme.border,
    alignItems: "center",
  },
  ghostText: { color: theme.textSecondary, fontSize: 11, letterSpacing: 2 },
  primary: {
    flex: 2,
    paddingVertical: spacing.md,
    backgroundColor: theme.primary,
    alignItems: "center",
    justifyContent: "center",
    minHeight: 44,
  },
  primaryText: { color: "#0A0A0A", fontSize: 11, letterSpacing: 2, fontWeight: "700" },
});
