import { Request, Response } from "express"
import { prisma } from "../config/prisma.js"

// GET /api/products/getFlashDeal
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

// GET /api/products/product-search
export const getProducts = async (req: Request, res: Response) => {
    const { category, search, minPrice, maxPrice, sort, rating } = req.query;

    const where: any = {};
    if (category && category !== "all") where.categoryId = {name: category as string};
    if (search) where.name = {contains: search, mode: "insensitive"};
    if(minPrice || maxPrice){
        where.price = {};
        if(minPrice) where.price.gte = Number(minPrice);
        if(maxPrice) where.price.lte = Number(maxPrice); 
    }
    if (rating) {
        where.rating = {
            gte: Number(rating)
        };
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

// GET /api/products/:id
export const getProductById = async (req: Request, res: Response) => {
    try {
        const product = await prisma.product.findUnique({ where: { id: req.params.id as string} });
        if (!product) return res.status(404).json({ message: "Product not found" });

        const discount = product.price && product.discountedPrice
            ? Math.round(((Number(product.price) - Number(product.discountedPrice)) / Number(product.price)) * 100)
            : 0;

        res.json({ product: { ...product, discount } });
    } catch (error) {
        console.error(error);
        res.status(500).json({ message: "Failed to get product" });
    }
};

// POST /api/products
export const createProduct = async (req: Request, res: Response) => {
    const product = await prisma.product.create({data: req.body});
    return res.status(201).json({product});
}

// PUT /api/products/:id
export const updateProduct = async (req: Request, res: Response) => {
    const product = await prisma.product.update({where: {id: req.params.id as string}, data: req.body});
    res.status(201).json({product})
}

// DELETE /api/products/:id
export const deleteProduct = async (req: Request, res: Response) => {
    await prisma.product.delete({where: {id: req.params.id as string}});
    res.json({message: "DELETED"})
}