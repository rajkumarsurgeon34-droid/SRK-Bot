// Copies the offline AI engine (wllama) into www/vendor so it ships inside the app (works without internet).
const fs = require("fs");
const path = require("path");
const src = path.join(__dirname, "..", "node_modules", "@wllama", "wllama", "esm");
const dst = path.join(__dirname, "..", "www", "vendor", "wllama");
fs.mkdirSync(dst, { recursive: true });
fs.copyFileSync(path.join(src, "index.js"), path.join(dst, "index.js"));
fs.copyFileSync(path.join(src, "wasm", "wllama.wasm"), path.join(dst, "wllama.wasm"));
console.log("wllama copied to www/vendor/wllama");
