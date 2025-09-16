import mongoose from "mongoose";
import jwt from "jsonwebtoken";

// USER MODEL (Farmers and Admins)
const userSchema = new mongoose.Schema(
  {
    mobileNumber: {
      type: String,
      required: true,
      unique: true, // automatically creates unique index
    },
    role: {
      type: String,
      enum: ["farmer", "admin"],
      required: true,
      default: "farmer",
    },
    name: {
      type: String,
      required: true,
      trim: true,
      maxlength: 100,
    },

    // OTP verification
    isVerified: {
      type: Boolean,
      default: true, // admin by default verified, farmer only after OTP
    },

    profileImage: {
      type: String, // URL to profile image
      default: null,
    },
    state: {
      type: String,
      required: function () {
        return this.role === "farmer";
      },
    },
    district: {
      type: String,
      required: function () {
        return this.role === "farmer";
      },
    },
    preferredLanguage: {
      type: String,
      enum: ["Hindi", "English"],
    },

    // Tokens
    refreshToken: {
      type: String,
      select: false,
    },

    crops: [
      {
        type: mongoose.Schema.Types.ObjectId,
        ref: "Crop", // should reference Crop, not User
      },
    ],
  },
  {
    timestamps: true,
  }
);


userSchema.index({ createdAt: -1 });

// Instance Methods
userSchema.methods.isFarmer = function () {
  return this.role === "farmer";
};

userSchema.methods.isAdmin = function () {
  return this.role === "admin";
};

// Generate Access Token
userSchema.methods.generateAccessToken = function () {
  return jwt.sign(
    {
      id: this._id,
      mobileNumber: this.mobileNumber,
      name: this.name,
    },
    process.env.ACCESS_TOKEN_SECRET_KEY,
    {
      expiresIn: process.env.ACCESS_TOKEN_EXPIRY,
    }
  );
};

// Generate Refresh Token
userSchema.methods.generateRefreshToken = function () {
  return jwt.sign(
    {
      id: this._id,
    },
    process.env.REFRESH_TOKEN_SECRET_KEY,
    {
      expiresIn: process.env.REFRESH_TOKEN_EXPIRY,
    }
  );
};

export const User = mongoose.model("User", userSchema);
