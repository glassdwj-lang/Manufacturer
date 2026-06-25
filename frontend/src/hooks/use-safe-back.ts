// Safe back navigation: falls back to a home replace when there is no history
// (page was reloaded directly, or screen was opened via deep link).
import { useRouter } from "expo-router";
import { useCallback } from "react";

const HOME = "/(app)";

export function useSafeBack(fallback: string = HOME) {
  const router = useRouter();
  return useCallback(() => {
    if (router.canGoBack && router.canGoBack()) {
      router.back();
    } else {
      // Replace so the now-orphan screen does not stay on the back stack
      router.replace(fallback as any);
    }
  }, [router, fallback]);
}
