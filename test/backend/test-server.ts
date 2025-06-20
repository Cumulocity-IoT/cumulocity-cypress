import express from "express";
import cookieParser from "cookie-parser";

import path from "path";

const app = express();

app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(cookieParser());

app.use(
  express.static("./test/cypress/app", {
    etag: false,
    lastModified: false,
    setHeaders: setCustomHeaders,
  })
);

app.post("/tenant/oauth", (req, res) => {
  // set cookies for the session
  res.cookie("authorization", "eyJhbGciOiJ", {
    domain: "localhost",
    path: "/",
    httpOnly: true,
  });
  res.cookie("XSRF-TOKEN", "pQWAHZQfhLRcDVqVsCjV", {
    domain: "localhost",
    path: "/",
  });
  res.send();
});

app.all("/*", (req, res) => {
  res.json({
    request: {
      headers: req.headers,
      body: req.body,
      cookies: req.cookies,
      method: req.method,
      url: req.url,
      auth: req.headers.authorization || req.headers.Authorization,
    },
  });
});

const PORT = 8080;
app.listen(PORT, '0.0.0.0', (error?: Error) => {
  if (error) {
    console.error('Test server failed to start:', error);
    process.exit(1);
  } else {
    console.log(`Cypress test backend running on http://localhost:${PORT}`);
  }
});

function setCustomHeaders(res: express.Response, filePath: string) {
  if (path.extname(filePath) === "") {
    res.setHeader("content-type", "application/json");
  }
}
