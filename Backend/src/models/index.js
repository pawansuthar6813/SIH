import { User } from "./user.model.js"
import { OTP } from "./otp.model.js"
import { BlackListedToken } from "./blackListedToken.model.js"
import { Crop } from "./crop.model.js"
import { Expert } from "./expert.model.js"
import { PhotoAnalysis } from "./photoAnalysis.model.js"

const models = {
    userModel: User,
    otpModel: OTP,
    blackListedTokenModel: BlackListedToken,
    cropModel: Crop,
    expertModel: Expert,
    photoAnalysisModel: PhotoAnalysis
}

export default models