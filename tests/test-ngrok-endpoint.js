const https = require("https");
require("dotenv").config({ path: require("path").join(__dirname, "../.env") });

const newToken =
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJ1c2VySWQiOiJ1c2VyLTEyMyIsInJvbGUiOiJ1c2VyIiwianRpIjoiOTllNGM0NTI0NjIyMWE3OGJiNDg0NmNkYWYyODI4ODQiLCJzZXNzaW9uSWQiOiJmYWU5YWRkODE5NzFkNjQ1IiwiaWF0IjoxNzUzNTc5MTAwLCJleHAiOjE3NTQxODM5MDAsImF1ZCI6ImZseWVyLXN5bmMtZnJvbnRlbmQiLCJpc3MiOiJmbHllci1zeW5jLWJhY2tlbmQifQ.DxVIAORpM2in9KtfQglTtumnrqGN-pnImsWZFBTuiMs";

const ngrokDomain = process.env.NGROK_DOMAIN;

console.log("🌐 Testing ngrok endpoint...");
console.log(`📡 Using domain: ${ngrokDomain}`);

const options = {
  hostname: ngrokDomain,
  port: 443,
  path: "/trpc/getReceipts",
  method: "GET",
  headers: {
    Authorization: `Bearer ${newToken}`,
    "Content-Type": "application/json",
    "ngrok-skip-browser-warning": "true",
  },
};

const req = https.request(options, (res) => {
  console.log(`✅ NGROK STATUS: ${res.statusCode}`);
  console.log(`📋 HEADERS: ${JSON.stringify(res.headers, null, 2)}`);

  let data = "";
  res.on("data", (chunk) => {
    data += chunk;
  });

  res.on("end", () => {
    console.log("📄 RESPONSE:", data);
    console.log("\n🎉 Ngrok test completed!");
  });
});

req.on("error", (error) => {
  console.error("❌ NGROK ERROR:", error.message);
});

req.end();
