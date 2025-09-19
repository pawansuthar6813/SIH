// import ApiError from "../utils/ApiError.js";
import ApiError from "../../Shared/utils/ApiError.js";
// import models from "../models/index.js";
import models from "../../models/index.js";

const { otpModel } = models;

export const generateOTP = () => {
    return Math.floor(100000 + Math.random() * 900000).toString(); // 6-digit OTP
};


export const sendOTP = async (mobileNumber, otp) => {
    // Integrate with SMS service like Twilio, AWS SNS, or Indian providers like MSG91, TextLocal
    console.log(`Sending OTP ${otp} to ${mobileNumber}`);

    // Example integration with MSG91 or similar service:
    /*
    const response = await fetch('https://api.msg91.com/api/v5/otp', {
        method: 'POST',
        headers: {
            'authkey': process.env.MSG91_API_KEY,
            'Content-Type': 'application/json'
        },
        body: JSON.stringify({
            template_id: process.env.MSG91_TEMPLATE_ID,
            mobile: `91${mobileNumber}`,
            otp: otp
        })
    });
    */

    return true; // Return success status
};



export const verifyOTP = async (mobileNumber, otp) => {

    const data = await otpModel.findOne({ mobileNumber })

    if (!data) {
        throw new ApiError(404, "OtpNotFoundError", "No otp found in db")
    }

    // Check if OTP is expired
    if (new Date() > data.expiresAt) {
        throw new ApiError(401, "OtpExpired", 'the given otp is expired')
    }


    // Check attempts limit
    // if (otpData.attempts >= 3) {
    //     otpStore.delete(mobileNumber);
    //     return res.status(400).json({
    //         success: false,
    //         message: "Too many invalid attempts",
    //         messageHindi: "बहुत सारे गलत प्रयास"
    //     });
    // }

    if (otp !== data.otp) {
        throw new ApiError(401, "InvalidOtp", "the given otp is invalid")
    }

    otpModel.findOneAndDelete({mobileNumber})

    return true;
};