/**
 * Public re-exports for the shared video subsystem. Import from here so
 * the rest of the codebase stays decoupled from the file layout under
 * `src/components/video/`.
 */
export { LoopingVideo } from "./LoopingVideo";
export type { LoopingVideoProps } from "./LoopingVideo";
export { MutePill } from "./MutePill";
export type { MutePillProps } from "./MutePill";
export { useVideoPlaybackPrefs } from "./useVideoPlaybackPrefs";
export type { VideoPlaybackPrefs } from "./useVideoPlaybackPrefs";
