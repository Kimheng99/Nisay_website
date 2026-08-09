import express from "express";
import { registerUser, login } from "../controllers/authController.js";


const authRouter = express.Router();

authRouter.post("/register", registerUser);
authRouter.post("/login", login);

export default authRouter;