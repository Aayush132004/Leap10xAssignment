import dotenv from "dotenv";

dotenv.config({ override: true });

export const config = {
  port: parseInt(process.env.PORT || "3001", 10),
  nodeEnv: process.env.NODE_ENV || "development",
  frontendUrl: process.env.FRONTEND_URL || "http://localhost:3000",
  groq: {
    apiKey: process.env.GROQ_API_KEY || "",
    model:
      process.env.GROQ_MODEL &&
      !process.env.GROQ_MODEL.includes("llama-3.1") &&
      !process.env.GROQ_MODEL.includes("llama-3.3")
        ? process.env.GROQ_MODEL
        : "openai/gpt-oss-120b",
  },
  // Vapi web calling (browser-to-voice, no phone number/Twilio required): the frontend
  // talks to Vapi directly with a PUBLIC key (NEXT_PUBLIC_VAPI_PUBLIC_KEY, frontend env).
  // The backend needs no Vapi credential at all — it only builds the assistant JSON from
  // the agent's own config (persona/goal/guidelines/knowledge), which Vapi's Web SDK then
  // uses to run the call. These env vars just pick which of Vapi's providers/voices/models
  // to ask for; adjust to whatever's enabled/free on the connected Vapi account.
  vapi: {
    modelProvider: process.env.VAPI_MODEL_PROVIDER || "openai",
    modelName: process.env.VAPI_MODEL_NAME || "gpt-4o-mini",
    // "vapi" voice provider v2 + language "auto" auto-switches synthesis language to
    // match what the model is currently saying, and generally sounds less robotic than
    // v1 — needed for agents whose `language` field allows Hindi/Hinglish.
    voiceProvider: process.env.VAPI_VOICE_PROVIDER || "vapi",
    voiceId: process.env.VAPI_VOICE_ID || "Elliot",
    voiceVersion: process.env.VAPI_VOICE_VERSION ? Number(process.env.VAPI_VOICE_VERSION) : 2,
    voiceLanguage: process.env.VAPI_VOICE_LANGUAGE || "auto",
    // Deepgram nova-3 + language "multi" does live code-switch detection instead of
    // committing to one language for the whole call — needed to actually pick up Hindi
    // when the caller switches mid-conversation.
    transcriberProvider: process.env.VAPI_TRANSCRIBER_PROVIDER || "deepgram",
    transcriberModel: process.env.VAPI_TRANSCRIBER_MODEL || "nova-3",
    transcriberLanguage: process.env.VAPI_TRANSCRIBER_LANGUAGE || "multi",
  },
} as const;

export function validateConfig(): void {
  const missing: string[] = [];

  if (!config.groq.apiKey) {
    missing.push("GROQ_API_KEY");
  }
  if (!process.env.DATABASE_URL) {
    missing.push("DATABASE_URL");
  }

  if (missing.length > 0) {
    console.warn(
      `⚠️  Missing environment variables: ${missing.join(", ")}. Some features may not work.`
    );
  }
}
