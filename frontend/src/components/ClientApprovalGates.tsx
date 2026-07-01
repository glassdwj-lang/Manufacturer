/**
 * ClientApprovalGates — the two-gate approval strip shown on Step 02
 * (Conceptual Rendering) for the client + a shrunken admin view.
 *
 * Gate 1  Render approval:  Accept  ↔  Request revision (+message)
 * Gate 2  Design lock:      Yes  ↔  No (admin will contact)
 *
 * Admin variant also shows a per-render "Release / Unrelease" toggle
 * so the atelier controls which conceptual renders are visible.
 */
import React, { useCallback, useEffect, useState } from "react";
import {
  ActivityIndicator, Alert, Image, ScrollView, Switch, Text,
  TextInput, TouchableOpacity, View,
} from "react-native";
import { api } from "@/src/api/client";
import { theme, spacing } from "@/src/theme";

type Props = {
  orderId: string;
  role: string;
};

export function ClientApprovalGates({ orderId, role }: Props) {
  const [released, setReleased] = useState<any[]>([]);
  const [approval, setApproval] = useState<any>({});
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [revisionMessage, setRevisionMessage] = useState("");
  const [showRevisionBox, setShowRevisionBox] = useState(false);
  const [confirmGate2, setConfirmGate2] = useState(false);

  // Admin only: the full render list (both released + not-released)
  const [adminAllRenders, setAdminAllRenders] = useState<any[]>([]);

  const load = useCallback(async () => {
    try {
      const r = await api.getClientRenders(orderId);
      setReleased(r.released);
      setApproval(r.approval);
      if (role === "admin" || role === "associate") {
        try {
          const order: any = await (api as any).getOrder(orderId);
          setAdminAllRenders(order?.renders || []);
        } catch { /* ignore */ }
      }
    } catch {
      // Silent — 403 for non-clients-of-order is expected
    } finally { setLoading(false); }
  }, [orderId, role]);

  useEffect(() => { load(); }, [load]);

  const toggleRelease = async (renderId: string, released: boolean) => {
    setBusy(true);
    try {
      await api.releaseRenderForClient(orderId, renderId, released);
      await load();
    } catch (e: any) { Alert.alert("Toggle failed", e?.message || "unknown"); }
    finally { setBusy(false); }
  };

  const gate1 = async (status: "accepted" | "revision_requested") => {
    setBusy(true);
    try {
      await api.postGate1(orderId, status, status === "revision_requested" ? revisionMessage : undefined);
      setShowRevisionBox(false); setRevisionMessage("");
      await load();
    } catch (e: any) { Alert.alert("Gate 1 failed", e?.message || "unknown"); }
    finally { setBusy(false); }
  };

  const gate2 = async (status: "yes" | "no") => {
    setBusy(true);
    try {
      await api.postGate2(orderId, status);
      setConfirmGate2(false);
      await load();
    } catch (e: any) { Alert.alert("Gate 2 failed", e?.message || "unknown"); }
    finally { setBusy(false); }
  };

  if (loading) return <ActivityIndicator style={{ marginTop: 8 }} color={theme.primary} />;

  const isClient = role === "client";
  const isAdmin = role === "admin" || role === "associate";
  const g1 = approval?.gate1_status || "pending";
  const g2 = approval?.gate2_status || "pending";

  return (
    <View style={{ marginTop: spacing.lg, borderTopWidth: 1, borderTopColor: theme.border, paddingTop: spacing.md }}>
      <Text style={{ color: theme.textPrimary, fontWeight: "700", fontSize: 15 }}>Client Approval</Text>

      {/* Admin: release toggles on ALL renders */}
      {isAdmin && adminAllRenders.length > 0 && (
        <View style={{ marginTop: spacing.sm }}>
          <Text style={{ color: theme.textMuted, fontSize: 12, marginBottom: 4 }}>Release for client review</Text>
          {adminAllRenders.map((r: any) => (
            <View key={r.id} style={{ flexDirection: "row", alignItems: "center", paddingVertical: 4 }}>
              <Text style={{ color: theme.textPrimary, flex: 1, fontSize: 12 }} numberOfLines={1}>
                {r.filename || r.id?.slice(0, 12)}
              </Text>
              <Switch
                value={!!r.client_release}
                onValueChange={(v) => toggleRelease(r.id, v)}
                disabled={busy}
              />
            </View>
          ))}
        </View>
      )}

      {/* Client view: released renders */}
        {isClient && released.length === 0 && (
          <Text style={{ color: theme.textMuted, fontSize: 12, marginTop: spacing.sm }}>The atelier hasn&apos;t released any conceptual renders yet.</Text>
        )}

      {isClient && released.length > 0 && (
        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginTop: spacing.sm }}>
          {released.map((r: any) => (
            <Image key={r.id} source={{ uri: r.url }} style={{ width: 200, height: 150, borderRadius: 8, marginRight: 8, backgroundColor: "#111" }} />
          ))}
        </ScrollView>
      )}

      {/* Gate 1 */}
      <View style={{ marginTop: spacing.md }}>
        <Text style={{ color: theme.textPrimary, fontWeight: "700", fontSize: 13 }}>Gate 1 · Render approval</Text>
        <Text style={{ color: theme.textMuted, fontSize: 11, marginTop: 2 }}>Status: {g1}</Text>

        {isClient && released.length > 0 && g1 === "pending" && !showRevisionBox && (
          <View style={{ flexDirection: "row", gap: 8, marginTop: 6 }}>
            <TouchableOpacity disabled={busy} onPress={() => gate1("accepted")}
              style={{ flex: 1, backgroundColor: theme.primary, padding: 10, borderRadius: 6, alignItems: "center" }}>
              <Text style={{ color: "#000", fontWeight: "700" }}>Accept</Text>
            </TouchableOpacity>
            <TouchableOpacity disabled={busy} onPress={() => setShowRevisionBox(true)}
              style={{ flex: 1, backgroundColor: "#7A5A15", padding: 10, borderRadius: 6, alignItems: "center" }}>
              <Text style={{ color: "#fff", fontWeight: "700" }}>Request revision</Text>
            </TouchableOpacity>
          </View>
        )}

        {isClient && showRevisionBox && (
          <View style={{ marginTop: 8 }}>
            <TextInput
              value={revisionMessage} onChangeText={setRevisionMessage}
              placeholder="What would you like changed?" placeholderTextColor={theme.textMuted}
              multiline numberOfLines={3}
              style={{ borderWidth: 1, borderColor: theme.border, borderRadius: 6, padding: 8, color: theme.textPrimary, minHeight: 60 }}
            />
            <View style={{ flexDirection: "row", gap: 8, marginTop: 6 }}>
              <TouchableOpacity onPress={() => { setShowRevisionBox(false); setRevisionMessage(""); }}
                style={{ flex: 1, padding: 10, borderRadius: 6, borderWidth: 1, borderColor: theme.border, alignItems: "center" }}>
                <Text style={{ color: theme.textPrimary }}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity disabled={busy || !revisionMessage.trim()} onPress={() => gate1("revision_requested")}
                style={{ flex: 1, backgroundColor: revisionMessage.trim() ? "#7A5A15" : "#333", padding: 10, borderRadius: 6, alignItems: "center" }}>
                <Text style={{ color: "#fff", fontWeight: "700" }}>Send</Text>
              </TouchableOpacity>
            </View>
          </View>
        )}

        {approval?.gate1_message && g1 === "revision_requested" && (
          <Text style={{ color: theme.textMuted, fontSize: 11, marginTop: 6, fontStyle: "italic" }}>
            Your message: “{approval.gate1_message}”
          </Text>
        )}
      </View>

      {/* Gate 2 */}
      {g1 === "accepted" && (
        <View style={{ marginTop: spacing.md, borderTopWidth: 1, borderTopColor: theme.border, paddingTop: spacing.sm }}>
          <Text style={{ color: theme.textPrimary, fontWeight: "700", fontSize: 13 }}>Gate 2 · Design lock (100% commitment)</Text>
          <Text style={{ color: theme.textMuted, fontSize: 11, marginTop: 2 }}>Status: {g2}</Text>

          {isClient && g2 === "pending" && (
            confirmGate2 ? (
              <View style={{ marginTop: 8 }}>
                <Text style={{ color: theme.textPrimary, fontSize: 12, marginBottom: 6 }}>
                  This confirms 100% commitment. Production begins immediately.
                </Text>
                <View style={{ flexDirection: "row", gap: 8 }}>
                  <TouchableOpacity disabled={busy} onPress={() => gate2("yes")}
                    style={{ flex: 1, backgroundColor: theme.primary, padding: 10, borderRadius: 6, alignItems: "center" }}>
                    <Text style={{ color: "#000", fontWeight: "700" }}>Confirm YES</Text>
                  </TouchableOpacity>
                  <TouchableOpacity onPress={() => setConfirmGate2(false)}
                    style={{ flex: 1, padding: 10, borderRadius: 6, borderWidth: 1, borderColor: theme.border, alignItems: "center" }}>
                    <Text style={{ color: theme.textPrimary }}>Cancel</Text>
                  </TouchableOpacity>
                </View>
              </View>
            ) : (
              <View style={{ flexDirection: "row", gap: 8, marginTop: 6 }}>
                <TouchableOpacity disabled={busy} onPress={() => setConfirmGate2(true)}
                  style={{ flex: 1, backgroundColor: theme.primary, padding: 10, borderRadius: 6, alignItems: "center" }}>
                  <Text style={{ color: "#000", fontWeight: "700" }}>Yes – lock design</Text>
                </TouchableOpacity>
                <TouchableOpacity disabled={busy} onPress={() => gate2("no")}
                  style={{ flex: 1, backgroundColor: "#7A1F1F", padding: 10, borderRadius: 6, alignItems: "center" }}>
                  <Text style={{ color: "#fff", fontWeight: "700" }}>No – need contact</Text>
                </TouchableOpacity>
              </View>
            )
          )}
        </View>
      )}
    </View>
  );
}
