import express from "express";
import { createProduct, deleteProduct, getFlashDeals, getProductById, getProducts, updateProduct } from "../controllers/productController.js";
import auth from "../middleware/auth.js";
import shopOwnerAuth from "../middleware/shopOwnerAuth.js"

const productRouter = express.Router();

productRouter.get("/getFlashDeals", getFlashDeals);
productRouter.get("/", getProducts);
productRouter.get("/:id", getProductById);
productRouter.post("/", auth, shopOwnerAuth, createProduct);
productRouter.put("/:id", auth, shopOwnerAuth, updateProduct);
productRouter.delete("/:id", auth, shopOwnerAuth, deleteProduct);

export default productRouter