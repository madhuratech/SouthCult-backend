import "dotenv/config";

import express from "express";
import cors from "cors";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

import otpRouter from "./routes/otp.js";
import submissionRouter from "./routes/submission.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();

const PORT = process.env.PORT || 5000;

// -----------------------------------------
// DIRECTORIES
// -----------------------------------------

const uploadsDirectory = path.join(__dirname, "uploads");
const dataDirectory = path.join(__dirname, "data");
const submissionsFile = path.join(
  dataDirectory,
  "submissions.json"
);

if (!fs.existsSync(uploadsDirectory)) {
  fs.mkdirSync(uploadsDirectory, {
    recursive: true,
  });
}

if (!fs.existsSync(dataDirectory)) {
  fs.mkdirSync(dataDirectory, {
    recursive: true,
  });
}

if (!fs.existsSync(submissionsFile)) {
  fs.writeFileSync(
    submissionsFile,
    JSON.stringify([], null, 2)
  );
}

// -----------------------------------------
// CORS
// -----------------------------------------

const allowedOrigins = [
  process.env.FRONTEND_URL,
  "http://localhost:5173",
  "http://localhost:3000",
].filter(Boolean);

app.use(
  cors({
    origin: (origin, callback) => {
      // Allow Postman/server-side requests
      if (!origin) {
        return callback(null, true);
      }

      if (allowedOrigins.includes(origin)) {
        return callback(null, true);
      }

      callback(
        new Error("Not allowed by CORS")
      );
    },
    methods: ["GET", "POST", "OPTIONS"],
    allowedHeaders: ["Content-Type", "Authorization"],
  })
);

// -----------------------------------------
// BODY PARSER
// -----------------------------------------

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// -----------------------------------------
// STATIC UPLOADS
// -----------------------------------------

app.use(
  "/uploads",
  express.static(uploadsDirectory)
);

// -----------------------------------------
// HEALTH CHECK
// -----------------------------------------

app.get("/", (req, res) => {
  res.json({
    success: true,
    message: "South Cult API is running",
  });
});

// -----------------------------------------
// ROUTES
// -----------------------------------------

app.use("/api/otp", otpRouter);

app.use(
  "/api/submissions",
  submissionRouter
);

// -----------------------------------------
// ERROR HANDLER
// -----------------------------------------

app.use((err, req, res, next) => {
  console.error("Server error:", err);

  if (err.message === "Not allowed by CORS") {
    return res.status(403).json({
      success: false,
      message: "CORS policy blocked this request.",
    });
  }

  if (err.code === "LIMIT_FILE_SIZE") {
    return res.status(413).json({
      success: false,
      message: "File size must be less than 500 MB.",
    });
  }

  return res.status(500).json({
    success: false,
    message:
      err.message ||
      "Internal server error.",
  });
});

// -----------------------------------------
// START SERVER
// -----------------------------------------

app.listen(PORT, () => {
  console.log(
    `South Cult API running on http://localhost:${PORT}`
  );
});