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

// Create uploads directory
if (!fs.existsSync(uploadsDirectory)) {
  fs.mkdirSync(uploadsDirectory, {
    recursive: true,
  });
}

// Create data directory
if (!fs.existsSync(dataDirectory)) {
  fs.mkdirSync(dataDirectory, {
    recursive: true,
  });
}

// Create submissions.json
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
  // Production frontend URL from .env
  process.env.FRONTEND_URL,

  // Local development
  "http://localhost:5173",
  "http://localhost:5174",

  // Production frontend
  "https://southcult.com",
  "https://www.southcult.com",
].filter(Boolean);

console.log("Allowed CORS origins:", allowedOrigins);

const corsOptions = {
  origin: (origin, callback) => {
    // Allow requests without an Origin header
    // such as curl, Postman, server-to-server requests, etc.
    if (!origin) {
      return callback(null, true);
    }

    if (allowedOrigins.includes(origin)) {
      return callback(null, true);
    }

    console.error("CORS blocked origin:", origin);

    return callback(
      new Error("Not allowed by CORS")
    );
  },

  methods: [
    "GET",
    "POST",
    "PUT",
    "PATCH",
    "DELETE",
    "OPTIONS",
  ],

  allowedHeaders: [
    "Content-Type",
    "Authorization",
  ],

  credentials: true,

  optionsSuccessStatus: 204,
};

// Apply CORS
app.use(cors(corsOptions));

// Explicitly handle preflight requests
app.options("*", cors(corsOptions));

// -----------------------------------------
// BODY PARSER
// -----------------------------------------

app.use(express.json());

app.use(
  express.urlencoded({
    extended: true,
  })
);

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

app.use(
  "/api/otp",
  otpRouter
);

app.use(
  "/api/submissions",
  submissionRouter
);

// -----------------------------------------
// ERROR HANDLER
// -----------------------------------------

app.use((err, req, res, next) => {
  console.error("Server error:", err);

  // CORS error
  if (err.message === "Not allowed by CORS") {
    return res.status(403).json({
      success: false,
      message:
        "CORS policy blocked this request.",
    });
  }

  // Multer file size error
  if (err.code === "LIMIT_FILE_SIZE") {
    return res.status(413).json({
      success: false,
      message:
        "File size must be less than 500 MB.",
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

