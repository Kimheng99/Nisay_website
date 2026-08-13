import { Request, Response, NextFunction } from "express";
import { prisma } from "../config/prisma.js";
import { Role } from "../generated/prisma/client.js";

const shopOwnerAuth = async (req: Request, res: Response, next: NextFunction) => {
    try {
        if(!req.user){
            return res.status(401).json({message: "Unauthorized"})
        }
        const user = await prisma.user.findUnique({
            where: {id: req.user.id},
            select: {
                id: true,
                role: true,
                status: true
            }
        })
        if(!user){
            return res.status(401).json({message: "User not found"})
        }
        if(user.status !== "ACTIVE"){
            return res.status(403).json({message: "Your account is not active."})
        }
        if(user.role !== Role.SHOP_OWNER){
            return res.status(403).json({message: "Access denied, Shop Owner only"})
        }
        next();

    } catch (error) {
        console.error(error);
        return res.status(500).json({message: "Server error"})
        
    }
}

// router.get("/api/shop/dashboard", auth, shopOwnerAuth, (req, res)=>{...})

export default shopOwnerAuth
