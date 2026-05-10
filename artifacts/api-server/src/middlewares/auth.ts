import jwt from "jsonwebtoken";
import type { Request, Response, NextFunction } from "express";

export const requireAuth = (req: Request, res: Response, next: NextFunction): void => {
  try {
    const token = (req as any).cookies?.token;

    if (!token) {
      res.status(401).json({ message: "Unauthorized" });
      return;
    }

    const decoded = jwt.verify(token, process.env.JWT_SECRET ?? "secret");

    (req as any).user = decoded;

    next();
  } catch (error) {
    res.status(401).json({ message: "Invalid token" });
  }
};

export const requireRole = (roles: string[] = []) => {
  return (req: Request, res: Response, next: NextFunction): void => {
    const user = (req as any).user;
    if (!roles.includes(user?.role)) {
      res.status(403).json({ message: "Forbidden" });
      return;
    }
    next();
  };
};
