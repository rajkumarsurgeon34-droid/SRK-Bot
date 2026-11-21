// Usage: node scripts/edition.js full|offline
// Switches app id, name and edition flag before building the Android app.
const fs = require("fs");
const path = require("path");
const edition = process.argv[2] === "offline" ? "offline" : "full";
const root = path.join(__dirname, "..");
const cfgPath = path.join(root, "capacitor.config.json");
const cfg = JSON.parse(fs.readFileSync(cfgPath, "utf8"));
if (edition === "offline") {
  cfg.appId = "com.shazverse.srkbot.offline";
  cfg.appName = "SRK Bot Offline";
} else {
  cfg.appId = "com.shazverse.srkbot";
  cfg.appName = "SRK Bot";
}
fs.writeFileSync(cfgPath, JSON.stringify(cfg, null, 2) + "\n");
fs.writeFileSync(path.join(root, "www", "edition.js"),
  '// Set at build time by scripts/edition.js — "full" (online + offline) or "offline" (SRK Bot Offline).\n' +
  'window.SRK_EDITION = "' + edition + '";\n');
const icon = edition === "offline" ? "icon-offline.png" : "icon-full.png";
fs.copyFileSync(path.join(root, "www", icon), path.join(root, "www", "icon.png"));
console.log("Edition:", edition, "→", cfg.appId, "/", cfg.appName);
