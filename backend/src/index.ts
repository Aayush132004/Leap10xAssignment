import express from "express";
import cors from "cors";
import { config, validateConfig } from "./config";
import agentRouter from "./modules/agents/agent.router";
import callRouter from "./modules/calls/call.router";
import evaluationRouter from "./modules/evaluations/evaluation.router";
import analyticsRouter from "./modules/analytics/analytics.router";
import validationRouter from "./modules/validation/validation.router";
import voiceRouter from "./modules/voice/voice.router";

validateConfig();

const app = express();

// Middleware
app.use(
  cors({
    origin: (origin, callback) => {
      // Allow requests with no origin (curl, same-origin, server-to-server) or any host in production/dev
      callback(null, true);
    },
    credentials: true,
  })
);
app.use(express.json({ limit: "10mb" }));

// Health check
app.get("/api/health", (_req, res) => {
  res.json({ status: "ok", timestamp: new Date().toISOString() });
});

// Routes
app.use("/api/agents", agentRouter);
app.use("/api/calls", callRouter);
app.use("/api/calls", evaluationRouter);      // /api/calls/:id/evaluate, /api/calls/:id/evaluation
app.use("/api/analytics", analyticsRouter);    // /api/analytics/dashboard, /api/analytics/agents/:id
app.use("/api/validation", validationRouter);  // /api/validation/compare
app.use("/api/voice", voiceRouter);            // /api/voice/assistant-config/:agentId

// Global error handler
app.use(
  (
    err: Error,
    _req: express.Request,
    res: express.Response,
    _next: express.NextFunction
  ) => {
    console.error("Unhandled error:", err);
    res.status(500).json({
      error: "Internal server error",
      message: config.nodeEnv === "development" ? err.message : undefined,
    });
  }
);

app.listen(config.port, () => {
  console.log(`🎙️  Voice Agent Studio backend running on port ${config.port}`);
  console.log(`   Environment: ${config.nodeEnv}`);
  console.log(`   Frontend URL: ${config.frontendUrl}`);
});

export default app;
