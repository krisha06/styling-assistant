"""Per-user preference vector: a running average of liked embeddings.

Not a trained model — CLAUDE.md section 1 describes this as a plain weighted
average, updated in place. One row per user in Supabase's preference_vectors
table (see backend/README/CLAUDE.md section 9 for the schema).
"""

import numpy as np

from services.supabase_client import get_supabase_client

TABLE = "preference_vectors"


def _parse_embedding(embedding: str | list[float]) -> np.ndarray:
    # supabase-py returns pgvector columns as Postgres's text serialization
    # ("[0.1,0.2,...]"), not a JSON array — confirmed live, not assumed.
    if isinstance(embedding, str):
        return np.array([float(x) for x in embedding.strip("[]").split(",")], dtype=np.float64)
    return np.array(embedding, dtype=np.float64)


def update_preference_vector(user_id: str, new_embedding: list[float]) -> None:
    client = get_supabase_client()

    existing = client.table(TABLE).select("embedding, like_count").eq("user_id", user_id).execute()

    if not existing.data:
        client.table(TABLE).insert(
            {"user_id": user_id, "embedding": new_embedding, "like_count": 1}
        ).execute()
        return

    row = existing.data[0]
    old_avg = _parse_embedding(row["embedding"])
    old_count = row["like_count"]
    new_vec = np.array(new_embedding, dtype=np.float64)

    # Running average — not atomic (read-then-write), acceptable at Phase 1's
    # traffic since a single user isn't swiping concurrently from two clients.
    new_avg = (old_avg * old_count + new_vec) / (old_count + 1)

    client.table(TABLE).update(
        {"embedding": new_avg.tolist(), "like_count": old_count + 1}
    ).eq("user_id", user_id).execute()
