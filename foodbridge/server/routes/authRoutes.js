import express from "express";
import crypto from "node:crypto";
import bcrypt from "bcryptjs";
import rateLimit from "express-rate-limit";
import { z } from "zod";
import { pool } from "../config/database.js";
import { authenticate, requireRole, signToken } from "../middleware/auth.js";

const router = express.Router();

// Strictest rate limiting for login attempts to mitigate brute-force on 4-digit PINs
const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 20,
  standardHeaders: "draft-7",
  legacyHeaders: false,
  message: {
    success: false,
    message: "Too many login attempts from this IP address. Please try again after 15 minutes."
  }
});

// Exactly 4 numeric digits (0-9) only; reject letters, spaces, and symbols
const fourDigitPasswordSchema = z
  .string({ required_error: "Password is required" })
  .regex(/^\d{4}$/, "Password must contain exactly 4 numeric digits (0-9)");

const registerSchema = z.object({
  name: z.string().trim().min(2, "Name must be at least 2 characters").max(100),
  email: z.string().trim().email("Use a valid email address").max(150),
  password: fourDigitPasswordSchema,
  phone: z.string().trim().max(15).optional().or(z.literal("")),
  role: z.enum(["donor", "recipient", "volunteer"]).default("donor"),
  recipientType: z.enum(["ngo", "individual"]).optional(),
  organizationName: z.string().trim().max(150).optional(),
  address: z.string().trim().max(255).optional(),
  locationLat: z.coerce.number().min(-90).max(90).optional(),
  locationLng: z.coerce.number().min(-180).max(180).optional()
});

const loginSchema = z.object({
  email: z.string().trim().email("Please provide a valid email address"),
  password: fourDigitPasswordSchema
});

const changePasswordSchema = z.object({
  currentPassword: fourDigitPasswordSchema,
  newPassword: fourDigitPasswordSchema
});

const forgotPasswordSchema = z.object({
  email: z.string().trim().email("Please provide a valid email address")
});

const resetPasswordSchema = z.object({
  token: z.string().trim().min(8, "Invalid reset token"),
  password: fourDigitPasswordSchema
});

function sanitizeUser(user, extra = {}) {
  return {
    userId: user.user_id ?? user.userId,
    name: user.name,
    email: user.email,
    phone: user.phone,
    role: user.role,
    isVerified: Boolean(user.is_verified ?? user.isVerified),
    ...extra
  };
}

async function logAudit(userId, action, entityType, entityId, metadata = null) {
  try {
    await pool.execute(
      "INSERT INTO audit_logs (user_id, action, entity_type, entity_id, metadata) VALUES (?, ?, ?, ?, ?)",
      [userId || null, action, entityType || null, entityId || null, metadata ? JSON.stringify(metadata) : null]
    );
  } catch {
    // Non-blocking audit logger
  }
}

async function createProfile(connection, userId, role, profileData) {
  if (role === "donor") {
    await connection.execute(
      `INSERT INTO donors (user_id, organization_name, location_lat, location_lng, address, verified)
       VALUES (?, ?, ?, ?, ?, FALSE)
       ON DUPLICATE KEY UPDATE organization_name = VALUES(organization_name)`,
      [
        userId,
        profileData.organizationName || profileData.name,
        profileData.locationLat ?? null,
        profileData.locationLng ?? null,
        profileData.address || null
      ]
    );
    return;
  }

  if (role === "recipient") {
    await connection.execute(
      `INSERT INTO recipients (user_id, organization_name, recipient_type, location_lat, location_lng, address, verified)
       VALUES (?, ?, ?, ?, ?, ?, FALSE)
       ON DUPLICATE KEY UPDATE organization_name = VALUES(organization_name), recipient_type = VALUES(recipient_type)`,
      [
        userId,
        profileData.organizationName || profileData.name,
        profileData.recipientType || "ngo",
        profileData.locationLat ?? null,
        profileData.locationLng ?? null,
        profileData.address || null
      ]
    );
    return;
  }

  if (role === "volunteer") {
    await connection.execute(
      `INSERT INTO volunteers (user_id, location_lat, location_lng, availability, vehicle_type)
       VALUES (?, ?, ?, TRUE, 'none')
       ON DUPLICATE KEY UPDATE availability = TRUE`,
      [userId, profileData.locationLat ?? null, profileData.locationLng ?? null]
    );
  }
}

export async function registerUser(req, res) {
  const parsed = registerSchema.safeParse(req.body);

  if (!parsed.success) {
    const firstError = parsed.error.issues?.[0]?.message || "Validation failed";
    return res.status(400).json({
      success: false,
      message: firstError,
      errors: parsed.error.flatten().fieldErrors
    });
  }

  const profile = parsed.data;
  const normalizedEmail = profile.email.toLowerCase();

  try {
    const [userRows] = await pool.execute(
      "SELECT user_id FROM users WHERE email = ? LIMIT 1",
      [normalizedEmail]
    );

    if (userRows.length > 0) {
      return res.status(409).json({
        success: false,
        message: "An account with this email already exists."
      });
    }

    const passwordHash = await bcrypt.hash(profile.password, 10);
    const connection = await pool.getConnection();

    try {
      await connection.beginTransaction();

      const [result] = await connection.execute(
        "INSERT INTO users (name, email, phone, role, password_hash, is_verified, failed_login_attempts) VALUES (?, ?, ?, ?, ?, FALSE, 0)",
        [profile.name, normalizedEmail, profile.phone || null, profile.role, passwordHash]
      );

      const userId = result.insertId;
      await createProfile(connection, userId, profile.role, profile);

      await connection.commit();

      await logAudit(userId, "USER_REGISTER", "users", userId, {
        email: normalizedEmail,
        role: profile.role,
        recipientType: profile.recipientType
      });

      const token = signToken({
        userId,
        email: normalizedEmail,
        role: profile.role,
        name: profile.name,
        recipientType: profile.recipientType || null
      });

      return res.status(201).json({
        success: true,
        message: "Registration successful.",
        token,
        user: sanitizeUser({
          user_id: userId,
          name: profile.name,
          email: normalizedEmail,
          phone: profile.phone || null,
          role: profile.role,
          is_verified: false
        }, { recipientType: profile.recipientType || null })
      });
    } catch (error) {
      await connection.rollback();
      throw error;
    } finally {
      connection.release();
    }
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: "Unable to create the user account at this time."
    });
  }
}

export async function loginUser(req, res) {
  const parsed = loginSchema.safeParse(req.body);

  if (!parsed.success) {
    const firstError = parsed.error.issues?.[0]?.message || "Validation failed";
    return res.status(400).json({
      success: false,
      message: firstError,
      errors: parsed.error.flatten().fieldErrors
    });
  }

  const { email, password } = parsed.data;
  const normalizedEmail = email.toLowerCase();

  try {
    const [rows] = await pool.execute(
      "SELECT * FROM users WHERE email = ? LIMIT 1",
      [normalizedEmail]
    );

    if (!rows.length) {
      return res.status(401).json({
        success: false,
        message: "Invalid email or password."
      });
    }

    const user = rows[0];

    // Check account lockout
    if (user.locked_until && new Date(user.locked_until) > new Date()) {
      const minutesRemaining = Math.max(
        1,
        Math.ceil((new Date(user.locked_until).getTime() - Date.now()) / (60 * 1000))
      );
      return res.status(429).json({
        success: false,
        message: `Account is temporarily locked due to repeated incorrect password attempts. Please try again in ${minutesRemaining} minute(s).`
      });
    }

    const isValidPassword = await bcrypt.compare(password, user.password_hash);

    if (!isValidPassword) {
      const newAttempts = (user.failed_login_attempts || 0) + 1;

      if (newAttempts >= 5) {
        await pool.execute(
          "UPDATE users SET failed_login_attempts = ?, locked_until = DATE_ADD(NOW(), INTERVAL 15 MINUTE) WHERE user_id = ?",
          [newAttempts, user.user_id]
        );

        await logAudit(user.user_id, "ACCOUNT_LOCKED", "users", user.user_id, {
          reason: "Exceeded 5 failed password attempts"
        });

        return res.status(429).json({
          success: false,
          message: "Account locked for 15 minutes due to 5 consecutive failed login attempts."
        });
      }

      await pool.execute(
        "UPDATE users SET failed_login_attempts = ? WHERE user_id = ?",
        [newAttempts, user.user_id]
      );

      const attemptsRemaining = 5 - newAttempts;
      return res.status(401).json({
        success: false,
        message: `Invalid email or password. (${attemptsRemaining} attempt${attemptsRemaining === 1 ? "" : "s"} remaining before temporary lockout)`
      });
    }

    // Reset lockout counters on successful authentication
    if (user.failed_login_attempts > 0 || user.locked_until) {
      await pool.execute(
        "UPDATE users SET failed_login_attempts = 0, locked_until = NULL WHERE user_id = ?",
        [user.user_id]
      );
    }

    let extraProfile = {};
    if (user.role === "recipient") {
      const [recRows] = await pool.execute(
        "SELECT recipient_type, organization_name, address FROM recipients WHERE user_id = ? LIMIT 1",
        [user.user_id]
      );
      if (recRows.length) {
        extraProfile = {
          recipientType: recRows[0].recipient_type,
          organizationName: recRows[0].organization_name,
          address: recRows[0].address
        };
      }
    } else if (user.role === "donor") {
      const [donorRows] = await pool.execute(
        "SELECT organization_name, address FROM donors WHERE user_id = ? LIMIT 1",
        [user.user_id]
      );
      if (donorRows.length) {
        extraProfile = {
          organizationName: donorRows[0].organization_name,
          address: donorRows[0].address
        };
      }
    }

    const token = signToken({
      userId: user.user_id,
      email: user.email,
      role: user.role,
      name: user.name,
      ...extraProfile
    });

    await logAudit(user.user_id, "USER_LOGIN_SUCCESS", "users", user.user_id);

    return res.status(200).json({
      success: true,
      message: "Login successful.",
      token,
      user: sanitizeUser(user, extraProfile)
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: "Unable to log in right now."
    });
  }
}

export async function getCurrentUser(req, res) {
  try {
    const [rows] = await pool.execute(
      "SELECT user_id, name, email, phone, role, is_verified FROM users WHERE user_id = ? LIMIT 1",
      [req.user.userId]
    );

    if (!rows.length) {
      return res.status(404).json({
        success: false,
        message: "User profile not found."
      });
    }

    let extraProfile = {};
    if (rows[0].role === "recipient") {
      const [recRows] = await pool.execute(
        "SELECT recipient_type, organization_name, address FROM recipients WHERE user_id = ? LIMIT 1",
        [rows[0].user_id]
      );
      if (recRows.length) {
        extraProfile = {
          recipientType: recRows[0].recipient_type,
          organizationName: recRows[0].organization_name,
          address: recRows[0].address
        };
      }
    } else if (rows[0].role === "donor") {
      const [donorRows] = await pool.execute(
        "SELECT organization_name, address FROM donors WHERE user_id = ? LIMIT 1",
        [rows[0].user_id]
      );
      if (donorRows.length) {
        extraProfile = {
          organizationName: donorRows[0].organization_name,
          address: donorRows[0].address
        };
      }
    }

    return res.status(200).json({
      success: true,
      user: sanitizeUser(rows[0], extraProfile)
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: "Unable to load the current user profile."
    });
  }
}

export async function changePassword(req, res) {
  const parsed = changePasswordSchema.safeParse(req.body);

  if (!parsed.success) {
    const firstError = parsed.error.issues?.[0]?.message || "Validation failed";
    return res.status(400).json({
      success: false,
      message: firstError,
      errors: parsed.error.flatten().fieldErrors
    });
  }

  const { currentPassword, newPassword } = parsed.data;

  try {
    const [rows] = await pool.execute(
      "SELECT password_hash FROM users WHERE user_id = ? LIMIT 1",
      [req.user.userId]
    );

    if (!rows.length) {
      return res.status(404).json({
        success: false,
        message: "User not found."
      });
    }

    const isCurrentPasswordValid = await bcrypt.compare(currentPassword, rows[0].password_hash);

    if (!isCurrentPasswordValid) {
      return res.status(401).json({
        success: false,
        message: "Current password is incorrect."
      });
    }

    const passwordHash = await bcrypt.hash(newPassword, 10);
    await pool.execute(
      "UPDATE users SET password_hash = ? WHERE user_id = ?",
      [passwordHash, req.user.userId]
    );

    await logAudit(req.user.userId, "PASSWORD_CHANGED", "users", req.user.userId);

    return res.status(200).json({
      success: true,
      message: "Password changed successfully."
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: "Unable to update the password."
    });
  }
}

export async function forgotPassword(req, res) {
  const parsed = forgotPasswordSchema.safeParse(req.body);

  if (!parsed.success) {
    return res.status(400).json({
      success: false,
      message: "Validation failed",
      errors: parsed.error.flatten().fieldErrors
    });
  }

  const email = parsed.data.email.toLowerCase();

  try {
    const [rows] = await pool.execute(
      "SELECT user_id, name, email FROM users WHERE email = ? LIMIT 1",
      [email]
    );

    if (!rows.length) {
      return res.status(200).json({
        success: true,
        message: "If an account exists for that email, a reset token has been generated."
      });
    }

    const rawToken = crypto.randomBytes(32).toString("hex");
    const tokenHash = crypto.createHash("sha256").update(rawToken).digest("hex");
    const expiresAt = new Date(Date.now() + 30 * 60 * 1000).toISOString().slice(0, 19).replace("T", " ");

    await pool.execute(
      "INSERT INTO password_reset_tokens (user_id, token_hash, expires_at) VALUES (?, ?, ?)",
      [rows[0].user_id, tokenHash, expiresAt]
    );

    await logAudit(rows[0].user_id, "PASSWORD_RESET_REQUESTED", "users", rows[0].user_id);

    return res.status(200).json({
      success: true,
      message: "If an account exists for that email, a reset token has been generated.",
      ...(process.env.NODE_ENV !== "production" ? { resetToken: rawToken } : {})
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: "Unable to process the password reset request."
    });
  }
}

export async function resetPassword(req, res) {
  const parsed = resetPasswordSchema.safeParse(req.body);

  if (!parsed.success) {
    const firstError = parsed.error.issues?.[0]?.message || "Validation failed";
    return res.status(400).json({
      success: false,
      message: firstError,
      errors: parsed.error.flatten().fieldErrors
    });
  }

  const { token, password } = parsed.data;
  const tokenHash = crypto.createHash("sha256").update(token).digest("hex");

  try {
    const [rows] = await pool.execute(
      `SELECT prt.user_id, u.email
       FROM password_reset_tokens prt
       JOIN users u ON u.user_id = prt.user_id
       WHERE prt.token_hash = ? AND prt.expires_at > NOW() AND prt.used_at IS NULL
       LIMIT 1`,
      [tokenHash]
    );

    if (!rows.length) {
      return res.status(400).json({
        success: false,
        message: "The reset token is invalid or has expired."
      });
    }

    const userId = rows[0].user_id;
    const passwordHash = await bcrypt.hash(password, 10);

    await pool.execute(
      "UPDATE users SET password_hash = ?, failed_login_attempts = 0, locked_until = NULL WHERE user_id = ?",
      [passwordHash, userId]
    );

    await pool.execute(
      "UPDATE password_reset_tokens SET used_at = NOW() WHERE user_id = ? AND token_hash = ?",
      [userId, tokenHash]
    );

    await logAudit(userId, "PASSWORD_RESET_SUCCESS", "users", userId);

    return res.status(200).json({
      success: true,
      message: "Password reset successful. You can now log in with your new 4-digit password."
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: "Unable to reset the password."
    });
  }
}

router.post("/register", registerUser);
router.post("/login", loginLimiter, loginUser);
router.post("/logout", authenticate, (req, res) => {
  logAudit(req.user?.userId, "USER_LOGOUT", "users", req.user?.userId);
  res.status(200).json({
    success: true,
    message: "Logged out successfully."
  });
});
router.post("/forgot-password", forgotPassword);
router.post("/reset-password", resetPassword);
router.get("/me", authenticate, getCurrentUser);
router.post("/change-password", authenticate, changePassword);
router.get("/admin-check", authenticate, requireRole("admin"), (req, res) => {
  res.status(200).json({
    success: true,
    message: "Admin access granted.",
    user: req.user
  });
});

export default router;
