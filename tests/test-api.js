const http = require("http");

const options = {
  hostname: "localhost",
  port: 4000,
  path: "/trpc/getReceipts",
  method: "GET",
  headers: {
    Authorization:
      "Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJ1c2VySWQiOiJ1c2VyLTEyMyIsInJvbGUiOiJ1c2VyIiwianRpIjoiMDE5ZThmYWYxZDAzNGQxYjE1Yzg3MGYyNTk0NDNjZDIiLCJzZXNzaW9uSWQiOiJlMzI3NzI2NGJmNTAxMWM5IiwiaWF0IjoxNzUzNTc4MTI1LCJleHAiOjE3NTQxODI5MjUsImF1ZCI6ImZseWVyLXN5bmMtZnJvbnRlbmQiLCJpc3MiOiJmbHllci1zeW5jLWJhY2tlbmQifQ.w3wVq4yAA3ShDYL7WeN6VV2hgXPgXKnkVie0v5uSHVY",
    "Content-Type": "application/json",
  },
};

const req = http.request(options, (res) => {
  console.log(`Status: ${res.statusCode}`);
  console.log(`Headers: ${JSON.stringify(res.headers, null, 2)}`);

  let data = "";
  res.on("data", (chunk) => {
    data += chunk;
  });

  res.on("end", () => {
    console.log("Response body:", data);
  });
});

req.on("error", (error) => {
  console.error("Error:", error.message);
});

req.end();
