import { Request, Response, NextFunction } from "express";
import { prisma } from "../config/prisma.js"
import { Role } from "../generated/prisma/client.js"

const adminEmails = process.env.ADMIN_EMAILS? process.env.ADMIN_EMAILS
                    .split(",")
                    .map((e) => e.trim().toLowerCase()): [];
const authAdmin = async (req: Request, res: Response, next: NextFunction)=> {
    try {
        if (!req.user) {
            return res.status(401).json({
                message: "Unauthorized"
            });
        }
        const user = await prisma.user.findUnique({
            where: {
                id: req.user.id
            },
            select: {
                id: true,
                email: true,
                role: true,
                status: true
            }
        });
        if (!user) {
            return res.status(401).json({
                message: "User not found"
            });
        }
        if (user.status !== "ACTIVE") {
            return res.status(403).json({
                message: "Your account is not active"
            });
        }
        if (!adminEmails.includes(user.email.toLowerCase())) {
            return res.status(403).json({
                message: "Access denied. Admin only."
            });
        }
        if (user.role !== Role.ADMIN) {
            return res.status(403).json({
                message: "Access denied. Admin role required."
            });
        }
        next();
    } catch (error) {
        console.error(error);
        return res.status(500).json({
            message: "Server error"
        });
    }
}

export default authAdmin