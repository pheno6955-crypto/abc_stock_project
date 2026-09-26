import "dotenv/config";
import os from "node:os";
import { createApp } from "./server.js";
import { startPredictionScheduler } from "./services/predictionScheduler.js";

function getLanAddresses(): string[] {
  return Object.values(os.networkInterfaces())
    .flat()
    .filter((iface): iface is NonNullable<typeof iface> => !!iface && iface.family === "IPv4" && !iface.internal)
    .map((iface) => iface.address);
}

const app = createApp();
const port = Number(process.env.PORT) || 8787;
const host = "0.0.0.0";
app.listen(port, host, () => {
  console.log(`🚀 stock-insight-backend listening on http://0.0.0.0:${port}`);
  for (const address of getLanAddresses()) {
    console.log(`   팀원 접속 URL: http://${address}:${port}`);
  }
});

startPredictionScheduler();
