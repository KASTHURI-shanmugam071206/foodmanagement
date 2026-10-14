import request from "supertest";
import { app } from "../app.js";

describe("FoodBridge API", () => {
  test("GET /health returns a healthy service response", async () => {
    const response = await request(app).get("/health");

    expect(response.status).toBe(200);
    expect(response.body.success).toBe(true);
    expect(response.body.service).toBe("FoodBridge API");
    expect(response.body.status).toBe("healthy");
  });

  test("GET /api/health returns the API health message", async () => {
    const response = await request(app).get("/api/health");

    expect(response.status).toBe(200);
    expect(response.body.success).toBe(true);
    expect(response.body.message).toBe("FoodBridge API is running");
  });

  test("GET /unknown-route returns a 404 payload", async () => {
    const response = await request(app).get("/missing-route");

    expect(response.status).toBe(404);
    expect(response.body.success).toBe(false);
    expect(response.body.message).toContain("Route not found");
  });
});
