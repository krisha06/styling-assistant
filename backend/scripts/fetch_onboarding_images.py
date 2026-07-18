"""
One-time, manually-run script to populate services/onboarding_deck.json.

Not part of the request path — CLAUDE.md section 1 specifies a fixed/curated
onboarding deck for Phase 1, not a dynamically-generated one. This script
queries SerpApi's Google Images engine once per style tag, so real curated
photos exist without hand-picking every URL. Re-run any time to refresh the
deck; it overwrites onboarding_deck.json.

Usage:
    cd backend
    source .venv/bin/activate
    python -m scripts.fetch_onboarding_images
"""

import json
import os
import sys
from pathlib import Path

import requests
from dotenv import load_dotenv

load_dotenv()

from services.clip import embed_image_url  # noqa: E402  (needs load_dotenv() first)

SERPAPI_KEY = os.environ.get("SERPAPI_KEY")
IMAGES_PER_TAG = 6
OUTPUT_PATH = Path(__file__).parent.parent / "services" / "onboarding_deck.json"

# tag -> search query. One query per fine-grained tag (not per UI bucket) so
# curation-audit tags stay attributable to a specific style, per the
# style-buckets.ts grouping used on the mobile side.
TAG_QUERIES: dict[str, str] = {
    "classic-timeless": "classic timeless outfit",
    "quiet-luxury": "quiet luxury outfit",
    "preppy": "preppy outfit",
    "workwear": "workwear outfit",
    "cozy-casual": "cozy casual outfit",
    "minimalist": "minimalist outfit",
    "athleisure": "athleisure outfit",
    "streetwear": "streetwear outfit",
    "colorful-maximalist": "colorful maximalist outfit",
    "eclectic-vintage": "eclectic vintage outfit",
    "romantic": "romantic outfit",
    "boho": "boho outfit",
}

# Age tag -> search query. These are a best-effort proxy via query phrasing
# only — Google Images has no real demographic filter, so results aren't
# guaranteed to actually depict someone in that age range. Each image gets
# just this one tag (no style tag), used as a second, independent filtering
# dimension alongside TAG_QUERIES in the mobile app's onboarding flow.
AGE_QUERIES: dict[str, str] = {
    "under-25": "young adult casual outfit college style",
    "25-40": "young professional outfit 30s",
    "40-60": "stylish outfit over 40",
    "60-plus": "senior style outfit over 60",
}


# Plain "<tag> outfit" queries pulled in a lot of unusable results: Pinterest
# "collage card" graphics (dozens of cut-out people composited onto a flat
# background with a big text caption) and magazine multi-celebrity cutout
# grids, not real single-shot photos. Appending this suffix + Google's
# itp:photo filter (excludes clipart/drawing/animated categories) verified
# via a live spot-check to reliably surface real street-style/editorial
# photography instead.
QUERY_SUFFIX = "street style photo -pinterest -collage -site:pinterest.com"

# Live-checked domains known to serve non-image placeholder pages (SEO
# crawler stand-ins) rather than the actual photo — cheap to skip before
# spending a network round trip on them. pinimg.com is Pinterest's image CDN:
# -site:pinterest.com in QUERY_SUFFIX only excludes results whose *source
# page* is pinterest.com, not images served from this CDN via other source
# pages, so it still let Pinterest-style collage graphics through — block
# the CDN host directly instead.
BLOCKED_URL_SUBSTRINGS = ["lookaside.instagram.com", "lookaside.fbsbx.com", "tiktok.com/api/img", "pinimg.com"]

MOBILE_USER_AGENT = "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15"


def is_url_usable(url: str) -> bool:
    # A live spot-check (curling all 94 URLs from an earlier run) found ~4%
    # returning 403 (hotlink protection) or an HTML placeholder instead of
    # the image — which the mobile app would render as a blank/black card.
    # Validating here, once, catches those before they ever reach the deck.
    try:
        resp = requests.get(url, headers={"User-Agent": MOBILE_USER_AGENT}, timeout=8, stream=True)
        content_type = resp.headers.get("Content-Type", "")
        resp.close()
        return resp.status_code == 200 and content_type.startswith("image")
    except requests.RequestException:
        return False


def fetch_images_for_tag(tag: str, query: str) -> list[dict]:
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

    # NOTE: CLAUDE.md section 3 flags SerpApi/Google Images response field
    # names as "best guesses" pending a live call. Confirmed here:
    # results live under "images_results", each item's direct image URL is
    # "original" (not "image_url"), and the linked page is "link". If a
    # future SerpApi response differs, update this function and flag the
    # mismatch back into CLAUDE.md section 3.
    images = []
    for item in data.get("images_results", []):
        if len(images) >= IMAGES_PER_TAG:
            break
        image_url = item.get("original")
        if not image_url:
            continue
        if any(blocked in image_url for blocked in BLOCKED_URL_SUBSTRINGS):
            continue
        if not is_url_usable(image_url):
            continue
        images.append(
            {
                "image_id": f"{tag}-{len(images)}",
                "image_url": image_url,
                "tags": [tag],
            }
        )
    return images


def embed_images(images: list[dict]) -> None:
    # Recomputed on every run, same as the rest of this script — image_id
    # isn't guaranteed stable across re-runs, so caching against a previous
    # onboarding_deck.json would be unsound. 94 sequential local CLIP
    # forward-passes is a small one-time cost for a manually-run script (the
    # first call is slow — it downloads the ~600MB model weights once).
    for i, image in enumerate(images, start=1):
        print(f"  embedding {i}/{len(images)}: {image['image_id']}")
        try:
            image["embedding"] = embed_image_url(image["image_url"])
        except Exception as e:
            print(f"    failed: {e}", file=sys.stderr)
            image["embedding"] = None


def main() -> None:
    if not SERPAPI_KEY:
        print("SERPAPI_KEY not set. Add it to backend/.env (see .env.example).", file=sys.stderr)
        sys.exit(1)

    all_images: list[dict] = []
    seen_urls: set[str] = set()

    for tag, query in {**TAG_QUERIES, **AGE_QUERIES}.items():
        print(f"Fetching images for tag '{tag}' ({query!r})...")
        try:
            images = fetch_images_for_tag(tag, query)
        except requests.RequestException as e:
            print(f"  failed: {e}", file=sys.stderr)
            continue

        for image in images:
            if image["image_url"] in seen_urls:
                continue
            seen_urls.add(image["image_url"])
            all_images.append(image)
        print(f"  got {len(images)} images")

    print(f"\nEmbedding {len(all_images)} images via local CLIP...")
    embed_images(all_images)
    failed = [img["image_id"] for img in all_images if img["embedding"] is None]
    all_images = [img for img in all_images if img["embedding"] is not None]
    if failed:
        print(f"  {len(failed)} image(s) dropped after embedding failure: {failed}", file=sys.stderr)

    OUTPUT_PATH.write_text(json.dumps(all_images, indent=2))
    print(f"\nWrote {len(all_images)} images to {OUTPUT_PATH}")


if __name__ == "__main__":
    main()
