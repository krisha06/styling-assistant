"""Lazily-constructed, cached Supabase client for the backend.

Uses the service role key (not the public/anon key) since the backend writes
preference_vectors rows for client-generated user_ids that have no real
Supabase Auth session behind them yet (Phase 1). Never expose this key to the
mobile client.
"""

import os

from supabase import Client, create_client

_client: Client | None = None


def get_supabase_client() -> Client:
    global _client
    if _client is None:
        url = os.environ.get("SUPABASE_URL")
        key = os.environ.get("SUPABASE_SERVICE_ROLE_KEY")
        if not url or not key:
            raise RuntimeError(
                "SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY not set. Add them to backend/.env (see .env.example)."
            )
        _client = create_client(url, key)
    return _client
