const jwt = require("jsonwebtoken");
const crypto = require("crypto");
const fs = require("fs");
const path = require("path");
require("dotenv/config");

console.log("🔐 Generating fresh JWT token...");
console.log("JWT_SECRET from env:", process.env.JWT_SECRET);

// Use the JWT secret from environment - no fallback for security
const secret = process.env.JWT_SECRET;
if (!secret) {
  console.error("❌ JWT_SECRET environment variable is required!");
  process.exit(1);
}
console.log("Using secret:", secret.substring(0, 10) + "...");
console.log("✅ Using proper secret from environment");

// Generate random JWT ID for uniqueness
const jti = crypto.randomBytes(16).toString("hex");

const payload = {
  userId: "user-123",
  role: "user",
  jti: jti, // JWT ID for uniqueness
  sessionId: crypto.randomBytes(8).toString("hex"), // Additional randomness
};

const options = {
  expiresIn: "7d", // Token expires in 7 days
  issuer: "flyer-sync-backend",
  audience: "flyer-sync-frontend",
};

const token = jwt.sign(payload, secret, options);

console.log("\n✅ Generated JWT Token:");
console.log(token);

// Verify it works
try {
  const decoded = jwt.verify(token, secret);
  console.log("\n✅ Token verification successful:");
  console.log(JSON.stringify(decoded, null, 2));

  // Update frontend .env file automatically
  const frontendEnvPath = path.join(__dirname, "../flyer-sync/.env");
  const backendEnvPath = path.join(__dirname, ".env");

  // Get ngrok domain from environment
  const ngrokDomain = process.env.NGROK_DOMAIN;
  const apiUrl = `https://${ngrokDomain}/trpc`;

  console.log(`📡 Using ngrok domain: ${ngrokDomain}`);

  // Update frontend .env
  const frontendEnvContent = `# Frontend Environment Variables
EXPO_PUBLIC_API_BASE_URL=${apiUrl}
EXPO_PUBLIC_JWT_TOKEN=${token}
`;

  try {
    fs.writeFileSync(frontendEnvPath, frontendEnvContent);
    console.log(`\n🔄 Updated frontend .env file: ${frontendEnvPath}`);
    console.log(`📱 API URL: ${apiUrl}`);
    console.log(
      `🎫 Token expires: ${new Date(decoded.exp * 1000).toLocaleString()}`
    );
  } catch (e) {
    console.log(`\n❌ Could not update frontend .env: ${e.message}`);
    console.log(
      "Please manually update the frontend .env file with this token:"
    );
    console.log(token);
  }
} catch (e) {
  console.log("\n❌ Token verification failed:", e.message);
}
