import React, { useState } from "react";
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity, ActivityIndicator,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { api } from "@/src/api/client";
import { useAuth } from "@/src/context/AuthContext";
import { theme, spacing } from "@/src/theme";
import { flags } from "@/src/flags";
import { useSafeBack } from "@/src/hooks/use-safe-back";
import { BrandStrip } from "@/src/components/BrandStrip";

type ResultRow = { tone: "ok" | "err"; text: string };
type LoadingKey = "base" | "extended" | "wipe" | "import" | null;

export default function DebugScreen() {
  const router = useRouter();
  const safeBack = useSafeBack();
  const { user } = useAuth();
  const [loading, setLoading] = useState<LoadingKey>(null);
  const [results, setResults] = useState<ResultRow[]>([]);
  const [confirmWipe, setConfirmWipe] = useState(false);

  if (!flags.enableDebug || user?.role !== "admin") {
    return (
      <SafeAreaView style={styles.safe}>
        <View style={styles.center}>
          <Text style={{ color: theme.textSecondary }}>
            {flags.enableDebug ? "Atelier only." : "Debug tools are disabled in this build."}
          </Text>
          <TouchableOpacity onPress={() => router.replace("/(app)")} style={{ marginTop: spacing.lg }}>
            <Text style={{ color: theme.primary, letterSpacing: 2 }}>BACK TO ATELIER</Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    );
  }

  const pushResult = (row: ResultRow) =>
    setResults((r) =>
      [{ ...row, text: `[${new Date().toLocaleTimeString()}] ${row.text}` }, ...r].slice(0, 12)
    );

  const runSeedBase = async () => {
    setLoading("base");
    try {
      const out = await api.seed();
      pushResult({ tone: "ok", text: `Base seed OK · ${out.seeded?.length ?? 0} entries` });
    } catch (e: any) {
      pushResult({ tone: "err", text: `Base seed failed · ${e?.message ?? "error"}` });
    } finally {
      setLoading(null);
    }
  };

  const runSeedExtended = async () => {
    setLoading("extended");
    try {
      const out = await api.seedExtended();
      const created = (out.seeded || []).filter((s: any) => s.status === "created").length;
      pushResult({
        tone: "ok",
        text: `Extended seed OK · ${created} new commission(s) · ${out.workshops} workshops · ${out.clients} clients`,
      });
    } catch (e: any) {
      pushResult({ tone: "err", text: `Extended seed failed · ${e?.message ?? "error"}` });
    } finally {
      setLoading(null);
    }
  };

  const runWipe = async () => {
    setLoading("wipe");
    setConfirmWipe(false);
    try {
      const out = await api.wipeDemo();
      pushResult({
        tone: "ok",
        text: `Wipe OK · ${out.orders_deleted} order(s), ${out.users_deleted} user(s) deleted (your admin preserved)`,
      });
    } catch (e: any) {
      pushResult({ tone: "err", text: `Wipe failed · ${e?.message ?? "error"}` });
    } finally {
      setLoading(null);
    }
  };

  const runImportAssociates = async () => {
    setLoading("import");
    try {
      const out = await api.importAssociates();
      if (out.ok) {
        pushResult({
          tone: "ok",
          text: `Import OK · fetched ${out.fetched} · created ${out.created} · updated ${out.updated} · skipped ${out.skipped}`,
        });
      } else {
        pushResult({
          tone: "err",
          text: `Import failed (${out.reason}) · ${out.detail ?? ""}`,
        });
      }
    } catch (e: any) {
      pushResult({ tone: "err", text: `Import failed · ${e?.message ?? "error"}` });
    } finally {
      setLoading(null);
    }
  };

  return (
    <SafeAreaView style={styles.safe} edges={["top", "bottom"]}>
      <BrandStrip />
      <View style={styles.header}>
        <TouchableOpacity testID="debug-back" onPress={safeBack} style={{ padding: 4 }}>
          <Ionicons name="chevron-back" size={22} color={theme.primary} />
        </TouchableOpacity>
        <View style={{ flex: 1 }}>
          <Text style={styles.eyebrow}>ATELIER · DEBUG</Text>
          <Text style={styles.title}>Sample Data</Text>
        </View>
      </View>

      <ScrollView contentContainerStyle={{ padding: spacing.lg, paddingBottom: spacing.xxl }}>
        <Text style={styles.section}>SEED DATA</Text>

        <Card
          title="Load Base Demo"
          subtitle="Creates 4 demo accounts (admin · workshop · associate · client) and one sample commission. Idempotent — safe to re-run."
          buttonLabel={loading === "base" ? "LOADING…" : "RUN BASE SEED"}
          disabled={loading !== null}
          loading={loading === "base"}
          onPress={runSeedBase}
          testID="seed-base-button"
        />

        <View style={{ height: spacing.md }} />

        <Card
          title="Load Sample Data (8 Commissions)"
          subtitle="Adds 3 extra workshops (Shanghai · Shenzhen · Guangzhou), 3 extra clients, and 8 commissions at varying stages (2/26 → 26/26) with photos seeded on completed steps. Idempotent."
          buttonLabel={loading === "extended" ? "LOADING…" : "LOAD 8 COMMISSIONS"}
          disabled={loading !== null}
          loading={loading === "extended"}
          onPress={runSeedExtended}
          testID="seed-extended-button"
        />

        <Text style={[styles.section, { marginTop: spacing.xl }]}>ASSOCIATE SYNC</Text>

        <Card
          title="Import Associates from gem-gallery-193"
          subtitle="Pulls all associates and admins from the source app and upserts them by email. Auto-runs daily at 00:01 Australia/Sydney. Associates and admins cannot be created or edited inside Atelier — they are read-only mirrors."
          buttonLabel={loading === "import" ? "IMPORTING…" : "IMPORT NOW"}
          disabled={loading !== null}
          loading={loading === "import"}
          onPress={runImportAssociates}
          testID="import-associates-button"
        />

        <Text style={[styles.section, { marginTop: spacing.xl, color: theme.error }]}>DANGER ZONE</Text>

        <View style={[styles.card, styles.danger]}>
          <Text style={[styles.cardTitle, { color: theme.error }]}>Wipe Demo Data</Text>
          <Text style={styles.cardSub}>
            Deletes ALL commissions and ALL users except your own admin account. Use this to start a clean QA run, then re-load the seeds above. Irreversible.
          </Text>

          {!confirmWipe ? (
            <TouchableOpacity
              testID="wipe-demo-button"
              onPress={() => setConfirmWipe(true)}
              disabled={loading !== null}
              style={[styles.dangerBtn, loading !== null && { opacity: 0.5 }]}
            >
              <Ionicons name="trash-outline" size={14} color={theme.error} />
              <Text style={styles.dangerBtnText}>WIPE DEMO DATA</Text>
            </TouchableOpacity>
          ) : (
            <View style={styles.confirmBlock}>
              <Text style={styles.confirmText}>
                This will delete every commission and user (except you). Continue?
              </Text>
              <View style={styles.confirmRow}>
                <TouchableOpacity
                  testID="wipe-cancel-button"
                  onPress={() => setConfirmWipe(false)}
                  style={styles.cancelBtn}
                >
                  <Text style={styles.cancelBtnText}>CANCEL</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  testID="wipe-confirm-button"
                  onPress={runWipe}
                  disabled={loading !== null}
                  style={[styles.confirmDangerBtn, loading !== null && { opacity: 0.5 }]}
                >
                  {loading === "wipe" ? (
                    <ActivityIndicator color="#0A0A0A" />
                  ) : (
                    <Text style={styles.confirmDangerBtnText}>YES, WIPE</Text>
                  )}
                </TouchableOpacity>
              </View>
            </View>
          )}
        </View>

        {results.length > 0 && (
          <>
            <Text style={[styles.section, { marginTop: spacing.xl }]}>LOG</Text>
            <View style={styles.logBox}>
              {results.map((r, i) => (
                <Text
                  key={i}
                  testID={`debug-log-${i}`}
                  style={[styles.logLine, r.tone === "err" && { color: theme.error }]}
                >
                  {r.text}
                </Text>
              ))}
            </View>
          </>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

function Card({
  title, subtitle, buttonLabel, onPress, disabled, loading, testID,
}: {
  title: string;
  subtitle: string;
  buttonLabel: string;
  onPress: () => void;
  disabled: boolean;
  loading: boolean;
  testID: string;
}) {
  return (
    <View style={styles.card}>
      <Text style={styles.cardTitle}>{title}</Text>
      <Text style={styles.cardSub}>{subtitle}</Text>
      <TouchableOpacity
        testID={testID}
        onPress={onPress}
        disabled={disabled}
        style={[styles.cardBtn, disabled && { opacity: 0.5 }]}
      >
        {loading ? (
          <ActivityIndicator color="#0A0A0A" />
        ) : (
          <Text style={styles.cardBtnText}>{buttonLabel}</Text>
        )}
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: theme.bg },
  center: { flex: 1, justifyContent: "center", alignItems: "center" },
  header: {
    flexDirection: "row", alignItems: "center", padding: spacing.md,
    borderBottomWidth: 1, borderBottomColor: theme.border, gap: spacing.sm,
  },
  eyebrow: { color: theme.primary, fontSize: 10, letterSpacing: 2 },
  title: { color: theme.textPrimary, fontSize: 18, marginTop: 2 },
  section: { color: theme.primary, fontSize: 10, letterSpacing: 3, marginBottom: spacing.md },
  card: {
    borderWidth: 1, borderColor: theme.border, padding: spacing.md, backgroundColor: theme.surface,
  },
  danger: { borderColor: theme.error, backgroundColor: theme.errorBg },
  cardTitle: { color: theme.textPrimary, fontSize: 15, marginBottom: 6 },
  cardSub: { color: theme.textSecondary, fontSize: 12, lineHeight: 18, marginBottom: spacing.md },
  cardBtn: {
    backgroundColor: theme.primary, paddingVertical: 14, alignItems: "center",
  },
  cardBtnText: { color: "#0A0A0A", fontSize: 11, letterSpacing: 3, fontWeight: "700" },
  dangerBtn: {
    borderWidth: 1, borderColor: theme.error,
    paddingVertical: 12, alignItems: "center", justifyContent: "center",
    flexDirection: "row", gap: 6,
  },
  dangerBtnText: { color: theme.error, fontSize: 11, letterSpacing: 3, fontWeight: "700" },
  confirmBlock: { gap: spacing.sm },
  confirmText: { color: theme.textPrimary, fontSize: 12, lineHeight: 18 },
  confirmRow: { flexDirection: "row", gap: spacing.sm },
  cancelBtn: {
    flex: 1, borderWidth: 1, borderColor: theme.border, paddingVertical: 12,
    alignItems: "center", justifyContent: "center",
  },
  cancelBtnText: { color: theme.textSecondary, fontSize: 11, letterSpacing: 3 },
  confirmDangerBtn: {
    flex: 1, backgroundColor: theme.error, paddingVertical: 12,
    alignItems: "center", justifyContent: "center",
  },
  confirmDangerBtnText: { color: "#0A0A0A", fontSize: 11, letterSpacing: 3, fontWeight: "700" },
  logBox: { borderWidth: 1, borderColor: theme.border, padding: spacing.md },
  logLine: { color: theme.textSecondary, fontSize: 11, fontFamily: "Courier", marginBottom: 4 },
});
