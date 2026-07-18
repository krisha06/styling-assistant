import logging

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

from services.onboarding_deck import get_onboarding_deck, get_onboarding_image
from services.preference_vector import update_preference_vector

logger = logging.getLogger(__name__)

router = APIRouter()


class OnboardingDeckItem(BaseModel):
    image_id: str
    image_url: str
    tags: list[str]


class OnboardingDeckResponse(BaseModel):
    deck: list[OnboardingDeckItem]


class OnboardingSwipeRequest(BaseModel):
    user_id: str
    image_id: str
    liked: bool


class OnboardingSwipeResponse(BaseModel):
    status: str


@router.post("/onboarding-deck", response_model=OnboardingDeckResponse)
def onboarding_deck() -> OnboardingDeckResponse:
    return OnboardingDeckResponse(deck=get_onboarding_deck())


@router.post("/onboarding-swipe", response_model=OnboardingSwipeResponse)
def onboarding_swipe(payload: OnboardingSwipeRequest) -> OnboardingSwipeResponse:
    image = get_onboarding_image(payload.image_id)
    if image is None:
        raise HTTPException(status_code=404, detail=f"Unknown onboarding image_id: {payload.image_id}")

    # Per CLAUDE.md section 1 point 2: only liked embeddings are averaged
    # into the preference vector. Passes are acknowledged but ignored.
    if not payload.liked:
        return OnboardingSwipeResponse(status="ok")

    try:
        update_preference_vector(payload.user_id, image["embedding"])
    except Exception:
        logger.exception("Failed to update preference vector for user_id=%s", payload.user_id)
        raise HTTPException(status_code=500, detail="Failed to update preference vector")

    return OnboardingSwipeResponse(status="ok")
