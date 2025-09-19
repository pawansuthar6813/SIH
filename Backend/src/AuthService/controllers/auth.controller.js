
import catchAsyncError from "../../Shared/utils/catchAsyncError.js";
import ApiError from "../../Shared/utils/ApiError.js";
import ApiResponse from "../../Shared/utils/ApiResponse.js";
import { sendOTP, verifyOTP } from "../services/auth.service.js";
// import { sendOTP } from "../services/auth.service.js";
import { generateOTP } from "../services/auth.service.js";
import generateTokens from "../services/generateTokens.js";
import jwt from 'jsonwebtoken'

import models from "../../models/index.js";

const { userModel, otpModel, blackListedTokenModel } = models;



const sendOtpController = catchAsyncError(async (req, res, next) => {
  const { mobileNumber } = req.body;

  // Validate Indian mobile number
  const mobileRegex = /^[6-9]\d{9}$/;
  if (!mobileRegex.test(mobileNumber)) {
    throw new ApiError(400, "Bad Request", "Invalid mobile number");
  }

  // Check if OTP record exists
  let otpRecord = await otpModel.findOne({ mobileNumber });

  const now = new Date();

  if (otpRecord) {
    // If last attempt is within 5 minutes
    if (otpRecord.lastAttempt && now - otpRecord.lastAttempt < 5 * 60 * 1000) {
      if (otpRecord.attempts >= 3) {
        throw new ApiError(429, "Too Many Requests", "You can only request OTP 3 times within 5 minutes");
      }
      otpRecord.attempts += 1;
    } else {
      // Reset attempts if outside 5 min window
      otpRecord.attempts = 1;
    }

    otpRecord.otp = generateOTP();
    otpRecord.lastAttempt = now;
    await otpRecord.save();
  } else {
    // First time request for this number
    otpRecord = await otpModel.create({
      mobileNumber,
      otp: generateOTP(),
      attempts: 1,
      lastAttempts: now,
    });
  }

  // Send OTP via SMS
  await sendOTP(mobileNumber, otpRecord.otp);

  const response = new ApiResponse(200, "OTP sent successfully", {
    mobileNumber,
    OTP: otpRecord.otp,
    expiresIn: 300,
  });

  res.status(response.statusCode).json(response);
});



const verifyOtpController = catchAsyncError(async (req, res, next) => {
  const { mobileNumber, otp } = req.body;

  await verifyOTP(mobileNumber, otp);

  const user = await userModel.findOne({ mobileNumber });

  let isNewUser = false;
  console.log("isNewUser: ", isNewUser);
  let isCropAdded = false;
  if (!user) isNewUser = true;
  if (user?.crops.length === 0) isCropAdded = false;

  if (!isNewUser) {
    const { accessToken, refreshToken } = await generateTokens(user);

    const accessTokenOptions = {
      expires: new Date(Date.now() + 15 * 60 * 1000), // 15 min
      httpOnly: true,
      secure: !(process.env.ENVIRONMENT === 'development'),
      sameSite: process.env.ENVIRONMENT === 'development' ? 'lax' : 'none',
    };

    const refreshTokenOptions = {
      expires: new Date(Date.now() + 60 * 24 * 60 * 60 * 1000), // 60 days
      httpOnly: true,
      secure: !(process.env.ENVIRONMENT === 'development'),
      sameSite: process.env.ENVIRONMENT === 'development' ? 'lax' : 'none',
    };

    return res.status(response.statusCode)
      .cookie("accessToken", accessToken, accessTokenOptions)
      .cookie("refreshToken", refreshToken, refreshTokenOptions)
      .json(response);
  }

  const response = new ApiResponse(200, "Otp verfied successully", { isNewUser, isCropAdded });
  return res.status(response.statusCode).json(response);
});



const registerFarmerController = catchAsyncError(async (req, res, next) => {
  const { name, mobileNumber, state, district, preferredLanguage } = req.body;


  // Validate mobile number
  const mobileRegex = /^[6-9]\d{9}$/;
  if (!mobileRegex.test(mobileNumber)) {
    throw new ApiError(400, "Bad Request", "Invalid mobile number");
  }

  // Check if farmer already exists
  const existingFarmer = await userModel.findOne({ mobileNumber });
  if (existingFarmer) {
    throw new ApiError(409, "Conflict", "Farmer already registered with this mobile number");
  }

  // Create new farmer
  const farmer = await userModel.create({
    name,
    mobileNumber,
    state,
    district,
    preferredLanguage,
  });

  const response = new ApiResponse(201, "Farmer registered successfully", {
    id: farmer._id,
    name: farmer.name,
    mobileNumber: farmer.mobileNumber,
    state: farmer.state,
    district: farmer.district,
    preferredLanguage: farmer.preferredLanguage,
  });

  const { accessToken, refreshToken } = await generateTokens(farmer);

  const accessTokenOptions = {
    expires: new Date(Date.now() + 15 * 60 * 1000), // 15 min
    httpOnly: true,
    secure: !(process.env.ENVIRONMENT === 'development'),
    sameSite: process.env.ENVIRONMENT === 'development' ? 'lax' : 'none',
  };

  const refreshTokenOptions = {
    expires: new Date(Date.now() + 60 * 24 * 60 * 60 * 1000), // 60 days
    httpOnly: true,
    secure: !(process.env.ENVIRONMENT === 'development'),
    sameSite: process.env.ENVIRONMENT === 'development' ? 'lax' : 'none',
  };

  res.status(response.statusCode)
    .cookie("accessToken", accessToken, accessTokenOptions)
    .cookie("refreshToken", refreshToken, refreshTokenOptions)
    .json(response);

});


const getFarmerDataController = catchAsyncError(async (req, res, next) => {
    const user  = req.user;

    const response = new ApiResponse(200, "user found", user);
    return res.status(response.statusCode).json(response);
})


const logoutFarmerController = catchAsyncError(async (req, res, next) => {
    const { user } = req;
    const accessToken = req.cookies.accessToken;
    const refreshToken = req.cookies.refreshToken;

    user.refreshToken = undefined;

    user.save();

    await blackListedTokenModel.create({token: accessToken});
    await blackListedTokenModel.create({token: refreshToken});

    const response = new ApiResponse(200, "User Logged out successfully");

    return res
        .clearCookie("accessToken")
        .clearCookie("refreshToken")
        .status(response.statusCode)
        .json(response)
    
})


const refreshAccessTokenController = catchAsyncError(async (req, res, next) => {

  // extract token
  const incomingRefreshToken = req.cookies?.refreshToken || req.header("Authorization")?.replace("Bearer ", "");


  if (!incomingRefreshToken) {
    throw new ApiError(401, "TokenNotFoundError", "refresh token not found. Please login again")
  }

  

  // verify token
  let decodedToken;
  try {
    decodedToken = jwt.verify(incomingRefreshToken, process.env.REFRESH_TOKEN_SECRET_KEY);
  } catch (error) {
    console.log(error);
    throw new ApiError(401, "InvalidRefreshToken", "the refresh token is invalid")
  }

  // find user
  const userInDb = await userModel.findById(decodedToken.id).select("+refreshToken")
  if (!userInDb) {
    throw new ApiError(401, "InvalidRefreshToken", "the refresh token is invalid")
  }

  // match incoming token and token stored in db
  if (incomingRefreshToken !== userInDb?.refreshToken) {
    throw new ApiError(401, "InvalidRefreshToken", "the refresh token is invalid")
  }

  // generate both tokens again
  const { accessToken, refreshToken } = await generateTokens(userInDb);


  // create options object for cookies
    const accessTokenOptions = {
        expires: new Date(Date.now() + 15 * 60 * 1000), // 15 min
        httpOnly: true,
        secure: !(process.env.ENVIRONMENT === 'development'),
        sameSite: process.env.ENVIRONMENT === 'development' ? 'lax' : 'none',
    };

    const refreshTokenOptions = {
        expires: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000), // 7 days
        httpOnly: true,
        secure: !(process.env.ENVIRONMENT === 'development'),
        sameSite: process.env.ENVIRONMENT === 'development' ? 'lax' : 'none',
    };

  const response = new ApiResponse(200, "user logged in successfully")
  return res
    .status(response.statusCode)
    .cookie("accessToken", accessToken, accessTokenOptions)
    .cookie("refreshToken", refreshToken, refreshTokenOptions)
    .json(response)
})



const authControllers = {
  sendOtpController,
  verifyOtpController,
  registerFarmerController,
  getFarmerDataController,
  logoutFarmerController,
  refreshAccessTokenController
}

export default authControllers;