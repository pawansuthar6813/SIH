import express from 'express';
import cors from 'cors'
import cookieParser from 'cookie-parser';
import { createServer } from 'http';
import handleAsyncErrors from './Shared/utils/handleAsyncErrors.js';
import authRouter from './AuthService/routes/auth.routes.js';
import router from './ChatService/chat.routes.js';
// import botRouter from './ChatService/bot.routes.js';
import ChatSocketManager from './ChatService/chatSocketConfig.js';

const app = express();

const chatRouter = router;

// Create HTTP server for Socket.IO
const server = createServer(app);

// Initialize Chat Socket Manager
const chatManager = new ChatSocketManager(server);

// CORS configuration
app.use(cors({
    origin: process.env.CORS_ORIGIN || "http://localhost:3000",
    credentials: true
}))

app.use(cookieParser())

app.use(express.json({limit: "16kb"}))

app.use(express.urlencoded({
    limit: "16kb",
    extended: true
}))

app.use(express.static("public"));

// Make Socket.IO instance available to routes
app.use((req, res, next) => {
    req.io = chatManager.getIO();
    req.chatManager = chatManager;
    next();
});

// Routes
app.use("/api/v1/auth", authRouter);
app.use("/api/v1/chat", chatRouter);
// app.use("/api/v1/bot", botRouter)

// Health check endpoint
app.get("/api/v1/health", (req, res) => {
    const stats = chatManager.getConnectionStats();
    res.json({
        success: true,
        message: "Kisaan Sahayak API is running",
        socketConnections: stats,
        timestamp: new Date().toISOString()
    });
});

// Socket connection info endpoint
app.get("/api/v1/chat/stats", (req, res) => {
    const stats = chatManager.getConnectionStats();
    res.json({
        success: true,
        data: stats
    });
});

app.use(handleAsyncErrors);

// Export both app and server
export { app, server };
export default server;