import logging

from fastapi import APIRouter, Depends
from pydantic import BaseModel

from services.auth import get_current_user_id
from services.clip import embed_image_url
from services.preference_vector import update_preference_vector
from services.recommendation_history import mark_recommendation_liked

logger = logging.getLogger(__name__)

router = APIRouter()


class RecommendationFeedbackRequest(BaseModel):
    recommendation_id: str


class RecommendationFeedbackResponse(BaseModel):
    status: str


# recommendations are now persisted (recommendation_history.py), so a like
# marks the row liked=true and folds its stored images into the running-
# average preference vector — same update_preference_vector() call and math
# onboarding-photo-upload already uses, just triggered per liked card
# instead of per onboarding photo. Images come from the DB row, not the
# request body — mark_recommendation_liked scopes the update to this user_id,
# so a client can't fold another user's images into their vector by
# guessing a UUID. Best-effort: an individual image failing to embed (dead
# link, etc.) is logged and skipped rather than failing the whole "like"
# action; an unknown/not-owned recommendation_id is a silent no-op, same
# posture as the rest of this best-effort endpoint.
@router.post("/recommendation-feedback", response_model=RecommendationFeedbackResponse)
def recommendation_feedback(
    payload: RecommendationFeedbackRequest, user_id: str = Depends(get_current_user_id)
) -> RecommendationFeedbackResponse:
    images = mark_recommendation_liked(user_id, payload.recommendation_id)
    if images is None:
        return RecommendationFeedbackResponse(status="ok")

    for image in images:
        try:
            embedding = embed_image_url(image["image_url"])
            update_preference_vector(user_id, embedding)
        except Exception:
            logger.exception(
                "Failed to fold liked image %r into preference vector for user_id=%s",
                image["image_url"],
                user_id,
            )
            continue

    return RecommendationFeedbackResponse(status="ok")
