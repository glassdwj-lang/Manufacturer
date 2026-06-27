/**
 * Expandable filter form for admins/associates.
 *
 * Hosts the search input, date range, and 1-3 people pickers depending
 * on role. Filters are *draft* until the user taps GO — only then do
 * they commit to the URL/API via the parent hook.
 */
import React from "react";
import { Text, TextInput, TouchableOpacity, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { theme } from "@/src/theme";
import { User } from "@/src/api/client";
import { DateField } from "@/src/components/DateField";
import { PeoplePicker } from "./PeoplePicker";
import { homeStyles } from "../styles";

export type FilterDraft = {
  client: string;
  mfg: string;
  assoc: string;
  q: string;
  from: string;
  to: string;
};

export function CommissionFilterPanel({
  role,
  draft,
  setDraft,
  onApply,
  onCancel,
  draftHasChanges,
  openPicker,
  setOpenPicker,
  clientOptions,
  mfgOptions,
  assocOptions,
}: {
  role: string;
  draft: FilterDraft;
  setDraft: (next: FilterDraft) => void;
  onApply: () => void;
  onCancel: () => void;
  draftHasChanges: boolean;
  openPicker: "" | "client" | "mfg" | "assoc";
  setOpenPicker: (v: "" | "client" | "mfg" | "assoc") => void;
  clientOptions: User[];
  mfgOptions: User[];
  assocOptions: User[];
}) {
  const patch = (p: Partial<FilterDraft>) => setDraft({ ...draft, ...p });
  return (
    <View style={homeStyles.filterPanel}>
      <Text style={homeStyles.filterLabel}>SEARCH JEWELRY TYPE / NAME</Text>
      <TextInput
        testID="filter-search-input"
        value={draft.q}
        onChangeText={(q) => patch({ q })}
        onSubmitEditing={onApply}
        returnKeyType="search"
        placeholder="e.g. ring, earring, necklace…"
        placeholderTextColor={theme.textMuted}
        autoCapitalize="none"
        style={homeStyles.searchInput}
      />

      <Text style={homeStyles.filterLabel}>DATE RANGE</Text>
      <View style={homeStyles.dateRow}>
        <View style={{ flex: 1, marginRight: 6 }}>
          <Text style={homeStyles.filterSubLabel}>FROM</Text>
          <DateField
            testID="filter-date-from"
            value={draft.from}
            onChange={(from) => patch({ from })}
            placeholder="Any start date"
            maximumDate={draft.to ? new Date(draft.to) : undefined}
          />
        </View>
        <View style={{ flex: 1, marginLeft: 6 }}>
          <Text style={homeStyles.filterSubLabel}>TO</Text>
          <DateField
            testID="filter-date-to"
            value={draft.to}
            onChange={(to) => patch({ to })}
            placeholder="Any end date"
            minimumDate={draft.from ? new Date(draft.from) : undefined}
          />
        </View>
      </View>

      {role === "admin" && (
        <>
          <PeoplePicker
            label="WORKSHOP (MANUFACTURER)"
            placeholder="All workshops"
            options={mfgOptions}
            selectedId={draft.mfg}
            isOpen={openPicker === "mfg"}
            onToggle={() => setOpenPicker(openPicker === "mfg" ? "" : "mfg")}
            onSelect={(id) => {
              patch({ mfg: id });
              setOpenPicker("");
            }}
            renderLabel={(u) => u.alias || u.name}
            renderSub={(u) => u.email}
          />
          <PeoplePicker
            label="ASSOCIATE"
            placeholder="All associates"
            options={assocOptions}
            selectedId={draft.assoc}
            isOpen={openPicker === "assoc"}
            onToggle={() =>
              setOpenPicker(openPicker === "assoc" ? "" : "assoc")
            }
            onSelect={(id) => {
              patch({ assoc: id });
              setOpenPicker("");
            }}
            renderLabel={(u) => u.name}
            renderSub={(u) => u.email}
          />
        </>
      )}
      <PeoplePicker
        label="CLIENT"
        placeholder="All clients"
        options={clientOptions}
        selectedId={draft.client}
        isOpen={openPicker === "client"}
        onToggle={() => setOpenPicker(openPicker === "client" ? "" : "client")}
        onSelect={(id) => {
          patch({ client: id });
          setOpenPicker("");
        }}
        renderLabel={(u) => u.name}
        renderSub={(u) => u.email}
      />

      <View style={homeStyles.goRow}>
        <TouchableOpacity
          testID="filter-cancel"
          onPress={onCancel}
          style={homeStyles.goCancelBtn}
        >
          <Text style={homeStyles.goCancelText}>CANCEL</Text>
        </TouchableOpacity>
        <TouchableOpacity
          testID="filter-go"
          onPress={onApply}
          style={[homeStyles.goBtn, !draftHasChanges && homeStyles.goBtnDim]}
        >
          <Ionicons name="checkmark" size={14} color="#0A0A0A" />
          <Text style={homeStyles.goBtnText}>GO</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

export default CommissionFilterPanel;
