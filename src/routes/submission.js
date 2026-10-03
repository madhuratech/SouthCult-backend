import express from "express";
import multer from "multer";
import pool from "../config/database.js";
import transporter from "../config/mailer.js";
import { otpStore } from "./otp.js";

const router = express.Router();

// ==================================================
// CONFIG
// ==================================================

const MAX_EMAIL_ATTACHMENT_SIZE = 20 * 1024 * 1024; // 20 MB

const ALLOWED_FILE_TYPES = [
  "audio/mpeg",
  "audio/wav",
  "audio/x-wav",
  "audio/wave",
  "video/mp4",
  "video/quicktime",
  "application/pdf",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
];

const ALLOWED_CATEGORIES = [
  "Music",
  "Film",
  "Documentary",
  "Script",
  "Visual Art",
];

// ==================================================
// MULTER
// ==================================================
// Files are kept in memory because they are directly
// attached to the emails. No Cloudinary upload is used.
// ==================================================

const upload = multer({
  storage: multer.memoryStorage(),

  limits: {
    fileSize: MAX_EMAIL_ATTACHMENT_SIZE,
  },

  fileFilter: (req, file, cb) => {
    if (!ALLOWED_FILE_TYPES.includes(file.mimetype)) {
      return cb(
        new Error(
          `Unsupported file type: ${file.mimetype}`
        )
      );
    }

    cb(null, true);
  },
});

// ==================================================
// EMAIL VERIFICATION MIDDLEWARE
// ==================================================

function requireEmailVerification(req, res, next) {
  try {
    const email = String(req.body.email || "")
      .trim()
      .toLowerCase();

    const verificationToken = String(
      req.body.verificationToken || ""
    ).trim();

    console.log("\n======================================");
    console.log("SUBMISSION VERIFICATION");
    console.log("======================================");

    console.log("Email:", email);
    console.log(
      "Token exists:",
      Boolean(verificationToken)
    );
    console.log(
      "Token length:",
      verificationToken.length
    );

    if (!email) {
      return res.status(400).json({
        success: false,
        message: "Email is required.",
      });
    }

    if (!verificationToken) {
      return res.status(400).json({
        success: false,
        message:
          "Email verification token is required.",
      });
    }

    const record = otpStore.get(email);

    console.log(
      "OTP store has email:",
      otpStore.has(email)
    );

    if (!record) {
      console.log("No OTP record found.");

      return res.status(400).json({
        success: false,
        message:
          "Email verification expired. Please verify your email again.",
      });
    }

    console.log("OTP record found.");
    console.log(
      "Verified:",
      record.verified
    );
    console.log(
      "Has verification token:",
      Boolean(record.verificationToken)
    );
    console.log(
      "Has verifiedAt:",
      Boolean(record.verifiedAt)
    );

    // ------------------------------------------
    // CHECK VERIFIED
    // ------------------------------------------

    if (!record.verified) {
      return res.status(400).json({
        success: false,
        message:
          "Please verify your email before submitting.",
      });
    }

    // ------------------------------------------
    // CHECK VERIFIED AT
    // ------------------------------------------

    if (!record.verifiedAt) {
      return res.status(400).json({
        success: false,
        message:
          "Email verification is incomplete. Please verify again.",
      });
    }

    // ------------------------------------------
    // CHECK VERIFICATION TOKEN
    // ------------------------------------------

    if (
      !record.verificationToken ||
      record.verificationToken !== verificationToken
    ) {
      console.log(
        "Verification token mismatch."
      );

      return res.status(400).json({
        success: false,
        message:
          "Email verification token is invalid.",
      });
    }

    // ------------------------------------------
    // TOKEN EXPIRY
    // ------------------------------------------

    const verifiedAt = new Date(
      record.verifiedAt
    ).getTime();

    const verificationAge =
      Date.now() - verifiedAt;

    const verificationExpiry =
      15 * 60 * 1000; // 15 minutes

    if (
      verificationAge >
      verificationExpiry
    ) {
      console.log(
        "Email verification token expired."
      );

      otpStore.delete(email);

      return res.status(400).json({
        success: false,
        message:
          "Email verification expired. Please verify again.",
      });
    }

    console.log(
      "✅ Email verification successful."
    );

    req.verifiedEmail = email;

    next();
  } catch (error) {
    console.error(
      "Verification middleware error:",
      error
    );

    return res.status(500).json({
      success: false,
      message:
        "Email verification failed.",
    });
  }
}

// ==================================================
// POST /api/submissions
// ==================================================

router.post(
  "/",
  upload.single("file"),
  requireEmailVerification,

  async (req, res) => {
    try {
      console.log("\n======================================");
      console.log("NEW SUBMISSION");
      console.log("======================================");

      // ==================================================
      // FORM DATA
      // ==================================================

      const name = String(
        req.body.name || ""
      ).trim();

      const normalizedEmail = String(
        req.body.email || ""
      )
        .trim()
        .toLowerCase();

      const phone = String(
        req.body.phone || ""
      ).trim();

      const city = String(
        req.body.city || ""
      ).trim();

      const category = String(
        req.body.category || ""
      ).trim();

      const title = String(
        req.body.title || ""
      ).trim();

      const about = String(
        req.body.about || ""
      ).trim();

      const portfolio = String(
        req.body.portfolio || ""
      ).trim();

      // ==================================================
      // LOG
      // ==================================================

      console.log("Name:", name);
      console.log("Email:", normalizedEmail);
      console.log("Phone:", phone);
      console.log("City:", city);
      console.log("Category:", category);
      console.log("Title:", title);
      console.log(
        "Portfolio:",
        portfolio
      );

      // ==================================================
      // BASIC VALIDATION
      // ==================================================

      if (!name) {
        return res.status(400).json({
          success: false,
          message: "Name is required.",
        });
      }

      if (!normalizedEmail) {
        return res.status(400).json({
          success: false,
          message: "Email is required.",
        });
      }

      if (!phone) {
        return res.status(400).json({
          success: false,
          message: "Phone number is required.",
        });
      }

      if (!category) {
        return res.status(400).json({
          success: false,
          message: "Category is required.",
        });
      }

      // ==================================================
      // CHECK VERIFIED EMAIL
      // ==================================================

      if (
        normalizedEmail !==
        req.verifiedEmail
      ) {
        console.log(
          "Email mismatch:",
          normalizedEmail,
          req.verifiedEmail
        );

        return res.status(400).json({
          success: false,
          message:
            "Submitted email does not match the verified email.",
        });
      }

      // ==================================================
      // CATEGORY VALIDATION
      // ==================================================

      if (
        !ALLOWED_CATEGORIES.includes(
          category
        )
      ) {
        return res.status(400).json({
          success: false,
          message:
            "Invalid submission category.",
        });
      }

      // ==================================================
      // FILE VALIDATION
      // ==================================================

      if (!req.file) {
        return res.status(400).json({
          success: false,
          message:
            "Please upload a file.",
        });
      }

      console.log("\nFILE INFORMATION");
      console.log(
        "Original name:",
        req.file.originalname
      );
      console.log(
        "Mimetype:",
        req.file.mimetype
      );
      console.log(
        "Size:",
        req.file.size
      );

      // ==================================================
      // MIME TYPE
      // ==================================================

      if (
        !ALLOWED_FILE_TYPES.includes(
          req.file.mimetype
        )
      ) {
        return res.status(400).json({
          success: false,
          message:
            "This file type is not allowed.",
        });
      }

      // ==================================================
      // EMPTY FILE
      // ==================================================

      if (
        !req.file.buffer ||
        req.file.buffer.length === 0
      ) {
        return res.status(400).json({
          success: false,
          message:
            "Uploaded file is empty.",
        });
      }

      // ==================================================
      // FILE SIZE
      // ==================================================

      if (
        req.file.size >
        MAX_EMAIL_ATTACHMENT_SIZE
      ) {
        return res.status(400).json({
          success: false,
          message:
            "File size must be 20 MB or less.",
        });
      }

      // ==================================================
      // DATABASE INSERT
      // ==================================================

      console.log(
        "\nSaving submission to MySQL..."
      );

      const [result] = await pool.execute(
        `
        INSERT INTO submissions (
          name,
          email,
          phone,
          city,
          category,
          title,
          about,
          portfolio,
          file_name,
          file_type,
          file_size,
          cloudinary_public_id,
          cloudinary_url
        )
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `,
        [
          name,
          normalizedEmail,
          phone,
          city,
          category,
          title,
          about,
          portfolio,
          req.file.originalname,
          req.file.mimetype,
          req.file.size,

          // Cloudinary no longer used
          null,
          null,
        ]
      );

      console.log(
        "✅ Submission saved to MySQL."
      );

      console.log(
        "Submission ID:",
        result.insertId
      );

      // ==================================================
      // COMMON ATTACHMENT
      // ==================================================

      const attachment = {
        filename: req.file.originalname,
        content: req.file.buffer,
        contentType: req.file.mimetype,
      };

      // ==================================================
      // SEND CONFIRMATION EMAIL TO SUBMITTER
      // ==================================================

      console.log(
        "\nSending confirmation email to submitter..."
      );

      await transporter.sendMail({
        from: `"SouthCult" <${process.env.EMAIL_USER}>`,

        to: normalizedEmail,

        subject:
          "SouthCult — Your Work Submission",

        attachments: [attachment],

        html: `
          <div
            style="
              font-family: Arial, sans-serif;
              line-height: 1.6;
              color: #111;
              max-width: 650px;
              margin: auto;
            "
          >

            <h2>
              Thank you for submitting your work to SouthCult.
            </h2>

            <p>
              Hi ${name},
            </p>

            <p>
              We have successfully received your submission.
            </p>

            <p>
              <strong>Submission ID:</strong>
              ${result.insertId}
            </p>

            <p>
              <strong>Category:</strong>
              ${category}
            </p>

            <p>
              <strong>Title:</strong>
              ${title || "Untitled Project"}
            </p>

            <p>
              Your uploaded file is attached to this email
              for your reference.
            </p>

            <p>
              Our team will review your submission.
            </p>

            <p>
              Regards,<br />
              <strong>SouthCult</strong>
            </p>

          </div>
        `,
      });

      console.log(
        "✅ Confirmation email sent to submitter."
      );

      // ==================================================
      // SEND SUBMISSION EMAIL TO CLIENT
      // ==================================================

      console.log(
        "\nSending submission email to client..."
      );

      await transporter.sendMail({
        from:
          `"SouthCult Submissions" <${process.env.EMAIL_USER}>`,

        to: process.env.CLIENT_EMAIL,

        subject:
          `New Work Submission — ${category} — ${
            title || "Untitled Project"
          }`,

        attachments: [attachment],

        html: `
          <div
            style="
              font-family: Arial, sans-serif;
              line-height: 1.6;
              color: #111;
              max-width: 700px;
              margin: auto;
            "
          >

            <h2>
              New SouthCult Work Submission
            </h2>

            <hr />

            <h3>
              Submission Details
            </h3>

            <p>
              <strong>Submission ID:</strong>
              ${result.insertId}
            </p>

            <p>
              <strong>Name:</strong>
              ${name}
            </p>

            <p>
              <strong>Email:</strong>
              ${normalizedEmail}
            </p>

            <p>
              <strong>Phone:</strong>
              ${phone}
            </p>

            <p>
              <strong>City:</strong>
              ${city || "Not provided"}
            </p>

            <p>
              <strong>Category:</strong>
              ${category}
            </p>

            <p>
              <strong>Title:</strong>
              ${title || "Untitled Project"}
            </p>

            <p>
              <strong>About:</strong>
            </p>

            <p>
              ${about || "Not provided"}
            </p>

            <p>
              <strong>Portfolio:</strong>
              ${
                portfolio
                  ? `<a href="${portfolio}">
                      ${portfolio}
                    </a>`
                  : "Not provided"
              }
            </p>

            <hr />

            <h3>
              Uploaded File
            </h3>

            <p>
              <strong>File name:</strong>
              ${req.file.originalname}
            </p>

            <p>
              <strong>File type:</strong>
              ${req.file.mimetype}
            </p>

            <p>
              <strong>File size:</strong>
              ${(
                req.file.size /
                (1024 * 1024)
              ).toFixed(2)} MB
            </p>

            <p>
              The uploaded file is attached to this email.
            </p>

          </div>
        `,
      });

      console.log(
        "✅ Submission email sent to client."
      );

      // ==================================================
      // INVALIDATE OTP
      // ==================================================

      otpStore.delete(
        normalizedEmail
      );

      console.log(
        "Email verification token invalidated."
      );

      // ==================================================
      // SUCCESS
      // ==================================================

      console.log(
        "\n======================================"
      );
      console.log(
        "✅ SUBMISSION COMPLETED SUCCESSFULLY"
      );
      console.log(
        "======================================\n"
      );

      return res.status(201).json({
        success: true,

        message:
          "Your submission has been received successfully.",

        submissionId:
          result.insertId,
      });
    } catch (error) {
      console.error(
        "\n======================================"
      );

      console.error(
        "❌ SUBMISSION ERROR"
      );

      console.error(
        "======================================"
      );

      console.error(error);

      return res.status(500).json({
        success: false,
        message:
          "Something went wrong while submitting your work.",
      });
    }
  }
);

// ==================================================
// MULTER ERROR HANDLER
// ==================================================

router.use(
  (error, req, res, next) => {
    if (
      error instanceof multer.MulterError
    ) {
      if (
        error.code === "LIMIT_FILE_SIZE"
      ) {
        return res.status(400).json({
          success: false,
          message:
            "File size must be 20 MB or less.",
        });
      }

      return res.status(400).json({
        success: false,
        message:
          error.message ||
          "File upload failed.",
      });
    }

    if (error) {
      console.error(
        "Upload error:",
        error
      );

      return res.status(400).json({
        success: false,
        message:
          error.message ||
          "File upload failed.",
      });
    }

    next();
  }
);

export default router;