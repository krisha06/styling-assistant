from dotenv import load_dotenv
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

load_dotenv()

from routes import concepts, item, onboarding, recommendation_feedback, recommendations

app = FastAPI(title="Styling App API", version="0.1.0")

# Dev-only CORS. React Native's fetch doesn't send an Origin header (CORS is
# a browser concept), so this mainly matters for react-native-web / browser
# testing. Tighten before any real deploy (Render) once auth exists.
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(onboarding.router, prefix="/api", tags=["onboarding"])
app.include_router(item.router, prefix="/api", tags=["item"])
app.include_router(concepts.router, prefix="/api", tags=["concepts"])
app.include_router(recommendations.router, prefix="/api", tags=["recommendations"])
app.include_router(recommendation_feedback.router, prefix="/api", tags=["recommendation-feedback"])


@app.get("/health")
def health():
    return {"status": "ok"}
