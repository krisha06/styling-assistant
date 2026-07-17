"""Builds individual clothing-item images per outfit concept for
/api/build-recommendations.

Originally searched per-concept and returned full-outfit street-style
photos ranked by CLIP similarity to the user's preference vector (per
CLAUDE.md section 1 step 4). Rebuilt to search per-item instead — the
full-outfit photos often didn't match a concept's actual listed items and
looked worse than expected. Each item gets its own product/flat-lay-style
search (reference_images.search_reference_images) and the first live
candidate wins (reference_images.is_url_usable) — no CLIP embedding here;
see reference_images.py's docstring for why per-item ranking was dropped.
Capped at ITEMS_PER_CONCEPT items (a concept can list up to 6; showing all
of them made each concept card too long).
"""

import logging

from services.reference_images import ImageCandidate, is_url_usable, search_reference_images

logger = logging.getLogger(__name__)

ITEMS_PER_CONCEPT = 4
CANDIDATES_PER_ITEM = 3


class ItemImage(ImageCandidate):
    item: str


def _find_image_for_item(item: str) -> ItemImage | None:
    try:
        candidates = search_reference_images(item, CANDIDATES_PER_ITEM)
    except Exception:
        logger.exception("SerpApi search failed for item %r", item)
        return None

    for candidate in candidates:
        if is_url_usable(candidate["image_url"]):
            return {"item": item, "image_url": candidate["image_url"], "source": candidate["source"]}
    return None


def build_recommendations(concepts: list[dict]) -> list[dict]:
    recommendations = []
    for concept in concepts:
        images = []
        for item in concept["items"][:ITEMS_PER_CONCEPT]:
            image = _find_image_for_item(item)
            if image is not None:
                images.append(image)
        recommendations.append(
            {
                "vibe_label": concept["vibe_label"],
                "explanation": concept["explanation"],
                "images": images,
            }
        )
    return recommendations
