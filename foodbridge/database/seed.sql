USE foodbridge;

-- Demo-only password hash: bcrypt hash for the 4-digit PIN "1234".
-- Change demo credentials and hashes before any shared or production deployment.
INSERT INTO users (user_id, name, email, phone, role, password_hash, is_verified) VALUES
(1, 'Green Basket Kitchen', 'donor1@foodbridge.demo', '9000000001', 'donor', '$2b$10$zzilIEBYXK4xuU6z4Nb4MuL7ce0ESrXPHylaIs3EzL225f7TajXJS', TRUE),
(2, 'Sunrise Restaurant', 'donor2@foodbridge.demo', '9000000002', 'donor', '$2b$10$zzilIEBYXK4xuU6z4Nb4MuL7ce0ESrXPHylaIs3EzL225f7TajXJS', TRUE),
(3, 'Campus Canteen', 'donor3@foodbridge.demo', '9000000003', 'donor', '$2b$10$zzilIEBYXK4xuU6z4Nb4MuL7ce0ESrXPHylaIs3EzL225f7TajXJS', TRUE),
(4, 'Hope Shelter', 'recipient1@foodbridge.demo', '9000000004', 'recipient', '$2b$10$zzilIEBYXK4xuU6z4Nb4MuL7ce0ESrXPHylaIs3EzL225f7TajXJS', TRUE),
(5, 'Community Care Centre', 'recipient2@foodbridge.demo', '9000000005', 'recipient', '$2b$10$zzilIEBYXK4xuU6z4Nb4MuL7ce0ESrXPHylaIs3EzL225f7TajXJS', TRUE),
(6, 'Little Steps Home', 'recipient3@foodbridge.demo', '9000000006', 'recipient', '$2b$10$zzilIEBYXK4xuU6z4Nb4MuL7ce0ESrXPHylaIs3EzL225f7TajXJS', TRUE),
(7, 'Arun Volunteer', 'volunteer1@foodbridge.demo', '9000000007', 'volunteer', '$2b$10$zzilIEBYXK4xuU6z4Nb4MuL7ce0ESrXPHylaIs3EzL225f7TajXJS', TRUE),
(8, 'Meena Volunteer', 'volunteer2@foodbridge.demo', '9000000008', 'volunteer', '$2b$10$zzilIEBYXK4xuU6z4Nb4MuL7ce0ESrXPHylaIs3EzL225f7TajXJS', TRUE),
(9, 'Kumar Volunteer', 'volunteer3@foodbridge.demo', '9000000009', 'volunteer', '$2b$10$zzilIEBYXK4xuU6z4Nb4MuL7ce0ESrXPHylaIs3EzL225f7TajXJS', TRUE),
(10, 'FoodBridge Admin', 'admin@foodbridge.demo', '9000000010', 'admin', '$2b$10$zzilIEBYXK4xuU6z4Nb4MuL7ce0ESrXPHylaIs3EzL225f7TajXJS', TRUE);

INSERT INTO donors (donor_id, user_id, organization_name, location_lat, location_lng, address, verified) VALUES
(1, 1, 'Green Basket Kitchen', 11.3410, 77.7172, 'Perundurai Road, Erode, Tamil Nadu', TRUE),
(2, 2, 'Sunrise Restaurant', 11.0168, 76.9558, 'Gandhipuram, Coimbatore, Tamil Nadu', TRUE),
(3, 3, 'Campus Canteen', 11.4980, 77.2750, 'Anthiyur, Erode, Tamil Nadu', TRUE);

INSERT INTO recipients (recipient_id, user_id, organization_name, location_lat, location_lng, address, capacity, verified) VALUES
(1, 4, 'Hope Shelter', 11.3500, 77.7300, 'Erode, Tamil Nadu', 150, TRUE),
(2, 5, 'Community Care Centre', 11.0200, 76.9600, 'Coimbatore, Tamil Nadu', 100, TRUE),
(3, 6, 'Little Steps Home', 11.5050, 77.2800, 'Anthiyur, Erode, Tamil Nadu', 80, TRUE);

INSERT INTO volunteers (volunteer_id, user_id, location_lat, location_lng, availability, vehicle_type) VALUES
(1, 7, 11.3420, 77.7180, TRUE, 'bike'),
(2, 8, 11.0180, 76.9560, TRUE, 'car'),
(3, 9, 11.4990, 77.2760, TRUE, 'auto');

INSERT INTO donations (donation_id, donor_id, food_type, quantity, remaining_quantity, preparation_time, location_lat, location_lng, safe_use_deadline, status) VALUES
(1, 1, 'Cooked Meals', 60, 60, NOW() - INTERVAL 1 HOUR, 11.3410, 77.7172, NOW() + INTERVAL 6 HOUR, 'available'),
(2, 2, 'Rice', 40, 40, NOW() - INTERVAL 2 HOUR, 11.0168, 76.9558, NOW() + INTERVAL 12 HOUR, 'available'),
(3, 3, 'Vegetables', 25, 25, NOW() - INTERVAL 30 MINUTE, 11.4980, 77.2750, NOW() + INTERVAL 24 HOUR, 'available'),
(4, 1, 'Bread', 30, 30, NOW() - INTERVAL 1 HOUR, 11.3410, 77.7172, NOW() + INTERVAL 18 HOUR, 'available'),
(5, 2, 'Cooked Meals', 20, 20, NOW() - INTERVAL 20 MINUTE, 11.0168, 76.9558, NOW() + INTERVAL 4 HOUR, 'available');

INSERT INTO requirements (requirement_id, recipient_id, food_type, quantity_required, remaining_quantity, required_time, location_lat, location_lng, priority, status) VALUES
(1, 1, 'Cooked Meals', 35, 35, NOW() + INTERVAL 1 HOUR, 11.3500, 77.7300, 'high', 'pending'),
(2, 2, 'Rice', 25, 25, NOW() + INTERVAL 3 HOUR, 11.0200, 76.9600, 'medium', 'pending'),
(3, 3, 'Vegetables', 15, 15, NOW() + INTERVAL 2 HOUR, 11.5050, 77.2800, 'high', 'pending'),
(4, 1, 'Bread', 20, 20, NOW() + INTERVAL 2 HOUR, 11.3500, 77.7300, 'low', 'pending'),
(5, 2, 'Cooked Meals', 15, 15, NOW() + INTERVAL 1 HOUR, 11.0200, 76.9600, 'high', 'pending');

INSERT INTO allocations (allocation_id, donation_id, requirement_id, allocated_quantity, matching_score, status) VALUES
(1, 1, 1, 25, 91.50, 'confirmed'),
(2, 2, 2, 20, 84.25, 'confirmed');

UPDATE donations SET remaining_quantity = 35, status = 'available' WHERE donation_id = 1;
UPDATE donations SET remaining_quantity = 20, status = 'available' WHERE donation_id = 2;
UPDATE requirements SET remaining_quantity = 10, status = 'partially_fulfilled' WHERE requirement_id = 1;
UPDATE requirements SET remaining_quantity = 5, status = 'partially_fulfilled' WHERE requirement_id = 2;

INSERT INTO deliveries (delivery_id, allocation_id, volunteer_id, pickup_time, delivery_time, status) VALUES
(1, 1, 1, NULL, NULL, 'assigned'),
(2, 2, 2, NULL, NULL, 'assigned');

INSERT INTO delivery_status_history (delivery_id, status, changed_by) VALUES
(1, 'pending', 10),
(1, 'assigned', 10),
(2, 'pending', 10),
(2, 'assigned', 10);

INSERT INTO notifications (user_id, title, message, type, is_read) VALUES
(1, 'Allocation created', 'A demo allocation has been created for donation #1.', 'allocation', FALSE),
(4, 'Food allocation update', 'A demo food allocation is ready for your organization.', 'allocation', FALSE),
(7, 'Delivery assigned', 'A demo delivery has been assigned to you.', 'delivery', FALSE);
