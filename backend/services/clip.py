"""Local CLIP image embeddings (openai/clip-vit-base-patch32) via `transformers`.

Runs entirely on-device (CPU). Originally used only by the offline,
manually-run scripts/fetch_onboarding_images.py precompute step — HF's
serverless Inference API no longer hosts any CLIP/image-embedding model
(confirmed live: `inferenceProviderMapping` is empty for every CLIP
checkpoint checked), so self-hosting was the only free unblock for that
script.

Now also used live, in the FastAPI request path, by
routes/item.py's /api/analyze-item (embed_image_bytes) — Replicate was
evaluated as a hosted alternative for this live case and rejected (not
actually free); self-hosting keeps the uploaded-photo embedding in the same
vector space as the onboarding pool's precomputed embeddings for free, at
the cost of slower per-request CPU inference. Revisit if this becomes a
real bottleneck once deployed (Render free tier CPU speed is still an open
question — see CLAUDE.md section 9).
"""

import io
from functools import lru_cache

import requests
import torch
from PIL import Image
from transformers import CLIPModel, CLIPProcessor

MODEL_ID = "openai/clip-vit-base-patch32"

# Some source sites hotlink-block the default `python-requests` user agent
# (403), same issue the fetch script already works around when validating
# URLs — use the same browser-like header here.
IMAGE_FETCH_HEADERS = {"User-Agent": "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15"}


@lru_cache(maxsize=1)
def _load_model() -> tuple[CLIPModel, CLIPProcessor]:
    model = CLIPModel.from_pretrained(MODEL_ID)
    processor = CLIPProcessor.from_pretrained(MODEL_ID)
    model.eval()
    return model, processor


def embed_image_bytes(image_bytes: bytes) -> list[float]:
    model, processor = _load_model()
    image = Image.open(io.BytesIO(image_bytes)).convert("RGB")

    inputs = processor(images=image, return_tensors="pt")
    with torch.no_grad():
        # get_image_features() returns a BaseModelOutputWithPooling here, not
        # a plain tensor (confirmed live against the installed transformers
        # version) — .pooler_output is the actual 512-dim projected CLIP
        # embedding; .last_hidden_state is the pre-projection per-patch ViT
        # output (768-dim x 50 tokens), not what we want.
        features = model.get_image_features(**inputs)
    return features.pooler_output[0].tolist()


def embed_image_url(image_url: str) -> list[float]:
    resp = requests.get(image_url, headers=IMAGE_FETCH_HEADERS, timeout=15)
    resp.raise_for_status()
    return embed_image_bytes(resp.content)
