import React, { useEffect, useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TextInput,
  TouchableOpacity,
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { api } from "@/src/api/client";
import { useAuth } from "@/src/context/AuthContext";
import { theme, spacing } from "@/src/theme";
import { useSafeBack } from "@/src/hooks/use-safe-back";
import { BrandStrip } from "@/src/components/BrandStrip";

type Lang = { language: string; language_name: string };

const SAMPLE_SENTENCE =
  "Diamond clarity verified by the master gemologist under 40x magnification.";

export default function TestTranslateScreen() {
  const router = useRouter();
  const safeBack = useSafeBack();
  const { user } = useAuth();
  const [langs, setLangs] = useState<Lang[]>([]);
  const [picked, setPicked] = useState<Lang | null>(null);
  const [text, setText] = useState(SAMPLE_SENTENCE);
  const [translation, setTranslation] = useState<string>("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [note, setNote] = useState<string | null>(null);

  // Admin-only — bounce anyone else.
  useEffect(() => {
    if (user && user.role !== "admin") {
      router.replace("/(app)");
    }
  }, [user, router]);

  // Load the supported-languages list once; dedupe by language code so each
  // language appears once even though many countries map to the same one.
  useEffect(() => {
    (async () => {
      try {
        const rows = await api.listLanguages();
        const seen = new Set<string>();
        const unique: Lang[] = [];
        for (const r of rows) {
          if (seen.has(r.language)) continue;
          seen.add(r.language);
          unique.push({ language: r.language, language_name: r.language_name });
        }
        // Show non-English options first; English last as a sanity option.
        unique.sort((a, b) => {
          if (a.language === "en") return 1;
          if (b.language === "en") return -1;
          return a.language_name.localeCompare(b.language_name);
        });
        setLangs(unique);
        // Default pick: first non-English
        setPicked(unique.find((l) => l.language !== "en") ?? unique[0] ?? null);
      } catch (e) {
        setError(e instanceof Error ? e.message : "Failed to load languages");
      }
    })();
  }, []);

  const run = async () => {
    if (!picked || !text.trim()) return;
    setBusy(true);
    setError(null);
    setNote(null);
    setTranslation("");
    try {
      const res = await api.testTranslate(
        text,
        picked.language,
        picked.language_name
      );
      setTranslation(res.translation || "");
      if (res.note) setNote(res.note);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Translation failed");
    } finally {
      setBusy(false);
    }
  };

  return (
    <SafeAreaView style={styles.safe} edges={["top"]}>
      <BrandStrip />
      <View style={styles.headerBar}>
        <TouchableOpacity testID="back-button" onPress={safeBack} style={styles.iconBtn}>
          <Ionicons name="chevron-back" size={22} color={theme.primary} />
        </TouchableOpacity>
        <View style={{ flex: 1 }}>
          <Text style={styles.eyebrow}>ATELIER · DEBUG</Text>
          <Text style={styles.title}>Test translation</Text>
        </View>
      </View>

      <KeyboardAvoidingView
        behavior={Platform.OS === "ios" ? "padding" : undefined}
        style={{ flex: 1 }}
      >
        <ScrollView
          contentContainerStyle={{
            padding: spacing.lg,
            paddingBottom: spacing.xxl,
          }}
          keyboardShouldPersistTaps="handled"
        >
          <Text style={styles.lede}>
            Pipes a sentence through the same Claude pipeline used by{" "}
            <Text style={{ color: theme.primary }}>complete_step</Text>. Useful
            for verifying the Universal LLM Key is healthy and the translation
            quality matches what clients see in their language.
          </Text>

          <Text style={styles.formLabel}>SOURCE TEXT (ENGLISH)</Text>
          <TextInput
            testID="translate-source"
            value={text}
            onChangeText={setText}
            multiline
            numberOfLines={4}
            placeholder="Type or paste an English sentence..."
            placeholderTextColor={theme.textMuted}
            style={styles.textInput}
          />

          <Text style={styles.formLabel}>TARGET LANGUAGE</Text>
          <View style={styles.langGrid}>
            {langs.map((l) => {
              const sel = picked?.language === l.language;
              return (
                <TouchableOpacity
                  key={l.language}
                  testID={`lang-${l.language}`}
                  style={[styles.langChip, sel && styles.langChipSel]}
                  onPress={() => setPicked(l)}
                >
                  <Text style={[styles.langChipText, sel && styles.langChipTextSel]}>
                    {l.language_name}
                  </Text>
                  <Text style={[styles.langChipCode, sel && { color: "#0A0A0A" }]}>
                    {l.language.toUpperCase()}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </View>

          <TouchableOpacity
            testID="translate-run"
            style={[
              styles.primaryBtn,
              (busy || !picked || !text.trim()) && { opacity: 0.6 },
            ]}
            onPress={run}
            disabled={busy || !picked || !text.trim()}
          >
            {busy ? (
              <ActivityIndicator color="#0A0A0A" />
            ) : (
              <Text style={styles.primaryBtnText}>TRANSLATE</Text>
            )}
          </TouchableOpacity>

          {error && (
            <View style={styles.errorBox}>
              <Text style={styles.errorText}>{error}</Text>
            </View>
          )}

          {!!translation && (
            <View style={styles.resultBox}>
              <Text style={styles.formLabel}>
                RESULT · {picked?.language_name?.toUpperCase()}
              </Text>
              <Text testID="translate-result" style={styles.resultText}>
                {translation}
              </Text>
              {note && <Text style={styles.note}>{note}</Text>}
            </View>
          )}
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: theme.bg },
  headerBar: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: theme.border,
  },
  iconBtn: { padding: 4, marginRight: spacing.sm },
  eyebrow: { color: theme.primary, fontSize: 10, letterSpacing: 2 },
  title: { color: theme.textPrimary, fontSize: 18, marginTop: 2 },
  lede: {
    color: theme.textSecondary,
    fontSize: 12,
    lineHeight: 18,
    marginBottom: spacing.lg,
  },
  formLabel: {
    color: theme.primary,
    fontSize: 10,
    letterSpacing: 2,
    marginTop: spacing.md,
    marginBottom: spacing.xs,
  },
  textInput: {
    backgroundColor: theme.surface,
    borderWidth: 1,
    borderColor: theme.border,
    color: theme.textPrimary,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    fontSize: 14,
    minHeight: 100,
    textAlignVertical: "top",
  },
  langGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: spacing.sm,
    marginTop: spacing.xs,
  },
  langChip: {
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderWidth: 1,
    borderColor: theme.border,
    alignItems: "center",
    minWidth: 84,
  },
  langChipSel: {
    backgroundColor: theme.primary,
    borderColor: theme.primary,
  },
  langChipText: { color: theme.textPrimary, fontSize: 13 },
  langChipTextSel: { color: "#0A0A0A", fontWeight: "700" },
  langChipCode: { color: theme.textMuted, fontSize: 10, marginTop: 2 },
  primaryBtn: {
    backgroundColor: theme.primary,
    paddingVertical: 16,
    alignItems: "center",
    marginTop: spacing.xl,
    minHeight: 44,
    justifyContent: "center",
  },
  primaryBtnText: {
    color: "#0A0A0A",
    fontSize: 12,
    fontWeight: "700",
    letterSpacing: 3,
  },
  errorBox: {
    backgroundColor: theme.errorBg,
    borderWidth: 1,
    borderColor: theme.error,
    padding: spacing.md,
    marginTop: spacing.lg,
  },
  errorText: { color: theme.error, fontSize: 12 },
  resultBox: {
    marginTop: spacing.xl,
    backgroundColor: theme.surface,
    borderWidth: 1,
    borderColor: theme.border,
    padding: spacing.md,
  },
  resultText: {
    color: theme.textPrimary,
    fontSize: 16,
    lineHeight: 24,
    marginTop: spacing.sm,
  },
  note: { color: theme.textMuted, fontSize: 11, marginTop: spacing.sm, fontStyle: "italic" },
});
