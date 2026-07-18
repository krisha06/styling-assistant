"""Verifies the Supabase access token on every request and derives user_id
from it, instead of trusting whatever user_id string a client sends.

Verified live against the installed supabase-py (supabase_auth==2.31.0,
_sync/gotrue_client.py): auth.get_user(jwt) sends the *passed* jwt as the
bearer for that one request, regardless of which key the client itself was
constructed with — so the existing service-role client
(services/supabase_client.py) doubles as the token verifier here. No second
Supabase client or extra env var needed.
"""

from fastapi import Header, HTTPException

from services.supabase_client import get_supabase_client


def get_current_user_id(authorization: str = Header(...)) -> str:
    if not authorization.startswith("Bearer "):
        raise HTTPException(status_code=401, detail="Missing or malformed Authorization header")

    token = authorization.removeprefix("Bearer ")
    try:
        response = get_supabase_client().auth.get_user(token)
    except Exception:
        raise HTTPException(status_code=401, detail="Invalid or expired session")

    if response is None or response.user is None:
        raise HTTPException(status_code=401, detail="Invalid or expired session")

    return response.user.id
