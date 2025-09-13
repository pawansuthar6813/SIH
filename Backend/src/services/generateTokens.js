import models from "../Models/index.js";
import ApiError from "../Utils/ApiError.js";

const { userModel } = models;

const generateTokens = async (user) => {

    // generate accessToken
    const accessToken = await user.generateAccessToken();

    // generate refreshToken
    const refreshToken = await user.generateRefreshToken();

    // save refresh token in db
    try {
        await userModel.findByIdAndUpdate(user._id , {
            $set: {refreshToken: refreshToken}
        })
    } catch (error) {
        throw new ApiError(500, "InternalServerError","error in generating refresh tokens");
    }
    
    // remove refresh token from user object so that it will not go with response
    user.refreshToken = undefined;

    // return generated tokens
    return {accessToken, refreshToken}

}

export default generateTokens;