
const express = require("express");
const router = express.Router();

const authController = require("../controllers/authController");
const authenticate = require("../middlewares/authenticate");

const recovery = require("../controllers/passwordRecoveryController");
const { ipLimit } = require("../services/recoveryRateLimit");
router.post("/forgot-password", ipLimit("forgot", 10), recovery.forgotPassword);
router.post("/reset-password", ipLimit("reset", 20), recovery.resetPassword);

router.post("/register", authController.register);
router.post("/login", authController.login);
router.post("/logout", authController.logout);

router.get("/me", authenticate, (req, res) => {
  res.json({
    user: {
      id: String(req.user._id),
      name: req.user.name,
      email: req.user.email,
      role: req.user.role,
    },
  });
});

module.exports = router;
