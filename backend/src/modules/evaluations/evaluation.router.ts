import { Router, Request, Response } from "express";
import { EvaluationService } from "./evaluation.service";
import { NotFoundError } from "../agents/agent.service";

const router = Router();
const evaluationService = new EvaluationService();

// POST /api/calls/:id/evaluate
router.post("/:callId/evaluate", async (req: Request, res: Response) => {
  try {
    const evaluation = await evaluationService.evaluateCall(req.params.callId as string);
    res.status(201).json(evaluation);
  } catch (error) {
    if (error instanceof NotFoundError) {
      res.status(404).json({ error: error.message });
      return;
    }
    if (error instanceof Error) {
      // Surface evaluation-specific errors with clear messages
      if (
        error.message.includes("no evaluation criteria") ||
        error.message.includes("GROQ_API_KEY")
      ) {
        res.status(400).json({ error: error.message });
        return;
      }
      console.error("Evaluation failed:", error.message);
      res.status(500).json({
        error: "Evaluation failed",
        message: error.message,
      });
      return;
    }
    console.error("Evaluation failed:", error);
    res.status(500).json({ error: "Evaluation failed" });
  }
});

// POST /api/calls/:id/consistency-check?runs=3
router.post("/:callId/consistency-check", async (req: Request, res: Response) => {
  try {
    const runs = Math.min(Math.max(parseInt(String(req.query.runs ?? "3"), 10) || 3, 2), 5);
    const result = await evaluationService.checkConsistency(req.params.callId as string, runs);
    res.status(201).json(result);
  } catch (error) {
    if (error instanceof NotFoundError) {
      res.status(404).json({ error: error.message });
      return;
    }
    if (error instanceof Error) {
      if (
        error.message.includes("no evaluation criteria") ||
        error.message.includes("GROQ_API_KEY")
      ) {
        res.status(400).json({ error: error.message });
        return;
      }
      console.error("Consistency check failed:", error.message);
      res.status(500).json({ error: "Consistency check failed", message: error.message });
      return;
    }
    console.error("Consistency check failed:", error);
    res.status(500).json({ error: "Consistency check failed" });
  }
});

// GET /api/calls/:id/evaluation
router.get("/:callId/evaluation", async (req: Request, res: Response) => {
  try {
    const evaluations = await evaluationService.getByCallId(req.params.callId as string);
    res.json(evaluations);
  } catch (error) {
    console.error("Failed to get evaluations:", error);
    res.status(500).json({ error: "Failed to get evaluations" });
  }
});

// GET /api/evaluations/:id
router.get("/evaluation/:id", async (req: Request, res: Response) => {
  try {
    const evaluation = await evaluationService.getById(req.params.id as string);
    res.json(evaluation);
  } catch (error) {
    if (error instanceof NotFoundError) {
      res.status(404).json({ error: error.message });
      return;
    }
    console.error("Failed to get evaluation:", error);
    res.status(500).json({ error: "Failed to get evaluation" });
  }
});

export default router;
