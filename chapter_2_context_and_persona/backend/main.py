from dotenv import load_dotenv
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from openai import OpenAI

load_dotenv()

app = FastAPI()

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173"],
    allow_methods=["*"],
    allow_headers=["*"],
)

client = OpenAI()


def _base_session():
    """Minimal session config — Chapter 1 (completed)."""
    return {
        "type": "realtime",
        "model": "gpt-realtime",
    }


@app.get("/get-token")
async def get_token():
    """Return an ephemeral token for the OpenAI Realtime API."""

    # ──────────────────────────────────────────────────────────────
    # TODO: CHAPTER 2 — Add The Enigma's persona and turn detection
    #
    # 1. Add "instructions" and "voice" so The Enigma comes to life:
    #
    #   "instructions": (
    #       "You are The Enigma, an eccentric Puzzle Master who controls "
    #       "this escape room. The user is trapped. Describe the room when asked. "
    #       "Guide them to inspect items: a dusty bookshelf, a grandfather clock. "
    #       "Give cryptic riddles. The 4-digit passcode is 7314 — encode it in "
    #       "your clues (e.g., page numbers, clock hands). When they tell you "
    #       "a code, you will eventually call unlock_door with it."
    #   ),
    #   "voice": "onyx",
    #
    # 2. Add "turn_detection" with semantic VAD and barge-in so the
    #    user can interrupt The Enigma mid-sentence:
    #
    #   "turn_detection": {
    #       "type": "semantic_vad",
    #       "eagerness": "auto",
    #       "create_response": True,
    #       "interrupt_response": True,
    #   },
    #
    #   - semantic_vad: chunks based on meaning, not just silence
    #   - interrupt_response: lets user barge in and stop the AI
    #
    # Docs: https://platform.openai.com/docs/api-reference/realtime-client-secrets
    # VAD: https://developers.openai.com/api/docs/guides/realtime-vad/
    # ──────────────────────────────────────────────────────────────

    session = _base_session()
    secret = client.realtime.client_secrets.create(session=session)
    return {"value": secret.value}
