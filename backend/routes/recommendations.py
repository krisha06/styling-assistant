import logging

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel

from services.auth import get_current_user_id
from services.recommendation_history import get_recommendation_history, save_recommendations
from services.recommendations import build_recommendations

logger = logging.getLogger(__name__)

router = APIRouter()


class ConceptInput(BaseModel):
    vibe_label: str
    items: list[str]
    explanation: str


class BuildRecommendationsRequest(BaseModel):
    concepts: list[ConceptInput]


class ImageResponse(BaseModel):
    item: str
    image_url: str
    source: str


class RecommendationResponse(BaseModel):
    id: str
    vibe_label: str
    explanation: str
    images: list[ImageResponse]


class BuildRecommendationsResponse(BaseModel):
    recommendations: list[RecommendationResponse]


@router.post("/build-recommendations", response_model=BuildRecommendationsResponse)
def build_recommendations_route(
    payload: BuildRecommendationsRequest, user_id: str = Depends(get_current_user_id)
) -> BuildRecommendationsResponse:
    try:
        concepts = [c.model_dump() for c in payload.concepts]
        recommendations = build_recommendations(concepts)
        saved = save_recommendations(user_id, recommendations)
    except Exception:
        logger.exception("Failed to build recommendations for user_id=%s", user_id)
        raise HTTPException(status_code=500, detail="Failed to build recommendations")

    return BuildRecommendationsResponse(
        recommendations=[
            RecommendationResponse(
                id=r["id"],
                vibe_label=r["vibe_label"],
                explanation=r["explanation"],
                images=[ImageResponse(**img) for img in r["images"]],
            )
            for r in saved
        ]
    )


class RecommendationHistoryItem(BaseModel):
    id: str
    vibe_label: str
    explanation: str
    images: list[ImageResponse]
    liked: bool
    created_at: str


class RecommendationHistoryResponse(BaseModel):
    recommendations: list[RecommendationHistoryItem]


@router.get("/recommendation-history", response_model=RecommendationHistoryResponse)
def recommendation_history_route(
    user_id: str = Depends(get_current_user_id),
) -> RecommendationHistoryResponse:
    rows = get_recommendation_history(user_id)
    return RecommendationHistoryResponse(
        recommendations=[
            RecommendationHistoryItem(
                id=r["id"],
                vibe_label=r["vibe_label"],
                explanation=r["explanation"],
                images=[ImageResponse(**img) for img in r["images"]],
                liked=r["liked"],
                created_at=r["created_at"],
            )
            for r in rows
        ]
    )
