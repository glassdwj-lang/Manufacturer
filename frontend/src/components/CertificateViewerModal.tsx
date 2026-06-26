/**
 * CertificateViewerModal — full-screen, lightbox-style in-app preview
 * for IGI certificates (and any other Cloudinary file we want to show
 * inline). The chrome intentionally mirrors PhotoLightbox so a client
 * tapping a PDF gets the same close-button affordance they already
 * know from the step photo viewer.
 *
 * • Images render with a native <Image> sized to "contain" — tap
 *   anywhere on the dark backdrop to dismiss, exactly like the
 *   photo lightbox.
 * • PDFs render via an <iframe> on web (browsers ship a native PDF
 *   reader) and react-native-webview on iOS / Android (both
 *   platforms render PDFs natively via their WebView).
 * • An optional caption pill at the top shows the filename so users
 *   can confirm what they're looking at without an opaque header bar.
 * • A floating circular close button (top-right) is the only chrome.
 */
import React from "react";
import {
  Image,
  Modal,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { WebView } from "react-native-webview";

function looksLikePdf(url: string): boolean {
  return /\.pdf(\?[^#]*)?$/i.test(url || "");
}
function looksLikeImage(url: string): boolean {
  return /\.(jpe?g|png|webp|gif|heic|heif|tiff?|bmp|avif)(\?|$)/i.test(url || "");
}

export type CertificateViewerModalProps = {
  visible: boolean;
  url: string | null;
  /** Filename (or any other label) shown as the caption pill. */
  title?: string | null;
  onClose: () => void;
};

export function CertificateViewerModal({
  visible,
  url,
  title,
  onClose,
}: CertificateViewerModalProps) {
  if (!url) return null;
  const isPdf = looksLikePdf(url);
  const isImage = looksLikeImage(url) && !isPdf;

  // For PDFs we DON'T put a Pressable behind the iframe because the
  // user needs to tap inside the document (scroll, zoom). Close is
  // strictly via the floating X button.
  // For images we DO put a Pressable so tap-anywhere dismisses,
  // matching PhotoLightbox.
  const renderBody = () => {
    if (isImage) {
      return (
        <Pressable
          style={StyleSheet.absoluteFill}
          onPress={onClose}
          testID="cert-viewer-backdrop"
        >
          <Image
            source={{ uri: url }}
            style={styles.image}
            resizeMode="contain"
          />
        </Pressable>
      );
    }
    // Anything else (PDF, octet-stream, unknown) → embedded viewer.
    if (Platform.OS === "web") {
      return React.createElement("iframe", {
        src: url,
        style: {
          border: 0,
          position: "absolute",
          inset: 0,
          width: "100%",
          height: "100%",
          background: "#000",
        },
        sandbox: "allow-scripts allow-same-origin allow-popups",
        title: title || "Certificate preview",
      });
    }
    return (
      <WebView
        originWhitelist={["*"]}
        source={{ uri: url }}
        style={StyleSheet.absoluteFill}
        startInLoadingState
      />
    );
  };

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={onClose}
      statusBarTranslucent
    >
      <View style={styles.backdrop}>
        {renderBody()}

        {/* Caption pill (filename) — purely informational, doesn't
            intercept taps. */}
        {title ? (
          <View style={styles.titlePill} pointerEvents="none">
            <Text style={styles.titleText} numberOfLines={1}>
              {title}
            </Text>
          </View>
        ) : null}

        {/* Floating close button — identical placement & styling to
            the photo lightbox so users learn one close affordance. */}
        <TouchableOpacity
          style={styles.closeBtn}
          onPress={onClose}
          testID="cert-viewer-close"
          accessibilityLabel="Close preview"
          hitSlop={{ top: 12, right: 12, bottom: 12, left: 12 }}
        >
          <Ionicons name="close" size={22} color="#fff" />
        </TouchableOpacity>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: "#000",
  },
  image: { width: "100%", height: "100%" },
  titlePill: {
    position: "absolute",
    top: Platform.OS === "ios" ? 56 : 24,
    alignSelf: "center",
    maxWidth: "70%",
    backgroundColor: "rgba(0,0,0,0.45)",
    borderColor: "rgba(255,255,255,0.18)",
    borderWidth: StyleSheet.hairlineWidth,
    paddingHorizontal: 14,
    paddingVertical: 6,
    borderRadius: 999,
  },
  titleText: {
    color: "#fff",
    fontSize: 11,
    letterSpacing: 2,
    fontWeight: "600",
  },
  closeBtn: {
    position: "absolute",
    top: Platform.OS === "ios" ? 54 : 22,
    right: 18,
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: "rgba(0,0,0,0.55)",
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: "rgba(255,255,255,0.18)",
    justifyContent: "center",
    alignItems: "center",
  },
});

export default CertificateViewerModal;
