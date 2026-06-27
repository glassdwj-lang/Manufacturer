/**
 * Manual on-demand translation hook. Uses the viewer's currently-picked
 * display language (`user.preferred_language` → MANUAL_TARGETS) and asks
 * the backend to translate the step's workshop note + associate review
 * note. Result is held in state only — NOT persisted.
 *
 * The reset() callback is invoked from the parent when language changes
 * so a stale translation doesn't linger across switches.
 */
import { useCallback, useEffect, useState } from "react";
import { api, Step } from "@/src/api/client";
import { useAuth } from "@/src/context/AuthContext";
import { MANUAL_TARGETS } from "./utils";

export type ManualTranslation = {
  notes: string;
  review: string;
  targetTag: string;
  targetName: string;
};

export function useManualTranslate(
  orderId: string | undefined,
  stepNum: number,
  step: Step | null,
) {
  const { user, languageVersion } = useAuth();
  const [manualTranslated, setManualTranslated] = useState<ManualTranslation | null>(null);
  const [translating, setTranslating] = useState(false);
  const [translateError, setTranslateError] = useState<string | null>(null);

  // Clear any on-demand translation when the viewer's display language
  // changes so the new pick takes over.
  useEffect(() => {
    setManualTranslated(null);
    setTranslateError(null);
  }, [languageVersion]);

  const handleManualTranslate = useCallback(async () => {
    if (!orderId || !step) return;
    const code = (user?.preferred_language || "").toLowerCase();
    const target = MANUAL_TARGETS[code];
    if (!target) {
      setTranslateError(
        "Pick a non-English display language from the header first.",
      );
      return;
    }
    setTranslating(true);
    setTranslateError(null);
    try {
      const res = await api.translateStepNote(
        orderId,
        stepNum,
        target.tag,
        target.name,
      );
      setManualTranslated({
        notes: res.notes_translated || step.notes || "",
        review:
          res.associate_review_note_translated ||
          step.associate_review_note ||
          "",
        targetTag: res.target_lang,
        targetName: res.target_lang_name,
      });
    } catch (e: any) {
      setTranslateError(e?.message ?? "Translation failed");
    } finally {
      setTranslating(false);
    }
  }, [orderId, stepNum, step, user?.preferred_language]);

  return {
    manualTranslated,
    translating,
    translateError,
    handleManualTranslate,
  };
}
