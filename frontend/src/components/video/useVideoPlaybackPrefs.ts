/**
 * Shared video playback preferences for every video surface in the app.
 *
 * Keeps the "muted/unmuted" choice consistent across the lightbox, the
 * dashboard hero video (when we add one), and any future video player.
 * Defaults to **muted** until the user explicitly enables sound; the
 * choice is then persisted via the app's AsyncStorage helper so it
 * survives app restarts.
 *
 * A module-level cache prevents the brief "unmuted flash" that would
 * otherwise happen on second/third opens while we await storage.
 */
import { useCallback, useEffect, useState } from "react";

import { storage } from "@/src/utils/storage";

const MUTE_STORAGE_KEY = "video.playback.muted";
let cachedMuted: boolean | null = null;
const subscribers = new Set<(muted: boolean) => void>();

function publish(muted: boolean) {
  cachedMuted = muted;
  for (const fn of subscribers) {
    try {
      fn(muted);
    } catch {
      // Subscribers are best-effort; never let one bad listener bring
      // down the broadcast.
    }
  }
}

export type VideoPlaybackPrefs = {
  /** True if videos should start (and stay) muted. */
  muted: boolean;
  /** Flip the muted preference for every active video at once. */
  toggleMuted: () => void;
  /** Set explicitly (used by programmatic flows; rarely needed). */
  setMuted: (next: boolean) => void;
};

/**
 * Reactive hook — every component using this stays in sync without prop
 * drilling, so a toggle inside the lightbox immediately affects a hero
 * video playing behind it.
 */
export function useVideoPlaybackPrefs(): VideoPlaybackPrefs {
  const [muted, setMutedState] = useState<boolean>(cachedMuted ?? true);

  // Subscribe to global changes so any component using the hook stays
  // synchronised when another instance toggles the preference.
  useEffect(() => {
    subscribers.add(setMutedState);
    return () => {
      subscribers.delete(setMutedState);
    };
  }, []);

  // Hydrate once from persisted storage. Only the very first hook
  // instance does the read; everyone else inherits the cached value.
  useEffect(() => {
    if (cachedMuted !== null) return;
    (async () => {
      const stored = await storage.getItem<boolean>(MUTE_STORAGE_KEY, true);
      publish(stored ?? true);
    })();
  }, []);

  const setMuted = useCallback((next: boolean) => {
    publish(next);
    void storage.setItem(MUTE_STORAGE_KEY, next);
  }, []);

  const toggleMuted = useCallback(() => {
    setMuted(!(cachedMuted ?? true));
  }, [setMuted]);

  return { muted, toggleMuted, setMuted };
}
