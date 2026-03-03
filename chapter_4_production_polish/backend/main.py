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


def _session(passcode: str) -> dict:
    """Full session: persona + semantic VAD/barge-in + unlock_door — Chapters 2–3 (completed)."""
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
            "the door swings open and they have escaped. Keep it brief—one or two sentences. "
            "If success is false, tell them the code was wrong and to keep searching."
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
            "output": {
                "voice": "cedar",  # Supported: alloy, ash, ballad, coral, echo, sage, shimmer, verse, marin, cedar
            },
        },
        "tools": [
            {
                "type": "function",
                "name": "unlock_door",
                "description": "Unlock the door when the user provides the correct 4-digit passcode",
                "parameters": {
                    "type": "object",
                    "properties": {
                        "code": {
                            "type": "string",
                            "description": "The 4-digit code the user spoke",
                        },
                    },
                    "required": ["code"],
                },
            },
        ],
        "tool_choice": "auto",
    }


@app.get("/get-token")
async def get_token():
    """Return an ephemeral token for the OpenAI Realtime API."""
    passcode = str(random.randint(1000, 9999))
    secret = client.realtime.client_secrets.create(session=_session(passcode))
    return {"value": secret.value, "passcode": passcode}
