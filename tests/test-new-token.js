const http = require("http");

const options = {
  hostname: "localhost",
  port: 4001,
  path: "/trpc/getReceipts",
  method: "GET",
  headers: {
    Authorization:
      "Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJ1c2VySWQiOiJ1c2VyLTEyMyIsInJvbGUiOiJ1c2VyIiwianRpIjoiYTM1YjQ3ODdmODk0NDA5ZDljYzIwMDE2YTgxOTExY2YiLCJzZXNzaW9uSWQiOiI4MTYzMTIwMzRjM2FkMTEyIiwiaWF0IjoxNzUzNTc4OTc2LCJleHAiOjE3NTQxODM3NzYsImF1ZCI6ImZseWVyLXN5bmMtZnJvbnRlbmQiLCJpc3MiOiJmbHllci1zeW5jLWJhY2tlbmQifQ.MZLIBNL55MK08guFWi5xAUWhtK-R5IU-3Jsenn3UrhU",
    "Content-Type": "application/json",
  },
};

const req = http.request(options, (res) => {
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
