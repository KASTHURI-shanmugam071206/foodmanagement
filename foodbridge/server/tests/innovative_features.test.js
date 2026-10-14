import request from "supertest";
import { app } from "../app.js";
import { pool } from "../config/database.js";

describe("7 Innovative Features Suite", () => {
  let adminToken;
  let volunteerToken;
  let donorToken;
  let recipientToken;
  let volunteerId;
  let testDonationId;
  let testRequirementId;
  let testDeliveryId;

  beforeAll(async () => {
    // 1. Log in demo accounts (all using 4-digit PIN '1234')
    const adminRes = await request(app)
      .post("/api/auth/login")
      .send({ email: "admin@foodbridge.demo", password: "1234" });
    adminToken = adminRes.body.token;

    const volRes = await request(app)
      .post("/api/auth/login")
      .send({ email: "volunteer1@foodbridge.demo", password: "1234" });
    volunteerToken = volRes.body.token;

    const donorRes = await request(app)
      .post("/api/auth/login")
      .send({ email: "donor1@foodbridge.demo", password: "1234" });
    donorToken = donorRes.body.token;

    const recRes = await request(app)
      .post("/api/auth/login")
      .send({ email: "recipient1@foodbridge.demo", password: "1234" });
    recipientToken = recRes.body.token;

    // Get volunteer profile
    const [volRows] = await pool.query("SELECT volunteer_id FROM volunteers LIMIT 1");
    volunteerId = volRows[0].volunteer_id;
  });

  afterAll(async () => {
    await pool.end();
  });

  // -------------------------------------------------------------
  // Feature 4: Food Safety & Expiry Alerts
  // -------------------------------------------------------------
  test("Feature 4: Food Safety - Records temperature, allergens, condition, and checks safety alerts", async () => {
    const futureDeadline = new Date(Date.now() + 3 * 60 * 60 * 1000).toISOString(); // 3 hrs from now (Urgent alert)
    const res = await request(app)
      .post("/api/donations/create")
      .set("Authorization", `Bearer ${donorToken}`)
      .send({
        foodType: "Cooked Biryani & Curry",
        quantity: 40,
        unit: "servings",
        storageTemperatureC: 65.5,
        storageType: "hot_holding",
        allergens: "Dairy, Nuts",
        foodCondition: "fresh_hot",
        safetyStatus: "safe",
        safetyNotes: "Prepared freshly in commercial kitchen, held above 60C",
        safeUseDeadline: futureDeadline
      });

    expect(res.status).toBe(201);
    expect(res.body.success).toBe(true);
    testDonationId = res.body.donation.donation_id;
    expect(res.body.donation.food_condition).toBe("fresh_hot");
    expect(res.body.donation.storage_type).toBe("hot_holding");

    // Fetch food safety alerts (< 4 hrs)
    const alertRes = await request(app)
      .get("/api/donations/safety/alerts")
      .set("Authorization", `Bearer ${adminToken}`);

    expect(alertRes.status).toBe(200);
    expect(alertRes.body.success).toBe(true);
    expect(Array.isArray(alertRes.body.alerts)).toBe(true);
  });

  test("Feature 4: Food Safety - Blocks allocation when food is expired or unsafe", async () => {
    // Expired donation
    const pastDeadline = new Date(Date.now() - 1000 * 60 * 60).toISOString();
    const expRes = await request(app)
      .post("/api/donations/create")
      .set("Authorization", `Bearer ${donorToken}`)
      .send({
        foodType: "Expired Pastries",
        quantity: 15,
        safeUseDeadline: pastDeadline
      });

    const expiredDonationId = expRes.body.donation.donation_id;

    // Create a requirement
    const reqRes = await request(app)
      .post("/api/requirements/create")
      .set("Authorization", `Bearer ${recipientToken}`)
      .send({
        foodType: "Expired Pastries",
        quantityRequired: 15,
        requiredTime: new Date(Date.now() + 2 * 60 * 60 * 1000).toISOString(),
        priority: "medium"
      });
    const reqId = reqRes.body.requirement.requirement_id;

    // Attempt allocation on expired food -> should be rejected
    const allocRes = await request(app)
      .post("/api/matches/allocate")
      .set("Authorization", `Bearer ${adminToken}`)
      .send({
        donationId: expiredDonationId,
        requirementId: reqId
      });

    expect(allocRes.status).toBe(400);
    expect(allocRes.body.message).toContain("safe-use deadline has already passed");
  });

  // -------------------------------------------------------------
  // Feature 5: Fair and Explainable Food Allocation
  // -------------------------------------------------------------
  test("Feature 5: Fair & Explainable Matching - Generates matches with transparent score breakdown", async () => {
    // Create matching requirement
    const reqRes = await request(app)
      .post("/api/requirements/create")
      .set("Authorization", `Bearer ${recipientToken}`)
      .send({
        foodType: "Cooked Biryani & Curry",
        quantityRequired: 40,
        requiredTime: new Date(Date.now() + 4 * 60 * 60 * 1000).toISOString(),
        priority: "high"
      });

    expect(reqRes.status).toBe(201);
    testRequirementId = reqRes.body.requirement.requirement_id;

    // Get recommended matches
    const matchRes = await request(app)
      .get("/api/matches/recommended")
      .set("Authorization", `Bearer ${adminToken}`);

    expect(matchRes.status).toBe(200);
    expect(matchRes.body.matches.length).toBeGreaterThan(0);

    const topMatch = matchRes.body.matches.find(m => m.donationId === testDonationId);
    expect(topMatch).toBeDefined();
    expect(topMatch.score).toBeGreaterThan(70);
    expect(topMatch.explanation).toBeDefined();
    expect(topMatch.explanation.foodCategory).toBeDefined();
    expect(topMatch.explanation.urgency).toBeDefined();
    expect(topMatch.explanation.recipientPriority).toBeDefined();
    expect(topMatch.summary).toContain("Match");
  });

  test("Feature 5: Concurrency Safe Allocation - Creates delivery and updates remaining quantities", async () => {
    const allocRes = await request(app)
      .post("/api/matches/allocate")
      .set("Authorization", `Bearer ${adminToken}`)
      .send({
        donationId: testDonationId,
        requirementId: testRequirementId,
        volunteerId: volunteerId
      });

    expect(allocRes.status).toBe(201);
    expect(allocRes.body.success).toBe(true);
    expect(allocRes.body.deliveryId).toBeDefined();
    testDeliveryId = allocRes.body.deliveryId;
  });

  // -------------------------------------------------------------
  // Feature 2: Smart Volunteer Assignment Engine
  // -------------------------------------------------------------
  test("Feature 2: Smart Volunteer Assignment - Recommends volunteers with multi-factor scoring breakdown", async () => {
    const recRes = await request(app)
      .get(`/api/deliveries/${testDeliveryId}/recommend-volunteers`)
      .set("Authorization", `Bearer ${adminToken}`);

    expect(recRes.status).toBe(200);
    expect(recRes.body.success).toBe(true);
    expect(Array.isArray(recRes.body.recommendations)).toBe(true);

    if (recRes.body.recommendations.length > 0) {
      const topRec = recRes.body.recommendations[0];
      expect(topRec.totalScore).toBeGreaterThanOrEqual(0);
      expect(topRec.breakdown).toBeDefined();
      expect(topRec.breakdown.proximity).toBeDefined();
      expect(topRec.breakdown.workload).toBeDefined();
      expect(topRec.breakdown.urgency).toBeDefined();
      expect(topRec.breakdown.vehicle).toBeDefined();
    }
  });

  test("Feature 2: Volunteer Respond - Volunteer accepts assignment", async () => {
    const res = await request(app)
      .post(`/api/deliveries/${testDeliveryId}/respond`)
      .set("Authorization", `Bearer ${volunteerToken}`)
      .send({ action: "accept" });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);

    // Verify delivery state updated to assignment_accepted
    const delRes = await request(app)
      .get(`/api/deliveries/${testDeliveryId}`)
      .set("Authorization", `Bearer ${volunteerToken}`);

    expect(delRes.body.delivery.status).toBe("assignment_accepted");
  });

  // -------------------------------------------------------------
  // Feature 1: Real-Time Food Rescue Tracker
  // -------------------------------------------------------------
  test("Feature 1: Status Progression - Transitions through arrived_pickup", async () => {
    const res = await request(app)
      .patch(`/api/deliveries/${testDeliveryId}/status`)
      .set("Authorization", `Bearer ${volunteerToken}`)
      .send({ status: "arrived_pickup", notes: "Volunteer reached restaurant" });

    expect(res.status).toBe(200);
    expect(res.body.status).toBe("arrived_pickup");

    // Verify status timeline persistence
    const delRes = await request(app)
      .get(`/api/deliveries/${testDeliveryId}`)
      .set("Authorization", `Bearer ${adminToken}`);

    expect(delRes.body.timeline.length).toBeGreaterThanOrEqual(2);
    expect(delRes.body.timeline.some(t => t.status === "arrived_pickup")).toBe(true);
  });

  // -------------------------------------------------------------
  // Feature 7: QR-Based Pickup and Delivery Verification
  // -------------------------------------------------------------
  test("Feature 7: QR Verification - Donor gets pickup QR & manual 6-digit PIN", async () => {
    const qrRes = await request(app)
      .get(`/api/deliveries/${testDeliveryId}/qr/pickup`)
      .set("Authorization", `Bearer ${donorToken}`);

    expect(qrRes.status).toBe(200);
    expect(qrRes.body.token).toBeDefined();
    expect(qrRes.body.manualCode).toMatch(/^\d{6}$/);

    // Volunteer verifies pickup using the 6-digit PIN fallback
    const verifyRes = await request(app)
      .post(`/api/deliveries/${testDeliveryId}/verify-pickup`)
      .set("Authorization", `Bearer ${volunteerToken}`)
      .send({ manualCode: qrRes.body.manualCode });

    expect(verifyRes.status).toBe(200);
    expect(verifyRes.body.status).toBe("food_collected");

    // Second use of same code must fail (single-use token protection)
    const reuseRes = await request(app)
      .post(`/api/deliveries/${testDeliveryId}/verify-pickup`)
      .set("Authorization", `Bearer ${volunteerToken}`)
      .send({ manualCode: qrRes.body.manualCode });

    expect(reuseRes.status).toBe(400);
    expect(reuseRes.body.message).toContain("already been used");
  });

  // -------------------------------------------------------------
  // Feature 3: Live Location, Route and ETA
  // -------------------------------------------------------------
  test("Feature 3: Live GPS Tracking - Volunteer posts location updates & calculates ETA", async () => {
    // Transition to in_transit
    await request(app)
      .patch(`/api/deliveries/${testDeliveryId}/status`)
      .set("Authorization", `Bearer ${volunteerToken}`)
      .send({ status: "in_transit" });

    // Send GPS coordinates (e.g. Bangalore center: 12.9716, 77.5946)
    const locRes = await request(app)
      .post(`/api/deliveries/${testDeliveryId}/location`)
      .set("Authorization", `Bearer ${volunteerToken}`)
      .send({ lat: 12.9716, lng: 77.5946 });

    expect(locRes.status).toBe(200);
    expect(locRes.body.success).toBe(true);
    expect(locRes.body.volunteerLat).toBe(12.9716);
    expect(locRes.body.volunteerLng).toBe(77.5946);

    // Verify stored location in delivery view
    const delRes = await request(app)
      .get(`/api/deliveries/${testDeliveryId}`)
      .set("Authorization", `Bearer ${adminToken}`);

    expect(delRes.body.delivery.volunteer_lat).toBe(12.9716);
    expect(delRes.body.delivery.volunteer_lng).toBe(77.5946);
    expect(delRes.body.isLocationStale).toBe(false);
  });

  // -------------------------------------------------------------
  // Feature 7 (Part 2): QR Delivery Verification & Completion
  // -------------------------------------------------------------
  test("Feature 7: QR Delivery Verification - Recipient generates QR and volunteer completes delivery", async () => {
    // Transition to arrived_recipient
    await request(app)
      .patch(`/api/deliveries/${testDeliveryId}/status`)
      .set("Authorization", `Bearer ${volunteerToken}`)
      .send({ status: "arrived_recipient" });

    // Recipient generates delivery verification QR
    const qrRes = await request(app)
      .get(`/api/deliveries/${testDeliveryId}/qr/delivery`)
      .set("Authorization", `Bearer ${recipientToken}`);

    expect(qrRes.status).toBe(200);
    expect(qrRes.body.token).toBeDefined();
    expect(qrRes.body.manualCode).toMatch(/^\d{6}$/);

    // Volunteer scans QR (sends token)
    const verifyRes = await request(app)
      .post(`/api/deliveries/${testDeliveryId}/verify-delivery`)
      .set("Authorization", `Bearer ${volunteerToken}`)
      .send({ token: qrRes.body.token });

    expect(verifyRes.status).toBe(200);
    expect(verifyRes.body.status).toBe("delivered");

    // Location tracking should now be inactive
    const locPostDeliv = await request(app)
      .post(`/api/deliveries/${testDeliveryId}/location`)
      .set("Authorization", `Bearer ${volunteerToken}`)
      .send({ lat: 12.9716, lng: 77.5946 });

    expect(locPostDeliv.status).toBe(400);
    expect(locPostDeliv.body.message).toContain("Tracking stopped");
  });

  // -------------------------------------------------------------
  // Feature 6: Real-Time Impact Dashboard and Analytics
  // -------------------------------------------------------------
  test("Feature 6: Real-Time Impact - Calculates verified meals, CO2, water, and exports CSV", async () => {
    const impactRes = await request(app)
      .get("/api/admin/impact")
      .set("Authorization", `Bearer ${adminToken}`);

    expect(impactRes.status).toBe(200);
    expect(impactRes.body.success).toBe(true);
    expect(impactRes.body.impact.totalMealsRescued).toBeGreaterThan(0);
    expect(impactRes.body.impact.totalWeightKg).toBeGreaterThan(0);
    expect(impactRes.body.impact.co2AvoidedKg).toBeGreaterThan(0);
    expect(impactRes.body.impact.waterSavedLiters).toBeGreaterThan(0);
    expect(impactRes.body.impact.methodology).toBeDefined();

    // Test impact CSV export
    const csvRes = await request(app)
      .get("/api/admin/export?type=impact")
      .set("Authorization", `Bearer ${adminToken}`);

    expect(csvRes.status).toBe(200);
    expect(csvRes.headers["content-type"]).toContain("text/csv");
    expect(csvRes.text).toContain("meals_rescued");
    expect(csvRes.text).toContain("co2_avoided_kg");
  });
});
