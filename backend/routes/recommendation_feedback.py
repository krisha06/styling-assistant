import logging

from fastapi import APIRouter
from pydantic import BaseModel

from services.clip import embed_image_url
from services.preference_vector import update_preference_vector

logger = logging.getLogger(__name__)

router = APIRouter()


class RecommendationFeedbackRequest(BaseModel):
    user_id: str
    image_urls: list[str]


class RecommendationFeedbackResponse(BaseModel):
    status: str


# Recommendations aren't persisted anywhere (build-recommendations is
# stateless), so there's no recommendation_id to reference the way
# section 3's original contract assumed. Instead, the mobile client sends
# back the image_urls it already has in hand for the liked concept card,
# and each gets independently embedded + folded into the running-average
# preference vector — same update_preference_vector() call and math
# onboarding-swipe already uses, just triggered per liked reference image
# instead of per onboarding swipe. Best-effort: an individual image
# failing to embed (dead link, etc.) is logged and skipped rather than
# failing the whole "like" action.
@router.post("/recommendation-feedback", response_model=RecommendationFeedbackResponse)
def recommendation_feedback(payload: RecommendationFeedbackRequest) -> RecommendationFeedbackResponse:
    for image_url in payload.image_urls:
        try:
            embedding = embed_image_url(image_url)
            update_preference_vector(payload.user_id, embedding)
        except Exception:
            logger.exception(
                "Failed to fold liked image %r into preference vector for user_id=%s",
                image_url,
                payload.user_id,
            )
            continue

    return RecommendationFeedbackResponse(status="ok")
