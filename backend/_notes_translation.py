"""
Viewer-aware notes translation cache.

Each step keeps a `notes_i18n` and `associate_review_note_i18n` dictionary of
the form `{ "<bcp47_tag>": "<translated_text>", ... }`. When a viewer fetches
an order or PDF in a non-English language, we look up the cache; on miss we
call the LLM, persist the result, and surface it as `notes_translated` /
`associate_review_note_translated` on the response.

Persisting per language means we avoid re-translating the same note on every
request — translation happens once per (step, language).
"""
from __future__ import annotations
import asyncio
import logging
from typing import Any

from _translation import translate as translate_text
from deps import db
from helpers import language_for_user

logger = logging.getLogger(__name__)


def _norm_tag(tag: str) -> str:
    """Lowercase + strip; mirror the keys we store under."""
    return (tag or "").strip().lower()


def _is_english(tag: str) -> bool:
    return _norm_tag(tag).startswith("en")


async def ensure_translations_for_viewer(order: dict, viewer: dict) -> dict:
    """Mutates `order` in place: for the viewer's preferred language, ensures
    every step's `notes_translated` and `associate_review_note_translated`
    fields are populated. Caches new translations on the step under
    `notes_i18n` / `associate_review_note_i18n` and persists them.

    Returns the (mutated) order. No-op for English viewers.
    """
    if not order or "steps" not in order:
        return order

    lang_tag, lang_name = language_for_user(viewer)
    if _is_english(lang_tag):
        # English viewers: clear any stale translation fields so the UI shows
        # the original notes.
        for s in order["steps"]:
            s["notes_translated"] = ""
            s["associate_review_note_translated"] = ""
            s["notes_target_lang"] = ""
        return order

    target = _norm_tag(lang_tag)

    pending: list[tuple[int, str, str]] = []  # (step_number, field, text)
    for s in order["steps"]:
        if not s.get("completed"):
            continue
        notes = (s.get("notes") or "").strip()
        review = (s.get("associate_review_note") or "").strip()

        cache_notes = (s.get("notes_i18n") or {}) if isinstance(s.get("notes_i18n"), dict) else {}
        cache_review = (
            (s.get("associate_review_note_i18n") or {})
            if isinstance(s.get("associate_review_note_i18n"), dict)
            else {}
        )

        # Backfill cache from legacy single-language fields when the saved
        # `notes_target_lang` matches the viewer's tag — saves an LLM call.
        legacy_tag = _norm_tag(s.get("notes_target_lang") or "")
        if legacy_tag and legacy_tag == target:
            if s.get("notes_translated") and target not in cache_notes:
                cache_notes[target] = s["notes_translated"]

        if notes and target not in cache_notes:
            pending.append((s["step_number"], "notes", notes))
        if review and target not in cache_review:
            pending.append((s["step_number"], "associate_review_note", review))

        # Surface from cache if present.
        s["notes_translated"] = cache_notes.get(target, "") or s.get("notes_translated", "") if legacy_tag == target else cache_notes.get(target, "")
        s["associate_review_note_translated"] = cache_review.get(target, "")
        s["notes_target_lang"] = target if s.get("notes_translated") else ""
        # Stash dicts back in case caller persists later (we also persist below).
        s["notes_i18n"] = cache_notes
        s["associate_review_note_i18n"] = cache_review

    if not pending:
        return order

    # Translate all pending strings concurrently.
    async def _tx(text: str) -> str:
        try:
            t = await translate_text(text, target, lang_name)
            return t or ""
        except Exception as e:
            logger.warning("ensure_translations_for_viewer: translate failed: %s", e)
            return ""

    results = await asyncio.gather(*[_tx(text) for (_n, _f, text) in pending])

    # Apply results and persist per-step in one $set.
    step_to_updates: dict[int, dict[str, Any]] = {}
    for (step_num, field, _text), translated in zip(pending, results):
        if not translated:
            continue
        # find the step dict to update in memory
        for s in order["steps"]:
            if s["step_number"] != step_num:
                continue
            if field == "notes":
                d = s.get("notes_i18n") or {}
                d[target] = translated
                s["notes_i18n"] = d
                s["notes_translated"] = translated
                s["notes_target_lang"] = target
            else:
                d = s.get("associate_review_note_i18n") or {}
                d[target] = translated
                s["associate_review_note_i18n"] = d
                s["associate_review_note_translated"] = translated
            updates = step_to_updates.setdefault(step_num, {})
            key = "notes_i18n" if field == "notes" else "associate_review_note_i18n"
            updates[key] = s.get(key)
            break

    # Persist new cache entries.
    if step_to_updates and order.get("id"):
        for step_num, fields in step_to_updates.items():
            try:
                set_fields = {f"steps.$.{k}": v for k, v in fields.items()}
                await db.orders.update_one(
                    {"id": order["id"], "steps.step_number": step_num},
                    {"$set": set_fields},
                )
            except Exception as e:
                logger.warning(
                    "Failed to persist notes_i18n for order=%s step=%s: %s",
                    order.get("id"),
                    step_num,
                    e,
                )

    return order
