import React from "react";
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Linking,
  Platform,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { useLocalSearchParams } from "expo-router";

import { theme, spacing } from "@/src/theme";
import { useSafeBack } from "@/src/hooks/use-safe-back";
import { Model3DViewer } from "@/src/components/Model3DViewer";
import { BrandStrip } from "@/src/components/BrandStrip";

export default function CadPreviewScreen() {
  const params = useLocalSearchParams<{ id: string; url?: string; name?: string }>();
  const orderId = String(params.id || "");
  const safeBack = useSafeBack(`/(app)/cad-files/${orderId}`);
  const url = String(params.url || "");
  const name = String(params.name || "model");

  const openExternal = () => {
    if (!url) return;
    if (Platform.OS === "web" && typeof window !== "undefined") {
      window.open(url, "_blank", "noopener");
      return;
    }
    Linking.openURL(url).catch(() => {});
  };

  return (
    <SafeAreaView style={styles.safe} edges={["top", "bottom"]}>
      <BrandStrip />
      <View style={styles.header}>
        <TouchableOpacity testID="cad-preview-back" onPress={safeBack}>
          <Ionicons name="arrow-back" size={22} color={theme.textPrimary} />
        </TouchableOpacity>
        <View style={{ flex: 1, marginHorizontal: spacing.sm }}>
          <Text style={styles.headerEyebrow}>3D PREVIEW</Text>
          <Text style={styles.headerTitle} numberOfLines={1}>
            {name}
          </Text>
        </View>
        <TouchableOpacity
          testID="cad-preview-download"
          onPress={openExternal}
          style={styles.headerBtn}
        >
          <Ionicons name="download-outline" size={18} color={theme.primary} />
        </TouchableOpacity>
      </View>
      <View style={{ flex: 1 }}>
        {url ? (
          <Model3DViewer url={url} />
        ) : (
          <View style={styles.empty}>
            <Text style={styles.emptyText}>No file URL provided.</Text>
          </View>
        )}
      </View>
      <Text style={styles.hint}>
        Drag to rotate · pinch to zoom · two-finger drag to pan
      </Text>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: "#0A0A0A" },
  header: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: theme.border,
  },
  headerEyebrow: { color: theme.primary, fontSize: 9, letterSpacing: 3 },
  headerTitle: { color: theme.textPrimary, fontSize: 14, marginTop: 2 },
  headerBtn: {
    width: 38,
    height: 38,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderColor: theme.border,
  },
  empty: { flex: 1, alignItems: "center", justifyContent: "center" },
  emptyText: { color: theme.textMuted, fontSize: 12 },
  hint: {
    textAlign: "center",
    color: theme.textMuted,
    fontSize: 10,
    letterSpacing: 1.5,
    paddingVertical: spacing.sm,
    borderTopWidth: 1,
    borderTopColor: theme.border,
  },
});
