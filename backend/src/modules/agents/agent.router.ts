import { Router, Request, Response } from "express";
import { AgentService, NotFoundError } from "./agent.service";
import { createAgentSchema, updateAgentSchema } from "./agent.schema";
import { ZodError } from "zod";

const router = Router();
const agentService = new AgentService();

// GET /api/agents
router.get("/", async (_req: Request, res: Response) => {
  try {
    const agents = await agentService.list();
    res.json(agents);
  } catch (error) {
    console.error("Failed to list agents:", error);
    res.status(500).json({ error: "Failed to list agents" });
  }
});

// GET /api/agents/:id
router.get("/:id", async (req: Request, res: Response) => {
  try {
    const agent = await agentService.getById(req.params.id as string);
    res.json(agent);
  } catch (error) {
    if (error instanceof NotFoundError) {
      res.status(404).json({ error: error.message });
      return;
    }
    console.error("Failed to get agent:", error);
    res.status(500).json({ error: "Failed to get agent" });
  }
});

// POST /api/agents
router.post("/", async (req: Request, res: Response) => {
  try {
    const data = createAgentSchema.parse(req.body);
    const agent = await agentService.create(data);
    res.status(201).json(agent);
  } catch (error) {
    if (error instanceof ZodError) {
      res.status(400).json({ error: "Validation failed", details: error.errors });
      return;
    }
    console.error("Failed to create agent:", error);
    res.status(500).json({ error: "Failed to create agent" });
  }
});

// PATCH /api/agents/:id
router.patch("/:id", async (req: Request, res: Response) => {
  try {
    const data = updateAgentSchema.parse(req.body);
    const agent = await agentService.update(req.params.id as string, data);
    res.json(agent);
  } catch (error) {
    if (error instanceof ZodError) {
      res.status(400).json({ error: "Validation failed", details: error.errors });
      return;
    }
    if (error instanceof NotFoundError) {
      res.status(404).json({ error: error.message });
      return;
    }
    console.error("Failed to update agent:", error);
    res.status(500).json({ error: "Failed to update agent" });
  }
});

// DELETE /api/agents/:id
router.delete("/:id", async (req: Request, res: Response) => {
  try {
    await agentService.delete(req.params.id as string);
    res.status(204).send();
  } catch (error) {
    if (error instanceof NotFoundError) {
      res.status(404).json({ error: error.message });
      return;
    }
    console.error("Failed to delete agent:", error);
    res.status(500).json({ error: "Failed to delete agent" });
  }
});

export default router;
