"""Shared embedding helpers: pgvector parsing + cosine similarity.

parse_pgvector was factored out of preference_vector.py once
taste_summary.py needed the same parsing — supabase-py returns pgvector
columns as Postgres's text serialization ("[0.1,0.2,...]"), not a JSON
array (confirmed live, not assumed). Naively `np.array(row["embedding"])`
on the raw value silently produces a 0-d string array, not a float array.

cosine_similarity was factored out the same way once a third call site
(recommendations.py) needed the same nearest-neighbor math already used
by taste_summary.py.
"""

import numpy as np


def parse_pgvector(embedding: str | list[float]) -> np.ndarray:
    if isinstance(embedding, str):
        return np.array([float(x) for x in embedding.strip("[]").split(",")], dtype=np.float64)
    return np.array(embedding, dtype=np.float64)


def cosine_similarity(a: np.ndarray, b: np.ndarray) -> float:
    return float(np.dot(a, b) / (np.linalg.norm(a) * np.linalg.norm(b)))
