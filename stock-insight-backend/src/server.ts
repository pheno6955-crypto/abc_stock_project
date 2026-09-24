import express from "express";
import cors from "cors";
import { stocksRouter } from "./routes/stocks.js";
import { predictionsRouter } from "./routes/predictions.js";
import { streakRouter } from "./routes/streak.js";

export function createApp() {
  const app = express();
  app.use(cors());
  app.use(express.json());

  app.get("/health", (_req, res) => res.json({ status: "ok" }));
  app.use("/api/stocks", stocksRouter);
  app.use("/api/predictions", predictionsRouter);
  app.use("/api/streak", streakRouter);

  return app;
}
