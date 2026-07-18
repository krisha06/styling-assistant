import json
from pathlib import Path
from typing import TypedDict

_SEED_PATH = Path(__file__).parent / "onboarding_deck.json"


class OnboardingImage(TypedDict):
    image_id: str
    image_url: str
    tags: list[str]
    embedding: list[float]


def get_onboarding_deck() -> list[OnboardingImage]:
    if not _SEED_PATH.exists():
        return []
    with _SEED_PATH.open() as f:
        return json.load(f)


def get_onboarding_image(image_id: str) -> OnboardingImage | None:
    for image in get_onboarding_deck():
        if image["image_id"] == image_id:
            return image
    return None
