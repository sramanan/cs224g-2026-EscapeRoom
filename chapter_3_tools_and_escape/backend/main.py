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
    """Session with The Enigma persona + semantic VAD/barge-in — Chapter 2 (completed)."""
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
    }


@app.get("/get-token")
async def get_token():
    """Return an ephemeral token for the OpenAI Realtime API."""

    # ──────────────────────────────────────────────────────────────
    # TODO: CHAPTER 3 — Register the unlock_door tool
    #
    # Add a "tools" array and "tool_choice" to the session so The
    # Enigma can call unlock_door when the user speaks the code:
    #
    #   session = {
    #       ..._base_session(),
    #       "tools": [
    #           {
    #               "type": "function",
    #               "name": "unlock_door",
    #               "description": "Unlock the door when the user provides the correct 4-digit passcode",
    #               "parameters": {
    #                   "type": "object",
    #                   "properties": {
    #                       "code": {
    #                           "type": "string",
    #                           "description": "The 4-digit code the user spoke",
    #                       },
    #                   },
    #                   "required": ["code"],
    #               },
    #           },
    #       ],
    #       "tool_choice": "auto",
    #   }
    #
    # Update instructions to say: "When the user tells you a code, call unlock_door with it."
    #
    # Docs: https://platform.openai.com/docs/guides/realtime-function-calling
    # ──────────────────────────────────────────────────────────────

    session = _base_session()
    secret = client.realtime.client_secrets.create(session=session)
    return {"value": secret.value}
