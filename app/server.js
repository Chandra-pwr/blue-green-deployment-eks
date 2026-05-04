const express = require('express');
const app = express();

const VERSION = process.env.VERSION || "v1";
const COLOR = VERSION === "v1" ? "#2563eb" : "#16a34a";

app.get('/', (req, res) => {
  res.send(`
  <html>
  <head>
    <title>Blue-Green Deployment</title>
    <style>
      body {
        font-family: Arial;
        background: #0f172a;
        color: white;
        display: flex;
        justify-content: center;
        align-items: center;
        height: 100vh;
      }
      .box {
        background: #1e293b;
        padding: 40px;
        border-radius: 10px;
        text-align: center;
      }
      .version {
        color: ${COLOR};
        font-size: 22px;
        font-weight: bold;
      }
    </style>
  </head>
  <body>
    <div class="box">
      <h1>🚀 Blue-Green Deployment</h1>
      <div class="version">Running: ${VERSION}</div>
    </div>
  </body>
  </html>
  `);
});

app.get('/health', (req, res) => res.send("OK"));

app.listen(3000, () => console.log("Server started"));