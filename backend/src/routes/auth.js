const express = require("express");
const bcrypt = require("bcryptjs");
const { timingSafeEqual } = require("crypto");
const pool = require("../db/pool");
const {
  createSessionToken,
  setSessionCookie,
  clearSessionCookie,
  requireAuth,
} = require("../middleware/auth");

const router = express.Router();

function safeCompare(left, right) {
  const leftBuffer = Buffer.from(String(left || ""));
  const rightBuffer = Buffer.from(String(right || ""));

  if (leftBuffer.length !== rightBuffer.length) {
    return false;
  }

  return timingSafeEqual(leftBuffer, rightBuffer);
}

function envOperatorLogin(username, password) {
  const operatorUsername = process.env.OPERATOR_USERNAME || process.env.ADMIN_USERNAME || "admin";
  const operatorPassword = process.env.OPERATOR_PASSWORD || process.env.ADMIN_PASSWORD || "admin123";

  if (!safeCompare(username, operatorUsername) || !safeCompare(password, operatorPassword)) {
    return null;
  }

  return { id: 0, username: operatorUsername, role: "operator" };
}

async function databaseUserLogin(username, password) {
  if (!process.env.DATABASE_URL) {
    return null;
  }

  const result = await pool.query(
    "SELECT id, username, password_hash, role FROM users WHERE username = $1",
    [username]
  );
  const user = result.rows[0];

  if (!user) {
    return null;
  }

  const passwordOk = await bcrypt.compare(password, user.password_hash);
  if (!passwordOk) {
    return null;
  }

  return user;
}

router.post("/login", async (req, res) => {
  const { username, password } = req.body || {};

  if (!username || !password) {
    return res.status(400).json({ error: "Username and password are required" });
  }

  try {
    let user = null;

    try {
      user = await databaseUserLogin(username, password);
    } catch (err) {
      if (err.code !== "42P01") {
        throw err;
      }
      console.warn("Postgres users table does not exist; falling back to operator env login.");
    }

    user = user || envOperatorLogin(username, password);

    if (!user) {
      return res.status(401).json({ error: "Invalid username or password" });
    }

    const token = createSessionToken(user);
    setSessionCookie(res, token);
    return res.json({ ok: true, username: user.username, role: user.role });
  } catch (err) {
    console.error("Login error:", err);
    return res.status(500).json({ error: "Login failed, please try again" });
  }
});

router.post("/logout", (req, res) => {
  clearSessionCookie(res);
  res.json({ ok: true });
});

// Lets the frontend check "am I still logged in?" on page load / refresh.
router.get("/session", requireAuth, (req, res) => {
  res.json({ ok: true, username: req.user.username, role: req.user.role });
});

module.exports = router;
