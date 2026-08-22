import { Request, Response } from "express";
import { prisma } from "../config/prisma.js";
import { Province } from "../generated/prisma/client.js";

const phoneRegex = /^[0-9]{9,10}$/;

// Shared validation for create/update
const validateAddressInput = (body: any, isUpdate = false) => {
  const { receiverName, phone, province, district, street } = body;

  if (!isUpdate || receiverName !== undefined) {
    if (!receiverName || typeof receiverName !== "string" || !receiverName.trim()) {
      return "Receiver name is required";
    }
  }
  if (!isUpdate || phone !== undefined) {
    if (!phone || typeof phone !== "string" || !phone.trim()) {
      return "Phone is required";
    }
    if (!phoneRegex.test(phone.trim())) {
      return "Phone number must contain 9 or 10 digits";
    }
  }
  if (!isUpdate || province !== undefined) {
    if (!province || !Object.values(Province).includes(province as Province)) {
      return "Valid province is required";
    }
  }
  if (!isUpdate || district !== undefined) {
    if (!district || typeof district !== "string" || !district.trim()) {
      return "District is required";
    }
  }
  if (!isUpdate || street !== undefined) {
    if (!street || typeof street !== "string" || !street.trim()) {
      return "Street is required";
    }
  }
  return null;
};

// GET /api/addresses  → list current user's saved addresses
export const getMyAddresses = async (req: Request, res: Response) => {
  try {
    if (!req.user?.id) {
      return res.status(401).json({ message: "Unauthorized" });
    }

    const addresses = await prisma.address.findMany({
      where: { userId: req.user.id },
      orderBy: { createdAt: "desc" },
    });

    return res.status(200).json({
      message: "Addresses fetched successfully",
      addresses,
    });
  } catch (error) {
    console.error("Get addresses error:", error);
    return res.status(500).json({ message: "Failed to get addresses" });
  }
};

// GET /api/addresses/:id  → get one address (must belong to current user)
export const getAddressById = async (req: Request, res: Response) => {
  try {
    if (!req.user?.id) {
      return res.status(401).json({ message: "Unauthorized" });
    }
    if (!req.params.id) {
      return res.status(400).json({ message: "Address ID is required" });
    }

    const address = await prisma.address.findFirst({
      where: { id: req.params.id as string, userId: req.user.id },
    });

    if (!address) {
      return res.status(404).json({ message: "Address not found" });
    }

    return res.status(200).json({ address });
  } catch (error) {
    console.error("Get address by id error:", error);
    return res.status(500).json({ message: "Failed to get address" });
  }
};

// POST /api/addresses  → create a new address for current user
export const createAddress = async (req: Request, res: Response) => {
  try {
    if (!req.user?.id) {
      return res.status(401).json({ message: "Unauthorized" });
    }

    const validationError = validateAddressInput(req.body);
    if (validationError) {
      return res.status(400).json({ message: validationError });
    }

    const { receiverName, phone, province, district, street } = req.body;

    const address = await prisma.address.create({
      data: {
        receiverName: receiverName.trim(),
        phone: phone.trim(),
        province,
        district: district.trim(),
        street: street.trim(),
        userId: req.user.id,
      },
    });

    return res.status(201).json({
      message: "Address created successfully",
      address,
    });
  } catch (error) {
    console.error("Create address error:", error);
    return res.status(500).json({ message: "Failed to create address" });
  }
};

// PUT /api/addresses/:id  → update an existing address
export const updateAddress = async (req: Request, res: Response) => {
  try {
    if (!req.user?.id) {
      return res.status(401).json({ message: "Unauthorized" });
    }
    if (!req.params.id) {
      return res.status(400).json({ message: "Address ID is required" });
    }

    const existing = await prisma.address.findFirst({
      where: { id: req.params.id as string, userId: req.user.id },
    });

    if (!existing) {
      return res.status(404).json({ message: "Address not found" });
    }

    const validationError = validateAddressInput(req.body, true);
    if (validationError) {
      return res.status(400).json({ message: validationError });
    }

    const { receiverName, phone, province, district, street } = req.body;

    const updated = await prisma.address.update({
      where: { id: existing.id },
      data: {
        ...(receiverName !== undefined && { receiverName: receiverName.trim() }),
        ...(phone !== undefined && { phone: phone.trim() }),
        ...(province !== undefined && { province }),
        ...(district !== undefined && { district: district.trim() }),
        ...(street !== undefined && { street: street.trim() }),
      },
    });

    return res.status(200).json({
      message: "Address updated successfully",
      address: updated,
    });
  } catch (error) {
    console.error("Update address error:", error);
    return res.status(500).json({ message: "Failed to update address" });
  }
};

// DELETE /api/addresses/:id  → delete an address
export const deleteAddress = async (req: Request, res: Response) => {
  try {
    if (!req.user?.id) {
      return res.status(401).json({ message: "Unauthorized" });
    }
    if (!req.params.id) {
      return res.status(400).json({ message: "Address ID is required" });
    }

    const existing = await prisma.address.findFirst({
      where: { id: req.params.id as string, userId: req.user.id },
    });

    if (!existing) {
      return res.status(404).json({ message: "Address not found" });
    }

    await prisma.address.delete({ where: { id: existing.id } });

    return res.status(200).json({ message: "Address deleted successfully" });
  } catch (error: any) {
    
    if (error.code === "P2003") {
      return res.status(400).json({
        message: "This address is used in an existing order and cannot be deleted",
      });
    }
    console.error("Delete address error:", error);
    return res.status(500).json({ message: "Failed to delete address" });
  }
};