const express = require("express");
const fs = require("fs");
const path = require("path");
const app = express();
const PORT = 3000;

const tokenFile = path.join(__dirname, "tokenStore.json");

app.use(express.static(path.join(__dirname, "../public")));
app.use(express.json());

app.get("/api/token/:token", (req, res) => {
  const tokenData = JSON.parse(fs.readFileSync(tokenFile));
  const token = req.params.token;
  const found = tokenData.find((t) => t.token === token);

  if (!found || found.redeemed) {
    return res.json({ valid: false });
  }

  res.json({ valid: true, result: found.result });
});

app.post("/api/verify/:token", (req, res) => {
  const tokenData = JSON.parse(fs.readFileSync(tokenFile));
  const token = req.params.token;
  const found = tokenData.find((t) => t.token === token);

  if (!found || found.redeemed || found.result !== "win") {
    return res.json({ success: false });
  }

  found.redeemed = true;
  fs.writeFileSync(tokenFile, JSON.stringify(tokenData, null, 2));
  res.json({ success: true });
});

app.listen(PORT, () => {
  console.log(`✅ Server running at http://localhost:${PORT}`);
});
