import "dotenv/config";
import express, { Request, Response, NextFunction } from "express";
import cors from 'cors';
import authRouter from "./routes/authRoutes.js";
import productRouter from "./routes/productRoutes.js";
import uploadRouter from "./routes/uploadRoutes.js";
import orderRouter from "./routes/orderRoutes.js";
import addressRouter from "./routes/addressRoutes.js";

const app = express();
app.use(express.json());
app.use(cors());

const port = process.env.PORT || 3000;
app.get('/', (req: Request, res: Response) => {
    res.send("Server is live! ");
});

app.use('/api/auth', authRouter);
app.use('/api/products', productRouter);
app.use('/api/upload', uploadRouter);
app.use('/api/orders', orderRouter);
app.use('/api/addresses', addressRouter);


// Error handling
app.use((error: any, req: Request, res: Response, next: NextFunction) => {
    console.error(error);
    res.status(500).json({message: error.message});
})

app.listen(port, () => {
    console.log(`Server is running on port http://localhost:${port}`)
})



