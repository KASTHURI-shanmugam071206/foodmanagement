import express from "express";
import { z } from "zod";
import { pool } from "../config/database.js";
import { authenticate, requireRole } from "../middleware/auth.js";

const router = express.Router();

const donationSchema = z.object({
  foodType: z.string().trim().min(2, "Food category/type is required").max(100),
  quantity: z.coerce.number().int().positive("Quantity must be greater than 0"),
  unit: z.string().trim().default("servings"),
  storageTemperatureC: z.coerce.number().optional(),
  storageType: z.enum(["ambient", "refrigerated", "frozen", "hot_holding"]).default("ambient"),
  allergens: z.string().trim().default("None"),
  foodCondition: z.enum(["fresh_hot", "fresh_chilled", "packaged_ambient", "sealed"]).default("packaged_ambient"),
  safetyStatus: z.enum(["safe", "requires_review", "unsafe_expired", "spoiled"]).default("safe"),
  safetyNotes: z.string().trim().max(500).optional(),
  preparationTime: z.string().min(1).optional(),
  safeUseDeadline: z.string().min(1, "Safe-use expiry deadline is required"),
  locationLat: z.coerce.number().min(-90).max(90).optional(),
  locationLng: z.coerce.number().min(-180).max(180).optional(),
  status: z.enum(["available", "allocated", "collected", "in_transit", "delivered", "expired", "cancelled"]).optional()
});

const updateDonationSchema = donationSchema.partial();

function normalizeDate(value) {
  if (value === null || value === undefined || value === "") return null;
  if (value instanceof Date) {
    return Number.isNaN(value.getTime()) ? null : value;
  }
  if (typeof value !== "string") return null;

  const trimmed = value.trim();
  if (!trimmed) return null;

  const candidateStrings = [trimmed];
  if (!trimmed.includes("T") && !trimmed.includes(" ")) {
    candidateStrings.push(`${trimmed}T12:00:00`);
  }

  for (const candidate of candidateStrings) {
    const date = new Date(candidate);
    if (!Number.isNaN(date.getTime())) {
      return date;
    }
  }

  return null;
}

function toSqlDateTime(value) {
  const date = normalizeDate(value);
  if (!date) return null;
  const pad = (n) => String(n).padStart(2, "0");
  const year = date.getFullYear();
  const month = pad(date.getMonth() + 1);
  const day = pad(date.getDate());
  const hours = pad(date.getHours());
  const minutes = pad(date.getMinutes());
  const seconds = pad(date.getSeconds());
  return `${year}-${month}-${day} ${hours}:${minutes}:${seconds}`;
}

async function getOrCreateDonorProfile(userId, userName) {
  const [rows] = await pool.execute(
    "SELECT donor_id FROM donors WHERE user_id = ? LIMIT 1",
    [userId]
  );

  if (rows.length > 0) {
    return rows[0].donor_id;
  }

  const [result] = await pool.execute(
    "INSERT INTO donors (user_id, organization_name, verified) VALUES (?, ?, TRUE)",
    [userId, userName || "Food Donor"]
  );

  return result.insertId;
}

async function getDonationRecord(donationId) {
  const [rows] = await pool.execute(
    `SELECT d.*, donor.organization_name, u.name AS donor_name, u.email AS donor_email, u.phone AS donor_phone
     FROM donations d
     JOIN donors donor ON donor.donor_id = d.donor_id
     JOIN users u ON u.user_id = donor.user_id
     WHERE d.donation_id = ? LIMIT 1`,
    [donationId]
  );

  return rows[0] || null;
}

async function logAudit(userId, action, entityType, entityId, metadata = null) {
  try {
    await pool.execute(
      "INSERT INTO audit_logs (user_id, action, entity_type, entity_id, metadata) VALUES (?, ?, ?, ?, ?)",
      [userId || null, action, entityType || null, entityId || null, metadata ? JSON.stringify(metadata) : null]
    );
  } catch {
    // Non-blocking
  }
}

router.get("/available", authenticate, async (req, res) => {
  try {
    const search = req.query.search ? `%${req.query.search.trim().toLowerCase()}%` : null;
    const foodType = req.query.foodType ? req.query.foodType.trim() : null;

    let query = `
      SELECT d.*, u.name AS donor_name, u.email AS donor_email, u.phone AS donor_phone,
             donor.organization_name, donor.address AS pickup_address
      FROM donations d
      JOIN donors donor ON donor.donor_id = d.donor_id
      JOIN users u ON u.user_id = donor.user_id
      WHERE d.status = 'available' AND d.remaining_quantity > 0
    `;
    const params = [];

    if (foodType) {
      query += ` AND LOWER(d.food_type) = LOWER(?)`;
      params.push(foodType);
    }

    if (search) {
      query += ` AND (LOWER(d.food_type) LIKE ? OR LOWER(u.name) LIKE ? OR LOWER(donor.organization_name) LIKE ?)`;
      params.push(search, search, search);
    }

    query += ` ORDER BY d.safe_use_deadline ASC, d.created_at DESC`;

    const [rows] = await pool.execute(query, params);

    return res.status(200).json({
      success: true,
      donations: rows
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: "Unable to fetch available donations."
    });
  }
});

router.post("/create", authenticate, requireRole("donor", "admin"), async (req, res) => {
  const parsed = donationSchema.safeParse(req.body);

  if (!parsed.success) {
    const firstError = parsed.error.issues?.[0]?.message || "Validation failed";
    return res.status(400).json({
      success: false,
      message: firstError,
      errors: parsed.error.flatten().fieldErrors
    });
  }

  const payload = parsed.data;
  const donorId = await getOrCreateDonorProfile(req.user.userId, req.user.name);

  try {
    const [result] = await pool.execute(
      `INSERT INTO donations (
        donor_id,
        food_type,
        quantity,
        remaining_quantity,
        unit,
        storage_temperature_c,
        storage_type,
        allergens,
        food_condition,
        safety_status,
        safety_notes,
        preparation_time,
        location_lat,
        location_lng,
        safe_use_deadline,
        status
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        donorId,
        payload.foodType,
        payload.quantity,
        payload.quantity,
        payload.unit || "servings",
        payload.storageTemperatureC ?? null,
        payload.storageType || "ambient",
        payload.allergens || "None",
        payload.foodCondition || "packaged_ambient",
        payload.safetyStatus || "safe",
        payload.safetyNotes || null,
        toSqlDateTime(payload.preparationTime || new Date()),
        payload.locationLat ?? null,
        payload.locationLng ?? null,
        toSqlDateTime(payload.safeUseDeadline),
        payload.status || "available"
      ]
    );

    const donationId = result.insertId;
    const donation = await getDonationRecord(donationId);

    await logAudit(req.user.userId, "DONATION_CREATED", "donations", donationId, {
      foodType: payload.foodType,
      quantity: payload.quantity
    });

    return res.status(201).json({
      success: true,
      message: "Donation created successfully.",
      donation
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: "Unable to create the donation record."
    });
  }
});

router.get("/mine", authenticate, requireRole("donor", "admin"), async (req, res) => {
  try {
    const donorId = req.user.role === "admin"
      ? null
      : await getOrCreateDonorProfile(req.user.userId, req.user.name);

    let query = `
      SELECT d.*,
             a.allocation_id, a.allocated_quantity, a.status AS allocation_status,
             del.delivery_id, del.status AS delivery_status,
             u_rec.name AS recipient_name,
             u_vol.name AS volunteer_name
      FROM donations d
      LEFT JOIN allocations a ON a.donation_id = d.donation_id
      LEFT JOIN requirements r ON r.requirement_id = a.requirement_id
      LEFT JOIN recipients rec ON rec.recipient_id = r.recipient_id
      LEFT JOIN users u_rec ON u_rec.user_id = rec.user_id
      LEFT JOIN deliveries del ON del.allocation_id = a.allocation_id
      LEFT JOIN volunteers v ON v.volunteer_id = del.volunteer_id
      LEFT JOIN users u_vol ON u_vol.user_id = v.user_id
    `;
    const params = [];

    if (donorId) {
      query += ` WHERE d.donor_id = ?`;
      params.push(donorId);
    }

    query += ` ORDER BY d.created_at DESC`;

    const [rows] = await pool.execute(query, params);

    return res.status(200).json({
      success: true,
      donations: rows
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: "Unable to fetch your donations."
    });
  }
});

router.get("/:donationId", authenticate, async (req, res) => {
  try {
    const donation = await getDonationRecord(req.params.donationId);

    if (!donation) {
      return res.status(404).json({
        success: false,
        message: "Donation not found."
      });
    }

    return res.status(200).json({
      success: true,
      donation
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: "Unable to fetch the donation."
    });
  }
});

router.put("/:donationId", authenticate, requireRole("donor", "admin"), async (req, res) => {
  const parsed = updateDonationSchema.safeParse(req.body);

  if (!parsed.success) {
    return res.status(400).json({
      success: false,
      message: "Validation failed",
      errors: parsed.error.flatten().fieldErrors
    });
  }

  try {
    const existing = await getDonationRecord(req.params.donationId);

    if (!existing) {
      return res.status(404).json({
        success: false,
        message: "Donation not found."
      });
    }

    if (req.user.role !== "admin") {
      const donorId = await getOrCreateDonorProfile(req.user.userId, req.user.name);
      if (existing.donor_id !== donorId) {
        return res.status(403).json({
          success: false,
          message: "You can only update your own donations."
        });
      }
    }

    const values = [];
    const assignments = [];

    if (parsed.data.foodType) {
      assignments.push("food_type = ?"); values.push(parsed.data.foodType);
    }
    if (parsed.data.quantity) {
      assignments.push("quantity = ?"); values.push(parsed.data.quantity);
      assignments.push("remaining_quantity = ?"); values.push(parsed.data.quantity);
    }
    if (parsed.data.preparationTime) {
      assignments.push("preparation_time = ?"); values.push(toSqlDateTime(parsed.data.preparationTime));
    }
    if (parsed.data.safeUseDeadline) {
      assignments.push("safe_use_deadline = ?"); values.push(toSqlDateTime(parsed.data.safeUseDeadline));
    }
    if (parsed.data.locationLat !== undefined) {
      assignments.push("location_lat = ?"); values.push(parsed.data.locationLat ?? null);
    }
    if (parsed.data.locationLng !== undefined) {
      assignments.push("location_lng = ?"); values.push(parsed.data.locationLng ?? null);
    }
    if (parsed.data.status) {
      assignments.push("status = ?"); values.push(parsed.data.status);
    }

    if (!assignments.length) {
      return res.status(400).json({
        success: false,
        message: "No update fields were provided."
      });
    }

    values.push(req.params.donationId);
    await pool.execute(
      `UPDATE donations SET ${assignments.join(", ")} WHERE donation_id = ?`,
      values
    );

    await logAudit(req.user.userId, "DONATION_UPDATED", "donations", req.params.donationId);

    const updatedDonation = await getDonationRecord(req.params.donationId);
    return res.status(200).json({
      success: true,
      message: "Donation updated successfully.",
      donation: updatedDonation
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: "Unable to update the donation."
    });
  }
});

router.delete("/:donationId", authenticate, requireRole("donor", "admin"), async (req, res) => {
  try {
    const existing = await getDonationRecord(req.params.donationId);

    if (!existing) {
      return res.status(404).json({
        success: false,
        message: "Donation not found."
      });
    }

    if (req.user.role !== "admin") {
      const donorId = await getOrCreateDonorProfile(req.user.userId, req.user.name);
      if (existing.donor_id !== donorId) {
        return res.status(403).json({
          success: false,
          message: "You can only cancel your own donations."
        });
      }
    }

    await pool.execute(
      "UPDATE donations SET status = 'cancelled', remaining_quantity = 0 WHERE donation_id = ?",
      [req.params.donationId]
    );

    await logAudit(req.user.userId, "DONATION_CANCELLED", "donations", req.params.donationId);

    return res.status(200).json({
      success: true,
      message: "Donation cancelled successfully."
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: "Unable to cancel the donation."
    });
  }
});

// Feature 4: Active safety and expiry alerts
router.get("/safety/alerts", authenticate, async (req, res) => {
  try {
    // Proactively update expired records
    await pool.execute(
      "UPDATE donations SET status = 'expired', safety_status = 'unsafe_expired' WHERE safe_use_deadline <= NOW() AND status = 'available'"
    ).catch(() => {});

    const [rows] = await pool.execute(`
      SELECT d.*, donor.organization_name AS donor_name, donor.address AS pickup_address,
             TIMESTAMPDIFF(MINUTE, NOW(), d.safe_use_deadline) AS minutes_remaining
      FROM donations d
      JOIN donors donor ON donor.donor_id = d.donor_id
      WHERE d.status IN ('available', 'allocated')
        AND d.remaining_quantity > 0
        AND d.safe_use_deadline <= DATE_ADD(NOW(), INTERVAL 4 HOUR)
      ORDER BY d.safe_use_deadline ASC
    `);

    const alerts = rows.map((r) => {
      const mins = Number(r.minutes_remaining) || 0;
      let level = "safe";
      if (mins <= 0) level = "expired";
      else if (mins <= 120) level = "critical"; // < 2 hrs
      else if (mins <= 240) level = "urgent";   // < 4 hrs

      return {
        ...r,
        alertLevel: level,
        hoursRemaining: (mins / 60).toFixed(1)
      };
    });

    return res.status(200).json({
      success: true,
      alerts
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: "Unable to retrieve food safety alerts."
    });
  }
});

// Feature 4: Report food spoilage / safety issue directly on a donation
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

router.post("/:donationId/report-safety", authenticate, async (req, res) => {
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

    const [rows] = await connection.execute(
      "SELECT * FROM donations WHERE donation_id = ? FOR UPDATE",
      [req.params.donationId]
    );

    if (!rows.length) {
      await connection.rollback();
      return res.status(404).json({ success: false, message: "Donation not found." });
    }

    const [reportResult] = await connection.execute(`
      INSERT INTO food_safety_reports
        (donation_id, reported_by, reason, notes, action_taken)
      VALUES (?, ?, ?, ?, 'marked_spoiled')
    `, [req.params.donationId, req.user.userId, reason, notes || null]);

    // Mark donation spoiled and cancel remaining
    await connection.execute(`
      UPDATE donations
      SET safety_status = 'spoiled', status = 'cancelled', remaining_quantity = 0, safety_notes = ?
      WHERE donation_id = ?
    `, [`Safety issue reported: ${reason}. Notes: ${notes || ''}`, req.params.donationId]);

    // Cancel any pending allocations
    await connection.execute(`
      UPDATE allocations SET status = 'cancelled'
      WHERE donation_id = ? AND status = 'pending'
    `, [req.params.donationId]);

    await connection.commit();

    return res.status(200).json({
      success: true,
      message: "Safety incident reported. Donation marked as spoiled.",
      reportId: reportResult.insertId
    });
  } catch (error) {
    await connection.rollback();
    return res.status(500).json({ success: false, message: "Unable to report food safety issue." });
  } finally {
    connection.release();
  }
});

// -------------------------------------------------------------
// POST /api/donations/ai-inspect — AI Food Freshness & Safety Scanner
// -------------------------------------------------------------
router.post("/ai-inspect", authenticate, async (req, res) => {
  try {
    const { foodType, photo, hoursAgo = 1, currentStorage = "ambient" } = req.body;

    // AI Safety & Freshness heuristics based on food chemistry and preparation timeline
    const categoryRules = {
      "Cooked Meals": { maxHours: 4, hotTemp: 65, chillTemp: 4, dangerFast: true },
      "Rice & Grains": { maxHours: 4, hotTemp: 65, chillTemp: 4, dangerFast: true },
      "Dairy Products": { maxHours: 3, hotTemp: null, chillTemp: 4, dangerFast: true },
      "Fresh Vegetables": { maxHours: 24, hotTemp: null, chillTemp: 10, dangerFast: false },
      "Fresh Fruits": { maxHours: 48, hotTemp: null, chillTemp: 12, dangerFast: false },
      "Bread & Bakery": { maxHours: 24, hotTemp: null, chillTemp: null, dangerFast: false },
      "Packaged Food": { maxHours: 72, hotTemp: null, chillTemp: null, dangerFast: false },
      "Beverages": { maxHours: 8, hotTemp: null, chillTemp: 4, dangerFast: false }
    };

    const rule = categoryRules[foodType] || { maxHours: 6, hotTemp: 60, chillTemp: 4, dangerFast: true };

    const hours = Math.max(0, Number(hoursAgo) || 1);
    const safeWindowLeft = Math.max(0, rule.maxHours - hours);
    let freshnessScore = Math.max(10, Math.min(99, Math.round(100 - (hours / rule.maxHours) * 60)));

    // Boost score if appropriately refrigerated or kept hot
    if (currentStorage === "refrigerated" || currentStorage === "hot_holding") {
      freshnessScore = Math.min(98, freshnessScore + 15);
    }

    let safetyStatus = "safe";
    let foodCondition = "fresh_hot";
    let recommendedStorageType = "hot_holding";
    let recommendedTemp = rule.hotTemp || 65;

    if (currentStorage === "refrigerated" || rule.chillTemp !== null && !rule.hotTemp) {
      recommendedStorageType = "refrigerated";
      recommendedTemp = rule.chillTemp || 4;
      foodCondition = "fresh_chilled";
    } else if (currentStorage === "frozen") {
      recommendedStorageType = "frozen";
      recommendedTemp = -18;
      foodCondition = "fresh_chilled";
    } else if (rule.maxHours >= 24) {
      recommendedStorageType = "ambient";
      recommendedTemp = 24;
      foodCondition = "packaged_ambient";
    }

    if (freshnessScore >= 80) {
      safetyStatus = "safe";
    } else if (freshnessScore >= 50) {
      safetyStatus = "requires_review";
    } else if (freshnessScore >= 30) {
      safetyStatus = "unsafe_expired";
    } else {
      safetyStatus = "spoiled";
    }

    const aiRemarks = safetyStatus === "safe"
      ? `AI Freshness Check Passed: ${foodType} is in optimal condition. Keep at ${recommendedTemp}°C (${recommendedStorageType}). Safe for redistribution for next ${safeWindowLeft} hours.`
      : `AI Alert: Potential safety risk for ${foodType}. Requires volunteer inspection upon pickup.`;

    const aiRemarksTa = safetyStatus === "safe"
      ? `AI சரிபார்ப்பு முடிந்தது: ${foodType} நல்ல நிலையில் உள்ளது. பரிந்துரைக்கப்பட்ட வெப்பநிலை: ${recommendedTemp}°C. அடுத்த ${safeWindowLeft} மணிநேரத்திற்குள் விநியோகிக்கலாம்.`
      : `AI எச்சரிக்கை: ${foodType}-ல் தரம் மாறுபட வாய்ப்புள்ளது. சேகரிக்கும் போது நேரடியாக சரிபார்க்கவும்.`;

    return res.status(200).json({
      success: true,
      analysis: {
        freshnessScore,
        safetyStatus,
        foodCondition,
        recommendedStorageType,
        recommendedTemperatureC: recommendedTemp,
        safeHoursRemaining: safeWindowLeft,
        aiRemarks,
        aiRemarksTa
      }
    });
  } catch (error) {
    return res.status(500).json({ success: false, message: "AI inspection failed." });
  }
});

export default router;
