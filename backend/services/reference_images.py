"""Fetches candidate reference images for individual clothing items via
SerpApi's Google Images engine, for /api/build-recommendations.

Reuses the query-quality fixes already discovered in
scripts/fetch_onboarding_images.py — plain queries surfaced Pinterest
collage graphics and dead-link hosts; the query suffix + tbs=itp:photo
filter and the blocked-domain list fix that (see that script's comments
for the full reasoning). The suffix here targets product/flat-lay style
shots of a single item, not full-outfit street-style photos — this module
originally searched per-concept ("<vibe_label> outfit <items>"), swapped
to per-item search after the outfit-photo results looked poor and often
didn't match the concept's actual listed items.

is_url_usable does a live GET + content-type check (same approach as
fetch_onboarding_images.py's validation), used to pick the first live
candidate per item — no CLIP embedding/ranking here. Personalization for
this endpoint happens upstream, in which items a concept lists
(taste_summary.py biases generate-concepts) — ranking *which specific
stock photo* of a given item to show added CLIP-embedding cost for
minimal benefit (per-item photo style doesn't vary much by taste), so it
was dropped in favor of speed.
"""

import os
from typing import TypedDict

import requests

SERPAPI_KEY = os.environ.get("SERPAPI_KEY")

QUERY_SUFFIX = "product photo -pinterest -collage -site:pinterest.com"
BLOCKED_URL_SUBSTRINGS = ["lookaside.instagram.com", "lookaside.fbsbx.com", "tiktok.com/api/img", "pinimg.com"]
MOBILE_USER_AGENT = "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15"


class ImageCandidate(TypedDict):
    image_url: str
    source: str


def is_url_usable(url: str) -> bool:
    try:
        resp = requests.get(url, headers={"User-Agent": MOBILE_USER_AGENT}, timeout=8, stream=True)
        content_type = resp.headers.get("Content-Type", "")
        resp.close()
        return resp.status_code == 200 and content_type.startswith("image")
    except requests.RequestException:
        return False


def search_reference_images(query: str, max_results: int) -> list[ImageCandidate]:
    if not SERPAPI_KEY:
        raise RuntimeError("SERPAPI_KEY not set. Add it to backend/.env (see .env.example).")

    resp = requests.get(
        "https://serpapi.com/search",
        params={
            "engine": "google_images",
            "q": f"{query} {QUERY_SUFFIX}",
            "tbs": "itp:photo",
            "api_key": SERPAPI_KEY,
        },
        timeout=30,
    )
    resp.raise_for_status()
    data = resp.json()

    # Same field names confirmed live in fetch_onboarding_images.py:
    # "images_results", each item's direct image URL is "original", the
    # linked source page is "link".
    candidates: list[ImageCandidate] = []
    for item in data.get("images_results", []):
        if len(candidates) >= max_results:
            break
        image_url = item.get("original")
        source = item.get("link")
        if not image_url or not source:
            continue
        if any(blocked in image_url for blocked in BLOCKED_URL_SUBSTRINGS):
            continue
        candidates.append({"image_url": image_url, "source": source})
    return candidates
