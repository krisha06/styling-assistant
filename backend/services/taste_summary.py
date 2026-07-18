"""Derives a short text summary of a user's style taste from their Supabase
preference vector, for use in generate-concepts prompts.

Section 3's contract calls for "a text summary of the user's taste," but a
preference vector is just 512 numbers — there's no text to read off it
directly. Heuristic used here: find the onboarding pool images most similar
(cosine similarity) to the user's vector, and summarize the most common
style tags among them (e.g. "leans toward: minimalist, quiet-luxury").
"""

import numpy as np

from services.embedding_utils import cosine_similarity
from services.onboarding_deck import get_onboarding_deck
from services.preference_vector import get_preference_vector

TOP_K_NEIGHBORS = 5
TOP_N_TAGS = 3

# Age-range tags aren't style descriptors — excluded so the summary reads
# as "leans toward: minimalist, quiet-luxury", not "..., 25-40".
_AGE_TAGS = {"under-25", "25-40", "40-60", "60-plus"}


def get_taste_summary(user_id: str) -> str | None:
    preference_vector = get_preference_vector(user_id)
    if preference_vector is None:
        return None

    pool = get_onboarding_deck()
    if not pool:
        return None

    scored = [
        (cosine_similarity(preference_vector, np.array(image["embedding"], dtype=np.float64)), image)
        for image in pool
    ]
    scored.sort(key=lambda pair: pair[0], reverse=True)
    top_neighbors = [image for _, image in scored[:TOP_K_NEIGHBORS]]

    tag_counts: dict[str, int] = {}
    for image in top_neighbors:
        for tag in image["tags"]:
            if tag in _AGE_TAGS:
                continue
            tag_counts[tag] = tag_counts.get(tag, 0) + 1

    if not tag_counts:
        return None

    top_tags = sorted(tag_counts, key=lambda tag: tag_counts[tag], reverse=True)[:TOP_N_TAGS]
    return "leans toward: " + ", ".join(top_tags)
