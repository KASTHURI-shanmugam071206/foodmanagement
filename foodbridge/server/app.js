import express from "express";
import cors from "cors";
import helmet from "helmet";
import rateLimit from "express-rate-limit";
import { env } from "./config/env.js";
import { requestLogger } from "./middleware/requestLogger.js";
import { errorHandler, notFoundHandler } from "./middleware/errorHandler.js";
import authRoutes from "./routes/authRoutes.js";
import donationRoutes from "./routes/donationRoutes.js";
import requirementRoutes from "./routes/requirementRoutes.js";
import matchingRoutes from "./routes/matchingRoutes.js";
import adminRoutes from "./routes/adminRoutes.js";
import forecastRoutes from "./routes/forecastRoutes.js";
import recoveryRoutes from "./routes/recoveryRoutes.js";
import notificationRoutes from "./routes/notificationRoutes.js";
import deliveryRoutes from "./routes/deliveryRoutes.js";

export const app = express();

const allowedOrigins = (env.CLIENT_ORIGIN ?? "http://localhost:5173")
  .split(",")
  .map((origin) => origin.trim())
  .filter(Boolean);

app.disable("x-powered-by");
app.use(helmet());
app.use(cors({
  origin: (origin, callback) => {
    if (!origin || allowedOrigins.includes(origin)) {
      callback(null, true);
      return;
    }

    callback(new Error("Not allowed by CORS"));
  },
  credentials: true
}));
app.use(express.json({ limit: "1mb" }));
app.use(express.urlencoded({ extended: true, limit: "1mb" }));
app.use(requestLogger);
app.use("/api", rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 300,
  standardHeaders: "draft-7",
  legacyHeaders: false,
  message: { success: false, message: "Too many requests. Please try again later." }
}));

app.get("/health", (req, res) => {
  res.status(200).json({
    success: true,
    service: "FoodBridge API",
    status: "healthy",
    timestamp: new Date().toISOString()
  });
});

app.get("/api/health", (req, res) => {
  res.status(200).json({ success: true, message: "FoodBridge API is running" });
});

app.use("/api/auth", authRoutes);
app.use("/api/donations", donationRoutes);
app.use("/api/requirements", requirementRoutes);
app.use("/api/matches", matchingRoutes);
app.use("/api/forecast", forecastRoutes);
app.use("/api/recovery", recoveryRoutes);
app.use("/api/admin", adminRoutes);
app.use("/api/notifications", notificationRoutes);
app.use("/api/deliveries", deliveryRoutes);

app.use(notFoundHandler);
app.use(errorHandler);
