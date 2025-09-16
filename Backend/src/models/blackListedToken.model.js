import mongoose from "mongoose";

const blackListedTokenSchema = new mongoose.Schema(
    {
        token: {
            type: String,
            required: true,
            unique: true
        },
        createdAt: {
            type: Date,
            default: Date.now,
            expires: 86400
        }
    }
)

export const BlackListedToken = mongoose.model("BlackListedToken", blackListedTokenSchema);