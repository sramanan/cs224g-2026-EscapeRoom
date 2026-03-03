from dotenv import load_dotenv
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

load_dotenv()

app = FastAPI()

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173"],
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.get("/get-token")
async def get_token():
    """Return an ephemeral token for the OpenAI Realtime API.

    The frontend uses this token to authenticate its WebRTC connection
    directly with OpenAI. The real API key never reaches the browser.
    """

    # ──────────────────────────────────────────────────────────────
    # TODO: CHAPTER 1 — Create an ephemeral client secret
    #
    # 1. Import the OpenAI client:
    #        from openai import OpenAI
    #        client = OpenAI()          # uses OPENAI_API_KEY env var
    #
    # 2. Request an ephemeral token:
    #        secret = client.realtime.client_secrets.create(
    #            session={
    #                "type": "realtime",
    #                "model": "gpt-realtime",
    #            }
    #        )
    #
    # 3. Return the token value:
    #        return {"value": secret.value}
    #
    # Docs: https://platform.openai.com/docs/api-reference/realtime-client-secrets
    # ──────────────────────────────────────────────────────────────

    return {"error": "Not implemented — complete the TODO above!"}
