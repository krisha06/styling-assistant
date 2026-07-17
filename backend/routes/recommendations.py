import logging

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

from services.recommendations import build_recommendations

logger = logging.getLogger(__name__)

router = APIRouter()


class ConceptInput(BaseModel):
    vibe_label: str
    items: list[str]
    explanation: str


class BuildRecommendationsRequest(BaseModel):
    concepts: list[ConceptInput]
    user_id: str


class ImageResponse(BaseModel):
    item: str
    image_url: str
    source: str


class RecommendationResponse(BaseModel):
    vibe_label: str
    explanation: str
    images: list[ImageResponse]


class BuildRecommendationsResponse(BaseModel):
    recommendations: list[RecommendationResponse]


@router.post("/build-recommendations", response_model=BuildRecommendationsResponse)
def build_recommendations_route(payload: BuildRecommendationsRequest) -> BuildRecommendationsResponse:
    try:
        concepts = [c.model_dump() for c in payload.concepts]
        recommendations = build_recommendations(concepts)
    except Exception:
        logger.exception("Failed to build recommendations for user_id=%s", payload.user_id)
        raise HTTPException(status_code=500, detail="Failed to build recommendations")

    return BuildRecommendationsResponse(
        recommendations=[
            RecommendationResponse(
                vibe_label=r["vibe_label"],
                explanation=r["explanation"],
                images=[ImageResponse(**img) for img in r["images"]],
            )
            for r in recommendations
        ]
    )
