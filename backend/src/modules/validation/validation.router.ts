import { Router, Request, Response } from "express";
import { ValidationService } from "./validation.service";
import { validateBatchSchema } from "./validation.schema";
import { ZodError } from "zod";

const router = Router();
const validationService = new ValidationService();

// POST /api/validation/compare
router.post("/compare", async (req: Request, res: Response) => {
  try {
    const data = validateBatchSchema.parse(req.body);
    const result = await validationService.compareWithLabels(data.labels);
    res.json(result);
  } catch (error) {
    if (error instanceof ZodError) {
      res.status(400).json({ error: "Validation failed", details: error.errors });
      return;
    }
    console.error("Comparison failed:", error);
    res.status(500).json({ error: "Failed to compare evaluations" });
  }
});

export default router;
