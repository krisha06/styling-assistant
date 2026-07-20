"""Shared FastAPI error mapping for Gemini API calls.

Used by every route that calls the Gemini API (item.py, concepts.py, ...)
so the error-to-HTTPException mapping and user-facing messages stay
consistent instead of drifting per route.
"""

import logging
from typing import NoReturn

from fastapi import HTTPException
from google.genai.errors import ClientError, ServerError

RATE_LIMIT_MESSAGE = "We're getting a lot of requests right now — please try again in a few minutes."
OVERLOADED_MESSAGE = "Sorry for the inconvenience — the description service is temporarily overloaded. Please try again later."


def raise_for_gemini_error(e: Exception, logger: logging.Logger, user_id: str, action: str) -> NoReturn:
    if isinstance(e, ClientError) and e.code == 429:
        logger.warning("Gemini rate limit hit for user_id=%s (%s)", user_id, action)
        raise HTTPException(status_code=429, detail=RATE_LIMIT_MESSAGE)
    if isinstance(e, ServerError):
        # Google's servers overloaded (503) — generate_content_with_retry
        # already retried once before this was raised, so a second failure
        # is worth its own message rather than folding into the generic case.
        logger.warning("Gemini overloaded (after retry) for user_id=%s (%s)", user_id, action)
        raise HTTPException(status_code=503, detail=OVERLOADED_MESSAGE)
    logger.exception("Gemini call failed for user_id=%s (%s)", user_id, action)
    raise HTTPException(status_code=500, detail=f"Failed to {action}")
