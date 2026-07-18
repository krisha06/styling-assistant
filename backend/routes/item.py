import logging

from fastapi import APIRouter, Depends, File, HTTPException, UploadFile
from pydantic import BaseModel

from services.analyzed_items import save_analyzed_item
from services.auth import get_current_user_id
from services.clip import embed_image_bytes
from services.gemini_errors import raise_for_gemini_error
from services.image_caption import describe_item

logger = logging.getLogger(__name__)

router = APIRouter()


class AnalyzeItemResponse(BaseModel):
    item_description: str
    embedding_id: str


@router.post("/analyze-item", response_model=AnalyzeItemResponse)
async def analyze_item(
    image: UploadFile = File(...),
    user_id: str = Depends(get_current_user_id),
) -> AnalyzeItemResponse:
    image_bytes = await image.read()
    mime_type = image.content_type or "image/jpeg"

    try:
        item_description = describe_item(image_bytes, mime_type=mime_type)
    except Exception as e:
        raise_for_gemini_error(e, logger, user_id, "analyze item")

    try:
        embedding = embed_image_bytes(image_bytes)
        embedding_id = save_analyzed_item(user_id, embedding, item_description)
    except Exception:
        logger.exception("Failed to analyze item for user_id=%s", user_id)
        raise HTTPException(status_code=500, detail="Failed to analyze item")

    return AnalyzeItemResponse(item_description=item_description, embedding_id=embedding_id)
