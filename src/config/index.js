require("dotenv").config();

module.exports = {
  port: process.env.PORT || 3000,
  clientUrl: process.env.CLIENT_URL,
  webhookPath: process.env.WEBHOOK_PATH,
  apiToken: process.env.CLIENT_API_TOKEN,
  defaultSessionId: process.env.DEFAULT_SESSION_ID,
  sessionDir: "./sessions",
  waConfig: {
    browser: [
      process.env.WA_BROWSER_NAME || "WA-Gateway",
      process.env.WA_BROWSER_TYPE || "Chrome",
      process.env.WA_BROWSER_VERSION || "1.0.0",
    ],
  },
};
