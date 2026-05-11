import express from "express";
import cors from "cors";
import cookieParser from "cookie-parser";
import pinoHttp from "pino-http";

import router from "./routes";
import { logger } from "./lib/logger";

const app = express();

app.use(
  pinoHttp({
    logger,
    serializers: {
      req(req: any) {
        return {
          id: req.id,
          method: req.method,
          url: req.url?.split("?")[0],
        };
      },

      res(res: any) {
        return {
          statusCode: res.statusCode,
        };
      },
    },
  })
);

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
