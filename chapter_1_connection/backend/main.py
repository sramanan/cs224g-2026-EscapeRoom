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

    # TODO: CHAPTER 1 — Create an ephemeral client secret
    #
    # Use the OpenAI client to request a short-lived token for the Realtime API.
    # The session config needs type "realtime" and model "gpt-realtime".
    # Return the token value as {"value": "<token>"}.
    #
    # Docs: https://platform.openai.com/docs/api-reference/realtime-client-secrets

    return {"error": "Not implemented — complete the TODO above!"}
