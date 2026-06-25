import { Stack } from "expo-router";
import { theme } from "@/src/theme";

export default function AppLayout() {
  return (
    <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: theme.bg } }}>
      <Stack.Screen name="index" />
      <Stack.Screen name="order/[id]" />
      <Stack.Screen name="step/[orderId]/[stepNumber]" options={{ presentation: "modal" }} />
      <Stack.Screen name="customs/[orderId]" options={{ presentation: "modal" }} />
      <Stack.Screen name="create-order" options={{ presentation: "modal" }} />
      <Stack.Screen name="users" />
      <Stack.Screen name="create-user" options={{ presentation: "modal" }} />
      <Stack.Screen name="debug" />
    </Stack>
  );
}
