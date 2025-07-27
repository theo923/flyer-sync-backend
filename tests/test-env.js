require("dotenv/config");
console.log("Environment variables:");
console.log("JWT_SECRET:", process.env.JWT_SECRET);
console.log("PORT:", process.env.PORT);
console.log(
  "NGROK_AUTH_TOKEN:",
  process.env.NGROK_AUTH_TOKEN ? "SET" : "NOT SET"
);
