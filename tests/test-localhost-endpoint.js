const http = require("http");

const newToken =
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJ1c2VySWQiOiJ1c2VyLTEyMyIsInJvbGUiOiJ1c2VyIiwianRpIjoiOTllNGM0NTI0NjIyMWE3OGJiNDg0NmNkYWYyODI4ODQiLCJzZXNzaW9uSWQiOiJmYWU5YWRkODE5NzFkNjQ1IiwiaWF0IjoxNzUzNTc5MTAwLCJleHAiOjE3NTQxODM5MDAsImF1ZCI6ImZseWVyLXN5bmMtZnJvbnRlbmQiLCJpc3MiOiJmbHllci1zeW5jLWJhY2tlbmQifQ.DxVIAORpM2in9KtfQglTtumnrqGN-pnImsWZFBTuiMs";

console.log("🧪 Testing localhost endpoint (port 4001)...");

const options = {
  hostname: "localhost",
  port: 4001,
  path: "/trpc/getReceipts",
  method: "GET",
  headers: {
    Authorization: `Bearer ${newToken}`,
    "Content-Type": "application/json",
  },
};

const req = http.request(options, (res) => {
  console.log(`✅ LOCALHOST STATUS: ${res.statusCode}`);
  console.log(`📋 HEADERS: ${JSON.stringify(res.headers, null, 2)}`);

  let data = "";
  res.on("data", (chunk) => {
    data += chunk;
  });

  res.on("end", () => {
    console.log("📄 RESPONSE:", data);
    console.log("\n🎉 Localhost test completed!");
  });
});

req.on("error", (error) => {
  console.error("❌ LOCALHOST ERROR:", error.message);
});

req.end();
