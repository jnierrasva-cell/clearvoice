const fs = require("fs");
const path = require("path");

const srcDir = path.join(__dirname, "..", "node_modules", "@lofcz", "deepfilternet-web", "dist");
const destDir = path.join(__dirname, "..", "public");
const files = ["df_bg.wasm", "worklet.js"];

if (!fs.existsSync(srcDir)) {
  console.warn("[clearvoice] @lofcz/deepfilternet-web not found — run npm install first");
  process.exit(0);
}

fs.mkdirSync(destDir, { recursive: true });

for (const file of files) {
  const src = path.join(srcDir, file);
  const dest = path.join(destDir, file);
  if (fs.existsSync(src)) {
    fs.copyFileSync(src, dest);
    console.log(`[clearvoice] copied ${file} → public/`);
  } else {
    console.warn(`[clearvoice] missing ${src}`);
  }
}
