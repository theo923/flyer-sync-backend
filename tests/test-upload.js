const https = require("https");
require("dotenv").config({ path: "../.env" });

// Create a small test image in base64 (1x1 pixel white JPEG)
const testImageBase64 =
  "/9j/4AAQSkZJRgABAQEAYABgAAD/2wBDAAEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQH/2wBDAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQH/wAARCAABAAEDASIAAhEBAxEB/8QAFQABAQAAAAAAAAAAAAAAAAAAAAv/xAAUEAEAAAAAAAAAAAAAAAAAAAAA/8QAFQEBAQAAAAAAAAAAAAAAAAAAAAX/xAAUEQEAAAAAAAAAAAAAAAAAAAAA/9oADAMBAAIRAxEAPwA/8A8A";

const currentToken =
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJ1c2VySWQiOiJ1c2VyLTEyMyIsInJvbGUiOiJ1c2VyIiwianRpIjoiYTZiMDkyNzRmM2E3YWU3MjBkZjJiZDZlZWVlMDZhNGYiLCJzZXNzaW9uSWQiOiI2NWE1NTgzNjBhOWM1YzU1IiwiaWF0IjoxNzUzNTc5MjU1LCJleHAiOjE3NTQxODQwNTUsImF1ZCI6ImZseWVyLXN5bmMtZnJvbnRlbmQiLCJpc3MiOiJmbHllci1zeW5jLWJhY2tlbmQifQ.7SyOcg3qs0dIDOKlR_uogn2e7mgKPy9ZgmU1gT35iY8";

const postData = JSON.stringify({
  imageBase64: testImageBase64,
});

const ngrokDomain = process.env.NGROK_DOMAIN;

console.log("🧪 Testing upload functionality...");
console.log(`📡 Using domain: ${ngrokDomain}`);

const options = {
  hostname: ngrokDomain,
  port: 443,
  path: "/trpc/uploadReceipt",
  method: "POST",
  headers: {
    Authorization: `Bearer ${currentToken}`,
    "Content-Type": "application/json",
    "Content-Length": Buffer.byteLength(postData),
    "ngrok-skip-browser-warning": "true",
  },
};

const req = https.request(options, (res) => {
  console.log(`✅ UPLOAD STATUS: ${res.statusCode}`);
  console.log(`📋 HEADERS: ${JSON.stringify(res.headers, null, 2)}`);

  let data = "";
  res.on("data", (chunk) => {
    data += chunk;
  });

  res.on("end", () => {
    console.log("📄 RESPONSE:", data);
    if (res.statusCode === 200) {
      console.log("🎉 Upload test successful!");
    } else {
      console.log("❌ Upload test failed");
    }
  });
});

req.on("error", (error) => {
  console.error("❌ UPLOAD ERROR:", error.message);
});

req.write(postData);
req.end();
