import catchAsyncError from "./catchAsyncError.js";
import ApiError from "../../Shared/utils/ApiError.js";
import models from "../../models/index.js";
import jwt from "jsonwebtoken";

const { blackListedTokenModel, userModel } = models;

export const authFarmer = catchAsyncError(async (req, res, next) => {
    
    const accessToken = req.cookies?.accessToken || req.body?.accessToken || req.headers.authorization?.split(" ")[1];
    // const refreshToken = req.cookies?.refreshToken;

    if(!accessToken){
        throw new ApiError(400, "TokenNotFoundError", "no access token found")
    }

    const isBlackListed = await blackListedTokenModel.findOne({token: accessToken})

    if(isBlackListed){
        throw new ApiError(401, "TokenExpiredError", 'the access token is expired. generate new access token')
    }

    let decodedToken
    try {
        decodedToken = jwt.verify(accessToken, process.env.ACCESS_TOKEN_SECRET_KEY);
    } catch (error) {
        throw new ApiError(401, "InvalidTokenError", "the access token is invalid");    
    }


    const user = await userModel.findById(decodedToken.id);

    if(!user){
        throw new ApiError(401, "NoUserFoundError", "no user found with this token");
    }

    req.user = user;
    
    next();
})