import express from "express";
import cors from "cors";
import cookieParser from "cookie-parser";

import router from "./routes";
import { logger } from "./lib/logger";

const app = express();

app.use((req, _res, next) => {
  logger.info(
    {
      method: req.method,
      url: req.originalUrl,
    },
    "incoming request"
  );

  next();
});

app.use(cors());
app.use(express.json());
app.use(cookieParser());

app.get("/health", (_req, res) => {
  res.json({
    ok: true,
  });
});

app.use("/api", router);

export default app;
