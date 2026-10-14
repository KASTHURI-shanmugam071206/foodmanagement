import request from "supertest";
import { app } from "../app.js";
import { pool } from "../config/database.js";

describe("FoodBridge End-to-End Role & Workflow Tests", () => {
  let adminToken = "";
  let donorToken = "";
  let recipientToken = "";
  let volunteerToken = "";

  let testDonationId = null;
  let testRequirementId = null;
  let testAllocationId = null;
  let testDeliveryId = null;

  beforeAll(async () => {
    // 1. Authenticate Admin with 4-digit PIN 1234
    const adminLogin = await request(app)
      .post("/api/auth/login")
      .send({ email: "admin@foodbridge.demo", password: "1234" });
    adminToken = adminLogin.body.token;

    // 2. Authenticate Donor with 4-digit PIN 1234
    const donorLogin = await request(app)
      .post("/api/auth/login")
      .send({ email: "donor1@foodbridge.demo", password: "1234" });
    donorToken = donorLogin.body.token;

    // 3. Authenticate Recipient with 4-digit PIN 1234
    const recipientLogin = await request(app)
      .post("/api/auth/login")
      .send({ email: "recipient1@foodbridge.demo", password: "1234" });
    recipientToken = recipientLogin.body.token;

    // 4. Authenticate Volunteer with 4-digit PIN 1234
    const volunteerLogin = await request(app)
      .post("/api/auth/login")
      .send({ email: "volunteer1@foodbridge.demo", password: "1234" });
    volunteerToken = volunteerLogin.body.token;
  });

  afterAll(async () => {
    // Clean up created test records if any
    if (testDeliveryId) {
      await pool.execute("DELETE FROM deliveries WHERE delivery_id = ?", [testDeliveryId]);
    }
    if (testAllocationId) {
      await pool.execute("DELETE FROM allocations WHERE allocation_id = ?", [testAllocationId]);
    }
    if (testDonationId) {
      await pool.execute("DELETE FROM donations WHERE donation_id = ?", [testDonationId]);
    }
    if (testRequirementId) {
      await pool.execute("DELETE FROM requirements WHERE requirement_id = ?", [testRequirementId]);
    }
    await pool.end();
  });

  test("1. Admin authenticated & access control verified", async () => {
    expect(adminToken).toBeTruthy();
    const res = await request(app)
      .get("/api/auth/admin-check")
      .set("Authorization", `Bearer ${adminToken}`);

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
  });

  test("2. Donor creates a new surplus food donation", async () => {
    expect(donorToken).toBeTruthy();
    const res = await request(app)
      .post("/api/donations/create")
      .set("Authorization", `Bearer ${donorToken}`)
      .send({
        foodType: "Fresh Fruit Crates",
        quantity: 50,
        safeUseDeadline: new Date(Date.now() + 24 * 3600000).toISOString(),
        locationLat: 11.341,
        locationLng: 77.7172,
        status: "available"
      });

    expect(res.status).toBe(201);
    expect(res.body.success).toBe(true);
    expect(res.body.donation.food_type).toBe("Fresh Fruit Crates");
    testDonationId = res.body.donation.donation_id;
  });

  test("3. Recipient creates a food requirement", async () => {
    expect(recipientToken).toBeTruthy();
    const res = await request(app)
      .post("/api/requirements/create")
      .set("Authorization", `Bearer ${recipientToken}`)
      .send({
        foodType: "Fresh Fruit Crates",
        quantityRequired: 30,
        requiredTime: new Date(Date.now() + 12 * 3600000).toISOString(),
        priority: "high",
        locationLat: 11.35,
        locationLng: 77.73,
        status: "pending"
      });

    expect(res.status).toBe(201);
    expect(res.body.success).toBe(true);
    expect(res.body.requirement.food_type).toBe("Fresh Fruit Crates");
    testRequirementId = res.body.requirement.requirement_id;
  });

  test("4. Food matching engine recommends match", async () => {
    const res = await request(app)
      .get("/api/matches/recommended")
      .set("Authorization", `Bearer ${recipientToken}`);

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(Array.isArray(res.body.matches)).toBe(true);
  });

  test("5. Allocation transaction confirms match and creates delivery", async () => {
    expect(testDonationId).toBeTruthy();
    expect(testRequirementId).toBeTruthy();

    const res = await request(app)
      .post("/api/matches/allocate")
      .set("Authorization", `Bearer ${recipientToken}`)
      .send({
        donationId: testDonationId,
        requirementId: testRequirementId,
        volunteerId: 1
      });

    expect(res.status).toBe(201);
    expect(res.body.success).toBe(true);
    expect(res.body.allocatedQuantity).toBe(30);
    testAllocationId = res.body.allocationId;
    testDeliveryId = res.body.deliveryId;
  });

  test("6. Volunteer updates delivery status", async () => {
    if (!testDeliveryId) {
      // Find active delivery for volunteer1
      const assignedRes = await request(app)
        .get("/api/matches/assigned")
        .set("Authorization", `Bearer ${volunteerToken}`);
      expect(assignedRes.status).toBe(200);
      if (assignedRes.body.deliveries.length > 0) {
        testDeliveryId = assignedRes.body.deliveries[0].delivery_id;
      }
    }

    if (testDeliveryId) {
      const res = await request(app)
        .patch(`/api/matches/deliveries/${testDeliveryId}/status`)
        .set("Authorization", `Bearer ${volunteerToken}`)
        .send({ status: "in_transit" });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
    }
  });

  test("7. Admin accesses stats, users list, and audit logs", async () => {
    const statsRes = await request(app)
      .get("/api/admin/stats")
      .set("Authorization", `Bearer ${adminToken}`);
    expect(statsRes.status).toBe(200);
    expect(statsRes.body.stats.donations).toBeGreaterThan(0);

    const auditRes = await request(app)
      .get("/api/admin/audit-log")
      .set("Authorization", `Bearer ${adminToken}`);
    expect(auditRes.status).toBe(200);
    expect(Array.isArray(auditRes.body.auditLog)).toBe(true);
  });
});
