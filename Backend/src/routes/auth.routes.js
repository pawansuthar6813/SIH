import express from 'express';
import authControllers from '../controllers/auth.controller.js';
import { authFarmer } from '../middlewares/auth.middleware.js';

const authRouter = express.Router();

authRouter.route("/send-otp").post(authControllers.sendOtpController);
authRouter.route("/verify-otp").post(authControllers.verifyOtpController);
authRouter.route("/register-farmer").post(authControllers.registerFarmerController);
authRouter.route("/logout-farmer").get(authFarmer, authControllers.logoutFarmerController);
authRouter.route("/farmer-info").get(authFarmer, authControllers.getFarmerDataController);
authRouter.route("/refresh-access-token").get(authControllers.refreshAccessTokenController);

export default authRouter;