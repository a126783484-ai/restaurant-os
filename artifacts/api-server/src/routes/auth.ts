import { Router, type IRouter } from "express";
import jwt from "jsonwebtoken";

const router: IRouter = Router();

router.post("/auth/login", (req, res): void => {
  const { email, password } = req.body ?? {};

  if (!email || !password) {
    res.status(400).json({ message: "Email and password are required" });
    return;
  }

  const secret = process.env.JWT_SECRET ?? "secret";
  const token = jwt.sign(
    { email, role: "manager" },
    secret,
    { expiresIn: "7d" }
  );

  res.cookie("token", token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    maxAge: 7 * 24 * 60 * 60 * 1000,
    sameSite: "lax",
  });

  res.json({ token, message: "Login successful" });
});

router.post("/auth/logout", (_req, res): void => {
  res.clearCookie("token");
  res.json({ message: "Logged out" });
});

export default router;
