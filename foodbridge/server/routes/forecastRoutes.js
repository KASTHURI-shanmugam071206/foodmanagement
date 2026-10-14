import express from "express";
import { z } from "zod";
import { pool } from "../config/database.js";
import { authenticate } from "../middleware/auth.js";

const router = express.Router();

const forecastQuerySchema = z.object({
  foodType: z.string().trim().optional()
});

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

router.get("/summary", authenticate, async (req, res) => {
  const parsed = forecastQuerySchema.safeParse(req.query);

  if (!parsed.success) {
    return res.status(400).json({
      success: false,
      message: "Validation failed",
      errors: parsed.error.flatten().fieldErrors
    });
  }

  try {
    const filter = parsed.data.foodType ? `AND d.food_type = ?` : "";
    const values = parsed.data.foodType ? [parsed.data.foodType] : [];

    const [donationRows] = await pool.execute(
      `SELECT food_type, SUM(COALESCE(remaining_quantity, 0)) AS available_quantity
       FROM donations d
       WHERE d.status IN ('available', 'allocated') AND d.remaining_quantity > 0 ${filter}
       GROUP BY d.food_type`,
      values
    );

    const [requirementRows] = await pool.execute(
      `SELECT food_type, SUM(COALESCE(remaining_quantity, 0)) AS required_quantity
       FROM requirements r
       WHERE r.status IN ('pending', 'partially_fulfilled') AND r.remaining_quantity > 0 ${filter}
       GROUP BY r.food_type`,
      values
    );

    const donationMap = new Map();
    donationRows.forEach((row) => {
      donationMap.set(row.food_type, Number(row.available_quantity) || 0);
    });

    const requirementMap = new Map();
    requirementRows.forEach((row) => {
      requirementMap.set(row.food_type, Number(row.required_quantity) || 0);
    });

    const summary = Array.from(new Set([...donationMap.keys(), ...requirementMap.keys()]))
      .map((foodType) => {
        const availableQuantity = donationMap.get(foodType) || 0;
        const requiredQuantity = requirementMap.get(foodType) || 0;
        const baselineDemand = Math.max(requiredQuantity, 0);
        const predictedDemand = Math.round(baselineDemand * 1.15);
        const predictedSurplus = Math.max(availableQuantity - predictedDemand, 0);
        const predictedShortage = Math.max(predictedDemand - availableQuantity, 0);
        const confidence = clamp(Math.round((availableQuantity + requiredQuantity) / 12 + 55), 58, 96);

        return {
          foodType,
          availableQuantity,
          requiredQuantity,
          predictedDemand,
          predictedSurplus,
          predictedShortage,
          confidence,
          riskLevel: predictedShortage > 0 ? "shortage" : predictedSurplus > 0 ? "surplus" : "balanced"
        };
      })
      .sort((a, b) => (b.predictedSurplus + b.predictedShortage) - (a.predictedSurplus + a.predictedShortage));

    return res.status(200).json({
      success: true,
      summary,
      generatedAt: new Date().toISOString()
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: "Unable to generate forecast summary."
    });
  }
});

export default router;
