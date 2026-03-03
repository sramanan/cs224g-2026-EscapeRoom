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


def _session() -> dict:
    """Full session: persona + semantic VAD/barge-in + unlock_door — Chapters 2–3 (completed)."""
    return {
        "type": "realtime",
        "model": "gpt-realtime",
        "instructions": (
            "You are The Enigma, an eccentric Puzzle Master who controls this escape room. "
            "The user is trapped. Describe the room when asked. "
            "Guide them to inspect items: a dusty bookshelf, a grandfather clock. "
            "Give cryptic riddles. The 4-digit passcode is 7314 — encode it in your clues "
            "(e.g., page numbers, clock hands). When the user tells you a code, call "
            "unlock_door with that code."
        ),
        "voice": "onyx",
        "turn_detection": {
            "type": "semantic_vad",
            "eagerness": "auto",
            "create_response": True,
            "interrupt_response": True,
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
    secret = client.realtime.client_secrets.create(session=_session())
    return {"value": secret.value}
