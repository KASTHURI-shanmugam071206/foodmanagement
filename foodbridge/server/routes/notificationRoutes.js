import express from "express";
import { pool } from "../config/database.js";
import { authenticate } from "../middleware/auth.js";

const router = express.Router();

router.get("/mine", authenticate, async (req, res) => {
  try {
    const [rows] = await pool.execute(
      "SELECT * FROM notifications WHERE user_id = ? ORDER BY created_at DESC LIMIT 30",
      [req.user.userId]
    );

    const [unreadRows] = await pool.execute(
      "SELECT COUNT(*) AS unread FROM notifications WHERE user_id = ? AND is_read = FALSE",
      [req.user.userId]
    );

    return res.status(200).json({
      success: true,
      notifications: rows,
      unreadCount: Number(unreadRows[0]?.unread || 0)
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: "Unable to load notifications."
    });
  }
});

router.patch("/:notificationId/read", authenticate, async (req, res) => {
  try {
    await pool.execute(
      "UPDATE notifications SET is_read = TRUE WHERE notification_id = ? AND user_id = ?",
      [req.params.notificationId, req.user.userId]
    );

    return res.status(200).json({
      success: true,
      message: "Notification marked as read."
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: "Unable to update notification."
    });
  }
});

router.patch("/read-all", authenticate, async (req, res) => {
  try {
    await pool.execute(
      "UPDATE notifications SET is_read = TRUE WHERE user_id = ?",
      [req.user.userId]
    );

    return res.status(200).json({
      success: true,
      message: "All notifications marked as read."
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: "Unable to mark all notifications as read."
    });
  }
});

export default router;
