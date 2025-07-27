const https = require("https");
require("dotenv").config({ path: "../.env" });

const ngrokDomain = process.env.NGROK_DOMAIN;

console.log("🧪 Testing ngrok connection...");
console.log(`📡 Using domain: ${ngrokDomain}`);

const options = {
  hostname: ngrokDomain,
  port: 443,
  path: "/trpc/getReceipts",
  method: "GET",
  headers: {
    Authorization:
      "Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJ1c2VySWQiOiJ1c2VyLTEyMyIsInJvbGUiOiJ1c2VyIiwianRpIjoiY2M1YTEyNzJhM2FkZDJlYTM2MWMxNDBmNDNiNDU3YWUiLCJzZXNzaW9uSWQiOiI4OWU3OTk5ZWE0NzIxMWRiIiwiaWF0IjoxNzUzNTc4NDUxLCJleHAiOjE3NTQxODMyNTEsImF1ZCI6ImZseWVyLXN5bmMtZnJvbnRlbmQiLCJpc3MiOiJmbHllci1zeW5jLWJhY2tlbmQifQ.TLER8KPF2vQsDq9fT6i6PoAZlc_82p_OjreNqv8DraQ",
    "Content-Type": "application/json",
    "ngrok-skip-browser-warning": "true",
  },
};

const req = https.request(options, (res) => {
  console.log(`STATUS: ${res.statusCode}`);
  console.log(`HEADERS: ${JSON.stringify(res.headers)}`);

  let data = "";
  res.on("data", (chunk) => {
    data += chunk;
  });

  res.on("end", () => {
    console.log("RESPONSE:", data);
  });
});

req.on("error", (error) => {
  console.error("ERROR:", error.message);
});

req.end();
