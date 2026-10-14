CREATE DATABASE IF NOT EXISTS foodbridge
  CHARACTER SET utf8mb4
  COLLATE utf8mb4_unicode_ci;

USE foodbridge;

SET FOREIGN_KEY_CHECKS = 0;
DROP TABLE IF EXISTS delivery_status_history;
DROP TABLE IF EXISTS notifications;
DROP TABLE IF EXISTS password_reset_tokens;
DROP TABLE IF EXISTS audit_logs;
DROP TABLE IF EXISTS system_settings;
DROP TABLE IF EXISTS deliveries;
DROP TABLE IF EXISTS allocations;
DROP TABLE IF EXISTS volunteers;
DROP TABLE IF EXISTS requirements;
DROP TABLE IF EXISTS donations;
DROP TABLE IF EXISTS recipients;
DROP TABLE IF EXISTS donors;
DROP TABLE IF EXISTS users;
SET FOREIGN_KEY_CHECKS = 1;

CREATE TABLE users (
  user_id INT PRIMARY KEY AUTO_INCREMENT,
  name VARCHAR(100) NOT NULL,
  email VARCHAR(100) UNIQUE NOT NULL,
  phone VARCHAR(15),
  role ENUM('donor','recipient','volunteer','admin') NOT NULL,
  password_hash VARCHAR(255) NOT NULL,
  is_verified BOOLEAN NOT NULL DEFAULT FALSE,
  failed_login_attempts INT DEFAULT 0,
  locked_until DATETIME NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_users_email (email),
  INDEX idx_users_role (role),
  INDEX idx_users_verified (is_verified)
) ENGINE=InnoDB;

CREATE TABLE donors (
  donor_id INT PRIMARY KEY AUTO_INCREMENT,
  user_id INT UNIQUE NOT NULL,
  organization_name VARCHAR(150),
  location_lat DECIMAL(10,8),
  location_lng DECIMAL(11,8),
  address TEXT,
  verified BOOLEAN NOT NULL DEFAULT FALSE,
  CONSTRAINT fk_donors_user FOREIGN KEY (user_id)
    REFERENCES users(user_id) ON DELETE CASCADE
) ENGINE=InnoDB;

CREATE TABLE recipients (
  recipient_id INT PRIMARY KEY AUTO_INCREMENT,
  user_id INT UNIQUE NOT NULL,
  organization_name VARCHAR(150),
  recipient_type ENUM('ngo','individual') NOT NULL DEFAULT 'ngo',
  location_lat DECIMAL(10,8),
  location_lng DECIMAL(11,8),
  address TEXT,
  capacity INT,
  verified BOOLEAN NOT NULL DEFAULT FALSE,
  CONSTRAINT fk_recipients_user FOREIGN KEY (user_id)
    REFERENCES users(user_id) ON DELETE CASCADE,
  CONSTRAINT chk_recipients_capacity CHECK (capacity IS NULL OR capacity >= 0)
) ENGINE=InnoDB;

CREATE TABLE donations (
  donation_id INT PRIMARY KEY AUTO_INCREMENT,
  donor_id INT NOT NULL,
  food_type VARCHAR(50) NOT NULL,
  quantity INT NOT NULL,
  remaining_quantity INT NOT NULL,
  preparation_time DATETIME,
  location_lat DECIMAL(10,8),
  location_lng DECIMAL(11,8),
  safe_use_deadline DATETIME NOT NULL,
  status ENUM('available','allocated','collected','in_transit','delivered','expired','cancelled') NOT NULL DEFAULT 'available',
  unit VARCHAR(30) NOT NULL DEFAULT 'servings',
  storage_temperature_c DECIMAL(4,1) NULL,
  storage_type ENUM('ambient','refrigerated','frozen','hot_holding') NOT NULL DEFAULT 'ambient',
  allergens VARCHAR(255) NOT NULL DEFAULT 'None',
  food_condition ENUM('fresh_hot','fresh_chilled','packaged_ambient','sealed') NOT NULL DEFAULT 'packaged_ambient',
  safety_status ENUM('safe','requires_review','unsafe_expired','spoiled') NOT NULL DEFAULT 'safe',
  safety_notes TEXT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_donations_food_type (food_type),
  INDEX idx_donations_status (status),
  INDEX idx_donations_safety (safety_status),
  INDEX idx_donations_deadline (safe_use_deadline),
  INDEX idx_donations_donor (donor_id),
  CONSTRAINT fk_donations_donor FOREIGN KEY (donor_id)
    REFERENCES donors(donor_id) ON DELETE CASCADE,
  CONSTRAINT chk_donations_quantity CHECK (quantity > 0 AND remaining_quantity >= 0 AND remaining_quantity <= quantity)
) ENGINE=InnoDB;

CREATE TABLE requirements (
  requirement_id INT PRIMARY KEY AUTO_INCREMENT,
  recipient_id INT NOT NULL,
  food_type VARCHAR(50) NOT NULL,
  quantity_required INT NOT NULL,
  remaining_quantity INT NOT NULL,
  required_time DATETIME NOT NULL,
  location_lat DECIMAL(10,8),
  location_lng DECIMAL(11,8),
  priority ENUM('low','medium','high') NOT NULL DEFAULT 'medium',
  status ENUM('pending','partially_fulfilled','fulfilled','cancelled') NOT NULL DEFAULT 'pending',
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_requirements_food_type (food_type),
  INDEX idx_requirements_status (status),
  INDEX idx_requirements_required_time (required_time),
  INDEX idx_requirements_recipient (recipient_id),
  CONSTRAINT fk_requirements_recipient FOREIGN KEY (recipient_id)
    REFERENCES recipients(recipient_id) ON DELETE CASCADE,
  CONSTRAINT chk_requirements_quantity CHECK (quantity_required > 0 AND remaining_quantity >= 0 AND remaining_quantity <= quantity_required)
) ENGINE=InnoDB;

CREATE TABLE allocations (
  allocation_id INT PRIMARY KEY AUTO_INCREMENT,
  donation_id INT NOT NULL,
  requirement_id INT NOT NULL,
  allocated_quantity INT NOT NULL,
  matching_score DECIMAL(5,2),
  status ENUM('pending','confirmed','completed','cancelled') NOT NULL DEFAULT 'pending',
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_allocations_donation (donation_id),
  INDEX idx_allocations_requirement (requirement_id),
  INDEX idx_allocations_status (status),
  CONSTRAINT fk_allocations_donation FOREIGN KEY (donation_id)
    REFERENCES donations(donation_id) ON DELETE CASCADE,
  CONSTRAINT fk_allocations_requirement FOREIGN KEY (requirement_id)
    REFERENCES requirements(requirement_id) ON DELETE CASCADE,
  CONSTRAINT chk_allocations_quantity CHECK (allocated_quantity > 0),
  CONSTRAINT chk_allocations_score CHECK (matching_score IS NULL OR (matching_score >= 0 AND matching_score <= 100))
) ENGINE=InnoDB;

CREATE TABLE volunteers (
  volunteer_id INT PRIMARY KEY AUTO_INCREMENT,
  user_id INT UNIQUE NOT NULL,
  location_lat DECIMAL(10,8),
  location_lng DECIMAL(11,8),
  availability BOOLEAN NOT NULL DEFAULT TRUE,
  vehicle_type ENUM('bike','car','auto','none') NOT NULL DEFAULT 'none',
  CONSTRAINT fk_volunteers_user FOREIGN KEY (user_id)
    REFERENCES users(user_id) ON DELETE CASCADE,
  INDEX idx_volunteers_availability (availability)
) ENGINE=InnoDB;

CREATE TABLE deliveries (
  delivery_id INT PRIMARY KEY AUTO_INCREMENT,
  allocation_id INT NOT NULL,
  volunteer_id INT NOT NULL,
  pickup_time DATETIME,
  delivery_time DATETIME,
  status VARCHAR(50) NOT NULL DEFAULT 'volunteer_assigned',
  volunteer_lat DECIMAL(10,8) NULL,
  volunteer_lng DECIMAL(11,8) NULL,
  last_location_update DATETIME NULL,
  estimated_eta_minutes INT NULL,
  cancellation_reason TEXT NULL,
  pickup_notes TEXT NULL,
  delivery_notes TEXT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_deliveries_status (status),
  INDEX idx_deliveries_volunteer (volunteer_id),
  CONSTRAINT fk_deliveries_allocation FOREIGN KEY (allocation_id)
    REFERENCES allocations(allocation_id) ON DELETE CASCADE,
  CONSTRAINT fk_deliveries_volunteer FOREIGN KEY (volunteer_id)
    REFERENCES volunteers(volunteer_id) ON DELETE RESTRICT
) ENGINE=InnoDB;

CREATE TABLE delivery_status_history (
  history_id INT PRIMARY KEY AUTO_INCREMENT,
  delivery_id INT NOT NULL,
  status VARCHAR(50) NOT NULL,
  notes TEXT NULL,
  location_lat DECIMAL(10,8) NULL,
  location_lng DECIMAL(11,8) NULL,
  changed_by INT,
  changed_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_history_delivery_time (delivery_id, changed_at),
  CONSTRAINT fk_history_delivery FOREIGN KEY (delivery_id)
    REFERENCES deliveries(delivery_id) ON DELETE CASCADE,
  CONSTRAINT fk_history_user FOREIGN KEY (changed_by)
    REFERENCES users(user_id) ON DELETE SET NULL
) ENGINE=InnoDB;

CREATE TABLE delivery_verifications (
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

CREATE TABLE food_safety_reports (
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

CREATE TABLE notifications (
  notification_id INT PRIMARY KEY AUTO_INCREMENT,
  user_id INT NOT NULL,
  title VARCHAR(150),
  message TEXT,
  type VARCHAR(50),
  is_read BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_notifications_user_read (user_id, is_read),
  CONSTRAINT fk_notifications_user FOREIGN KEY (user_id)
    REFERENCES users(user_id) ON DELETE CASCADE
) ENGINE=InnoDB;

CREATE TABLE password_reset_tokens (
  token_id INT PRIMARY KEY AUTO_INCREMENT,
  user_id INT NOT NULL,
  token_hash VARCHAR(255) NOT NULL,
  expires_at DATETIME NOT NULL,
  used_at DATETIME NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY uq_password_reset_token_hash (token_hash),
  INDEX idx_password_reset_user (user_id),
  CONSTRAINT fk_password_reset_user FOREIGN KEY (user_id)
    REFERENCES users(user_id) ON DELETE CASCADE
) ENGINE=InnoDB;

CREATE TABLE audit_logs (
  audit_id INT PRIMARY KEY AUTO_INCREMENT,
  user_id INT,
  action VARCHAR(150) NOT NULL,
  entity_type VARCHAR(100),
  entity_id INT,
  metadata JSON,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_audit_user (user_id),
  CONSTRAINT fk_audit_user FOREIGN KEY (user_id)
    REFERENCES users(user_id) ON DELETE SET NULL
) ENGINE=InnoDB;

CREATE TABLE system_settings (
  setting_id INT PRIMARY KEY AUTO_INCREMENT,
  key_name VARCHAR(100) NOT NULL UNIQUE,
  value_text VARCHAR(255),
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
) ENGINE=InnoDB;
