import express from "express";
import crypto from "crypto";
import nodemailer from "nodemailer";

const router = express.Router();

// -----------------------------------------
// OTP STORAGE
// -----------------------------------------

const otpStore = new Map();

// -----------------------------------------
// MAILER
// -----------------------------------------

const transporter = nodemailer.createTransport({
  host: process.env.SMTP_HOST || "smtp.gmail.com",
  port: Number(process.env.SMTP_PORT || 587),
  secure: process.env.SMTP_SECURE === "true",

  auth: {
    user: process.env.EMAIL_USER,
    pass: process.env.EMAIL_APP_PASSWORD,
  },
});

// -----------------------------------------
// HELPERS
// -----------------------------------------

function normalizeEmail(email) {
  return String(email || "")
    .trim()
    .toLowerCase();
}

function generateOTP() {
  return crypto
    .randomInt(100000, 1000000)
    .toString();
}

function generateVerificationToken() {
  return crypto.randomBytes(32).toString("hex");
}

// -----------------------------------------
// SEND OTP
// -----------------------------------------

router.post("/send", async (req, res) => {
  try {
    const email = normalizeEmail(req.body.email);

    if (!email) {
      return res.status(400).json({
        success: false,
        message: "Email address is required.",
      });
    }

    // Correct email validation
    const emailRegex =
      /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/i;

    if (!emailRegex.test(email)) {
      return res.status(400).json({
        success: false,
        message: "Please enter a valid email address.",
      });
    }

    // -----------------------------------------
    // RATE LIMIT RESEND
    // -----------------------------------------

    const existing = otpStore.get(email);

    if (existing) {
      const secondsSinceLastSent =
        (Date.now() - existing.createdAt) / 1000;

      if (secondsSinceLastSent < 30) {
        const remaining = Math.ceil(
          30 - secondsSinceLastSent
        );

        return res.status(429).json({
          success: false,
          message: `Please wait ${remaining} seconds before requesting another OTP.`,
        });
      }
    }

    // -----------------------------------------
    // GENERATE OTP
    // -----------------------------------------

    const otp = generateOTP();

    const expiryMinutes = Number(
      process.env.OTP_EXPIRY_MINUTES || 10
    );

    const expiresAt =
      Date.now() + expiryMinutes * 60 * 1000;

    // -----------------------------------------
    // STORE OTP
    // -----------------------------------------

    otpStore.set(email, {
      otp,
      createdAt: Date.now(),
      expiresAt,
      attempts: 0,
      verified: false,
      verificationToken: null,
    });

    // -----------------------------------------
    // SEND EMAIL
    // -----------------------------------------

    await transporter.sendMail({
      from:
        process.env.FROM_EMAIL ||
        process.env.EMAIL_USER,

      to: email,

      subject:
        "South Cult — Email Verification",

      text:
        `Your South Cult verification code is ${otp}. ` +
        `This code expires in ${expiryMinutes} minutes.`,

      html: `
        <div style="
          font-family: Arial, sans-serif;
          background: #050505;
          color: #ffffff;
          padding: 40px;
        ">
          <div style="
            max-width: 500px;
            margin: auto;
          ">

            <h1 style="
              font-size: 28px;
              margin-bottom: 10px;
            ">
              South Cult
            </h1>

            <p style="
              color: #999999;
            ">
              Email verification
            </p>

            <p>
              Use the verification code below
              to continue your submission.
            </p>

            <div style="
              background: #111111;
              border: 1px solid #333333;
              padding: 20px;
              text-align: center;
              margin: 30px 0;
            ">

              <span style="
                font-size: 32px;
                font-weight: bold;
                letter-spacing: 8px;
              ">
                ${otp}
              </span>

            </div>

            <p style="
              color: #999999;
              font-size: 13px;
            ">
              This code expires in
              ${expiryMinutes} minutes.
            </p>

            <p style="
              color: #777777;
              font-size: 12px;
            ">
              If you did not request this code,
              you can safely ignore this email.
            </p>

          </div>
        </div>
      `,
    });

    console.log(`✅ OTP sent to ${email}`);

    return res.status(200).json({
      success: true,
      message: `OTP has been sent to ${email}.`,
    });

  } catch (error) {
    console.error("Send OTP error:", error);

    return res.status(500).json({
      success: false,
      message:
        "Unable to send OTP. Please try again.",
    });
  }
});

// -----------------------------------------
// VERIFY OTP
// -----------------------------------------

router.post("/verify", async (req, res) => {
  try {
    const email = normalizeEmail(req.body.email);

    const otp = String(
      req.body.otp || ""
    ).trim();

    if (!email || !otp) {
      return res.status(400).json({
        success: false,
        message: "Email and OTP are required.",
      });
    }

    const record = otpStore.get(email);

    if (!record) {
      return res.status(400).json({
        success: false,
        message:
          "No OTP found. Please request a new OTP.",
      });
    }

    // -----------------------------------------
    // EXPIRY
    // -----------------------------------------

    if (Date.now() > record.expiresAt) {
      otpStore.delete(email);

      return res.status(400).json({
        success: false,
        message:
          "OTP has expired. Please request a new OTP.",
      });
    }

    // -----------------------------------------
    // MAX ATTEMPTS
    // -----------------------------------------

    if (record.attempts >= 5) {
      otpStore.delete(email);

      return res.status(429).json({
        success: false,
        message:
          "Too many incorrect attempts. Please request a new OTP.",
      });
    }

    // -----------------------------------------
    // CHECK OTP
    // -----------------------------------------

    if (record.otp !== otp) {
      record.attempts += 1;

      return res.status(400).json({
        success: false,
        message:
          "Invalid OTP. Please try again.",
      });
    }

    // -----------------------------------------
    // VERIFIED
    // -----------------------------------------

    const verificationToken =
      generateVerificationToken();

    record.verified = true;
    record.verificationToken = verificationToken;
    record.verifiedAt = Date.now();

    otpStore.set(email, record);

    return res.status(200).json({
      success: true,
      message:
        "Email verified successfully.",
      verificationToken,
    });

  } catch (error) {
    console.error(
      "Verify OTP error:",
      error
    );

    return res.status(500).json({
      success: false,
      message:
        "Unable to verify OTP.",
    });
  }
});

// -----------------------------------------
// EXPORT OTP STORE
// -----------------------------------------

export { otpStore };

export default router;
