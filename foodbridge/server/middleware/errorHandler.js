export function notFoundHandler(req, res) {
  res.status(404).json({
    success: false,
    message: `Route not found: ${req.method} ${req.originalUrl}`
  });
}

export function errorHandler(error, req, res, next) {
  if (res.headersSent) return next(error);

  const statusCode = Number.isInteger(error.statusCode) ? error.statusCode : 500;
  const message = statusCode >= 500 && process.env.NODE_ENV === "production"
    ? "Internal server error"
    : error.message || "Internal server error";

  if (statusCode >= 500) {
    console.error(JSON.stringify({
      level: "error",
      message: error.message,
      method: req.method,
      path: req.originalUrl,
      timestamp: new Date().toISOString()
    }));
  }

  res.status(statusCode).json({ success: false, message });
}
