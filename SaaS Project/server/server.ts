import "./configs/instrument.mjs"
import express, { Request, Response } from "express";
import cors from 'cors'
import 'dotenv/config'
import { clerkMiddleware } from "@clerk/express";
import clerkWebhooks from "./controllers/clerk.js";
import * as Sentry from "@sentry/node"
import userRouter from "./routes/userRoutes.js";
import projectRouter from "./routes/projectRoutes.js";



const app = express();

const PORT = process.env.PORT || 10000;

// Middleware
app.use(cors())

app.post('/api/clerk', express.raw({ type: 'application/json' }), clerkWebhooks)

app.use(express.json())
app.use(clerkMiddleware())

app.get("/", (req: Request, res: Response) => {
  res.send("Server is Live!");
});

app.use('/api/user', userRouter)
app.use('/api/project', projectRouter)

Sentry.setupExpressErrorHandler(app);

app.listen(PORT, () => {
  console.log(`Server is running on port ${PORT}`);
});
