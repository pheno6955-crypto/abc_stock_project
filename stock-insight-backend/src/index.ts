import "dotenv/config";
import { createApp } from "./server.js";

const app = createApp();
const port = Number(process.env.PORT) || 8787;
app.listen(port, () => {
  console.log(`🚀 stock-insight-backend listening on http://localhost:${port}`);
});
