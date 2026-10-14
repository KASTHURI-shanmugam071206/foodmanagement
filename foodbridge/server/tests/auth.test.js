import request from "supertest";
import { app } from "../app.js";
import { pool } from "../config/database.js";

describe("FoodBridge 4-Digit Numeric Password Authentication", () => {
  afterAll(async () => {
    await pool.end();
  });
  test("POST /api/auth/login rejects password with letters", async () => {
    const res = await request(app)
      .post("/api/auth/login")
      .send({ email: "admin@foodbridge.demo", password: "abcd" });

    expect(res.status).toBe(400);
    expect(res.body.success).toBe(false);
    expect(res.body.message).toContain("4 numeric digits");
  });

  test("POST /api/auth/login rejects password with 3 digits", async () => {
    const res = await request(app)
      .post("/api/auth/login")
      .send({ email: "admin@foodbridge.demo", password: "123" });

    expect(res.status).toBe(400);
    expect(res.body.success).toBe(false);
    expect(res.body.message).toContain("4 numeric digits");
  });

  test("POST /api/auth/login rejects password with 5 digits", async () => {
    const res = await request(app)
      .post("/api/auth/login")
      .send({ email: "admin@foodbridge.demo", password: "12345" });

    expect(res.status).toBe(400);
    expect(res.body.success).toBe(false);
    expect(res.body.message).toContain("4 numeric digits");
  });

  test("POST /api/auth/login rejects password with symbols", async () => {
    const res = await request(app)
      .post("/api/auth/login")
      .send({ email: "admin@foodbridge.demo", password: "12#4" });

    expect(res.status).toBe(400);
    expect(res.body.success).toBe(false);
    expect(res.body.message).toContain("4 numeric digits");
  });

  test("POST /api/auth/register rejects non-4-digit password", async () => {
    const res = await request(app)
      .post("/api/auth/register")
      .send({
        name: "Test User",
        email: "test_invalid_pin@example.com",
        password: "password123",
        role: "donor"
      });

    expect(res.status).toBe(400);
    expect(res.body.success).toBe(false);
    expect(res.body.message).toContain("4 numeric digits");
  });

  test("POST /api/auth/login succeeds with valid 4-digit PIN '1234'", async () => {
    const res = await request(app)
      .post("/api/auth/login")
      .send({ email: "admin@foodbridge.demo", password: "1234" });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.token).toBeDefined();
    expect(res.body.user).toBeDefined();
    expect(res.body.user.role).toBe("admin");
    expect(res.body.user.password_hash).toBeUndefined();
    expect(res.body.user.password).toBeUndefined();
  });

  test("POST /api/auth/login fails with incorrect 4-digit PIN", async () => {
    const res = await request(app)
      .post("/api/auth/login")
      .send({ email: "admin@foodbridge.demo", password: "9999" });

    expect(res.status).toBe(401);
    expect(res.body.success).toBe(false);
    expect(res.body.message).toContain("Invalid email or password");
  });
});
