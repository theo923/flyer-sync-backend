const http = require("http");

const options = {
  hostname: "localhost",
  port: 4000,
  path: "/trpc/getReceipts",
  method: "GET",
  headers: {
    Authorization:
      "Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJ1c2VySWQiOiJ1c2VyLTEyMyIsInJvbGUiOiJ1c2VyIiwianRpIjoiNDVlZDk5ZTE0Nzk2YzdlOGVlYzI0ZDdjZWUwOWFhYzciLCJzZXNzaW9uSWQiOiIwOTZiOWI5NDU4YWQ2NDdmIiwiaWF0IjoxNzUzNTc3ODk5LCJleHAiOjE3NTQxODI2OTl9.Ni_yy0k4UTigBhbXHggpmoUuXZLHZJia7t1_T0LwZbU",
    "Content-Type": "application/json",
  },
};

console.log("🧪 Testing API with fresh random JWT token...");

const req = http.request(options, (res) => {
  console.log(`📊 Status: ${res.statusCode}`);
  console.log(`📋 Headers: ${JSON.stringify(res.headers, null, 2)}`);

  let data = "";
  res.on("data", (chunk) => {
    data += chunk;
  });

  res.on("end", () => {
    console.log("📄 Response body:", data);
    if (res.statusCode === 200) {
      console.log("\n✅ SUCCESS: Authentication working with random JWT!");
    } else {
      console.log("\n❌ FAILED: Authentication issue");
    }
  });
});

req.on("error", (error) => {
  console.error("❌ Error:", error.message);
});

req.end();
