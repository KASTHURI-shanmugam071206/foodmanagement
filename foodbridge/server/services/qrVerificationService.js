import crypto from "node:crypto";
import { pool } from "../config/database.js";

/**
 * Generates or retrieves an active single-use verification token and 6-digit backup code.
 */
export async function getOrCreateVerificationCode(deliveryId, verificationType) {
  // Check if an unused, unexpired token already exists for this delivery & type
  const [existing] = await pool.execute(`
    SELECT verification_id, token_code, manual_code, expires_at
    FROM delivery_verifications
    WHERE delivery_id = ? AND verification_type = ? AND used_at IS NULL AND expires_at > NOW()
    ORDER BY created_at DESC LIMIT 1
  `, [deliveryId, verificationType]);

  if (existing.length > 0) {
    return {
      token: existing[0].token_code,
      manualCode: existing[0].manual_code,
      expiresAt: existing[0].expires_at,
      verificationType
    };
  }

  // Generate new token & 6-digit manual backup code
  const rawToken = crypto.randomBytes(16).toString("hex");
  const manualCode = Math.floor(100000 + Math.random() * 900000).toString();
  const tokenHash = crypto.createHash("sha256").update(rawToken).digest("hex");

  // 60 minutes validity — stored in MySQL-compatible LOCAL datetime (matches NOW())
  const expiresAt = new Date(Date.now() + 60 * 60 * 1000);
  const pad = (n) => String(n).padStart(2, "0");
  const expiresAtSql = `${expiresAt.getFullYear()}-${pad(expiresAt.getMonth() + 1)}-${pad(expiresAt.getDate())} ${pad(expiresAt.getHours())}:${pad(expiresAt.getMinutes())}:${pad(expiresAt.getSeconds())}`;

  await pool.execute(`
    INSERT INTO delivery_verifications
      (delivery_id, verification_type, token_hash, token_code, manual_code, expires_at)
    VALUES (?, ?, ?, ?, ?, ?)
  `, [
    deliveryId,
    verificationType,
    tokenHash,
    rawToken,
    manualCode,
    expiresAtSql
  ]);

  return {
    token: rawToken,
    manualCode,
    expiresAt,
    verificationType
  };
}

/**
 * Validates and consumes a verification code (token or manual 6-digit PIN).
 */
export async function consumeVerificationCode(deliveryId, verificationType, { token, manualCode }, userId, connection = null) {
  const db = connection || pool;
  let query = `
    SELECT * FROM delivery_verifications
    WHERE delivery_id = ? AND verification_type = ?
  `;
  const params = [deliveryId, verificationType];

  if (manualCode) {
    const cleanCode = manualCode.toString().trim();
    query += " AND manual_code = ?";
    params.push(cleanCode);
  } else if (token) {
    const cleanToken = token.trim();
    query += " AND (token_code = ? OR token_hash = ?)";
    const hash = crypto.createHash("sha256").update(cleanToken).digest("hex");
    params.push(cleanToken, hash);
  } else {
    throw new Error("Either QR token or 6-digit manual code must be provided.");
  }

  query += " AND used_at IS NULL AND expires_at > NOW()";
  query += " ORDER BY created_at DESC LIMIT 1";

  const [rows] = await db.execute(query, params);

  if (!rows.length) {
    // Distinguish between: code already used vs truly invalid vs expired
    let detailQuery = `SELECT used_at, expires_at FROM delivery_verifications WHERE delivery_id = ? AND verification_type = ?`;
    const detailParams = [deliveryId, verificationType];

    if (manualCode) {
      detailQuery += " AND manual_code = ?";
      detailParams.push(manualCode.toString().trim());
    } else if (token) {
      const hash = crypto.createHash("sha256").update(token.trim()).digest("hex");
      detailQuery += " AND (token_code = ? OR token_hash = ?)";
      detailParams.push(token.trim(), hash);
    }

    detailQuery += " ORDER BY created_at DESC LIMIT 1";
    const [detailRows] = await db.execute(detailQuery, detailParams);

    if (detailRows.length) {
      const v = detailRows[0];
      if (v.used_at !== null) {
        throw new Error("This verification code has already been used.");
      }
      throw new Error("This verification code has expired. Please ask the sender to generate a fresh QR/code.");
    }
    throw new Error("Invalid verification code. Please check the code and try again.");
  }

  const verif = rows[0];
  await db.execute(`
    UPDATE delivery_verifications
    SET used_at = NOW(), verified_by = ?
    WHERE verification_id = ?
  `, [userId, verif.verification_id]);

  return {
    success: true,
    verificationId: verif.verification_id,
    verificationType,
    verifiedAt: new Date().toISOString()
  };
}
