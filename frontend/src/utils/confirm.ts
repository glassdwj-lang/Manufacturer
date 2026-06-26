import { Alert, Platform } from "react-native";

export interface ConfirmOptions {
  title: string;
  message: string;
  confirmLabel?: string;
  cancelLabel?: string;
  destructive?: boolean;
  onConfirm: () => void | Promise<void>;
}

/**
 * Cross-platform confirmation prompt.
 *
 * On native uses React Native Alert; on web uses the synchronous `window.confirm`
 * which is consistent with the rest of the codebase (the native Alert renders
 * but auto-dismisses on the Expo web preview in some browsers).
 */
export function confirmAction(opts: ConfirmOptions): void {
  const proceed = () => {
    const r = opts.onConfirm();
    if (r && typeof (r as Promise<void>).then === "function") {
      (r as Promise<void>).catch((e) => console.warn("confirmAction", e));
    }
  };
  if (Platform.OS === "web") {
    if (typeof window !== "undefined" && window.confirm(`${opts.title}\n\n${opts.message}`)) {
      proceed();
    }
    return;
  }
  Alert.alert(opts.title, opts.message, [
    { text: opts.cancelLabel || "Cancel", style: "cancel" },
    {
      text: opts.confirmLabel || "OK",
      style: opts.destructive ? "destructive" : "default",
      onPress: proceed,
    },
  ]);
}

/**
 * Cross-platform info notice. Falls back to `window.alert` on web for parity
 * with `confirmAction`.
 */
export function notify(title: string, message?: string): void {
  if (Platform.OS === "web") {
    if (typeof window !== "undefined") {
      window.alert(message ? `${title}\n\n${message}` : title);
    }
    return;
  }
  Alert.alert(title, message);
}
