import logging
import random

from fastapi import APIRouter, Depends, File, UploadFile
from pydantic import BaseModel

from services.auth import get_current_user_id
from services.clip import embed_image_bytes
from services.onboarding_deck import get_onboarding_deck
from services.preference_vector import get_preference_vector, update_preference_vector

logger = logging.getLogger(__name__)

router = APIRouter()

DEV_SEED_COUNT = 15


class OnboardingPhotoUploadResponse(BaseModel):
    status: str
    processed: int
    total: int


class OnboardingDevSeedResponse(BaseModel):
    status: str
    processed: int


class OnboardingStatusResponse(BaseModel):
    has_onboarded: bool


@router.post("/onboarding-photo-upload", response_model=OnboardingPhotoUploadResponse)
async def onboarding_photo_upload(
    images: list[UploadFile] = File(...),
    user_id: str = Depends(get_current_user_id),
) -> OnboardingPhotoUploadResponse:
    processed = 0
    for image in images:
        try:
            image_bytes = await image.read()
            embedding = embed_image_bytes(image_bytes)
            update_preference_vector(user_id, embedding)
            processed += 1
        except Exception:
            logger.exception(
                "Failed to fold onboarding photo %r into preference vector for user_id=%s",
                image.filename,
                user_id,
            )
            continue

    return OnboardingPhotoUploadResponse(status="ok", processed=processed, total=len(images))


# Dev/testing-only: lets manual QA skip hand-picking 15 photos every time.
# Reuses the onboarding pool's precomputed embeddings directly (no download
# or re-embedding), so it's instant — functionally the same as the old
# swipe-onboarding endpoint's per-swipe fold-in, just batched and randomized.
# Not part of the production API contract (CLAUDE.md section 3) — pull this
# before any real deploy, same as the CORS allow_origins=["*"] dev shortcut
# in main.py. Still requires a real verified session, same as every other
# route, so it exercises the real auth path too.
@router.post("/onboarding-dev-seed", response_model=OnboardingDevSeedResponse)
def onboarding_dev_seed(user_id: str = Depends(get_current_user_id)) -> OnboardingDevSeedResponse:
    pool = get_onboarding_deck()
    sample = random.sample(pool, k=min(DEV_SEED_COUNT, len(pool)))

    processed = 0
    for image in sample:
        try:
            update_preference_vector(user_id, image["embedding"])
            processed += 1
        except Exception:
            logger.exception(
                "Dev-seed failed to fold image_id=%s into preference vector for user_id=%s",
                image["image_id"],
                user_id,
            )
            continue

    return OnboardingDevSeedResponse(status="ok", processed=processed)


@router.get("/onboarding-status", response_model=OnboardingStatusResponse)
def onboarding_status(user_id: str = Depends(get_current_user_id)) -> OnboardingStatusResponse:
    return OnboardingStatusResponse(has_onboarded=get_preference_vector(user_id) is not None)
