/** SYSTEM SYNCS card — shows status of background daily/monthly jobs. */
import React from "react";
import { Text, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { styles } from "../styles";
import { relTime } from "../utils";

function SyncBlock({
  title,
  schedule,
  lastRun,
}: {
  title: string;
  schedule: string;
  lastRun: any;
}) {
  const at = lastRun?.summary?.synced_at || lastRun?.at || lastRun?.finished_at;
  const ok = lastRun ? lastRun?.summary?.ok !== false : null;
  return (
    <View style={styles.syncBlock}>
      <View style={{ flex: 1 }}>
        <Text style={styles.syncTitle}>{title}</Text>
        <Text style={styles.syncSchedule}>{schedule}</Text>
      </View>
      <View style={{ alignItems: "flex-end" }}>
        {at ? (
          <Text style={styles.syncTime}>{relTime(at)}</Text>
        ) : (
          <Text style={styles.syncTime}>Never run</Text>
        )}
        {ok === true && (
          <Ionicons name="checkmark-circle" size={14} color="#48905C" />
        )}
        {ok === false && (
          <Ionicons name="warning" size={14} color="#C8553D" />
        )}
      </View>
    </View>
  );
}

export function SyncStatusCard({
  syncs,
}: {
  syncs: { associate_sync: any; gem_gallery_meta: any };
}) {
  return (
    <View style={styles.card}>
      <Text style={styles.cardEyebrow}>SYSTEM SYNCS</Text>
      <SyncBlock
        title="ASSOCIATE / USER SYNC"
        schedule={syncs.associate_sync.schedule?.description || "Daily"}
        lastRun={syncs.associate_sync.last_run}
      />
      <SyncBlock
        title="GEM-GALLERY COUNTRY META"
        schedule={syncs.gem_gallery_meta.schedule?.description || "Monthly"}
        lastRun={syncs.gem_gallery_meta.last_run}
      />
    </View>
  );
}
