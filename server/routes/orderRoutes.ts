import express from "express"
import auth from "../middleware/auth.js"
import shopOwnerAuth from "../middleware/shopOwnerAuth.js"
import { createOrder, getAllOrders, getOrder, getShopOrders, updateOrderStatus } from "../controllers/orderController.js";

const orderRouter = express.Router();
orderRouter.post('/', auth, createOrder);
orderRouter.get('/all', auth, getAllOrders);
orderRouter.get('/:id',auth, getOrder);
orderRouter.get('/', auth, shopOwnerAuth,getShopOrders);
orderRouter.put('/:id/status', auth, shopOwnerAuth, updateOrderStatus);


export default orderRouter;

