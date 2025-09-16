import mongoose from "mongoose";

const otpSchema = new mongoose.Schema(
    {
        mobileNumber: {
            type: String,
            required: true
        },
        otp: {
            type: String,
            required: true,
        },
        attempts: {
            type: Number,
            default: 0
        },
        lastAttempt: {
            type: Date,
        },
        expiresAt: {
            type: Date,
            default: () => Date.now() + 5 * 60 * 1000, // expires in 5 minutes
        },

    },
    {
        timestamps: true,
    }
);


otpSchema.pre("save", function (next) {
  if (this.isModified("otp")) {
    this.expiresAt = new Date(Date.now() + 5 * 60 * 1000); // extend 5 min
  }
  next();
});

export const OTP = mongoose.model("OTP", otpSchema);

