"""Clothing-item description via the Gemini API (gemini-3.5-flash).

Originally a local BLIP captioning model (free, self-hosted, same pattern as
services/clip.py) — swapped out after real-device testing showed BLIP
describes the overall scene/person ("a man holding a white shirt") rather
than clothing detail, missing things like logos and patterns. Gemini's
free tier covers this project's call volume, so this reintroduces one
external dependency but not a paid one.
"""

from google.genai import types

from services.gemini_client import generate_content_with_retry

MODEL_ID = "gemini-3.5-flash"

PROMPT = (
    "Describe the clothing item in this image in one or two sentences. "
    "Focus only on the garment itself: type of item, color, pattern, "
    "material appearance, fit/silhouette, and any visible logos, text, or "
    "graphics. Do not describe the person wearing it, their pose, or the "
    "background."
)


def describe_item(image_bytes: bytes, mime_type: str = "image/jpeg") -> str:
    response = generate_content_with_retry(
        model=MODEL_ID,
        contents=[
            types.Part.from_bytes(data=image_bytes, mime_type=mime_type),
            PROMPT,
        ],
    )
    return response.text.strip()
