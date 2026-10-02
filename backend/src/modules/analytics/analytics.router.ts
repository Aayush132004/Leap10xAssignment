import { Router, Request, Response } from "express";
import { AnalyticsService } from "./analytics.service";
import { NotFoundError } from "../agents/agent.service";

const router = Router();
const analyticsService = new AnalyticsService();

// GET /api/analytics/dashboard
router.get("/dashboard", async (_req: Request, res: Response) => {
  try {
    const summary = await analyticsService.getDashboardSummary();
    res.json(summary);
  } catch (error) {
    console.error("Failed to get dashboard summary:", error);
    res.status(500).json({ error: "Failed to get dashboard summary" });
  }
});

// GET /api/agents/:id/analytics
router.get("/agents/:id", async (req: Request, res: Response) => {
  try {
    const analytics = await analyticsService.getAgentAnalytics(req.params.id as string);
    res.json(analytics);
  } catch (error) {
    if (error instanceof NotFoundError) {
      res.status(404).json({ error: error.message });
      return;
    }
    console.error("Failed to get agent analytics:", error);
    res.status(500).json({ error: "Failed to get agent analytics" });
  }
});

export default router;
