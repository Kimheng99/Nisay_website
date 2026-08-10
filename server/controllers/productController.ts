import { Request, Response } from "express"
import { prisma } from "../config/prisma.js"


export const getFlashDeals = async ( req: Request, res: Response ) => {
    const products = await prisma.product.findMany({
        where:{stock: { gt: 0}},
        orderBy:{price: "desc"}
    })
    const productsWithDiscount = products.map((p:any) => {
        const discount = p.price && p.discountedPrice? Math.round(((p.price-p.discount)/p.price)*100): 0;
        return {...p, discount} 
    })
    return res.json({product: productsWithDiscount.slice(0,8)})
}

export const getProducts = async (req: Request, res: Response) => {
    const { category, search, minPrice, maxPrice, sort } = req.query;

    const where: any = {};
    if (category && category !== "all") where.categoryId = {name: category as string};
    if (search) where.name = {contains: search, mode: "insensitive"};
    if(minPrice || maxPrice){
        where.price = {};
        if(minPrice) where.price.gte = Number(minPrice);
        if(maxPrice) where.price.lte = Number(maxPrice); 
    }

    const orderBy: any = {};
    if(sort === "low-price") orderBy.price = 'asc';
    else if(sort === "high-price") orderBy.price = 'desc';
    else orderBy.createdAt = 'desc';

    const products = await prisma.product.findMany({where, orderBy});

    const productsWithdiscount = products.map((p: any) => {
        const discount =  p.price && p.discountedPrice ? Math.round(((p.price-p.discountedPrice)/p.price)*100) : 0
        return {...p, discount }
    })
    res.json({products: productsWithdiscount})
}