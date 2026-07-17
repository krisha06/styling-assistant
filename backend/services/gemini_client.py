"""Lazily-constructed, cached Gemini API client, plus a shared
generate_content wrapper with a single retry on ServerError.

Shared by every service that calls the Gemini API (image_caption.py,
concepts.py, ...) — factored out once a second call site needed it, so the
API-key check, client construction, and retry behavior stay in one place.

The retry exists because a real live call hit `503 UNAVAILABLE` ("This
model is currently experiencing high demand... usually temporary") —
Google's servers being overloaded, distinct from our own 429 rate-limit
handling in gemini_errors.py. One retry after a short delay resolves this
in many cases without surfacing anything to the user.
"""

import os
import time
from functools import lru_cache
from typing import Any

from google import genai
from google.genai import errors, types

RETRY_DELAY_SECONDS = 2


@lru_cache(maxsize=1)
def get_gemini_client() -> genai.Client:
    api_key = os.environ.get("GEMINI_API_KEY")
    if not api_key:
        raise RuntimeError("GEMINI_API_KEY not set. Add it to backend/.env (see .env.example).")
    return genai.Client(api_key=api_key)


def generate_content_with_retry(
    model: str, contents: Any, config: types.GenerateContentConfig | None = None
) -> types.GenerateContentResponse:
    client = get_gemini_client()
    try:
        return client.models.generate_content(model=model, contents=contents, config=config)
    except errors.ServerError:
        time.sleep(RETRY_DELAY_SECONDS)
        return client.models.generate_content(model=model, contents=contents, config=config)
