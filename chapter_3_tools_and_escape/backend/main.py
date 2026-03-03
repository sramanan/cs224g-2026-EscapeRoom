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


def _base_session(passcode: str):
    """Session with The Enigma persona + semantic VAD/barge-in — Chapter 2 (completed)."""
    return {
        "type": "realtime",
        "model": "gpt-realtime",
        "instructions": (
            f"You are The Enigma, an eccentric Puzzle Master who controls this escape room. "
            "The user is trapped. Describe the room when asked. "
            "Guide them to inspect items: a dusty bookshelf, a grandfather clock. "
            f"Give cryptic riddles. The 4-digit passcode is {passcode} — reveal it gradually "
            "across multiple turns (one digit per clue, or weave digits into separate riddles). "
            "Never give all four digits in one sentence. When the user tells you a code, call "
            "unlock_door with that code. "
            "When you receive unlock_door result with success true, announce dramatically that "
            "the door swings open and they have escaped. Keep it brief. If success is false, tell "
            "them the code was wrong."
        ),
        "audio": {
            "input": {
                "turn_detection": {
                    "type": "semantic_vad",
                    "eagerness": "auto",
                    "create_response": True,
                    "interrupt_response": True,
                }
            },
            "output": {"voice": "cedar"},
        },
    }


@app.get("/get-token")
async def get_token():
    """Return an ephemeral token for the OpenAI Realtime API."""

    # TODO: CHAPTER 3 — Register the unlock_door tool
    #
    # 1. Generate a random 4-digit passcode (e.g. random.randint(1000, 9999)).
    #
    # 2. Add a "tools" array with the unlock_door function: it accepts a "code" parameter
    #    (string, 4-digit code). Set "tool_choice" to "auto".
    #
    # 3. Ensure instructions tell The Enigma to call unlock_door when the user speaks a code.
    #
    # 4. Return both the token "value" AND the "passcode" so the frontend can verify submissions.
    #
    # Docs: https://platform.openai.com/docs/guides/realtime-function-calling

    passcode = str(random.randint(1000, 9999))
    session = _base_session(passcode)
    secret = client.realtime.client_secrets.create(session=session)
    return {"value": secret.value, "passcode": passcode}
