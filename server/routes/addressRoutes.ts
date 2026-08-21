import express from "express";
import {
  getMyAddresses,
  getAddressById,
  createAddress,
  updateAddress,
  deleteAddress,
} from "../controllers/addressController.js";
import auth from "../middleware/auth.js"; // adjust to your actual auth middleware

const addressRouter = express.Router();



addressRouter.get("/",auth, getMyAddresses);
addressRouter.get("/:id",auth, getAddressById);
addressRouter.post("/",auth, createAddress);
addressRouter.put("/:id",auth, updateAddress);
addressRouter.delete("/:id",auth, deleteAddress);

export default addressRouter;