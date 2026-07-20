"""Persists build-recommendations output and tracks like status.

One row per concept card (matches the like granularity the mobile client
already uses — one heart per card, not per image). images is stored as
jsonb, not normalized into its own table — small, fixed-shape array with
no per-element query need, same minimal-schema preference as
preference_vectors/analyzed_items (see CLAUDE.md section 9).
"""

from services.supabase_client import get_supabase_client

TABLE = "recommendations"


def save_recommendations(user_id: str, recommendations: list[dict]) -> list[dict]:
    client = get_supabase_client()
    rows = [
        {
            "user_id": user_id,
            "vibe_label": r["vibe_label"],
            "explanation": r["explanation"],
            "images": r["images"],
        }
        for r in recommendations
    ]
    if not rows:
        return []
    result = client.table(TABLE).insert(rows).execute()
    return result.data


def mark_recommendation_liked(user_id: str, recommendation_id: str) -> list[dict] | None:
    client = get_supabase_client()
    result = (
        client.table(TABLE)
        .update({"liked": True})
        .eq("id", recommendation_id)
        .eq("user_id", user_id)
        .execute()
    )
    if not result.data:
        return None
    return result.data[0]["images"]


def get_recommendation_history(user_id: str) -> list[dict]:
    client = get_supabase_client()
    result = (
        client.table(TABLE)
        .select("id, vibe_label, explanation, images, liked, created_at")
        .eq("user_id", user_id)
        .order("created_at", desc=True)
        .limit(100)
        .execute()
    )
    return result.data
