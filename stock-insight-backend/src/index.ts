import "dotenv/config";
import { createApp } from "./server.js";
import { startPredictionScheduler } from "./services/predictionScheduler.js";

const app = createApp();
const port = Number(process.env.PORT) || 8787;
const host = "0.0.0.0";
app.listen(port, host, () => {
  console.log(`🚀 stock-insight-backend listening on http://0.0.0.0:${port}`);
  console.log(`   팀원 접속 URL: http://192.0.0.2:${port}`);
});

startPredictionScheduler();
