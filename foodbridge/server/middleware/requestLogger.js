export function requestLogger(req, res, next) {
  const startedAt = Date.now();

  res.on("finish", () => {
    console.log(JSON.stringify({
      level: "info",
      method: req.method,
      path: req.originalUrl,
      statusCode: res.statusCode,
      durationMs: Date.now() - startedAt,
      timestamp: new Date().toISOString()
    }));
  });

  next();
}
