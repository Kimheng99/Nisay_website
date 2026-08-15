// utils/orderCalculator.ts

import { prisma } from "../config/prisma.js";

export type OrderItem = {
  productId: string;
  quantity: number;
};

export type ShopSummary = {
  shopId: string;
  shopName: string;
  items: {
    productId: string;
    productName: string;
    price: number;
    quantity: number;
    lineTotal: number;
  }[];
  subTotal: number;
  shippingFee: number;
  shopTotal: number;
};

export type OrderSummaryResult = {
  shopSummaries: ShopSummary[];
  grandTotal: number;
};

export async function calculateOrderBreakdown(
  items: OrderItem[],
  shippingProvince: string
): Promise<OrderSummaryResult> {

  // 1. Fetch products
  const productIds = items.map((item) => item.productId);
  const products = await prisma.product.findMany({
    where: { id: { in: productIds } },
    include: { shop: true },
  });
  const productMap = new Map(products.map((p) => [p.id, p]));

  // 2. Validate items
  for (const item of items) {
    const product = productMap.get(item.productId);
    if (!product) {
      throw new Error(`Product ${item.productId} not found`);
    }
    if (!Number.isInteger(item.quantity) || item.quantity <= 0) {
      throw new Error(`Invalid quantity for product ${product.name}`);
    }
    if (product.stock < item.quantity) {
      throw new Error(`Not enough stock for ${product.name}`);
    }
  }

  // 3. Group items by shop
  const shopGroups = new Map<string, {
    shopId: string;
    shopName: string;
    items: {
      productId: string;
      productName: string;
      price: number;
      quantity: number;
      lineTotal: number;
    }[];
  }>();

  for (const item of items) {
    const product = productMap.get(item.productId)!;
    const price = Number(product.discountedPrice ?? product.price);
    const lineTotal = Math.round(price * item.quantity * 100) / 100;

    if (!shopGroups.has(product.shopId)) {
      shopGroups.set(product.shopId, {
        shopId: product.shopId,
        shopName: product.shop.shopName,
        items: [],
      });
    }

    shopGroups.get(product.shopId)!.items.push({
      productId: product.id,
      productName: product.name,
      price,
      quantity: item.quantity,
      lineTotal,
    });
  }

  // 4. Calculate subtotal + shipping fee per shop
  let grandTotal = 0;
  const shopSummaries: ShopSummary[] = [];

  for (const shop of shopGroups.values()) {
    const subTotal = Math.round(
      shop.items.reduce((sum, item) => sum + item.lineTotal, 0) * 100
    ) / 100;

    const shopData = await prisma.shop.findUnique({
      where: { id: shop.shopId },
      select: { province: true, nearFee: true, farFee: true },
    });

    if (!shopData) {
      throw new Error(`Shop ${shop.shopId} not found`);
    }

    const shippingFee =
      shopData.province === shippingProvince
        ? Number(shopData.nearFee)
        : Number(shopData.farFee);

    const shopTotal = Math.round((subTotal + shippingFee) * 100) / 100;
    grandTotal += shopTotal;

    shopSummaries.push({
      shopId: shop.shopId,
      shopName: shop.shopName,
      items: shop.items,
      subTotal,
      shippingFee,
      shopTotal,
    });
  }

  grandTotal = Math.round(grandTotal * 100) / 100;

  return { shopSummaries, grandTotal };
}