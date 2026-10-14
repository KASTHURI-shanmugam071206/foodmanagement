import express from "express";
import { z } from "zod";
import { pool } from "../config/database.js";
import { authenticate, requireRole } from "../middleware/auth.js";

const router = express.Router();

const recoveryPlanSchema = z.object({
  donationId: z.coerce.number().int().positive(),
  scenario: z.enum([
    "recipient_cancelled",
    "volunteer_cancelled",
    "pickup_delayed",
    "insufficient_capacity",
    "route_infeasible"
  ]).default("recipient_cancelled"),
  reason: z.string().trim().max(250).optional()
});

function buildRankedAlternatives(donation, requirements) {
  return requirements
    .filter((requirement) => requirement.remaining_quantity > 0)
    .map((requirement) => {
      const sameFoodType = requirement.food_type.toLowerCase() === donation.food_type.toLowerCase();
      const quantityFit = Math.min(donation.remaining_quantity, requirement.remaining_quantity);
      const urgencyBoost = requirement.priority === "high" ? 18 : requirement.priority === "medium" ? 10 : 5;
      const totalScore = (sameFoodType ? 45 : 20) + urgencyBoost + Math.min(quantityFit, 25);

      return {
        requirementId: requirement.requirement_id,
        recipientName: requirement.organization_name || "Recipient organization",
        foodType: requirement.food_type,
        requestQuantity: requirement.remaining_quantity,
        matchedQuantity: quantityFit,
        score: totalScore,
        reason: sameFoodType
          ? "Same food category and active demand."
          : "Compatible demand with remaining pickup window.",
        requiresApproval: true
      };
    })
    .sort((a, b) => b.score - a.score)
    .slice(0, 5);
}

router.post("/plan", authenticate, requireRole("admin", "donor", "recipient"), async (req, res) => {
  const parsed = recoveryPlanSchema.safeParse(req.body);

  if (!parsed.success) {
    return res.status(400).json({
      success: false,
      message: "Validation failed",
      errors: parsed.error.flatten().fieldErrors
    });
  }

  try {
    const [donationRows] = await pool.execute(
      "SELECT * FROM donations WHERE donation_id = ? LIMIT 1",
      [parsed.data.donationId]
    );

    if (!donationRows.length) {
      return res.status(404).json({
        success: false,
        message: "Donation not found."
      });
    }

    const donation = donationRows[0];
    const [requirementRows] = await pool.execute(
      `SELECT r.*, rec.organization_name
       FROM requirements r
       JOIN recipients rec ON rec.recipient_id = r.recipient_id
       WHERE r.status IN ('pending', 'partially_fulfilled') AND r.remaining_quantity > 0
       ORDER BY r.priority DESC, r.created_at DESC`
    );

    const alternativeRecipients = buildRankedAlternatives(donation, requirementRows);

    return res.status(200).json({
      success: true,
      scenario: parsed.data.scenario,
      reason: parsed.data.reason || "Original assignment failed or became infeasible.",
      donationId: donation.donation_id,
      foodType: donation.food_type,
      availableQuantity: donation.remaining_quantity,
      alternatives: alternativeRecipients,
      recommendedAction: alternativeRecipients.length
        ? "Reassign the remaining quantity to the highest-scoring eligible recipient after human approval."
        : "No feasible alternate recipient is available; escalate to an authorised coordinator.",
      requiresApproval: true
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: "Unable to evaluate recovery options."
    });
  }
});

export default router;
