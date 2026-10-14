import express from "express";
import bcrypt from "bcryptjs";
import { z } from "zod";
import { pool } from "../config/database.js";
import { authenticate, requireRole } from "../middleware/auth.js";

const router = express.Router();

const fourDigitPasswordSchema = z
  .string({ required_error: "Password is required" })
  .regex(/^\d{4}$/, "Password must contain exactly 4 numeric digits (0-9)");

const userStatusSchema = z.object({
  action: z.enum(["verify", "suspend", "reactivate"]).default("verify")
});

const adminCreateUserSchema = z.object({
  name: z.string().trim().min(2, "Name must be at least 2 characters").max(100),
  email: z.string().trim().email("Use a valid email address").max(150),
  password: fourDigitPasswordSchema,
  phone: z.string().trim().max(15).optional().or(z.literal("")),
  role: z.enum(["donor", "recipient", "volunteer", "admin"]).default("donor"),
  recipientType: z.enum(["ngo", "individual"]).optional(),
  organizationName: z.string().trim().max(150).optional(),
  address: z.string().trim().max(255).optional(),
  locationLat: z.coerce.number().min(-90).max(90).optional(),
  locationLng: z.coerce.number().min(-180).max(180).optional()
});

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

router.get("/stats", authenticate, requireRole("admin"), async (req, res) => {
  try {
    const [donationCount] = await pool.execute("SELECT COUNT(*) AS total FROM donations");
    const [activeDonations] = await pool.execute(
      "SELECT COUNT(*) AS total, COALESCE(SUM(remaining_quantity), 0) AS total_remaining FROM donations WHERE status = 'available'"
    );
    const [requirementCount] = await pool.execute("SELECT COUNT(*) AS total FROM requirements");
    const [openRequirements] = await pool.execute(
      "SELECT COUNT(*) AS total, COALESCE(SUM(remaining_quantity), 0) AS total_needed FROM requirements WHERE status IN ('pending', 'partially_fulfilled')"
    );
    const [allocationCount] = await pool.execute("SELECT COUNT(*) AS total FROM allocations");
    const [deliveryCount] = await pool.execute("SELECT COUNT(*) AS total FROM deliveries");
    const [deliveredCount] = await pool.execute("SELECT COUNT(*) AS total FROM deliveries WHERE status IN ('delivered', 'confirmed')");
    const [userRows] = await pool.execute(
      "SELECT role, COUNT(*) AS total FROM users GROUP BY role ORDER BY role"
    );

    const stats = {
      users: Object.fromEntries(userRows.map((row) => [row.role, Number(row.total)])),
      donations: Number(donationCount[0]?.total || 0),
      activeDonations: Number(activeDonations[0]?.total || 0),
      totalDonationRemainingUnits: Number(activeDonations[0]?.total_remaining || 0),
      requirements: Number(requirementCount[0]?.total || 0),
      openRequirements: Number(openRequirements[0]?.total || 0),
      totalNeededUnits: Number(openRequirements[0]?.total_needed || 0),
      allocations: Number(allocationCount[0]?.total || 0),
      deliveries: Number(deliveryCount[0]?.total || 0),
      completedDeliveries: Number(deliveredCount[0]?.total || 0)
    };

    return res.status(200).json({
      success: true,
      stats
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: "Unable to load platform statistics."
    });
  }
});

router.get("/users", authenticate, requireRole("admin"), async (req, res) => {
  try {
    const [rows] = await pool.execute(
      `SELECT u.user_id, u.name, u.email, u.phone, u.role, u.is_verified, u.created_at,
              u.failed_login_attempts, u.locked_until,
              d.organization_name AS donor_org,
              r.organization_name AS recipient_org,
              r.recipient_type,
              v.vehicle_type AS volunteer_vehicle,
              v.availability AS volunteer_availability
       FROM users u
       LEFT JOIN donors d ON d.user_id = u.user_id
       LEFT JOIN recipients r ON r.user_id = u.user_id
       LEFT JOIN volunteers v ON v.user_id = u.user_id
       ORDER BY u.created_at DESC`
    );

    return res.status(200).json({
      success: true,
      users: rows
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: "Unable to fetch user records."
    });
  }
});

router.post("/users", authenticate, requireRole("admin"), async (req, res) => {
  const parsed = adminCreateUserSchema.safeParse(req.body);

  if (!parsed.success) {
    const firstError = parsed.error.issues?.[0]?.message || "Validation failed";
    return res.status(400).json({
      success: false,
      message: firstError,
      errors: parsed.error.flatten().fieldErrors
    });
  }

  const { name, email, password, phone, role, recipientType, organizationName, address, locationLat, locationLng } = parsed.data;
  const normalizedEmail = email.toLowerCase();

  try {
    const [existing] = await pool.execute(
      "SELECT user_id FROM users WHERE email = ? LIMIT 1",
      [normalizedEmail]
    );

    if (existing.length > 0) {
      return res.status(409).json({
        success: false,
        message: "A user with this email already exists."
      });
    }

    const passwordHash = await bcrypt.hash(password, 10);
    const connection = await pool.getConnection();

    try {
      await connection.beginTransaction();

      const [result] = await connection.execute(
        "INSERT INTO users (name, email, phone, role, password_hash, is_verified) VALUES (?, ?, ?, ?, ?, TRUE)",
        [name, normalizedEmail, phone || null, role, passwordHash]
      );

      const newUserId = result.insertId;

      if (role === "donor") {
        await connection.execute(
          "INSERT INTO donors (user_id, organization_name, location_lat, location_lng, address, verified) VALUES (?, ?, ?, ?, ?, TRUE)",
          [newUserId, organizationName || name, locationLat ?? null, locationLng ?? null, address || null]
        );
      } else if (role === "recipient") {
        await connection.execute(
          "INSERT INTO recipients (user_id, organization_name, recipient_type, location_lat, location_lng, address, verified) VALUES (?, ?, ?, ?, ?, ?, TRUE)",
          [newUserId, organizationName || name, recipientType || "ngo", locationLat ?? null, locationLng ?? null, address || null]
        );
      } else if (role === "volunteer") {
        await connection.execute(
          "INSERT INTO volunteers (user_id, location_lat, location_lng, availability, vehicle_type) VALUES (?, ?, ?, TRUE, 'none')",
          [newUserId, locationLat ?? null, locationLng ?? null]
        );
      }

      await connection.commit();

      await logAudit(req.user.userId, "ADMIN_CREATE_USER", "users", newUserId, {
        email: normalizedEmail,
        role,
        recipientType
      });

      return res.status(201).json({
        success: true,
        message: "User account created successfully by administrator.",
        userId: newUserId
      });
    } catch (err) {
      await connection.rollback();
      throw err;
    } finally {
      connection.release();
    }
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: "Unable to create user account."
    });
  }
});

router.patch("/users/:userId/status", authenticate, requireRole("admin"), async (req, res) => {
  const parsed = userStatusSchema.safeParse(req.body);

  if (!parsed.success) {
    return res.status(400).json({
      success: false,
      message: "Validation failed",
      errors: parsed.error.flatten().fieldErrors
    });
  }

  try {
    const { userId } = req.params;
    const { action } = parsed.data;

    const [userRows] = await pool.execute(
      "SELECT user_id, role, is_verified FROM users WHERE user_id = ? LIMIT 1",
      [userId]
    );

    if (!userRows.length) {
      return res.status(404).json({
        success: false,
        message: "User not found."
      });
    }

    const isVerified = action === "verify" ? 1 : action === "suspend" ? 0 : 1;
    const profileVerified = action === "verify" ? 1 : action === "suspend" ? 0 : 1;

    await pool.execute(
      "UPDATE users SET is_verified = ?, failed_login_attempts = 0, locked_until = NULL WHERE user_id = ?",
      [isVerified, userId]
    );

    if (userRows[0].role === "donor") {
      await pool.execute(
        "UPDATE donors SET verified = ? WHERE user_id = ?",
        [profileVerified, userId]
      );
    }

    if (userRows[0].role === "recipient") {
      await pool.execute(
        "UPDATE recipients SET verified = ? WHERE user_id = ?",
        [profileVerified, userId]
      );
    }

    if (userRows[0].role === "volunteer") {
      await pool.execute(
        "UPDATE volunteers SET availability = ? WHERE user_id = ?",
        [profileVerified === 1, userId]
      );
    }

    await logAudit(req.user.userId, `ADMIN_USER_${action.toUpperCase()}`, "users", userId, { action });

    return res.status(200).json({
      success: true,
      message: `User ${action} action completed successfully.`
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: "Unable to update the user status."
    });
  }
});

router.delete("/users/:userId", authenticate, requireRole("admin"), async (req, res) => {
  try {
    const { userId } = req.params;

    if (Number(userId) === Number(req.user.userId)) {
      return res.status(400).json({
        success: false,
        message: "You cannot delete your own admin account."
      });
    }

    const [userRows] = await pool.execute(
      "SELECT user_id, email, name FROM users WHERE user_id = ? LIMIT 1",
      [userId]
    );

    if (!userRows.length) {
      return res.status(404).json({
        success: false,
        message: "User not found."
      });
    }

    await pool.execute("DELETE FROM users WHERE user_id = ?", [userId]);

    await logAudit(req.user.userId, "ADMIN_DELETE_USER", "users", userId, {
      deletedEmail: userRows[0].email,
      deletedName: userRows[0].name
    });

    return res.status(200).json({
      success: true,
      message: "User deleted successfully."
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: "Unable to delete user."
    });
  }
});

router.get("/donations", authenticate, requireRole("admin"), async (req, res) => {
  try {
    const [rows] = await pool.execute(
      `SELECT d.*, u.name AS donor_name, u.email AS donor_email, donor.organization_name
       FROM donations d
       JOIN donors donor ON donor.donor_id = d.donor_id
       JOIN users u ON u.user_id = donor.user_id
       ORDER BY d.created_at DESC`
    );

    return res.status(200).json({
      success: true,
      donations: rows
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: "Unable to fetch donation records."
    });
  }
});

router.get("/requirements", authenticate, requireRole("admin"), async (req, res) => {
  try {
    const [rows] = await pool.execute(
      `SELECT r.*, u.name AS recipient_name, u.email AS recipient_email, recipient.organization_name, recipient.recipient_type
       FROM requirements r
       JOIN recipients recipient ON recipient.recipient_id = r.recipient_id
       JOIN users u ON u.user_id = recipient.user_id
       ORDER BY r.created_at DESC`
    );

    return res.status(200).json({
      success: true,
      requirements: rows
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: "Unable to fetch requirement records."
    });
  }
});

router.get("/allocations", authenticate, requireRole("admin"), async (req, res) => {
  try {
    const [rows] = await pool.execute(
      `SELECT a.*,
              d.food_type, d.safe_use_deadline,
              u_donor.name AS donor_name,
              u_rec.name AS recipient_name,
              del.delivery_id, del.status AS delivery_status,
              u_vol.name AS volunteer_name
       FROM allocations a
       JOIN donations d ON d.donation_id = a.donation_id
       JOIN donors donor ON donor.donor_id = d.donor_id
       JOIN users u_donor ON u_donor.user_id = donor.user_id
       JOIN requirements r ON r.requirement_id = a.requirement_id
       JOIN recipients rec ON rec.recipient_id = r.recipient_id
       JOIN users u_rec ON u_rec.user_id = rec.user_id
       LEFT JOIN deliveries del ON del.allocation_id = a.allocation_id
       LEFT JOIN volunteers v ON v.volunteer_id = del.volunteer_id
       LEFT JOIN users u_vol ON u_vol.user_id = v.user_id
       ORDER BY a.created_at DESC`
    );

    return res.status(200).json({
      success: true,
      allocations: rows
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: "Unable to fetch allocations."
    });
  }
});

router.get("/deliveries", authenticate, requireRole("admin"), async (req, res) => {
  try {
    const [rows] = await pool.execute(
      `SELECT del.*,
              a.allocated_quantity,
              d.food_type, d.safe_use_deadline,
              u_donor.name AS donor_name, donor.address AS donor_address,
              u_rec.name AS recipient_name, rec.address AS recipient_address,
              u_vol.name AS volunteer_name, u_vol.phone AS volunteer_phone
       FROM deliveries del
       JOIN allocations a ON a.allocation_id = del.allocation_id
       JOIN donations d ON d.donation_id = a.donation_id
       JOIN donors donor ON donor.donor_id = d.donor_id
       JOIN users u_donor ON u_donor.user_id = donor.user_id
       JOIN requirements r ON r.requirement_id = a.requirement_id
       JOIN recipients rec ON rec.recipient_id = r.recipient_id
       JOIN users u_rec ON u_rec.user_id = rec.user_id
       JOIN volunteers v ON v.volunteer_id = del.volunteer_id
       JOIN users u_vol ON u_vol.user_id = v.user_id
       ORDER BY del.created_at DESC`
    );

    return res.status(200).json({
      success: true,
      deliveries: rows
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: "Unable to fetch deliveries."
    });
  }
});

router.get("/audit-log", authenticate, requireRole("admin"), async (req, res) => {
  try {
    const [rows] = await pool.execute(
      `SELECT a.*, u.name AS user_name, u.email AS user_email, u.role AS user_role
       FROM audit_logs a
       LEFT JOIN users u ON u.user_id = a.user_id
       ORDER BY a.created_at DESC
       LIMIT 100`
    );

    return res.status(200).json({
      success: true,
      auditLog: rows
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: "Unable to fetch audit log."
    });
  }
});

// Feature 6: Real-Time Impact Dashboard and Analytics
router.get("/impact", authenticate, async (req, res) => {
  try {
    const period = req.query.period || "all";
    let dateFilter = "";
    if (period === "today") {
      dateFilter = "AND del.delivery_time >= CURDATE()";
    } else if (period === "week") {
      dateFilter = "AND del.delivery_time >= DATE_SUB(NOW(), INTERVAL 7 DAY)";
    } else if (period === "month") {
      dateFilter = "AND del.delivery_time >= DATE_SUB(NOW(), INTERVAL 30 DAY)";
    }

    // 1. Delivered stats
    const [deliveredStats] = await pool.execute(`
      SELECT COALESCE(SUM(a.allocated_quantity), 0) AS total_meals,
             COUNT(DISTINCT del.delivery_id) AS total_deliveries,
             COUNT(DISTINCT d.donor_id) AS active_donors,
             COUNT(DISTINCT r.recipient_id) AS active_recipients,
             COUNT(DISTINCT del.volunteer_id) AS active_volunteers
      FROM deliveries del
      JOIN allocations a ON a.allocation_id = del.allocation_id
      JOIN donations d ON d.donation_id = a.donation_id
      JOIN requirements r ON r.requirement_id = a.requirement_id
      WHERE del.status IN ('delivered', 'confirmed') ${dateFilter}
    `);

    // 2. Total active / in-progress meals
    const [inProgressStats] = await pool.execute(`
      SELECT COALESCE(SUM(a.allocated_quantity), 0) AS in_transit_meals
      FROM deliveries del
      JOIN allocations a ON a.allocation_id = del.allocation_id
      WHERE del.status NOT IN ('delivered', 'cancelled', 'failed')
    `);

    // 3. Category breakdown
    const [categories] = await pool.execute(`
      SELECT d.food_type, COALESCE(SUM(a.allocated_quantity), 0) AS meals_rescued
      FROM deliveries del
      JOIN allocations a ON a.allocation_id = del.allocation_id
      JOIN donations d ON d.donation_id = a.donation_id
      WHERE del.status IN ('delivered', 'confirmed') ${dateFilter}
      GROUP BY d.food_type
      ORDER BY meals_rescued DESC
    `);

    // 4. Calculate environmental impact metrics (transparent methodology)
    // 1 serving/meal ≈ 0.42 kg (standard global food waste estimate)
    const totalMeals = Number(deliveredStats[0]?.total_meals || 0);
    const totalKgSaved = Math.round(totalMeals * 0.42 * 10) / 10;
    // 2.5 kg CO2e prevented per 1 kg of food rescued (FAO/EPA Food Loss and Waste methodology)
    const co2AvoidedKg = Math.round(totalKgSaved * 2.5 * 10) / 10;
    // 1,000 liters of embedded water footprint saved per kg of food rescued
    const waterSavedLiters = Math.round(totalKgSaved * 1000);

    const impact = {
      period,
      totalMealsRescued: totalMeals,
      totalWeightKg: totalKgSaved,
      co2AvoidedKg,
      waterSavedLiters,
      completedDeliveries: Number(deliveredStats[0]?.total_deliveries || 0),
      inTransitMeals: Number(inProgressStats[0]?.in_transit_meals || 0),
      participatingDonors: Number(deliveredStats[0]?.active_donors || 0),
      participatingRecipients: Number(deliveredStats[0]?.active_recipients || 0),
      participatingVolunteers: Number(deliveredStats[0]?.active_volunteers || 0),
      categoryBreakdown: categories.map((c) => ({
        foodType: c.food_type,
        meals: Number(c.meals_rescued),
        weightKg: Math.round(Number(c.meals_rescued) * 0.42 * 10) / 10
      })),
      methodology: {
        mealEquivalentKg: "0.42 kg per meal equivalent (FAO standard)",
        co2Conversion: "2.5 kg CO2e prevented per kg food rescued (EPA WARM model)",
        waterConversion: "1,000 liters embedded water footprint saved per kg food"
      }
    };

    return res.status(200).json({
      success: true,
      impact
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: "Unable to calculate platform impact analytics."
    });
  }
});

router.get("/export", authenticate, requireRole("admin"), async (req, res) => {
  try {
    const type = req.query.type || "donations";
    let rows = [];
    let filename = `foodbridge_${type}_${Date.now()}.csv`;

    if (type === "impact") {
      const [data] = await pool.execute(`
        SELECT del.delivery_id, d.food_type, a.allocated_quantity AS meals_rescued,
               ROUND(a.allocated_quantity * 0.42, 2) AS weight_kg,
               ROUND(a.allocated_quantity * 0.42 * 2.5, 2) AS co2_avoided_kg,
               ROUND(a.allocated_quantity * 0.42 * 1000) AS water_saved_liters,
               u_donor.name AS donor_name, u_rec.name AS recipient_name, u_vol.name AS volunteer_name,
               del.delivery_time AS delivered_at
        FROM deliveries del
        JOIN allocations a ON a.allocation_id = del.allocation_id
        JOIN donations d ON d.donation_id = a.donation_id
        JOIN donors donor ON donor.donor_id = d.donor_id
        JOIN users u_donor ON u_donor.user_id = donor.user_id
        JOIN requirements r ON r.requirement_id = a.requirement_id
        JOIN recipients rec ON rec.recipient_id = r.recipient_id
        JOIN users u_rec ON u_rec.user_id = rec.user_id
        JOIN volunteers v ON v.volunteer_id = del.volunteer_id
        JOIN users u_vol ON u_vol.user_id = v.user_id
        WHERE del.status IN ('delivered', 'confirmed')
        ORDER BY del.delivery_time DESC
      `);
      rows = data;
    } else if (type === "donations") {
      const [data] = await pool.execute(
        `SELECT d.donation_id, u.name AS donor_name, d.food_type, d.quantity, d.remaining_quantity,
                d.status, d.safe_use_deadline, d.created_at
         FROM donations d
         JOIN donors donor ON donor.donor_id = d.donor_id
         JOIN users u ON u.user_id = donor.user_id
         ORDER BY d.created_at DESC`
      );
      rows = data;
    } else if (type === "requirements") {
      const [data] = await pool.execute(
        `SELECT r.requirement_id, u.name AS recipient_name, rec.recipient_type, r.food_type,
                r.quantity_required, r.remaining_quantity, r.priority, r.status, r.required_time, r.created_at
         FROM requirements r
         JOIN recipients rec ON rec.recipient_id = r.recipient_id
         JOIN users u ON u.user_id = rec.user_id
         ORDER BY r.created_at DESC`
      );
      rows = data;
    } else if (type === "deliveries") {
      const [data] = await pool.execute(
        `SELECT del.delivery_id, a.allocation_id, d.food_type, a.allocated_quantity,
                u_donor.name AS donor_name, u_rec.name AS recipient_name, u_vol.name AS volunteer_name,
                del.status, del.pickup_time, del.delivery_time, del.created_at
         FROM deliveries del
         JOIN allocations a ON a.allocation_id = del.allocation_id
         JOIN donations d ON d.donation_id = a.donation_id
         JOIN donors donor ON donor.donor_id = d.donor_id
         JOIN users u_donor ON u_donor.user_id = donor.user_id
         JOIN requirements r ON r.requirement_id = a.requirement_id
         JOIN recipients rec ON rec.recipient_id = r.recipient_id
         JOIN users u_rec ON u_rec.user_id = rec.user_id
         JOIN volunteers v ON v.volunteer_id = del.volunteer_id
         JOIN users u_vol ON u_vol.user_id = v.user_id
         ORDER BY del.created_at DESC`
      );
      rows = data;
    } else if (type === "users") {
      const [data] = await pool.execute(
        `SELECT user_id, name, email, phone, role, is_verified, created_at FROM users ORDER BY created_at DESC`
      );
      rows = data;
    } else if (type === "audit") {
      const [data] = await pool.execute(
        `SELECT audit_id, user_id, action, entity_type, entity_id, created_at FROM audit_logs ORDER BY created_at DESC LIMIT 500`
      );
      rows = data;
    }

    if (!rows.length) {
      return res.status(200).send("No records found");
    }

    const headers = Object.keys(rows[0]);
    const csvLines = [headers.join(",")];

    for (const row of rows) {
      const values = headers.map((header) => {
        const val = row[header] ?? "";
        const str = String(val).replace(/"/g, '""');
        return `"${str}"`;
      });
      csvLines.push(values.join(","));
    }

    res.setHeader("Content-Type", "text/csv");
    res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);
    return res.status(200).send(csvLines.join("\n"));
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: "Export failed."
    });
  }
});

export default router;
