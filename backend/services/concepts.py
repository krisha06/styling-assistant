"""Generates outfit concepts from an item description via the Gemini API.

Same provider as image_caption.py (gemini-3.5-flash) — kept consistent
after the cost-driven move off Claude for item_description; section 2's
original Claude pin for this step wasn't separately reconsidered, this
follows that same decision. Uses response_schema for structured JSON
output rather than free-text parsing (confirmed live that the installed
google-genai version supports response_mime_type="application/json" +
response_schema on GenerateContentConfig, and returns a parsed Pydantic
instance on response.parsed).
"""

from google.genai import types
from pydantic import BaseModel, Field

from services.gemini_client import generate_content_with_retry

MODEL_ID = "gemini-3.5-flash"


class Concept(BaseModel):
    vibe_label: str
    items: list[str]
    explanation: str


class ConceptsResult(BaseModel):
    concepts: list[Concept] = Field(min_length=3, max_length=4)


def _build_prompt(item_description: str, taste_summary: str | None) -> str:
    taste_line = f"\nThe user's style taste {taste_summary}." if taste_summary else ""
    return (
        f"A user uploaded a clothing item described as: {item_description}."
        f"{taste_line}\n\n"
        "Generate 3-4 distinct outfit concepts built around this item. For "
        "each concept, provide: a short vibe_label (2-4 words, e.g. "
        '"Weekend Casual" or "Elevated Minimalist"); items, a list of 3-6 '
        "specific clothing/accessory pieces that complete the outfit (do "
        "not repeat the uploaded item itself); and a one-sentence "
        "explanation of why the outfit works."
    )


def generate_concepts(item_description: str, taste_summary: str | None) -> list[Concept]:
    response = generate_content_with_retry(
        model=MODEL_ID,
        contents=_build_prompt(item_description, taste_summary),
        config=types.GenerateContentConfig(
            response_mime_type="application/json",
            response_schema=ConceptsResult,
        ),
    )
    parsed = response.parsed
    if not isinstance(parsed, ConceptsResult):
        raise ValueError(f"Gemini response did not match the expected concepts schema: {response.text!r}")
    return parsed.concepts
