from dotenv import load_dotenv
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from openai import OpenAI
import random

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

    # TODO: CHAPTER 2 — Add The Enigma's persona and turn detection
    #
    # 1. Generate a random 4-digit passcode (e.g. random.randint(1000, 9999)).
    #
    # 2. Add "instructions" describing The Enigma: eccentric Puzzle Master, describes
    #    the room (bookshelf, grandfather clock), gives cryptic riddles. Include the
    #    passcode in the instructions so The Enigma knows it. Reveal it gradually
    #    across multiple turns—one digit per clue, or weave digits into separate
    #    riddles. Never give all four digits in one sentence.
    #
    # 3. Add "audio" with input.turn_detection (semantic_vad, create_response,
    #    interrupt_response) and output.voice ("cedar" or alloy/ash/shimmer/etc).
    #
    # Docs: https://platform.openai.com/docs/api-reference/realtime-client-secrets
    # VAD: https://developers.openai.com/api/docs/guides/realtime-vad/

    session = _base_session()
    secret = client.realtime.client_secrets.create(session=session)
    return {"value": secret.value}
