"""
Translation service for Atelier.

Translates short text (manufacturer notes, associate review notes) into the
client's preferred language using Claude Sonnet 4.5 via the Emergent LLM key.

- One-shot, non-streaming: caller awaits result and persists the translation.
- Skipped when source == target (e.g. English client receiving English note).
- Country → language mapping is opinionated for the markets Somnio.Co serves.
"""
from __future__ import annotations
import os
import uuid
import logging
from typing import Optional

logger = logging.getLogger(__name__)

# ---------------- Country → language map ----------------
# Each entry: ISO country code -> (BCP-47 language tag, native language name)
COUNTRY_LANG: dict[str, tuple[str, str]] = {
    "AU": ("en", "English"),
    "GB": ("en", "English"),
    "US": ("en", "English"),
    "CA": ("en", "English"),
    "NZ": ("en", "English"),
    "IE": ("en", "English"),
    "SG": ("en", "English"),
    "ZA": ("en", "English"),
    "CN": ("zh-CN", "Chinese (Simplified)"),
    "HK": ("zh-HK", "Chinese (Traditional)"),
    "TW": ("zh-TW", "Chinese (Traditional)"),
    "JP": ("ja", "Japanese"),
    "KR": ("ko", "Korean"),
    "FR": ("fr", "French"),
    "BE": ("fr", "French"),
    "CH": ("fr", "French"),
    "DE": ("de", "German"),
    "AT": ("de", "German"),
    "IT": ("it", "Italian"),
    "ES": ("es", "Spanish"),
    "PT": ("pt", "Portuguese"),
    "BR": ("pt-BR", "Portuguese (Brazil)"),
    "NL": ("nl", "Dutch"),
    "AE": ("ar", "Arabic"),
    "SA": ("ar", "Arabic"),
    "QA": ("ar", "Arabic"),
    "IN": ("en", "English"),  # English is widely used
    "RU": ("ru", "Russian"),
    "TR": ("tr", "Turkish"),
    "GR": ("el", "Greek"),
    "MX": ("es", "Spanish"),
    "TH": ("th", "Thai"),
    "ID": ("id", "Indonesian"),
    "MY": ("ms", "Malay"),
    "VN": ("vi", "Vietnamese"),
    "PH": ("en", "English"),
}

# List of (code, name) tuples for the country dropdown
COUNTRY_LIST = sorted(
    [
        ("AU", "Australia"),
        ("GB", "United Kingdom"),
        ("US", "United States"),
        ("CA", "Canada"),
        ("NZ", "New Zealand"),
        ("IE", "Ireland"),
        ("SG", "Singapore"),
        ("ZA", "South Africa"),
        ("CN", "China"),
        ("HK", "Hong Kong"),
        ("TW", "Taiwan"),
        ("JP", "Japan"),
        ("KR", "South Korea"),
        ("FR", "France"),
        ("BE", "Belgium"),
        ("CH", "Switzerland"),
        ("DE", "Germany"),
        ("AT", "Austria"),
        ("IT", "Italy"),
        ("ES", "Spain"),
        ("PT", "Portugal"),
        ("BR", "Brazil"),
        ("NL", "Netherlands"),
        ("AE", "United Arab Emirates"),
        ("SA", "Saudi Arabia"),
        ("QA", "Qatar"),
        ("IN", "India"),
        ("RU", "Russia"),
        ("TR", "Turkey"),
        ("GR", "Greece"),
        ("MX", "Mexico"),
        ("TH", "Thailand"),
        ("ID", "Indonesia"),
        ("MY", "Malaysia"),
        ("VN", "Vietnam"),
        ("PH", "Philippines"),
    ],
    key=lambda x: x[1],
)


def language_for_country(country_code: Optional[str]) -> tuple[str, str]:
    """Returns (lang_tag, native_name). Defaults to English when unknown / empty."""
    if not country_code:
        return ("en", "English")
    return COUNTRY_LANG.get(country_code.upper(), ("en", "English"))


# ---------------- Translation call ----------------
async def translate(
    text: str,
    target_lang: str,
    target_lang_name: str,
    source_hint: Optional[str] = None,
) -> Optional[str]:
    """Translate a short snippet into target_lang.

    Returns the translated string, or None on failure / when no translation needed.
    Safe to call with empty/None text — returns None.
    """
    if not text or not text.strip():
        return None
    if target_lang.lower().startswith("en"):
        # Source is presumed to be the manufacturer's writing language. For an
        # English-speaking client we leave the note as-is; caller handles fallback.
        return None

    key = os.environ.get("EMERGENT_LLM_KEY")
    if not key:
        logger.warning("EMERGENT_LLM_KEY missing — skipping translation")
        return None

    try:
        from emergentintegrations.llm.chat import LlmChat, UserMessage
    except ImportError:
        logger.warning("emergentintegrations not installed — skipping translation")
        return None

    system_prompt = (
        "You are a precise luxury-brand translator for Somnio.Co Atelier, a high-end jewelry maison. "
        "Translate the manufacturer's craftsmanship note into the requested target language for a "
        "discerning client. Preserve brand terminology in their original form: Atelier, Maison, "
        "Provenance, Somnio.Co. Keep the same number of sentences. Do NOT add commentary, do NOT "
        "wrap in quotes, do NOT prefix with 'Translation:'. Return only the translated text."
    )

    user_text = (
        f"Target language: {target_lang_name} ({target_lang})\n"
        f"{f'Source language hint: {source_hint}{chr(10)}' if source_hint else ''}"
        f"Text to translate:\n---\n{text}\n---"
    )

    try:
        chat = LlmChat(
            api_key=key,
            session_id=f"translate-{uuid.uuid4().hex[:8]}",
            system_message=system_prompt,
        ).with_model("anthropic", "claude-sonnet-4-5-20250929")
        result = await chat.send_message(UserMessage(text=user_text))
        if hasattr(result, "content"):
            return str(result.content).strip()
        return str(result).strip()
    except Exception as e:
        logger.exception("translation failed: %s", e)
        return None
