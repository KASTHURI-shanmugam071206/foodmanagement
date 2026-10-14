import express from "express";
import { z } from "zod";
import { pool } from "../config/database.js";
import { authenticate, requireRole } from "../middleware/auth.js";
import { emitToDelivery, emitToUser } from "../services/socketService.js";
import {
  calculateDistanceKm,
  getSmartVolunteerRecommendations
} from "../services/smartAssignmentService.js";
import {
  getOrCreateVerificationCode,
  consumeVerificationCode
} from "../services/qrVerificationService.js";

const router = express.Router();

// Supported 10 Stages + terminal states
export const DELIVERY_STAGES = [
  "donation_created",
  "allocated",
  "volunteer_assigned",
  "assigned",
  "volunteer_accepted",
  "assignment_accepted",
  "arrived_pickup",
  "food_collected",
  "picked_up",
  "in_transit",
  "out_for_delivery",
  "arrived_destination",
  "arrived_recipient",
  "delivered",
  "confirmed",
  "cancelled",
  "failed"
];

// Helper to resolve delivery details with full authorization check
async function getFullDelivery(deliveryId) {
  const [rows] = await pool.execute(`
    SELECT del.*, del.status AS delivery_status,
           a.allocation_id, a.allocated_quantity, a.matching_score,
           d.donation_id, d.food_type, d.quantity AS donation_quantity, d.remaining_quantity AS donation_remaining,
           d.safe_use_deadline, d.preparation_time, d.unit, d.storage_temperature_c, d.storage_type,
           d.allergens, d.food_condition, d.safety_status, d.safety_notes,
           donor.donor_id, donor.organization_name AS donor_name, donor.address AS pickup_address,
           donor.location_lat AS pickup_lat, donor.location_lng AS pickup_lng,
           u_donor.user_id AS donor_user_id, u_donor.name AS donor_contact_name, u_donor.phone AS donor_phone,
           rec.recipient_id, rec.organization_name AS recipient_name, rec.address AS recipient_address,
           rec.address AS delivery_address,
           rec.location_lat AS recipient_lat, rec.location_lng AS recipient_lng,
           rec.location_lat AS delivery_lat, rec.location_lng AS delivery_lng,
           u_rec.user_id AS recipient_user_id, u_rec.name AS recipient_contact_name, u_rec.phone AS recipient_phone,
           v.volunteer_id, v.vehicle_type,
           u_vol.user_id AS volunteer_user_id, u_vol.name AS volunteer_name, u_vol.phone AS volunteer_phone
    FROM deliveries del
    JOIN allocations a ON a.allocation_id = del.allocation_id
    JOIN donations d ON d.donation_id = a.donation_id
    JOIN donors donor ON donor.donor_id = d.donor_id
    JOIN users u_donor ON u_donor.user_id = donor.user_id
    JOIN requirements r ON r.requirement_id = a.requirement_id
    JOIN recipients rec ON rec.recipient_id = r.recipient_id
    JOIN users u_rec ON u_rec.user_id = rec.user_id
    LEFT JOIN volunteers v ON v.volunteer_id = del.volunteer_id
    LEFT JOIN users u_vol ON u_vol.user_id = v.user_id
    WHERE del.delivery_id = ?
    LIMIT 1
  `, [deliveryId]);

  return rows[0] || null;
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
        emitToUser(id, "notification:new", { title, message, type, createdAt: new Date() });
      }
    }
  } catch {
    // Non-blocking
  }
}

// -------------------------------------------------------------
// GET /api/deliveries/assigned — Volunteer dashboard active list
// -------------------------------------------------------------
router.get("/assigned", authenticate, requireRole("volunteer", "admin"), async (req, res) => {
  try {
    let volunteerId = null;
    if (req.user.role === "volunteer") {
      volunteerId = await getVolunteerProfile(req.user.userId);
      if (!volunteerId) {
        return res.status(403).json({ success: false, message: "Volunteer profile not found." });
      }
    }

    let query = `
      SELECT del.delivery_id, del.status AS delivery_status, del.pickup_time, del.delivery_time, del.created_at,
             del.volunteer_lat, del.volunteer_lng, del.last_location_update, del.estimated_eta_minutes,
             del.pickup_photo, del.delivery_photo,
             a.allocation_id, a.allocated_quantity,
             d.donation_id, d.food_type, d.safe_use_deadline, d.unit, d.storage_temperature_c,
             d.storage_type, d.allergens, d.food_condition, d.safety_status,
             donor.address AS pickup_address, donor.organization_name AS donor_name,
             donor.location_lat AS pickup_lat, donor.location_lng AS pickup_lng,
             u_donor.phone AS donor_phone,
             rec.address AS delivery_address, rec.organization_name AS recipient_name,
             rec.location_lat AS recipient_lat, rec.location_lng AS recipient_lng,
             rec.location_lat AS delivery_lat, rec.location_lng AS delivery_lng,
             u_rec.phone AS recipient_phone,
             u_vol.name AS volunteer_name
      FROM deliveries del
      JOIN allocations a ON a.allocation_id = del.allocation_id
      JOIN donations d ON d.donation_id = a.donation_id
      JOIN donors donor ON donor.donor_id = d.donor_id
      JOIN users u_donor ON u_donor.user_id = donor.user_id
      JOIN requirements r ON r.requirement_id = a.requirement_id
      JOIN recipients rec ON rec.recipient_id = r.recipient_id
      JOIN users u_rec ON u_rec.user_id = rec.user_id
      LEFT JOIN volunteers v ON v.volunteer_id = del.volunteer_id
      LEFT JOIN users u_vol ON u_vol.user_id = v.user_id
    `;
    const params = [];

    if (volunteerId) {
      query += " WHERE del.volunteer_id = ?";
      params.push(volunteerId);
    }

    query += " ORDER BY del.created_at DESC";

    const [rows] = await pool.execute(query, params);

    let volunteerInfo = null;
    if (req.user.role === "volunteer" && volunteerId) {
      const [vRows] = await pool.execute(
        "SELECT volunteer_id, karma_points, vehicle_type FROM volunteers WHERE volunteer_id = ?",
        [volunteerId]
      );
      volunteerInfo = vRows[0] || null;
    }

    return res.status(200).json({ success: true, deliveries: rows, volunteer: volunteerInfo });
  } catch (error) {
    return res.status(500).json({ success: false, message: "Unable to load assigned deliveries." });
  }
});

// -------------------------------------------------------------
// GET /api/deliveries/leaderboard/top — Volunteer Leaderboard & Badges
// -------------------------------------------------------------
router.get("/leaderboard/top", authenticate, async (req, res) => {
  try {
    const [rows] = await pool.execute(`
      SELECT v.volunteer_id, u.name, v.karma_points, v.vehicle_type,
             COUNT(CASE WHEN del.status IN ('delivered', 'confirmed') THEN 1 END) AS completed_deliveries,
             COALESCE(SUM(CASE WHEN del.status IN ('delivered', 'confirmed') THEN a.allocated_quantity ELSE 0 END), 0) AS total_meals_rescued
      FROM volunteers v
      JOIN users u ON u.user_id = v.user_id
      LEFT JOIN deliveries del ON del.volunteer_id = v.volunteer_id
      LEFT JOIN allocations a ON a.allocation_id = del.allocation_id
      GROUP BY v.volunteer_id, u.name, v.karma_points, v.vehicle_type
      ORDER BY v.karma_points DESC, completed_deliveries DESC
      LIMIT 10
    `);
    return res.status(200).json({ success: true, leaderboard: rows });
  } catch (err) {
    return res.status(500).json({ success: false, message: "Unable to load leaderboard" });
  }
});

// -------------------------------------------------------------
// GET /api/deliveries/:deliveryId — Detailed single delivery view
// -------------------------------------------------------------
router.get("/:deliveryId", authenticate, async (req, res) => {
  try {
    const delivery = await getFullDelivery(req.params.deliveryId);
    if (!delivery) {
      return res.status(404).json({ success: false, message: "Delivery not found." });
    }

    // Role check
    const isParticipant =
      req.user.role === "admin" ||
      delivery.donor_user_id === req.user.userId ||
      delivery.recipient_user_id === req.user.userId ||
      delivery.volunteer_user_id === req.user.userId;

    if (!isParticipant) {
      return res.status(403).json({ success: false, message: "Unauthorized access to delivery." });
    }

    // Load status timeline
    const [historyRows] = await pool.execute(`
      SELECT h.history_id, h.status, h.notes, h.location_lat, h.location_lng, h.changed_at,
             u.name AS changed_by_name, u.role AS changed_by_role
      FROM delivery_status_history h
      LEFT JOIN users u ON u.user_id = h.changed_by
      WHERE h.delivery_id = ?
      ORDER BY h.changed_at ASC
    `, [req.params.deliveryId]);

    // Check location freshness
    let isLocationStale = true;
    if (delivery.last_location_update) {
      const diffMs = Date.now() - new Date(delivery.last_location_update).getTime();
      isLocationStale = diffMs > 3 * 60 * 1000; // > 3 min
    }

    return res.status(200).json({
      success: true,
      delivery,
      timeline: historyRows,
      isLocationStale
    });
  } catch (error) {
    return res.status(500).json({ success: false, message: "Unable to load delivery details." });
  }
});

// -------------------------------------------------------------
// PATCH /api/deliveries/:deliveryId/status — 10-Stage State Machine
// -------------------------------------------------------------
const statusChangeSchema = z.object({
  status: z.string().trim(),
  notes: z.string().trim().max(500).optional(),
  cancellationReason: z.string().trim().max(500).optional(),
  lat: z.coerce.number().min(-90).max(90).optional(),
  lng: z.coerce.number().min(-180).max(180).optional()
});

router.patch("/:deliveryId/status", authenticate, requireRole("volunteer", "admin"), async (req, res) => {
  const parsed = statusChangeSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({
      success: false,
      message: "Validation failed",
      errors: parsed.error.flatten().fieldErrors
    });
  }

  let { status, notes, cancellationReason, lat, lng } = parsed.data;

  // Map legacy names to 10 standard stages
  const statusAlias = {
    "assigned": "volunteer_assigned",
    "assignment_accepted": "volunteer_accepted",
    "arrived_recipient": "arrived_destination",
    "picked_up": "food_collected",
    "out_for_delivery": "in_transit",
    "confirmed": "delivered"
  };
  if (statusAlias[status]) {
    status = statusAlias[status];
  }

  const connection = await pool.getConnection();

  try {
    await connection.beginTransaction();

    const [delRows] = await connection.execute(`
      SELECT del.*, a.donation_id, a.requirement_id,
             d.donor_id, donor.user_id AS donor_user_id,
             rec.user_id AS recipient_user_id,
             v.user_id AS volunteer_user_id
      FROM deliveries del
      JOIN allocations a ON a.allocation_id = del.allocation_id
      JOIN donations d ON d.donation_id = a.donation_id
      JOIN donors donor ON donor.donor_id = d.donor_id
      JOIN requirements r ON r.requirement_id = a.requirement_id
      JOIN recipients rec ON rec.recipient_id = r.recipient_id
      LEFT JOIN volunteers v ON v.volunteer_id = del.volunteer_id
      WHERE del.delivery_id = ?
      FOR UPDATE
    `, [req.params.deliveryId]);

    if (!delRows.length) {
      await connection.rollback();
      return res.status(404).json({ success: false, message: "Delivery not found." });
    }

    const delivery = delRows[0];

    // Volunteer ownership check
    if (req.user.role === "volunteer") {
      const volId = await getVolunteerProfile(req.user.userId);
      if (delivery.volunteer_id !== volId) {
        await connection.rollback();
        return res.status(403).json({
          success: false,
          message: "You can only update deliveries assigned to you."
        });
      }
    }

    // Require reason for cancellation/failure
    if ((status === "cancelled" || status === "failed") && !cancellationReason && !notes) {
      await connection.rollback();
      return res.status(400).json({
        success: false,
        message: "A cancellation or failure reason is required."
      });
    }

    // Dynamic timestamp updates
    let timeUpdates = "";
    if (status === "food_collected" || status === "picked_up") {
      timeUpdates = ", pickup_time = NOW()";
    } else if (status === "delivered") {
      timeUpdates = ", delivery_time = NOW()";
    }

    let cancelSql = "";
    const cancelText = cancellationReason || notes || null;
    if (cancelText) {
      cancelSql = ", cancellation_reason = ?";
    }

    const updateParams = [status];
    if (cancelText) updateParams.push(cancelText);
    updateParams.push(req.params.deliveryId);

    await connection.execute(`
      UPDATE deliveries
      SET status = ? ${timeUpdates} ${cancelSql}
      WHERE delivery_id = ?
    `, updateParams);

    // Save status history audit
    await connection.execute(`
      INSERT INTO delivery_status_history
        (delivery_id, status, notes, location_lat, location_lng, changed_by)
      VALUES (?, ?, ?, ?, ?, ?)
    `, [
      req.params.deliveryId,
      status,
      notes || cancelText || null,
      lat ?? null,
      lng ?? null,
      req.user.userId
    ]);

    // Update parent allocation & donation statuses
    if (status === "delivered") {
      await connection.execute(
        "UPDATE allocations SET status = 'completed' WHERE allocation_id = ?",
        [delivery.allocation_id]
      );
      await connection.execute(
        "UPDATE donations SET status = 'delivered' WHERE donation_id = ? AND remaining_quantity = 0",
        [delivery.donation_id]
      );
    } else if (status === "in_transit" || status === "food_collected") {
      await connection.execute(
        "UPDATE donations SET status = 'in_transit' WHERE donation_id = ?",
        [delivery.donation_id]
      );
    } else if (status === "cancelled" || status === "failed") {
      await connection.execute(
        "UPDATE allocations SET status = 'cancelled' WHERE allocation_id = ?",
        [delivery.allocation_id]
      );
    }

    await connection.commit();

    const formattedStatus = status.replace(/_/g, " ").toUpperCase();
    const eventPayload = {
      deliveryId: Number(req.params.deliveryId),
      status,
      statusText: formattedStatus,
      changedBy: req.user.name,
      notes: notes || cancelText,
      timestamp: new Date().toISOString()
    };

    // Real-Time Socket.IO broadcasts
    emitToDelivery(req.params.deliveryId, "delivery:status_changed", eventPayload);
    emitToUser(delivery.donor_user_id, "delivery:status_changed", eventPayload);
    emitToUser(delivery.recipient_user_id, "delivery:status_changed", eventPayload);
    emitToUser(delivery.volunteer_user_id, "delivery:status_changed", eventPayload);

    // Non-blocking DB notification
    notifyUsers(
      [delivery.donor_user_id, delivery.recipient_user_id, delivery.volunteer_user_id],
      `Delivery update: ${formattedStatus}`,
      `Delivery #${delivery.delivery_id} status updated to "${formattedStatus}".`
    );

    return res.status(200).json({
      success: true,
      message: `Delivery status updated to ${status}.`,
      status,
      timestamp: eventPayload.timestamp
    });
  } catch (error) {
    await connection.rollback();
    return res.status(500).json({ success: false, message: "Unable to update delivery status." });
  } finally {
    connection.release();
  }
});

// -------------------------------------------------------------
// POST /api/deliveries/:deliveryId/location — Live GPS Tracking
// -------------------------------------------------------------
const locationSchema = z.object({
  lat: z.coerce.number().min(-90).max(90),
  lng: z.coerce.number().min(-180).max(180)
});

router.post("/:deliveryId/location", authenticate, requireRole("volunteer", "admin"), async (req, res) => {
  const parsed = locationSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ success: false, message: "Valid lat and lng required." });
  }

  const { lat, lng } = parsed.data;

  try {
    const delivery = await getFullDelivery(req.params.deliveryId);
    if (!delivery) {
      return res.status(404).json({ success: false, message: "Delivery not found." });
    }

    // Only allow location updates if delivery is active
    const terminalStates = ["delivered", "cancelled", "failed"];
    if (terminalStates.includes(delivery.status)) {
      return res.status(400).json({
        success: false,
        message: "Tracking stopped: delivery is already completed or inactive."
      });
    }

    // Determine target location: recipient if food collected / in transit, else donor
    const targetLat = ["food_collected", "in_transit", "arrived_recipient"].includes(delivery.status)
      ? delivery.recipient_lat
      : delivery.pickup_lat;
    const targetLng = ["food_collected", "in_transit", "arrived_recipient"].includes(delivery.status)
      ? delivery.recipient_lng
      : delivery.pickup_lng;

    let etaMinutes = null;
    let distanceKm = null;
    if (targetLat != null && targetLng != null) {
      distanceKm = calculateDistanceKm(lat, lng, targetLat, targetLng);
      if (distanceKm !== null) {
        // Average urban transit speed: ~25 km/h
        etaMinutes = Math.max(1, Math.round((distanceKm / 25) * 60));
      }
    }

    await pool.execute(`
      UPDATE deliveries
      SET volunteer_lat = ?, volunteer_lng = ?, last_location_update = NOW(), estimated_eta_minutes = ?
      WHERE delivery_id = ?
    `, [lat, lng, etaMinutes, req.params.deliveryId]);

    // Also update volunteer table coordinates
    if (delivery.volunteer_id) {
      await pool.execute(
        "UPDATE volunteers SET location_lat = ?, location_lng = ? WHERE volunteer_id = ?",
        [lat, lng, delivery.volunteer_id]
      );
    }

    const payload = {
      deliveryId: Number(req.params.deliveryId),
      volunteerLat: lat,
      volunteerLng: lng,
      distanceKm,
      etaMinutes,
      lastLocationUpdate: new Date().toISOString()
    };

    // Emit live location to room
    emitToDelivery(req.params.deliveryId, "delivery:location_updated", payload);

    return res.status(200).json({
      success: true,
      message: "Location updated successfully.",
      ...payload
    });
  } catch (error) {
    return res.status(500).json({ success: false, message: "Unable to update delivery location." });
  }
});

// -------------------------------------------------------------
// Feature 2: Smart Volunteer Recommendations & Assignment
// -------------------------------------------------------------
router.get("/:deliveryId/recommend-volunteers", authenticate, requireRole("admin"), async (req, res) => {
  try {
    const delivery = await getFullDelivery(req.params.deliveryId);
    if (!delivery) {
      return res.status(404).json({ success: false, message: "Delivery not found." });
    }

    const recommendations = await getSmartVolunteerRecommendations({
      pickupLat: delivery.pickup_lat,
      pickupLng: delivery.pickup_lng,
      destinationLat: delivery.recipient_lat,
      destinationLng: delivery.recipient_lng,
      safeUseDeadline: delivery.safe_use_deadline,
      quantity: delivery.allocated_quantity || 10
    });

    return res.status(200).json({
      success: true,
      deliveryId: delivery.delivery_id,
      currentVolunteerId: delivery.volunteer_id,
      currentVolunteerName: delivery.volunteer_name,
      recommendations
    });
  } catch (error) {
    return res.status(500).json({ success: false, message: "Unable to calculate volunteer recommendations." });
  }
});

// Admin manual assign / reassign volunteer
const assignVolunteerSchema = z.object({
  volunteerId: z.coerce.number().int().positive(),
  notes: z.string().trim().max(300).optional()
});

router.post("/:deliveryId/assign-volunteer", authenticate, requireRole("admin"), async (req, res) => {
  const parsed = assignVolunteerSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ success: false, message: "Valid volunteerId is required." });
  }

  const { volunteerId, notes } = parsed.data;
  const connection = await pool.getConnection();

  try {
    await connection.beginTransaction();

    const [delRows] = await connection.execute(
      "SELECT * FROM deliveries WHERE delivery_id = ? FOR UPDATE",
      [req.params.deliveryId]
    );

    if (!delRows.length) {
      await connection.rollback();
      return res.status(404).json({ success: false, message: "Delivery not found." });
    }

    const [volRows] = await connection.execute(
      "SELECT v.*, u.name, u.user_id FROM volunteers v JOIN users u ON u.user_id = v.user_id WHERE v.volunteer_id = ? LIMIT 1",
      [volunteerId]
    );

    if (!volRows.length) {
      await connection.rollback();
      return res.status(404).json({ success: false, message: "Target volunteer not found." });
    }

    const volunteer = volRows[0];

    // Assign volunteer
    await connection.execute(`
      UPDATE deliveries
      SET volunteer_id = ?, status = 'volunteer_assigned'
      WHERE delivery_id = ?
    `, [volunteerId, req.params.deliveryId]);

    // History record
    await connection.execute(`
      INSERT INTO delivery_status_history (delivery_id, status, notes, changed_by)
      VALUES (?, 'volunteer_assigned', ?, ?)
    `, [
      req.params.deliveryId,
      notes || `Assigned to ${volunteer.name} by admin`,
      req.user.userId
    ]);

    await connection.commit();

    notifyUsers(
      [volunteer.user_id],
      "New Delivery Assignment",
      `You have been assigned to rescue delivery #${req.params.deliveryId}. Please review and accept.`
    );

    emitToDelivery(req.params.deliveryId, "delivery:status_changed", {
      deliveryId: Number(req.params.deliveryId),
      status: "volunteer_assigned",
      volunteerName: volunteer.name,
      timestamp: new Date().toISOString()
    });

    return res.status(200).json({
      success: true,
      message: `Volunteer ${volunteer.name} successfully assigned to delivery #${req.params.deliveryId}.`,
      volunteerId,
      volunteerName: volunteer.name
    });
  } catch (error) {
    await connection.rollback();
    return res.status(500).json({ success: false, message: "Unable to assign volunteer." });
  } finally {
    connection.release();
  }
});

// Volunteer accept or reject assignment
const respondSchema = z.object({
  action: z.enum(["accept", "reject"]),
  reason: z.string().trim().max(300).optional()
});

router.post("/:deliveryId/respond", authenticate, requireRole("volunteer"), async (req, res) => {
  const parsed = respondSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ success: false, message: "Action must be 'accept' or 'reject'." });
  }

  const { action, reason } = parsed.data;
  const volunteerId = await getVolunteerProfile(req.user.userId);
  const connection = await pool.getConnection();

  try {
    await connection.beginTransaction();

    const [delRows] = await connection.execute(
      "SELECT * FROM deliveries WHERE delivery_id = ? FOR UPDATE",
      [req.params.deliveryId]
    );

    if (!delRows.length) {
      await connection.rollback();
      return res.status(404).json({ success: false, message: "Delivery not found." });
    }

    const delivery = delRows[0];
    if (delivery.volunteer_id !== volunteerId) {
      await connection.rollback();
      return res.status(403).json({ success: false, message: "You are not assigned to this delivery." });
    }

    if (action === "accept") {
      await connection.execute(
        "UPDATE deliveries SET status = 'volunteer_accepted' WHERE delivery_id = ?",
        [req.params.deliveryId]
      );
      await connection.execute(`
        INSERT INTO delivery_status_history (delivery_id, status, notes, changed_by)
        VALUES (?, 'volunteer_accepted', 'Volunteer accepted the assignment', ?)
      `, [req.params.deliveryId, req.user.userId]);

      await connection.commit();

      emitToDelivery(req.params.deliveryId, "delivery:status_changed", {
        deliveryId: Number(req.params.deliveryId),
        status: "volunteer_accepted",
        timestamp: new Date().toISOString()
      });

      return res.status(200).json({ success: true, message: "Assignment accepted! Please proceed to pickup." });
    } else {
      // Rejection: Release assignment safely
      await connection.execute(
        "UPDATE deliveries SET status = 'allocated', volunteer_id = NULL WHERE delivery_id = ?",
        [req.params.deliveryId]
      );
      await connection.execute(`
        INSERT INTO delivery_status_history (delivery_id, status, notes, changed_by)
        VALUES (?, 'allocated', ?, ?)
      `, [req.params.deliveryId, `Volunteer rejected: ${reason || 'Unavailable'}`, req.user.userId]);

      await connection.commit();

      emitToDelivery(req.params.deliveryId, "delivery:status_changed", {
        deliveryId: Number(req.params.deliveryId),
        status: "allocated",
        notes: "Assignment released by volunteer",
        timestamp: new Date().toISOString()
      });

      return res.status(200).json({ success: true, message: "Assignment released. Thank you for notifying us." });
    }
  } catch (error) {
    await connection.rollback();
    return res.status(500).json({ success: false, message: "Unable to process assignment response." });
  } finally {
    connection.release();
  }
});

// -------------------------------------------------------------
// Feature 4: Food Safety Reporting Endpoint
// -------------------------------------------------------------
const safetyReportSchema = z.object({
  reason: z.enum([
    "expired",
    "temperature_abuse",
    "packaging_damaged",
    "foul_odor_color",
    "contamination",
    "other"
  ]),
  notes: z.string().trim().max(1000).optional()
});

router.post("/:deliveryId/report-safety", authenticate, async (req, res) => {
  const parsed = safetyReportSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({
      success: false,
      message: "Validation failed",
      errors: parsed.error.flatten().fieldErrors
    });
  }

  const { reason, notes } = parsed.data;
  const connection = await pool.getConnection();

  try {
    await connection.beginTransaction();

    const [delRows] = await connection.execute(`
      SELECT del.*, a.donation_id,
             d.donor_id, donor.user_id AS donor_user_id,
             rec.user_id AS recipient_user_id
      FROM deliveries del
      JOIN allocations a ON a.allocation_id = del.allocation_id
      JOIN donations d ON d.donation_id = a.donation_id
      JOIN donors donor ON donor.donor_id = d.donor_id
      JOIN requirements r ON r.requirement_id = a.requirement_id
      JOIN recipients rec ON rec.recipient_id = r.recipient_id
      WHERE del.delivery_id = ?
      FOR UPDATE
    `, [req.params.deliveryId]);

    if (!delRows.length) {
      await connection.rollback();
      return res.status(404).json({ success: false, message: "Delivery not found." });
    }

    const delivery = delRows[0];

    // Insert safety report
    const [reportResult] = await connection.execute(`
      INSERT INTO food_safety_reports
        (donation_id, delivery_id, reported_by, reason, notes, action_taken)
      VALUES (?, ?, ?, ?, ?, 'marked_spoiled')
    `, [delivery.donation_id, req.params.deliveryId, req.user.userId, reason, notes || null]);

    // Mark delivery as failed
    await connection.execute(`
      UPDATE deliveries
      SET status = 'failed', cancellation_reason = ?
      WHERE delivery_id = ?
    `, [`Food Safety Issue: ${reason}. Notes: ${notes || 'None'}`, req.params.deliveryId]);

    // Mark donation as spoiled
    await connection.execute(`
      UPDATE donations
      SET status = 'cancelled', safety_status = 'spoiled', safety_notes = ?
      WHERE donation_id = ?
    `, [`Spoilage reported: ${reason}. ${notes || ''}`, delivery.donation_id]);

    // Status history
    await connection.execute(`
      INSERT INTO delivery_status_history (delivery_id, status, notes, changed_by)
      VALUES (?, 'failed', ?, ?)
    `, [
      req.params.deliveryId,
      `Food safety report #${reportResult.insertId}: ${reason}`,
      req.user.userId
    ]);

    await connection.commit();

    // Broadcast alerts
    const alertPayload = {
      deliveryId: Number(req.params.deliveryId),
      status: "failed",
      reason: `Food Safety Alert: ${reason}`,
      timestamp: new Date().toISOString()
    };

    emitToDelivery(req.params.deliveryId, "delivery:status_changed", alertPayload);
    notifyUsers(
      [delivery.donor_user_id, delivery.recipient_user_id],
      "Food Safety Incident Reported",
      `Delivery #${req.params.deliveryId} was stopped due to a reported safety issue (${reason}).`,
      "safety_alert"
    );

    return res.status(200).json({
      success: true,
      message: "Food safety issue recorded. Delivery has been safely stopped.",
      reportId: reportResult.insertId
    });
  } catch (error) {
    await connection.rollback();
    return res.status(500).json({ success: false, message: "Unable to record food safety report." });
  } finally {
    connection.release();
  }
});

// -------------------------------------------------------------
// Feature 7: QR Code Generation & Verification
// -------------------------------------------------------------
// Donor gets Pickup QR & code
router.get("/:deliveryId/qr/pickup", authenticate, async (req, res) => {
  try {
    const delivery = await getFullDelivery(req.params.deliveryId);
    if (!delivery) {
      return res.status(404).json({ success: false, message: "Delivery not found." });
    }

    const isAuthorized = req.user.role === "admin" || delivery.donor_user_id === req.user.userId;
    if (!isAuthorized) {
      return res.status(403).json({ success: false, message: "Only the food donor can generate pickup QR." });
    }

    const qrData = await getOrCreateVerificationCode(delivery.delivery_id, "pickup");

    return res.status(200).json({
      success: true,
      ...qrData,
      foodType: delivery.food_type,
      quantity: delivery.allocated_quantity
    });
  } catch (error) {
    return res.status(500).json({ success: false, message: "Unable to generate pickup QR code." });
  }
});

// Recipient gets Delivery QR & code
router.get("/:deliveryId/qr/delivery", authenticate, async (req, res) => {
  try {
    const delivery = await getFullDelivery(req.params.deliveryId);
    if (!delivery) {
      return res.status(404).json({ success: false, message: "Delivery not found." });
    }

    const isAuthorized = req.user.role === "admin" || delivery.recipient_user_id === req.user.userId;
    if (!isAuthorized) {
      return res.status(403).json({ success: false, message: "Only the recipient can generate delivery confirmation QR." });
    }

    const qrData = await getOrCreateVerificationCode(delivery.delivery_id, "delivery");

    return res.status(200).json({
      success: true,
      ...qrData,
      recipientName: delivery.recipient_name,
      quantity: delivery.allocated_quantity
    });
  } catch (error) {
    return res.status(500).json({ success: false, message: "Unable to generate delivery QR code." });
  }
});

// Volunteer verifies Pickup (via scanned token or 6-digit code)
const verifySchema = z.object({
  token: z.string().trim().optional(),
  manualCode: z.string().trim().optional(),
  photo: z.string().optional()
});

router.post("/:deliveryId/verify-pickup", authenticate, requireRole("volunteer", "admin"), async (req, res) => {
  const parsed = verifySchema.safeParse(req.body);
  if (!parsed.success || (!parsed.data.token && !parsed.data.manualCode)) {
    return res.status(400).json({ success: false, message: "Provide either a scanned QR token or 6-digit backup code." });
  }

  const connection = await pool.getConnection();

  try {
    await connection.beginTransaction();

    const [delRows] = await connection.execute(
      "SELECT * FROM deliveries WHERE delivery_id = ? FOR UPDATE",
      [req.params.deliveryId]
    );

    if (!delRows.length) {
      await connection.rollback();
      return res.status(404).json({ success: false, message: "Delivery not found." });
    }

    const delivery = delRows[0];

    // Consume verification code
    await consumeVerificationCode(
      delivery.delivery_id,
      "pickup",
      parsed.data,
      req.user.userId,
      connection
    );

    // Transition status to food_collected & save photo if provided
    let photoSql = "";
    const updateParams = [];
    if (parsed.data.photo) {
      photoSql = ", pickup_photo = ?";
      updateParams.push(parsed.data.photo);
    }
    updateParams.push(delivery.delivery_id);

    await connection.execute(`
      UPDATE deliveries
      SET status = 'food_collected', pickup_time = NOW() ${photoSql}
      WHERE delivery_id = ?
    `, updateParams);

    await connection.execute(`
      INSERT INTO delivery_status_history (delivery_id, status, notes, changed_by)
      VALUES (?, 'food_collected', 'Verified pickup via secure QR / PIN code', ?)
    `, [delivery.delivery_id, req.user.userId]);

    await connection.commit();

    const eventPayload = {
      deliveryId: delivery.delivery_id,
      status: "food_collected",
      statusText: "FOOD COLLECTED",
      notes: "Pickup verified by QR / code",
      timestamp: new Date().toISOString()
    };

    emitToDelivery(delivery.delivery_id, "delivery:status_changed", eventPayload);

    return res.status(200).json({
      success: true,
      message: "Pickup verified successfully! Food is now collected.",
      status: "food_collected"
    });
  } catch (error) {
    await connection.rollback();
    return res.status(400).json({ success: false, message: error.message || "Failed to verify pickup." });
  } finally {
    connection.release();
  }
});

// Volunteer verifies Delivery (via scanned token or 6-digit code)
router.post("/:deliveryId/verify-delivery", authenticate, requireRole("volunteer", "admin"), async (req, res) => {
  const parsed = verifySchema.safeParse(req.body);
  if (!parsed.success || (!parsed.data.token && !parsed.data.manualCode)) {
    return res.status(400).json({ success: false, message: "Provide either a scanned QR token or 6-digit backup code." });
  }

  const connection = await pool.getConnection();

  try {
    await connection.beginTransaction();

    const [delRows] = await connection.execute(`
      SELECT del.*, a.donation_id, a.allocation_id
      FROM deliveries del
      JOIN allocations a ON a.allocation_id = del.allocation_id
      WHERE del.delivery_id = ?
      FOR UPDATE
    `, [req.params.deliveryId]);

    if (!delRows.length) {
      await connection.rollback();
      return res.status(404).json({ success: false, message: "Delivery not found." });
    }

    const delivery = delRows[0];

    // Consume verification code
    await consumeVerificationCode(
      delivery.delivery_id,
      "delivery",
      parsed.data,
      req.user.userId,
      connection
    );

    // Transition status to delivered & save photo if provided
    let photoSql = "";
    const updateParams = [];
    if (parsed.data.photo) {
      photoSql = ", delivery_photo = ?";
      updateParams.push(parsed.data.photo);
    }
    updateParams.push(delivery.delivery_id);

    await connection.execute(`
      UPDATE deliveries
      SET status = 'delivered', delivery_time = NOW() ${photoSql}
      WHERE delivery_id = ?
    `, updateParams);

    await connection.execute(
      "UPDATE allocations SET status = 'completed' WHERE allocation_id = ?",
      [delivery.allocation_id]
    );

    await connection.execute(
      "UPDATE donations SET status = 'delivered' WHERE donation_id = ? AND remaining_quantity = 0",
      [delivery.donation_id]
    );

    // Award 50 Karma Points to volunteer
    if (delivery.volunteer_id) {
      await connection.execute(
        "UPDATE volunteers SET karma_points = karma_points + 50 WHERE volunteer_id = ?",
        [delivery.volunteer_id]
      );
    }

    await connection.execute(`
      INSERT INTO delivery_status_history (delivery_id, status, notes, changed_by)
      VALUES (?, 'delivered', 'Verified delivery via secure recipient QR / PIN code', ?)
    `, [delivery.delivery_id, req.user.userId]);

    await connection.commit();

    const eventPayload = {
      deliveryId: delivery.delivery_id,
      status: "delivered",
      statusText: "DELIVERED",
      notes: "Delivery verified by recipient QR / PIN",
      timestamp: new Date().toISOString()
    };

    emitToDelivery(delivery.delivery_id, "delivery:status_changed", eventPayload);

    return res.status(200).json({
      success: true,
      message: "Delivery verified successfully! Mission accomplished. +50 Karma Points awarded!",
      status: "delivered",
      karmaAwarded: 50
    });
  } catch (error) {
    await connection.rollback();
    return res.status(400).json({ success: false, message: error.message || "Failed to verify delivery." });
  } finally {
    connection.release();
  }
});

// -------------------------------------------------------------
// POST /api/deliveries/:deliveryId/photo — Upload Handover Photo Proof
// -------------------------------------------------------------
router.post("/:deliveryId/photo", authenticate, requireRole("volunteer", "admin"), async (req, res) => {
  try {
    const { type, photo } = req.body;
    if (!photo || (type !== "pickup" && type !== "delivery")) {
      return res.status(400).json({ success: false, message: "Valid type (pickup/delivery) and photo data required." });
    }
    const col = type === "pickup" ? "pickup_photo" : "delivery_photo";
    await pool.execute(`UPDATE deliveries SET ${col} = ? WHERE delivery_id = ?`, [photo, req.params.deliveryId]);
    emitToDelivery(req.params.deliveryId, "delivery:photo_uploaded", {
      deliveryId: Number(req.params.deliveryId),
      type,
      photo
    });
    return res.status(200).json({ success: true, message: `${type === "pickup" ? "Pickup" : "Delivery"} photo proof saved!` });
  } catch (err) {
    return res.status(500).json({ success: false, message: "Unable to save photo proof." });
  }
});

export default router;
