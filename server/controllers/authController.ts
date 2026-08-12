import { Request, Response } from "express";
import { prisma } from "../config/prisma.js";
import jwt from "jsonwebtoken";
import bcrypt from "bcrypt";
import "dotenv/config";


const generateToken = (id: string): string => {
    return jwt.sign(
        {id},
        process.env.JWT_SECRET as string,
        {
            expiresIn: "30d",
        }
        
    )
}

export const registerUser = async (req: Request, res: Response) => {

    const {name, email, password} = req.body;
    if (!name || !email || !password){
        return res.status(400).json({messege: "Name email and password is required!"})
    }
    const validEmail = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

    if (!validEmail.test(email.trim().toLowerCase())){
        return res.status(400).json({message: "Please input the valid email!"})
    }

    if (password.length < 6){
        return res.status(400).json({message: "Password must be at least 6 characters!"})
    }

    const exitingEmail = await prisma.user.findUnique({
        where : {
            email : email.trim().toLowerCase()
        }
    })

    const hashedPassword = await bcrypt.hash(password,10);

    if(exitingEmail){
        return res.status(400).json({message: "Email already exists"})
    }

    const user = await prisma.user.create({
        data: {
            name: name,
            email: email.trim().toLowerCase(),
            password: hashedPassword

        }
    })
    const token = generateToken(user.id);

    const userData: any = {...user};
    delete userData.password;

    res.status(201).json({user: userData, token})


}

export const login = async (req: Request, res: Response) => {
    const { email, password } = req.body;
    if (!email.trim().toLowerCase() || !password){
        return res.status(400).json({message: "Email and Password is required!"})
    }
    const user = await prisma.user.findUnique({
        where: {email: email.trim().toLowerCase()}
    })

    if(!user){
        return res.status(401).json({message: "Invalid email or password!"})
    }

    const isMatch = await bcrypt.compare(password, user.password );
    if(!isMatch){
        return res.status(401).json({message: "Invalid email or password!"})
    }
    const token = generateToken(user.id);
    const userData: any = {...user};
    delete userData.password;

    res.status(201).json({user: userData, token})


}