import { Server } from "socket.io";
import jwt from "jsonwebtoken";
import { env } from "../config/env.js";

let io = null;

export function initSocket(httpServer) {
  const allowedOrigins = (env.CLIENT_ORIGIN ?? "http://localhost:5173")
    .split(",")
    .map((origin) => origin.trim())
    .filter(Boolean);

  io = new Server(httpServer, {
    cors: {
      origin: allowedOrigins.length > 0 ? allowedOrigins : "*",
      methods: ["GET", "POST", "PATCH", "PUT"],
      credentials: true
    }
  });

  // Socket middleware for JWT verification (optional, allows token in auth)
  io.use((socket, next) => {
    const token = socket.handshake.auth?.token || socket.handshake.headers?.authorization?.replace("Bearer ", "");
    if (token) {
      try {
        const decoded = jwt.verify(token, env.JWT_ACCESS_SECRET);
        socket.user = decoded;
      } catch (err) {
        // Continue unauthenticated, but socket.user will be undefined
      }
    }
    next();
  });

  io.on("connection", (socket) => {
    // If authenticated via handshake
    if (socket.user?.userId) {
      socket.join(`user_${socket.user.userId}`);
      if (socket.user.role === "admin") {
        socket.join("admins");
      }
    }

    // Explicit room subscription
    socket.on("join_user", (userId) => {
      if (userId) {
        socket.join(`user_${userId}`);
      }
    });

    socket.on("join_delivery", (deliveryId) => {
      if (deliveryId) {
        socket.join(`delivery_${deliveryId}`);
      }
    });

    socket.on("leave_delivery", (deliveryId) => {
      if (deliveryId) {
        socket.leave(`delivery_${deliveryId}`);
      }
    });

    socket.on("disconnect", () => {
      // Clean disconnect
    });
  });

  console.log("Socket.IO initialized successfully");
  return io;
}

export function getIO() {
  return io;
}

export function emitToUser(userId, event, data) {
  if (io && userId) {
    io.to(`user_${userId}`).emit(event, data);
  }
}

export function emitToDelivery(deliveryId, event, data) {
  if (io && deliveryId) {
    io.to(`delivery_${deliveryId}`).emit(event, data);
    // Also notify admins
    io.to("admins").emit(event, data);
  }
}

export function broadcast(event, data) {
  if (io) {
    io.emit(event, data);
  }
}
