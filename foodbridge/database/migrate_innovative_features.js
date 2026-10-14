import { pool } from "../server/config/database.js";

async function columnExists(tableName, columnName) {
  const [rows] = await pool.query(
    "SELECT 1 FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? AND COLUMN_NAME = ?",
    [tableName, columnName]
  );
  return rows.length > 0;
}

async function addColumnIfNotExists(tableName, columnName, columnDef) {
  const exists = await columnExists(tableName, columnName);
  if (!exists) {
    console.log(`Adding ${columnName} to ${tableName}...`);
    await pool.query(`ALTER TABLE ${tableName} ADD COLUMN ${columnName} ${columnDef}`);
  } else {
    console.log(`Column ${columnName} already exists in ${tableName}`);
  }
}

async function runMigration() {
  console.log("Starting innovative features database migration...");

  try {
    // 1. Deliveries table: modify status to VARCHAR(50)
    console.log("Modifying deliveries.status to VARCHAR(50)...");
    await pool.query("ALTER TABLE deliveries MODIFY COLUMN status VARCHAR(50) NOT NULL DEFAULT 'volunteer_assigned'");

    await addColumnIfNotExists("deliveries", "volunteer_lat", "DECIMAL(10,8) NULL");
    await addColumnIfNotExists("deliveries", "volunteer_lng", "DECIMAL(11,8) NULL");
    await addColumnIfNotExists("deliveries", "last_location_update", "DATETIME NULL");
    await addColumnIfNotExists("deliveries", "estimated_eta_minutes", "INT NULL");
    await addColumnIfNotExists("deliveries", "cancellation_reason", "TEXT NULL");
    await addColumnIfNotExists("deliveries", "pickup_notes", "TEXT NULL");
    await addColumnIfNotExists("deliveries", "delivery_notes", "TEXT NULL");

    // 2. Delivery status history
    await addColumnIfNotExists("delivery_status_history", "notes", "TEXT NULL");
    await addColumnIfNotExists("delivery_status_history", "location_lat", "DECIMAL(10,8) NULL");
    await addColumnIfNotExists("delivery_status_history", "location_lng", "DECIMAL(11,8) NULL");

    // 3. Donations table
    await addColumnIfNotExists("donations", "unit", "VARCHAR(30) NOT NULL DEFAULT 'servings'");
    await addColumnIfNotExists("donations", "storage_temperature_c", "DECIMAL(4,1) NULL");
    await addColumnIfNotExists("donations", "storage_type", "ENUM('ambient','refrigerated','frozen','hot_holding') NOT NULL DEFAULT 'ambient'");
    await addColumnIfNotExists("donations", "allergens", "VARCHAR(255) NOT NULL DEFAULT 'None'");
    await addColumnIfNotExists("donations", "food_condition", "ENUM('fresh_hot','fresh_chilled','packaged_ambient','sealed') NOT NULL DEFAULT 'packaged_ambient'");
    await addColumnIfNotExists("donations", "safety_status", "ENUM('safe','requires_review','unsafe_expired','spoiled') NOT NULL DEFAULT 'safe'");
    await addColumnIfNotExists("donations", "safety_notes", "TEXT NULL");

    // 4. Create delivery_verifications table for QR / manual PIN verification
    console.log("Creating delivery_verifications table...");
    await pool.query(`
      CREATE TABLE IF NOT EXISTS delivery_verifications (
        verification_id INT PRIMARY KEY AUTO_INCREMENT,
        delivery_id INT NOT NULL,
        verification_type ENUM('pickup', 'delivery') NOT NULL,
        token_hash VARCHAR(255) NOT NULL,
        token_code VARCHAR(100) NOT NULL,
        manual_code VARCHAR(6) NOT NULL,
        expires_at DATETIME NOT NULL,
        used_at DATETIME NULL,
        verified_by INT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        INDEX idx_verif_delivery (delivery_id),
        INDEX idx_verif_manual (manual_code),
        CONSTRAINT fk_verif_delivery FOREIGN KEY (delivery_id)
          REFERENCES deliveries(delivery_id) ON DELETE CASCADE,
        CONSTRAINT fk_verif_user FOREIGN KEY (verified_by)
          REFERENCES users(user_id) ON DELETE SET NULL
      ) ENGINE=InnoDB;
    `);

    // 5. Create food_safety_reports table
    console.log("Creating food_safety_reports table...");
    await pool.query(`
      CREATE TABLE IF NOT EXISTS food_safety_reports (
        report_id INT PRIMARY KEY AUTO_INCREMENT,
        donation_id INT NULL,
        delivery_id INT NULL,
        reported_by INT NOT NULL,
        reason ENUM('expired', 'temperature_abuse', 'packaging_damaged', 'foul_odor_color', 'contamination', 'other') NOT NULL,
        notes TEXT NULL,
        action_taken VARCHAR(100) DEFAULT 'marked_spoiled',
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        INDEX idx_safety_donation (donation_id),
        INDEX idx_safety_delivery (delivery_id),
        CONSTRAINT fk_safety_donation FOREIGN KEY (donation_id)
          REFERENCES donations(donation_id) ON DELETE SET NULL,
        CONSTRAINT fk_safety_reported_by FOREIGN KEY (reported_by)
          REFERENCES users(user_id) ON DELETE CASCADE
      ) ENGINE=InnoDB;
    `);

    console.log("Migration completed successfully!");
    process.exit(0);
  } catch (err) {
    console.error("Migration failed:", err);
    process.exit(1);
  }
}

runMigration();
