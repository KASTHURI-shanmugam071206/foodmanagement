import express from "express";
import { z } from "zod";
import { pool } from "../config/database.js";
import { authenticate, requireRole } from "../middleware/auth.js";

const router = express.Router();

const requirementSchema = z.object({
  foodType: z.string().trim().min(2, "Food category/type is required").max(100),
  quantityRequired: z.coerce.number().int().positive("Required quantity must be greater than 0"),
  requiredTime: z.string().min(1, "Required delivery time is required"),
  priority: z.enum(["low", "medium", "high"]).optional(),
  locationLat: z.coerce.number().min(-90).max(90).optional(),
  locationLng: z.coerce.number().min(-180).max(180).optional(),
  status: z.enum(["pending", "partially_fulfilled", "fulfilled", "cancelled"]).optional()
});

const updateRequirementSchema = requirementSchema.partial();

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

async function getOrCreateRecipientProfile(userId, userName) {
  const [rows] = await pool.execute(
    "SELECT recipient_id FROM recipients WHERE user_id = ? LIMIT 1",
    [userId]
  );

  if (rows.length > 0) {
    return rows[0].recipient_id;
  }

  const [result] = await pool.execute(
    "INSERT INTO recipients (user_id, organization_name, recipient_type, verified) VALUES (?, ?, 'ngo', TRUE)",
    [userId, userName || "Recipient Organization"]
  );

  return result.insertId;
}

async function getRequirementRecord(requirementId) {
  const [rows] = await pool.execute(
    `SELECT r.*, rec.organization_name, rec.recipient_type, u.name AS recipient_name, u.email AS recipient_email, u.phone AS recipient_phone
     FROM requirements r
     JOIN recipients rec ON rec.recipient_id = r.recipient_id
     JOIN users u ON u.user_id = rec.user_id
     WHERE r.requirement_id = ? LIMIT 1`,
    [requirementId]
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

router.get("/open", authenticate, async (req, res) => {
  try {
    const search = req.query.search ? `%${req.query.search.trim().toLowerCase()}%` : null;
    const foodType = req.query.foodType ? req.query.foodType.trim() : null;
    const priority = req.query.priority ? req.query.priority.trim() : null;

    let query = `
      SELECT r.*, u.name AS recipient_name, u.phone AS recipient_phone,
             rec.organization_name, rec.recipient_type, rec.address AS delivery_address
      FROM requirements r
      JOIN recipients rec ON rec.recipient_id = r.recipient_id
      JOIN users u ON u.user_id = rec.user_id
      WHERE r.status IN ('pending', 'partially_fulfilled') AND r.remaining_quantity > 0
    `;
    const params = [];

    if (foodType) {
      query += ` AND LOWER(r.food_type) = LOWER(?)`;
      params.push(foodType);
    }

    if (priority) {
      query += ` AND r.priority = ?`;
      params.push(priority);
    }

    if (search) {
      query += ` AND (LOWER(r.food_type) LIKE ? OR LOWER(u.name) LIKE ? OR LOWER(rec.organization_name) LIKE ?)`;
      params.push(search, search, search);
    }

    query += ` ORDER BY FIELD(r.priority, 'high', 'medium', 'low'), r.required_time ASC, r.created_at DESC`;

    const [rows] = await pool.execute(query, params);

    return res.status(200).json({
      success: true,
      requirements: rows
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: "Unable to fetch open food requirements."
    });
  }
});

router.post("/create", authenticate, requireRole("recipient", "admin"), async (req, res) => {
  const parsed = requirementSchema.safeParse(req.body);

  if (!parsed.success) {
    const firstError = parsed.error.issues?.[0]?.message || "Validation failed";
    return res.status(400).json({
      success: false,
      message: firstError,
      errors: parsed.error.flatten().fieldErrors
    });
  }

  const payload = parsed.data;
  const recipientId = await getOrCreateRecipientProfile(req.user.userId, req.user.name);

  try {
    const [result] = await pool.execute(
      `INSERT INTO requirements (
        recipient_id,
        food_type,
        quantity_required,
        remaining_quantity,
        required_time,
        location_lat,
        location_lng,
        priority,
        status
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        recipientId,
        payload.foodType,
        payload.quantityRequired,
        payload.quantityRequired,
        toSqlDateTime(payload.requiredTime),
        payload.locationLat ?? null,
        payload.locationLng ?? null,
        payload.priority || "medium",
        payload.status || "pending"
      ]
    );

    const requirementId = result.insertId;
    const requirement = await getRequirementRecord(requirementId);

    await logAudit(req.user.userId, "REQUIREMENT_CREATED", "requirements", requirementId, {
      foodType: payload.foodType,
      quantityRequired: payload.quantityRequired,
      priority: payload.priority
    });

    return res.status(201).json({
      success: true,
      message: "Food requirement created successfully.",
      requirement
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: "Unable to create the requirement."
    });
  }
});

router.get("/mine", authenticate, requireRole("recipient", "admin"), async (req, res) => {
  try {
    const recipientId = req.user.role === "admin"
      ? null
      : await getOrCreateRecipientProfile(req.user.userId, req.user.name);

    let query = `
      SELECT r.*,
             a.allocation_id, a.allocated_quantity, a.status AS allocation_status,
             del.delivery_id, del.status AS delivery_status,
             u_donor.name AS donor_name,
             u_vol.name AS volunteer_name
      FROM requirements r
      LEFT JOIN allocations a ON a.requirement_id = r.requirement_id
      LEFT JOIN donations d ON d.donation_id = a.donation_id
      LEFT JOIN donors donor ON donor.donor_id = d.donor_id
      LEFT JOIN users u_donor ON u_donor.user_id = donor.user_id
      LEFT JOIN deliveries del ON del.allocation_id = a.allocation_id
      LEFT JOIN volunteers v ON v.volunteer_id = del.volunteer_id
      LEFT JOIN users u_vol ON u_vol.user_id = v.user_id
    `;
    const params = [];

    if (recipientId) {
      query += ` WHERE r.recipient_id = ?`;
      params.push(recipientId);
    }

    query += ` ORDER BY r.created_at DESC`;

    const [rows] = await pool.execute(query, params);

    return res.status(200).json({
      success: true,
      requirements: rows
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: "Unable to fetch your requirements."
    });
  }
});

router.get("/:requirementId", authenticate, async (req, res) => {
  try {
    const requirement = await getRequirementRecord(req.params.requirementId);

    if (!requirement) {
      return res.status(404).json({
        success: false,
        message: "Requirement not found."
      });
    }

    return res.status(200).json({
      success: true,
      requirement
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: "Unable to fetch the requirement."
    });
  }
});

router.put("/:requirementId", authenticate, requireRole("recipient", "admin"), async (req, res) => {
  const parsed = updateRequirementSchema.safeParse(req.body);

  if (!parsed.success) {
    return res.status(400).json({
      success: false,
      message: "Validation failed",
      errors: parsed.error.flatten().fieldErrors
    });
  }

  try {
    const existing = await getRequirementRecord(req.params.requirementId);

    if (!existing) {
      return res.status(404).json({
        success: false,
        message: "Requirement not found."
      });
    }

    if (req.user.role !== "admin") {
      const recipientId = await getOrCreateRecipientProfile(req.user.userId, req.user.name);
      if (existing.recipient_id !== recipientId) {
        return res.status(403).json({
          success: false,
          message: "You can only update your own food requirements."
        });
      }
    }

    const assignments = [];
    const values = [];

    if (parsed.data.foodType) {
      assignments.push("food_type = ?"); values.push(parsed.data.foodType);
    }
    if (parsed.data.quantityRequired) {
      assignments.push("quantity_required = ?"); values.push(parsed.data.quantityRequired);
      assignments.push("remaining_quantity = ?"); values.push(parsed.data.quantityRequired);
    }
    if (parsed.data.requiredTime) {
      assignments.push("required_time = ?"); values.push(toSqlDateTime(parsed.data.requiredTime));
    }
    if (parsed.data.priority) {
      assignments.push("priority = ?"); values.push(parsed.data.priority);
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

    values.push(req.params.requirementId);
    await pool.execute(`UPDATE requirements SET ${assignments.join(", ")} WHERE requirement_id = ?`, values);

    await logAudit(req.user.userId, "REQUIREMENT_UPDATED", "requirements", req.params.requirementId);

    const updatedRequirement = await getRequirementRecord(req.params.requirementId);

    return res.status(200).json({
      success: true,
      message: "Requirement updated successfully.",
      requirement: updatedRequirement
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: "Unable to update the requirement."
    });
  }
});

router.delete("/:requirementId", authenticate, requireRole("recipient", "admin"), async (req, res) => {
  try {
    const existing = await getRequirementRecord(req.params.requirementId);

    if (!existing) {
      return res.status(404).json({
        success: false,
        message: "Requirement not found."
      });
    }

    if (req.user.role !== "admin") {
      const recipientId = await getOrCreateRecipientProfile(req.user.userId, req.user.name);
      if (existing.recipient_id !== recipientId) {
        return res.status(403).json({
          success: false,
          message: "You can only cancel your own food requirements."
        });
      }
    }

    await pool.execute(
      "UPDATE requirements SET status = 'cancelled', remaining_quantity = 0 WHERE requirement_id = ?",
      [req.params.requirementId]
    );

    await logAudit(req.user.userId, "REQUIREMENT_CANCELLED", "requirements", req.params.requirementId);

    return res.status(200).json({
      success: true,
      message: "Requirement cancelled successfully."
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: "Unable to cancel the requirement."
    });
  }
});

export default router;
