import { Request, Response } from "express";
import { prisma } from "../config/prisma.js";

export const createOrder = async (req: Request, res: Response) => {
  try {
     const {items,receiverName,shippingAddress,shippingProvince} = req.body;
    if (!req.user?.id) {
      return res.status(401).json({message: "Unauthorized",});
    }
    if (!Array.isArray(items) || items.length === 0) {
      return res.status(400).json({
        message: "Order items are required",
      });
    }
    if (!shippingProvince) {
        return res.status(400).json({
            message: "Shipping province is required",
        });
        }
    if (!receiverName ||typeof receiverName !== "string" ||receiverName.trim() === "") {
      return res.status(400).json({message: "Receiver name is required",});
    }

    if (!shippingAddress ||typeof shippingAddress !== "string" ||shippingAddress.trim() === "") {
      return res.status(400).json({message: "Shipping address is required",});
    }
    const productIds = items.map((item: { productId: string }) => item.productId);
    const products = await prisma.product.findMany({ where: {id: {in: productIds,},},});
    const productMap = new Map(products.map((product) => [product.id,product,]));
    for (const item of items) {
      const product = productMap.get(item.productId);
      if (!product) {
        return res.status(404).json({message: `Product ${item.productId} not found`,});
      }
      if (!Number.isInteger(item.quantity) ||item.quantity <= 0) {return res.status(400).json({
          message: `Invalid quantity for product ${product.name}`,
        });
      }
      if (product.stock < item.quantity) {
        return res.status(400).json({message: `Not enough stock for ${product.name}`,
          availableStock: product.stock,
          requestedQuantity: item.quantity,
        });
      }
    }
    const order = await prisma.$transaction(async (tx) => {
        const shopGroups = new Map<string,
          {
            shopId: string;
            items: {
              productId: string;
              productName: string;
              price: number;
              quantity: number;
            }[];
          }
        >();

        for (const item of items) {
          const product = productMap.get(
            item.productId
          )!;
          const price = Number(
            product.discountedPrice ??
              product.price
          );
          if (!shopGroups.has(product.shopId)) {
            shopGroups.set(product.shopId, {
              shopId: product.shopId,
              items: [],
            });
          }

          shopGroups.get(product.shopId)!.items.push({
            productId: product.id,
            productName: product.name,
            price,
            quantity: item.quantity,
          });
        }
        let totalAmount = 0;

        for (const shop of shopGroups.values()) {
          for (const item of shop.items) {
            totalAmount +=
              item.price * item.quantity;
          }
        }
        totalAmount =
          Math.round(totalAmount * 100) / 100;
        const newOrder = await tx.order.create({
          data: {
            userId: req.user!.id,
            receiverName:receiverName.trim(),
            shippingAddress:shippingAddress.trim(),
            shippingProvince,
            totalAmount,
          },
        });

        for (const shop of shopGroups.values()) {
          let subTotal = 0;
          for (const item of shop.items) {
             subTotal +=item.price * item.quantity;
          }
          subTotal = Math.round(subTotal * 100) / 100;
          // Get the shop information
            const shopData = await tx.shop.findUnique({
                where: {
                id: shop.shopId,
                },
                select: {
                province: true,
                nearFee: true,
                farFee: true,
                },
            });
            if (!shopData) {
                throw new Error(
                `Shop ${shop.shopId} not found`
                );
            }
            let shippingFee = 0;
             if (
                shopData.province === shippingProvince
            ) {
                shippingFee = Number(
                shopData.nearFee
                );
            }
            else {
                shippingFee = Number(
                shopData.farFee
                );
            }

  


            
            const shopOrder =
                await tx.shopOrder.create({
                data: {
                    shopId: shop.shopId,
                    orderId: newOrder.id,
                    subTotal,
                    shippingFee,
                },
                });
            for (const item of shop.items) {
                await tx.orderItem.create({
                data: {
                    shopOrderId:
                    shopOrder.id,
                    productId:
                    item.productId,
                    productName:
                    item.productName,
                    price: item.price,
                    quantity:
                    item.quantity,
                },
                });
                const updatedProduct =
                await tx.product.updateMany({
                    where: {
                    id: item.productId,
                    stock: {
                        gte: item.quantity,
                    },
                    },
                    data: {
                    stock: {
                        decrement: item.quantity,
                    },
                    },
                });
                if (updatedProduct.count !== 1) {
                throw new Error(
                    `Not enough stock for ${item.productName}`
                );
                }
            }
            }
        return tx.order.findUnique({
          where: {
            id: newOrder.id,
          },

          include: {
            shopOrders: {
              include: {
                items: true,
                shop: true,
              },
            },
          },
        });
      }
    );
    return res.status(201).json({
      message: "Order created successfully",
      order,
    });

  } catch (error) {

    console.error(
      "Create order error:",
      error
    );

    return res.status(500).json({
      message: "Failed to create order",
    });
  }
};