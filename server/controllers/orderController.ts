import { Request, Response } from "express";
import { calculateOrderBreakdown } from "../utils/orderCalculator.js";
import { prisma } from "../config/prisma.js";
import { PaymentMethod } from "../generated/prisma/client.js";

 // GET api/orders/orderSummary
export const calculateOrderSummary = async (req: Request, res: Response) => {
  try {
    const { items, shippingProvince } = req.body;

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

// POST /api/orders/
export const createOrder = async (req: Request, res: Response) => {
  try {
    const { items, addressId, newAddress, paymentMethod } = req.body;
    if (!req.user?.id) {
      return res.status(401).json({ message: "Unauthorized" });
    }
    if (!Array.isArray(items) || items.length === 0) {
      return res.status(400).json({ message: "Order items are required" });
    }
    if (!addressId && !newAddress) {
      return res.status(400).json({ message: "addressId or newAddress is required" });
    }
    if (
      !paymentMethod ||
      !Object.values(PaymentMethod).includes(paymentMethod as PaymentMethod)
    ) {
      return res.status(400).json({
        message: "Invalid payment method",
        validPaymentMethods: Object.values(PaymentMethod),
      });
    }

    let resolvedAddressId: string | undefined = addressId;

    
    if (!resolvedAddressId && newAddress) {
      const { receiverName, phone, province, district, street } = newAddress;

      if (!receiverName || typeof receiverName !== "string" || !receiverName.trim()) {
        return res.status(400).json({ message: "Receiver name is required" });
      }
      if (!phone || typeof phone !== "string" || !phone.trim()) {
        return res.status(400).json({ message: "Receiver phone is required" });
      }
      if (!province) {
        return res.status(400).json({ message: "Province is required" });
      }
      if (!district || typeof district !== "string" || !district.trim()) {
        return res.status(400).json({ message: "District is required" });
      }
      if (!street || typeof street !== "string" || !street.trim()) {
        return res.status(400).json({ message: "Street is required" });
      }

      const phoneRegex = /^[0-9]{10}$/;
      if (!phoneRegex.test(phone.trim())) {
        return res.status(400).json({ message: "Invalid phone number format (10 digits required)" });
      }

      const createdAddress = await prisma.address.create({
        data: {
          receiverName: receiverName.trim(),
          phone: phone.trim(),
          province,
          district: district.trim(),
          street: street.trim(),
          userId: req.user.id,
        },
      });

      resolvedAddressId = createdAddress.id;
    }

   
    const address = await prisma.address.findFirst({
      where: { id: resolvedAddressId, userId: req.user.id },
    });

    if (!address) {
      return res.status(403).json({ message: "Invalid or unauthorized address" });
    }

    const { shopSummaries, grandTotal } = await calculateOrderBreakdown(
      items,
      address.province
    );

    const order = await prisma.$transaction(async (tx) => {
      const newOrder = await tx.order.create({
        data: {
          userId: req.user!.id,
          addressId: address.id,
          totalAmount: grandTotal,
          payment: {
            create: {
              method: paymentMethod as PaymentMethod,
              status: "PENDING",
              amount: grandTotal,
            },
          },
        },
      });

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
          address: true,
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

// GET /api/orders
export const getAllOrders = async (req: Request, res: Response) => {
  try {
    if (!req.user?.id) {
      return res.status(401).json({ message: "Unauthorized" });
    }

    const { page = "1", limit = "10", status } = req.query;
    const pageNumber = Math.max(1, parseInt(page as string) || 1);
    const limitNumber = Math.min(50, Math.max(1, parseInt(limit as string) || 10));
    const skip = (pageNumber - 1) * limitNumber;

    const validStatuses = ["PENDING", "CONFIRMED", "SHIPPING", "DELIVERED", "CANCELLED"];
    if (status && !validStatuses.includes(status as string)) {
      return res.status(400).json({ message: "Invalid status filter", validStatuses });
    }

    const where: any = { userId: req.user.id };
    if (status) {
      where.shopOrders = { some: { status } };
    }
    const totalCount = await prisma.order.count({ where });
    const orders = await prisma.order.findMany({
      where,
      skip,
      take: limitNumber,
      orderBy: { createdAt: "desc" },
      include: {
        address: true, 
        payment: {
          select: { method: true, status: true, amount: true, paidAt: true },
        },
        shopOrders: {
          include: {
            shop: {
              select: {
                id: true,
                shopName: true,
                addresses: {
                  select: { province: true },
                  take: 1, 
                },
              },
            },
            items: {
              select: { id: true, productId: true, productName: true, price: true, quantity: true },
            },
          },
        },
      },
    });

    const formattedOrders = orders.map((order) => ({
      id: order.id,
      receiverName: order.address.receiverName,
      receiverPhone: order.address.phone,
      shippingAddress: `${order.address.street}, ${order.address.district}`,
      shippingProvince: order.address.province,
      createdAt: order.createdAt,

      payment: order.payment
        ? {
            method: order.payment.method,
            status: order.payment.status,
            amount: Number(order.payment.amount),
            paidAt: order.payment.paidAt,
          }
        : null,

      totalAmount: Number(order.totalAmount),

      shops: order.shopOrders.map((shopOrder) => ({
        shopOrderId: shopOrder.id,
        shopId: shopOrder.shop.id,
        shopName: shopOrder.shop.shopName,
        shopProvince:
          (shopOrder.shop.addresses[0] as { province?: string } | undefined)?.province ?? null,
        status: shopOrder.status,

        items: shopOrder.items.map((item) => ({
          id: item.id,
          productId: item.productId,
          productName: item.productName,
          price: Number(item.price),
          quantity: item.quantity,
          lineTotal: Math.round(Number(item.price) * item.quantity * 100) / 100,
        })),

        subTotal: Number(shopOrder.subTotal),
        shippingFee: Number(shopOrder.shippingFee),
        shopTotal:
          Math.round((Number(shopOrder.subTotal) + Number(shopOrder.shippingFee)) * 100) / 100,
      })),
    }));

    return res.status(200).json({
      message: "Orders fetched successfully",
      pagination: {
        page: pageNumber,
        limit: limitNumber,
        totalCount,
        totalPages: Math.ceil(totalCount / limitNumber),
      },
      orders: formattedOrders,
    });
  } catch (error) {
    console.error("Get all orders error:", error);
    return res.status(500).json({ message: "Failed to get orders" });
  }
};

// GET /api/orders/:id
export const getOrder = async (req: Request, res: Response) => {
  try {
    if (!req.user?.id) {
      return res.status(401).json({ message: "Unauthorized" });
    }
    if (!req.params.id) {
      return res.status(400).json({ message: "Order ID is required" });
    }

    const order = await prisma.order.findFirst({
      where: {
        id: req.params.id as string,
        userId: req.user!.id,
      },
      include: {
        address: true, 
        payment: true,
        shopOrders: {
          include: {
            shop: {
              select: {
                id: true,
                shopName: true, 
                addresses: {
                  select: { province: true },
                  take: 1,
                },
              },
            },
            items: {
              select: { id: true, productId: true, productName: true, price: true, quantity: true },
            },
          },
        },
      },
    });

    if (!order) {
      return res.status(404).json({ message: "Order not found!" });
    }

    const formattedOrder = {
      id: order.id,
      receiverName: order.address.receiverName,
      shippingAddress: `${order.address.street}, ${order.address.district}`,
      shippingProvince: order.address.province,
      createdAt: order.createdAt,
      payment: order.payment
        ? {
            method: order.payment.method,
            status: order.payment.status,
            amount: Number(order.payment.amount),
            paidAt: order.payment.paidAt,
          }
        : null,

      priceSummary: {
        itemsTotal:
          Math.round(order.shopOrders.reduce((sum, so) => sum + Number(so.subTotal), 0) * 100) / 100,
        shippingTotal:
          Math.round(order.shopOrders.reduce((sum, so) => sum + Number(so.shippingFee), 0) * 100) / 100,
        grandTotal: Number(order.totalAmount),
      },

      shops: order.shopOrders.map((shopOrder) => ({
        shopOrderId: shopOrder.id,
        shopId: shopOrder.shop.id,
        shopName: shopOrder.shop.shopName,
        shopProvince:
          (shopOrder.shop.addresses as Array<{ province: string | null }>)[0]?.province ?? null,
        status: shopOrder.status,

        items: shopOrder.items.map((item) => ({
          id: item.id,
          productId: item.productId,
          productName: item.productName,
          price: Number(item.price),
          quantity: item.quantity,
          lineTotal: Math.round(Number(item.price) * item.quantity * 100) / 100,
        })),

        subTotal: Number(shopOrder.subTotal),
        shippingFee: Number(shopOrder.shippingFee),
        shopTotal:
          Math.round((Number(shopOrder.subTotal) + Number(shopOrder.shippingFee)) * 100) / 100,
      })),
    };

    return res.status(200).json({ order: formattedOrder });
  } catch (error) {
    console.error("Get order error:", error);
    return res.status(500).json({ message: "Failed to get order" });
  }
};

// PUT /api/orders/:id/status 
export const updateOrderStatus = async (req: Request, res: Response) => {
  try {
    const { status, shopOrderId } = req.body;
    if (!req.user?.id) {
      return res.status(401).json({ message: "Unauthorized" });
    }
    if (!req.params.id) {
      return res.status(400).json({ message: "Order ID is required" });
    }
    if (!shopOrderId) {
      return res.status(400).json({ message: "Shop Order ID is required" });
    }
    const validStatuses = ["CONFIRMED", "SHIPPING", "DELIVERED", "CANCELLED"];
    if (!status || !validStatuses.includes(status)) {
      return res.status(400).json({ message: "Invalid status", validStatuses });
    }

    const shop = await prisma.shop.findFirst({
      where: { ownerId: req.user!.id },
    });

    if (!shop) {
      return res.status(403).json({ message: "You are not a shop owner" });
    }

    const order = await prisma.order.findUnique({
      where: { id: req.params.id as string },
    });

    if (!order) {
      return res.status(404).json({ message: "Order not found" });
    }

    const shopOrder = await prisma.shopOrder.findFirst({
      where: {
        id: shopOrderId,
        orderId: req.params.id as string,
        shopId: shop.id,
      },
    });

    if (!shopOrder) {
      return res.status(403).json({ message: "You are not authorized to update this shop order" });
    }

    const statusFlow: Record<string, string[]> = {
      PENDING: ["CONFIRMED", "CANCELLED"],
      CONFIRMED: ["SHIPPING", "CANCELLED"],
      SHIPPING: ["DELIVERED"],
      DELIVERED: [],
      CANCELLED: [],
    };

    const allowedNextStatuses = statusFlow[shopOrder.status];
    if (!allowedNextStatuses.includes(status)) {
      return res.status(400).json({
        message: `Cannot change status from ${shopOrder.status} to ${status}`,
        currentStatus: shopOrder.status,
        allowedNextStatuses,
      });
    }

    const updatedShopOrder = await prisma.shopOrder.update({
      where: { id: shopOrderId },
      data: { status },
    });

    return res.status(200).json({
      message: `Order status updated to ${status} successfully`,
      shopOrderId: updatedShopOrder.id,
      status: updatedShopOrder.status,
    });
  } catch (error) {
    console.error("Update order status error:", error);
    return res.status(500).json({ message: "Failed to update order status" });
  }
};

// GET /api/orders/shop
export const getShopOrders = async (req: Request, res: Response) => {
  try {
    if (!req.user?.id) {
      return res.status(401).json({ message: "Unauthorized" });
    }

    const shop = await prisma.shop.findUnique({
      where: { ownerId: req.user.id },
    });

    if (!shop) {
      return res.status(403).json({ message: "You don't own a shop" });
    }

    const { status, page = "1", limit = "10" } = req.query;
    const pageNumber = Math.max(1, parseInt(page as string) || 1);
    const limitNumber = Math.max(1, parseInt(limit as string) || 10);
    const skip = (pageNumber - 1) * limitNumber;

    const where: any = { shopId: shop.id };
    const validStatuses = ["PENDING", "CONFIRMED", "SHIPPING", "DELIVERED", "CANCELLED"];
    if (status && validStatuses.includes(status as string)) {
      where.status = status;
    }

    const totalCount = await prisma.shopOrder.count({ where });

    const shopOrders = await prisma.shopOrder.findMany({
      where,
      skip,
      take: limitNumber,
      orderBy: { createdAt: "desc" },
      include: {
        order: {
          select: {
            id: true,
            createdAt: true,
            address: true, 
            payment: {
              select: { method: true, status: true, paidAt: true },
            },
          },
        },
        items: {
          select: { id: true, productId: true, productName: true, price: true, quantity: true },
        },
      },
    });

    const formattedOrders = shopOrders.map((shopOrder) => ({
      shopOrderId: shopOrder.id,
      orderId: shopOrder.order.id,
      status: shopOrder.status,
      subTotal: Number(shopOrder.subTotal),
      shippingFee: Number(shopOrder.shippingFee),
      shopTotal:
        Math.round((Number(shopOrder.subTotal) + Number(shopOrder.shippingFee)) * 100) / 100,
      createdAt: shopOrder.createdAt,

      receiverName: shopOrder.order.address.receiverName,
      receiverPhone: shopOrder.order.address.phone,
      shippingAddress: `${shopOrder.order.address.street}, ${shopOrder.order.address.district}`,
      shippingProvince: shopOrder.order.address.province,

      payment: shopOrder.order.payment
        ? {
            method: shopOrder.order.payment.method,
            status: shopOrder.order.payment.status,
            paidAt: shopOrder.order.payment.paidAt,
          }
        : null,

      items: shopOrder.items.map((item) => ({
        productId: item.productId,
        productName: item.productName,
        price: Number(item.price),
        quantity: item.quantity,
        lineTotal: Math.round(Number(item.price) * item.quantity * 100) / 100,
      })),
    }));

    return res.status(200).json({
      message: "Shop orders fetched successfully",
      shopId: shop.id,
      shopName: shop.shopName,
      pagination: {
        page: pageNumber,
        limit: limitNumber,
        totalCount,
        totalPages: Math.ceil(totalCount / limitNumber),
      },
      orders: formattedOrders,
    });
  } catch (error) {
    console.error("Get shop orders error:", error);
    return res.status(500).json({ message: "Failed to get shop orders" });
  }
};