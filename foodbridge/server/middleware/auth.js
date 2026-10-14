import jwt from "jsonwebtoken";
import { pool } from "../config/database.js";
import { env } from "../config/env.js";

export function signToken(payload) {
  return jwt.sign(payload, env.JWT_ACCESS_SECRET, {
    expiresIn: env.JWT_ACCESS_EXPIRES_IN
  });
}

export function verifyToken(token) {
  return jwt.verify(token, env.JWT_ACCESS_SECRET);
}

export async function authenticate(req, res, next) {
  const authHeader = req.headers.authorization || "";
  const token = authHeader.startsWith("Bearer ") ? authHeader.slice(7) : null;

  if (!token) {
    return res.status(401).json({
      success: false,
      message: "Authentication required. Please provide a valid bearer token."
    });
  }

  try {
    const payload = verifyToken(token);
    const [rows] = await pool.execute(
      "SELECT user_id, name, email, role, is_verified FROM users WHERE user_id = ? LIMIT 1",
      [payload.userId]
    );

    if (!rows.length) {
      return res.status(401).json({
        success: false,
        message: "Authentication failed. User not found."
      });
    }

    req.user = {
      userId: rows[0].user_id,
      name: rows[0].name,
      email: rows[0].email,
      role: rows[0].role,
      isVerified: Boolean(rows[0].is_verified)
    };

    return next();
  } catch (error) {
    return res.status(401).json({
      success: false,
      message: "Invalid or expired token. Please log in again."
    });
  }
}

export function requireRole(...allowedRoles) {
  return (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({
        success: false,
        message: "Authentication required."
      });
    }

    if (!allowedRoles.includes(req.user.role)) {
      return res.status(403).json({
        success: false,
        message: "You do not have permission to access this resource."
      });
    }

    return next();
  };
}
