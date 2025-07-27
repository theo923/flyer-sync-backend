const jwt = require("jsonwebtoken");
require("dotenv").config();

if (!process.env.JWT_SECRET) {
  console.error("❌ JWT_SECRET environment variable is required!");
  process.exit(1);
}

const token =
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJ1c2VySWQiOiJ1c2VyLTEyMyIsInJvbGUiOiJ1c2VyIiwianRpIjoiYTZiMDkyNzRmM2E3YWU3MjBkZjJiZDZlZWVlMDZhNGYiLCJzZXNzaW9uSWQiOiI2NWE1NTgzNjBhOWM1YzU1IiwiaWF0IjoxNzUzNTc5MjU1LCJleHAiOjE3NTQxODQwNTUsImF1ZCI6ImZseWVyLXN5bmMtZnJvbnRlbmQiLCJpc3MiOiJmbHllci1zeW5jLWJhY2tlbmQifQ.7SyOcg3qs0dIDOKlR_uogn2e7mgKPy9ZgmU1gT35iY8";

console.log("🧪 Testing frontend token validity...");

try {
  const decoded = jwt.verify(token, process.env.JWT_SECRET);
  console.log("✅ Token is VALID!");
  console.log("👤 User:", decoded.userId);
  console.log("🆔 JTI:", decoded.jti.slice(0, 16) + "...");
  console.log("⏰ Expires:", new Date(decoded.exp * 1000).toLocaleString());
} catch (e) {
  console.log("❌ Token is INVALID:", e.message);
}
