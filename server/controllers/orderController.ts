import { Request, Response } from "express";
import { calculateOrderBreakdown } from "../utils/orderCalculator.js";
import { prisma } from "../config/prisma.js";

export const calculateOrderSummary = async (req: Request, res: Response) => {
  try {
    const { items, shippingProvince } = req.body;

    // Validate
    if (!req.user?.id) {
      return res.status(401).json({ message: "Unauthorized" });
    }
    if (!Array.isArray(items) || items.length === 0) {
      return res.status(400).json({ message: "Order items are required" });
    }
    if (!shippingProvince) {
      return res.status(400).json({ message: "Shipping province is required" });
    }

  
    const { shopSummaries, grandTotal } = await calculateOrderBreakdown(
      items,
      shippingProvince
    );

    return res.status(200).json({
      message: "Order summary calculated",
      shippingProvince,
      shops: shopSummaries,
      grandTotal,
    });

  } catch (error: any) {
    console.error("Calculate order summary error:", error);
    return res.status(500).json({ message: error.message || "Failed to calculate order summary" });
  }
};

export const createOrder = async (req: Request, res: Response) => {
  try {
    const { items, receiverName, shippingAddress, shippingProvince } = req.body;
    if (!req.user?.id) {
      return res.status(401).json({ message: "Unauthorized" });
    }
    if (!Array.isArray(items) || items.length === 0) {
      return res.status(400).json({ message: "Order items are required" });
    }
    if (!shippingProvince) {
      return res.status(400).json({ message: "Shipping province is required" });
    }
    if (!receiverName || typeof receiverName !== "string" || receiverName.trim() === "") {
      return res.status(400).json({ message: "Receiver name is required" });
    }
    if (!shippingAddress || typeof shippingAddress !== "string" || shippingAddress.trim() === "") {
      return res.status(400).json({ message: "Shipping address is required" });
    }

    const { shopSummaries, grandTotal } = await calculateOrderBreakdown(
      items,
      shippingProvince
    );

    // Create order in transaction
    const order = await prisma.$transaction(async (tx) => {

      // Create main order with correct grandTotal (including shipping!)
      const newOrder = await tx.order.create({
        data: {
          userId: req.user!.id,
          receiverName: receiverName.trim(),
          shippingAddress: shippingAddress.trim(),
          shippingProvince,
          totalAmount: grandTotal, 
        },
      });

      // Create ShopOrders + OrderItems using shopSummaries from helper
      for (const shop of shopSummaries) {
        const shopOrder = await tx.shopOrder.create({
          data: {
            shopId: shop.shopId,
            orderId: newOrder.id,
            subTotal: shop.subTotal,
            shippingFee: shop.shippingFee,
          },
        });

        for (const item of shop.items) {
          await tx.orderItem.create({
            data: {
              shopOrderId: shopOrder.id,
              productId: item.productId,
              productName: item.productName,
              price: item.price,
              quantity: item.quantity,
            },
          });

          // Decrement stock safely
          const updatedProduct = await tx.product.updateMany({
            where: {
              id: item.productId,
              stock: { gte: item.quantity },
            },
            data: {
              stock: { decrement: item.quantity },
            },
          });

          if (updatedProduct.count !== 1) {
            throw new Error(`Not enough stock for ${item.productName}`);
          }
        }
      }

      return tx.order.findUnique({
        where: { id: newOrder.id },
        include: {
          shopOrders: {
            include: {
              items: true,
              shop: true,
            },
          },
        },
      });
    });

    return res.status(201).json({
      message: "Order created successfully",
      order,
    });

  } catch (error: any) {
    console.error("Create order error:", error);
    return res.status(500).json({ message: error.message || "Failed to create order" });
  }
};
