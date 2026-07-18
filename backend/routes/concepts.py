import logging

from fastapi import APIRouter
from pydantic import BaseModel

from services.concepts import generate_concepts
from services.gemini_errors import raise_for_gemini_error
from services.taste_summary import get_taste_summary

logger = logging.getLogger(__name__)

router = APIRouter()


class GenerateConceptsRequest(BaseModel):
    item_description: str
    user_id: str


class ConceptResponse(BaseModel):
    vibe_label: str
    items: list[str]
    explanation: str


class GenerateConceptsResponse(BaseModel):
    concepts: list[ConceptResponse]


@router.post("/generate-concepts", response_model=GenerateConceptsResponse)
def generate_concepts_route(payload: GenerateConceptsRequest) -> GenerateConceptsResponse:
    taste_summary = get_taste_summary(payload.user_id)

    try:
        concepts = generate_concepts(payload.item_description, taste_summary)
    except Exception as e:
        raise_for_gemini_error(e, logger, payload.user_id, "generate concepts")

    return GenerateConceptsResponse(
        concepts=[
            ConceptResponse(vibe_label=c.vibe_label, items=c.items, explanation=c.explanation)
            for c in concepts
        ]
    )
