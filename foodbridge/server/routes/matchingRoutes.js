import express from "express";
import { z } from "zod";
import { pool } from "../config/database.js";
import { authenticate, requireRole } from "../middleware/auth.js";

const router = express.Router();

const allocationSchema = z.object({
  donationId: z.coerce.number().int().positive(),
  requirementId: z.coerce.number().int().positive(),
  volunteerId: z.coerce.number().int().positive().optional()
});

const deliveryStatusSchema = z.object({
  status: z.enum(["assigned", "picked_up", "in_transit", "out_for_delivery", "delivered", "confirmed"])
});

function normalizeUpper(value) {
  return (value || "").toLowerCase().trim();
}

async function getVolunteerProfile(userId) {
  const [rows] = await pool.execute(
    "SELECT volunteer_id FROM volunteers WHERE user_id = ? LIMIT 1",
    [userId]
  );
  return rows[0]?.volunteer_id ?? null;
}

async function notifyUsers(userIds, title, message, type = "delivery") {
  try {
    for (const id of userIds) {
      if (id) {
        await pool.execute(
          "INSERT INTO notifications (user_id, title, message, type, is_read) VALUES (?, ?, ?, ?, FALSE)",
          [id, title, message, type]
        );
      }
    }
  } catch {
    // Non-blocking notification
  }
}

import { calculateDistanceKm, getSmartVolunteerRecommendations } from "../services/smartAssignmentService.js";

router.get("/recommended", authenticate, async (req, res) => {
  try {
    // Proactively expire any past-deadline donations
    await pool.execute(
      "UPDATE donations SET status = 'expired', safety_status = 'unsafe_expired' WHERE safe_use_deadline <= NOW() AND status = 'available'"
    ).catch(() => {});

    const [requirements] = await pool.execute(
      `SELECT r.*, rec.organization_name AS recipient_org, rec.recipient_type, u.name AS recipient_name
       FROM requirements r
       JOIN recipients rec ON rec.recipient_id = r.recipient_id
       JOIN users u ON u.user_id = rec.user_id
       WHERE r.status IN ('pending', 'partially_fulfilled') AND r.remaining_quantity > 0
       ORDER BY r.priority DESC, r.created_at DESC`
    );

    const [donations] = await pool.execute(
      `SELECT d.*, donor.organization_name AS donor_org, u.name AS donor_name
       FROM donations d
       JOIN donors donor ON donor.donor_id = d.donor_id
       JOIN users u ON u.user_id = donor.user_id
       WHERE d.status IN ('available', 'allocated')
         AND d.remaining_quantity > 0
         AND d.safe_use_deadline > NOW()
         AND d.safety_status NOT IN ('unsafe_expired', 'spoiled')
       ORDER BY d.created_at DESC`
    );

    const matches = [];

    for (const requirement of requirements) {
      for (const donation of donations) {
        const dType = normalizeUpper(donation.food_type);
        const rType = normalizeUpper(requirement.food_type);
        const exactMatch = dType === rType;
        const partialMatch = dType.includes(rType) || rType.includes(dType);

        if (!exactMatch && !partialMatch) continue;

        // 1. Food Type Compatibility (Max 30 pts)
        const foodPoints = exactMatch ? 30 : 18;
        const foodReason = exactMatch ? "Exact category match" : "Related food category";

        // 2. Urgency Window based on safe-use deadline (Max 25 pts)
        const msLeft = new Date(donation.safe_use_deadline).getTime() - Date.now();
        const hoursLeft = Math.max(0, msLeft / (1000 * 60 * 60));
        let urgencyPoints = 10;
        let urgencyReason = "Adequate safe handling window";
        if (hoursLeft <= 2) {
          urgencyPoints = 25;
          urgencyReason = `Critical expiry window (${hoursLeft.toFixed(1)}h remaining) — immediate rescue needed`;
        } else if (hoursLeft <= 5) {
          urgencyPoints = 20;
          urgencyReason = `Approaching safe-use deadline (${hoursLeft.toFixed(1)}h remaining)`;
        } else if (hoursLeft <= 12) {
          urgencyPoints = 15;
          urgencyReason = `Safe pickup window (${hoursLeft.toFixed(1)}h remaining)`;
        }

        // 3. Recipient Priority & Need Equity (Max 25 pts)
        let priorityPoints = 10;
        let priorityReason = "Standard community requirement";
        if (requirement.priority === "high") {
          priorityPoints = 25;
          priorityReason = "High-priority humanitarian requirement";
        } else if (requirement.priority === "medium") {
          priorityPoints = 18;
          priorityReason = "Medium-priority requirement";
        }

        // 4. Quantity Fit (Max 10 pts)
        const matchedQty = Math.min(donation.remaining_quantity, requirement.remaining_quantity);
        const pctFulfilled = Math.round((matchedQty / requirement.remaining_quantity) * 100);
        let quantityPoints = 5;
        let quantityReason = `Fulfills ${pctFulfilled}% of requested quantity (${matchedQty} units)`;
        if (matchedQty >= requirement.remaining_quantity) {
          quantityPoints = 10;
          quantityReason = `Completely satisfies requested volume (${matchedQty} units)`;
        } else if (pctFulfilled >= 50) {
          quantityPoints = 8;
        }

        // 5. Proximity (Max 10 pts)
        const distanceKm = calculateDistanceKm(
          donation.location_lat,
          donation.location_lng,
          requirement.location_lat,
          requirement.location_lng
        );
        let proximityPoints = 6; // fallback neutral
        let proximityReason = "Location estimated";
        if (distanceKm !== null) {
          if (distanceKm <= 3.0) {
            proximityPoints = 10;
            proximityReason = `${distanceKm} km apart (hyper-local proximity)`;
          } else if (distanceKm <= 8.0) {
            proximityPoints = 8;
            proximityReason = `${distanceKm} km apart (short transit distance)`;
          } else if (distanceKm <= 15.0) {
            proximityPoints = 5;
            proximityReason = `${distanceKm} km apart`;
          } else {
            proximityPoints = 2;
            proximityReason = `${distanceKm} km apart (longer transit)`;
          }
        }

        const totalScore = Math.min(99, foodPoints + urgencyPoints + priorityPoints + quantityPoints + proximityPoints);

        const explanation = {
          foodCategory: { points: foodPoints, max: 30, reason: foodReason },
          urgency: { points: urgencyPoints, max: 25, reason: urgencyReason },
          recipientPriority: { points: priorityPoints, max: 25, reason: priorityReason },
          quantityFit: { points: quantityPoints, max: 10, reason: quantityReason },
          proximity: { points: proximityPoints, max: 10, reason: proximityReason }
        };

        const summary = `${totalScore}% Match: ${foodReason}, ${priorityReason}, ${urgencyReason}.`;

        matches.push({
          donationId: donation.donation_id,
          requirementId: requirement.requirement_id,
          foodType: donation.food_type,
          requestedFood: requirement.food_type,
          donationRemaining: donation.remaining_quantity,
          requirementRemaining: requirement.remaining_quantity,
          matchedQuantity: matchedQty,
          donorName: donation.donor_org || donation.donor_name,
          recipientName: requirement.recipient_org || requirement.recipient_name,
          score: totalScore,
          explanation,
          summary,
          safeUseDeadline: donation.safe_use_deadline,
          requiredTime: requirement.required_time,
          distanceKm
        });
      }
    }

    matches.sort((a, b) => b.score - a.score);

    return res.status(200).json({
      success: true,
      matches
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: "Unable to generate recommended matches."
    });
  }
});

router.get("/assigned", authenticate, requireRole("volunteer"), async (req, res) => {
  try {
    const volunteerId = await getVolunteerProfile(req.user.userId);

    if (!volunteerId) {
      return res.status(403).json({
        success: false,
        message: "Volunteer profile not found."
      });
    }

    const [rows] = await pool.execute(
      `SELECT del.delivery_id, del.status AS delivery_status, del.pickup_time, del.delivery_time, del.created_at,
              a.allocation_id, a.allocated_quantity,
              d.donation_id, d.food_type, d.safe_use_deadline,
              donor.address AS pickup_address, donor.organization_name AS donor_name,
              u_donor.phone AS donor_phone,
              rec.address AS delivery_address, rec.organization_name AS recipient_name,
              u_rec.phone AS recipient_phone
       FROM deliveries del
       JOIN allocations a ON a.allocation_id = del.allocation_id
       JOIN donations d ON d.donation_id = a.donation_id
       JOIN donors donor ON donor.donor_id = d.donor_id
       JOIN users u_donor ON u_donor.user_id = donor.user_id
       JOIN requirements r ON r.requirement_id = a.requirement_id
       JOIN recipients rec ON rec.recipient_id = r.recipient_id
       JOIN users u_rec ON u_rec.user_id = rec.user_id
       WHERE del.volunteer_id = ?
       ORDER BY del.created_at DESC`,
      [volunteerId]
    );

    return res.status(200).json({
      success: true,
      deliveries: rows
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: "Unable to load assigned deliveries."
    });
  }
});

router.patch("/deliveries/:deliveryId/status", authenticate, requireRole("volunteer", "admin"), async (req, res) => {
  const parsed = deliveryStatusSchema.safeParse(req.body);

  if (!parsed.success) {
    return res.status(400).json({
      success: false,
      message: "Validation failed",
      errors: parsed.error.flatten().fieldErrors
    });
  }

  const { status } = parsed.data;
  const connection = await pool.getConnection();

  try {
    await connection.beginTransaction();

    const [rows] = await connection.execute(
      `SELECT del.*, a.donation_id, a.requirement_id,
              donor.user_id AS donor_user_id, rec.user_id AS recipient_user_id
       FROM deliveries del
       JOIN allocations a ON a.allocation_id = del.allocation_id
       JOIN donations d ON d.donation_id = a.donation_id
       JOIN donors donor ON donor.donor_id = d.donor_id
       JOIN requirements r ON r.requirement_id = a.requirement_id
       JOIN recipients rec ON rec.recipient_id = r.recipient_id
       WHERE del.delivery_id = ? FOR UPDATE`,
      [req.params.deliveryId]
    );

    if (!rows.length) {
      await connection.rollback();
      return res.status(404).json({
        success: false,
        message: "Delivery not found."
      });
    }

    const delivery = rows[0];

    if (req.user.role === "volunteer") {
      const volunteerId = await getVolunteerProfile(req.user.userId);
      if (delivery.volunteer_id !== volunteerId) {
        await connection.rollback();
        return res.status(403).json({
          success: false,
          message: "You can only update your own assigned deliveries."
        });
      }
    }

    let timeUpdate = "";
    if (status === "picked_up") {
      timeUpdate = ", pickup_time = NOW()";
    } else if (status === "delivered" || status === "confirmed") {
      timeUpdate = ", delivery_time = NOW()";
    }

    await connection.execute(
      `UPDATE deliveries SET status = ? ${timeUpdate} WHERE delivery_id = ?`,
      [status, req.params.deliveryId]
    );

    // Save history audit in delivery_status_history
    await connection.execute(
      "INSERT INTO delivery_status_history (delivery_id, status, changed_by) VALUES (?, ?, ?)",
      [req.params.deliveryId, status, req.user.userId]
    );

    // Update parent donation and allocation status if delivered
    if (status === "delivered" || status === "confirmed") {
      await connection.execute(
        "UPDATE allocations SET status = 'completed' WHERE allocation_id = ?",
        [delivery.allocation_id]
      );
      await connection.execute(
        "UPDATE donations SET status = 'delivered' WHERE donation_id = ? AND remaining_quantity = 0",
        [delivery.donation_id]
      );
    } else if (status === "in_transit") {
      await connection.execute(
        "UPDATE donations SET status = 'in_transit' WHERE donation_id = ?",
        [delivery.donation_id]
      );
    }

    await connection.commit();

    // Trigger non-blocking notifications
    notifyUsers(
      [delivery.donor_user_id, delivery.recipient_user_id],
      `Delivery update: ${status.replace("_", " ")}`,
      `Your delivery #${delivery.delivery_id} status has been updated to "${status.replace("_", " ")}".`
    );

    return res.status(200).json({
      success: true,
      message: `Delivery status updated to ${status}.`,
      status
    });
  } catch (error) {
    await connection.rollback();
    return res.status(500).json({
      success: false,
      message: "Unable to update delivery status."
    });
  } finally {
    connection.release();
  }
});

router.post("/allocate", authenticate, requireRole("admin", "recipient", "donor", "volunteer"), async (req, res) => {
  const parsed = allocationSchema.safeParse(req.body);

  if (!parsed.success) {
    return res.status(400).json({
      success: false,
      message: "Validation failed",
      errors: parsed.error.flatten().fieldErrors
    });
  }

  const { donationId, requirementId, volunteerId: assignedVolId } = parsed.data;
  const connection = await pool.getConnection();

  try {
    await connection.beginTransaction();

    const [donationRows] = await connection.execute(
      `SELECT d.*, donor.user_id AS donor_user_id
       FROM donations d
       JOIN donors donor ON donor.donor_id = d.donor_id
       WHERE d.donation_id = ? FOR UPDATE`,
      [donationId]
    );

    const [reqRows] = await connection.execute(
      `SELECT r.*, rec.user_id AS recipient_user_id
       FROM requirements r
       JOIN recipients rec ON rec.recipient_id = r.recipient_id
       WHERE r.requirement_id = ? FOR UPDATE`,
      [requirementId]
    );

    if (!donationRows.length || !reqRows.length) {
      await connection.rollback();
      return res.status(404).json({
        success: false,
        message: "Donation or requirement not found."
      });
    }

    const donation = donationRows[0];
    const requirement = reqRows[0];

    // Food Safety Check (Feature 4)
    if (new Date(donation.safe_use_deadline).getTime() <= Date.now()) {
      await connection.rollback();
      return res.status(400).json({
        success: false,
        message: "Cannot allocate: Food donation safe-use deadline has already passed."
      });
    }

    if (donation.safety_status === "spoiled" || donation.safety_status === "unsafe_expired") {
      await connection.rollback();
      return res.status(400).json({
        success: false,
        message: `Cannot allocate: Donation is flagged as ${donation.safety_status}.`
      });
    }

    if (donation.remaining_quantity <= 0 || requirement.remaining_quantity <= 0) {
      await connection.rollback();
      return res.status(400).json({
        success: false,
        message: "The selected donation or requirement has no available quantity remaining."
      });
    }

    const allocatedQuantity = Math.min(donation.remaining_quantity, requirement.remaining_quantity);
    const matchingScore = 92.5;

    const [allocResult] = await connection.execute(
      `INSERT INTO allocations (donation_id, requirement_id, allocated_quantity, matching_score, status)
       VALUES (?, ?, ?, ?, 'confirmed')`,
      [donationId, requirementId, allocatedQuantity, matchingScore]
    );

    const allocationId = allocResult.insertId;

    const updatedDonationRemaining = donation.remaining_quantity - allocatedQuantity;
    const updatedReqRemaining = requirement.remaining_quantity - allocatedQuantity;

    await connection.execute(
      "UPDATE donations SET remaining_quantity = ?, status = ? WHERE donation_id = ?",
      [
        updatedDonationRemaining,
        updatedDonationRemaining > 0 ? "available" : "allocated",
        donationId
      ]
    );

    await connection.execute(
      "UPDATE requirements SET remaining_quantity = ?, status = ? WHERE requirement_id = ?",
      [
        updatedReqRemaining,
        updatedReqRemaining > 0 ? "partially_fulfilled" : "fulfilled",
        requirementId
      ]
    );

    // Determine volunteer using Smart Assignment (Feature 2)
    let targetVolunteerId = assignedVolId || null;
    if (!targetVolunteerId && req.user.role === "volunteer") {
      targetVolunteerId = await getVolunteerProfile(req.user.userId);
    }

    // Auto-pick best scoring available volunteer if none selected
    if (!targetVolunteerId) {
      const recommendations = await getSmartVolunteerRecommendations({
        pickupLat: donation.location_lat,
        pickupLng: donation.location_lng,
        destinationLat: requirement.location_lat,
        destinationLng: requirement.location_lng,
        safeUseDeadline: donation.safe_use_deadline,
        quantity: allocatedQuantity,
        limit: 1
      });

      if (recommendations.length > 0) {
        targetVolunteerId = recommendations[0].volunteerId;
      } else {
        const [volRows] = await connection.execute(
          "SELECT volunteer_id FROM volunteers WHERE availability = TRUE LIMIT 1"
        );
        if (volRows.length > 0) {
          targetVolunteerId = volRows[0].volunteer_id;
        }
      }
    }

    let deliveryId = null;
    if (targetVolunteerId) {
      const [delResult] = await connection.execute(
        "INSERT INTO deliveries (allocation_id, volunteer_id, status) VALUES (?, ?, 'volunteer_assigned')",
        [allocationId, targetVolunteerId]
      );
      deliveryId = delResult.insertId;

      await connection.execute(
        "INSERT INTO delivery_status_history (delivery_id, status, notes, changed_by) VALUES (?, 'volunteer_assigned', 'Allocated and assigned to volunteer', ?)",
        [deliveryId, req.user.userId]
      );
    }

    await connection.commit();

    notifyUsers(
      [donation.donor_user_id, requirement.recipient_user_id],
      "Food allocation confirmed",
      `Allocation #${allocationId} for ${allocatedQuantity} units has been confirmed.`
    );

    return res.status(201).json({
      success: true,
      message: "Allocation successfully confirmed.",
      allocationId,
      deliveryId,
      allocatedQuantity
    });
  } catch (error) {
    await connection.rollback();
    return res.status(500).json({
      success: false,
      message: "Unable to complete allocation transaction."
    });
  } finally {
    connection.release();
  }
});

export default router;
