const jwt = require("jsonwebtoken");

const COOKIE_NAME = "lwtmt_session";
const EXPIRES_IN_HOURS = Number(process.env.JWT_EXPIRES_IN_HOURS || 12);
const JWT_SECRET = process.env.JWT_SECRET || "lwtmt-local-dev-secret";

function createSessionToken(user) {
  return jwt.sign(
    { sub: user.username, role: user.role },
    JWT_SECRET,
    { expiresIn: `${EXPIRES_IN_HOURS}h` }
  );
}

function setSessionCookie(res, token) {
  res.cookie(COOKIE_NAME, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    maxAge: EXPIRES_IN_HOURS * 60 * 60 * 1000,
  });
}

function clearSessionCookie(res) {
  res.clearCookie(COOKIE_NAME);
}

// Express middleware: rejects the request with 401 if there's no valid session cookie.
function requireAuth(req, res, next) {
  const token = req.cookies ? req.cookies[COOKIE_NAME] : null;
  if (!token) {
    return res.status(401).json({ error: "Login required" });
  }
  try {
    const payload = jwt.verify(token, JWT_SECRET);
    req.user = { username: payload.sub, role: payload.role };
    return next();
  } catch (err) {
    return res.status(401).json({ error: "Session expired or invalid, please log in again" });
  }
}

module.exports = {
  COOKIE_NAME,
  createSessionToken,
  setSessionCookie,
  clearSessionCookie,
  requireAuth,
};
