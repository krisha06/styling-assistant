from fastapi import APIRouter
from pydantic import BaseModel

from services.onboarding_deck import get_onboarding_deck

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
    # --- STUB ---
    # TODO(real-CLIP-integration): per CLAUDE.md section 1 steps 1-3, this
    # should embed the swiped image (or look up a precomputed embedding for
    # this curated onboarding image_id) via the Hugging Face CLIP API, and
    # if liked, fold it into payload.user_id's running preference-vector
    # average in Supabase. Currently: no HF/CLIP call, no vector math, no
    # persistence — validates the payload and logs only.
    print(f"[stub] onboarding-swipe: user={payload.user_id} image={payload.image_id} liked={payload.liked}")
    return OnboardingSwipeResponse(status="ok")
