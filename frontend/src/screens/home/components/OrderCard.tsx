/**
 * Commission row card shown in the home FlatList.
 *
 * Supports admin bulk-select mode (checkbox + tap to toggle) and shows
 * either the current in-flight step or a "completed" badge.
 */
import React from "react";
import { Text, TouchableOpacity, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { theme } from "@/src/theme";
import { Order } from "@/src/api/client";
import {
  CompletedBadge,
  PhaseBadge,
  ProgressBar,
} from "@/src/components/Ui";
import { useI18n } from "@/src/i18n";
import { homeStyles } from "../styles";

export function OrderCard({
  order,
  onPress,
  selectMode = false,
  selected = false,
}: {
  order: Order;
  onPress: () => void;
  selectMode?: boolean;
  selected?: boolean;
}) {
  const { t } = useI18n();
  const completed = order.progress?.completed_count ?? 0;
  const total = order.progress?.total ?? 26;
  const currentStep = order.steps?.find((s) => !s.completed);
  return (
    <TouchableOpacity
      testID={`order-card-${order.id}`}
      onPress={onPress}
      style={[
        homeStyles.orderCard,
        selectMode && selected && homeStyles.orderCardSelected,
      ]}
    >
      <View style={homeStyles.orderCardTop}>
        <View style={{ flex: 1 }}>
          <Text style={homeStyles.orderRef}>{order.order_ref}</Text>
          <Text style={homeStyles.orderName}>{order.jewelry_name}</Text>
          <Text style={homeStyles.orderSub}>
            {order.client_name} · {order.manufacturer_name}
          </Text>
        </View>
        <View style={homeStyles.orderRightCol}>
          {currentStep ? (
            <PhaseBadge phase={currentStep.phase} />
          ) : (
            <CompletedBadge label={t("home.card.completed_badge")} />
          )}
          {selectMode && (
            <View
              style={homeStyles.cardCheckbox}
              testID={`order-checkbox-${order.id}`}
            >
              <Ionicons
                name={selected ? "checkbox" : "square-outline"}
                size={22}
                color={selected ? theme.primary : theme.textMuted}
              />
            </View>
          )}
        </View>
      </View>
      <View style={homeStyles.progressRow}>
        <ProgressBar current={completed} total={total} />
        <Text style={homeStyles.progressText}>
          {completed} / {total}
        </Text>
      </View>
      {currentStep ? (
        <Text style={homeStyles.currentStep}>
          {t("home.card.next_step", {
            n: currentStep.step_number,
            title: currentStep.title,
          })}
        </Text>
      ) : (
        <Text style={[homeStyles.currentStep, { color: theme.success }]}>
          {t("home.card.all_done")}
        </Text>
      )}
    </TouchableOpacity>
  );
}

export default OrderCard;
