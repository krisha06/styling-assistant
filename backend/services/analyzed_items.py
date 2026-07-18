"""Persists one row per /api/analyze-item call.

Mirrors preference_vector.py's use of the Supabase service-role client, but
this table is a plain insert-per-request log, not a running average — each
uploaded photo gets its own row, keyed by embedding_id.
"""

from services.supabase_client import get_supabase_client

TABLE = "analyzed_items"


def save_analyzed_item(user_id: str, embedding: list[float], item_description: str) -> str:
    client = get_supabase_client()
    result = (
        client.table(TABLE)
        .insert({"user_id": user_id, "embedding": embedding, "item_description": item_description})
        .execute()
    )
    return result.data[0]["embedding_id"]
