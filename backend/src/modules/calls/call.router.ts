import { Router, Request, Response } from "express";
import { CallService } from "./call.service";
import { NotFoundError } from "../agents/agent.service";
import { createCallSchema, bulkCreateCallsSchema } from "./call.schema";
import { ZodError } from "zod";

const router = Router();
const callService = new CallService();

// GET /api/calls
router.get("/", async (req: Request, res: Response) => {
  try {
    const filters = {
      agentId: req.query.agentId as string | undefined,
      source: req.query.source as string | undefined,
    };
    const calls = await callService.list(filters);
    res.json(calls);
  } catch (error) {
    console.error("Failed to list calls:", error);
    res.status(500).json({ error: "Failed to list calls" });
  }
});

// GET /api/calls/:id
router.get("/:id", async (req: Request, res: Response) => {
  try {
    const call = await callService.getById(req.params.id as string);
    res.json(call);
  } catch (error) {
    if (error instanceof NotFoundError) {
      res.status(404).json({ error: error.message });
      return;
    }
    console.error("Failed to get call:", error);
    res.status(500).json({ error: "Failed to get call" });
  }
});

// POST /api/calls
router.post("/", async (req: Request, res: Response) => {
  try {
    const data = createCallSchema.parse(req.body);
    const call = await callService.create(data);
    res.status(201).json(call);
  } catch (error) {
    if (error instanceof ZodError) {
      res.status(400).json({ error: "Validation failed", details: error.errors });
      return;
    }
    if (error instanceof NotFoundError) {
      res.status(404).json({ error: error.message });
      return;
    }
    console.error("Failed to create call:", error);
    res.status(500).json({ error: "Failed to create call" });
  }
});

// POST /api/calls/bulk
router.post("/bulk", async (req: Request, res: Response) => {
  try {
    const data = bulkCreateCallsSchema.parse(req.body);
    const calls = await callService.bulkCreate(data);
    res.status(201).json({ created: calls.length, calls });
  } catch (error) {
    if (error instanceof ZodError) {
      res.status(400).json({ error: "Validation failed", details: error.errors });
      return;
    }
    if (error instanceof NotFoundError) {
      res.status(404).json({ error: error.message });
      return;
    }
    console.error("Failed to bulk create calls:", error);
    res.status(500).json({ error: "Failed to create calls" });
  }
});

// DELETE /api/calls/:id
router.delete("/:id", async (req: Request, res: Response) => {
  try {
    await callService.delete(req.params.id as string);
    res.status(204).send();
  } catch (error) {
    if (error instanceof NotFoundError) {
      res.status(404).json({ error: error.message });
      return;
    }
    console.error("Failed to delete call:", error);
    res.status(500).json({ error: "Failed to delete call" });
  }
});

export default router;
