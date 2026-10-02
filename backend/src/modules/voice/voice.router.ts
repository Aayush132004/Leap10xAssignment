import { Router, Request, Response } from "express";
import { VoiceService } from "./voice.service";
import { NotFoundError } from "../agents/agent.service";

const router = Router();
const voiceService = new VoiceService();

// GET /api/voice/assistant-config/:agentId — Vapi assistant JSON built from the agent's
// own config, for the frontend to pass straight into the Vapi Web SDK's vapi.start().
router.get("/assistant-config/:agentId", async (req: Request, res: Response) => {
  try {
    const assistant = await voiceService.getAssistantConfig(req.params.agentId as string);
    res.json(assistant);
  } catch (error) {
    if (error instanceof NotFoundError) {
      res.status(404).json({ error: error.message });
      return;
    }
    console.error("Failed to build assistant config:", error);
    res.status(500).json({ error: "Failed to build assistant config" });
  }
});

export default router;
