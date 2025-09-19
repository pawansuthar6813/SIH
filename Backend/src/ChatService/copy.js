// Enhanced Authentication Middleware for chatSocketConfig.js
// Handles both farmer/admin JWT tokens and AI agent bot tokens

import { Server } from 'socket.io';
import jwt from 'jsonwebtoken';
import chatControllers from './chat.controller.js';
import chatServiceModels from './models/index.js';
import models from '../models/index.js';

const { conversationModel, messageModel } = chatServiceModels;
const { userModel } = models;

class ChatSocketManager {
    constructor(server) {
        this.io = new Server(server, {
            cors: {
                origin: process.env.CLIENT_URL || "http://localhost:3000",
                methods: ["GET", "POST"],
                credentials: true
            },
            pingTimeout: 60000,
            pingInterval: 25000,
            maxHttpBufferSize: 50e6,
            allowEIO3: true,
            transports: ['websocket', 'polling']
        });

        this.connectedUsers = new Map();
        this.connectedAIAgents = new Map(); // Track AI agent connections
        this.activeUploads = new Map();
        this.typingUsers = new Map();
        
        this.setupMiddleware();
        this.setupEventHandlers();
        
        console.log('🌾 Kisaan Sahayak Chat Socket Server initialized');
    }

    // Enhanced authentication middleware
    setupMiddleware() {
        this.io.use(async (socket, next) => {
            try {
                const token = socket.handshake.auth.token || 
                            socket.handshake.headers.authorization?.split(' ')[1] ||
                            socket.handshake.query.token;
                
                if (!token) {
                    return next(new Error('Authentication token required'));
                }

                // Try to verify as user token first
                try {
                    const decoded = jwt.verify(token, process.env.ACCESS_TOKEN_SECRET_KEY);
                    const user = await userModel.findById(decoded.id);
                    
                    if (user) {
                        // Regular user (farmer/admin)
                        socket.userId = user._id.toString();
                        socket.userRole = user.role;
                        socket.userName = user.name;
                        socket.user = user;
                        socket.connectionType = 'user';
                        
                        console.log(`🔐 User authenticated: ${socket.userName} (${socket.userId})`);
                        return next();
                    }
                } catch (jwtError) {
                    // If regular token fails, try bot token
                }

                // Try to verify as AI agent bot token
                try {
                    const botDecoded = jwt.verify(token, process.env.JWT_SECRET);
                    
                    if (botDecoded.role === 'assistant' && botDecoded.name === 'Kisaan Sahayak') {
                        // AI Agent connection
                        socket.userId = 'kisaan_sahayak';
                        socket.userRole = 'ai_agent';
                        socket.userName = botDecoded.name;
                        socket.farmerId = botDecoded.farmerId; // Associated farmer
                        socket.connectionType = 'ai_agent';
                        socket.botToken = token;
                        
                        console.log(`🤖 AI Agent authenticated for farmer: ${socket.farmerId}`);
                        return next();
                    }
                } catch (botTokenError) {
                    return next(new Error('Invalid authentication token'));
                }
                
                return next(new Error('Authentication failed'));
                
            } catch (error) {
                console.error('Socket authentication error:', error.message);
                next(new Error('Authentication failed'));
            }
        });
    }

    setupEventHandlers() {
        this.io.on('connection', (socket) => {
            console.log(`👤 Connection: ${socket.userName} (${socket.connectionType})`);
            
            if (socket.connectionType === 'user') {
                // Store user connection
                this.connectedUsers.set(socket.userId, {
                    socketId: socket.id,
                    socket: socket,
                    name: socket.userName,
                    userRole: socket.userRole,
                    connectedAt: new Date()
                });

                // Join user to their personal room
                socket.join(`user_${socket.userId}`);
                
                // Setup event handlers based on user role
                if (socket.userRole === 'farmer') {
                    this.handleFarmerEvents(socket);
                } else if (socket.userRole === 'admin') {
                    this.handleAdminEvents(socket);
                }
            } else if (socket.connectionType === 'ai_agent') {
                // Store AI agent connection
                this.connectedAIAgents.set(socket.farmerId, {
                    socketId: socket.id,
                    socket: socket,
                    name: socket.userName,
                    farmerId: socket.farmerId,
                    connectedAt: new Date()
                });

                // Join AI agent to farmer's conversation room
                socket.join(`user_${socket.farmerId}`);
                socket.join(`ai_agent_${socket.farmerId}`);
                
                this.handleAIAgentEvents(socket);
            }
            
            this.handleMediaEvents(socket);
            this.handleGeneralEvents(socket);
            
            // Handle disconnection
            socket.on('disconnect', (reason) => {
                console.log(`👋 ${socket.connectionType} disconnected: ${socket.userName} (${reason})`);
                
                if (socket.connectionType === 'user') {
                    this.connectedUsers.delete(socket.userId);
                    this.typingUsers.delete(socket.userId);
                    this.cleanupActiveUploads(socket.userId);
                } else if (socket.connectionType === 'ai_agent') {
                    this.connectedAIAgents.delete(socket.farmerId);
                }
            });
        });
    }

    // New: Handle AI agent specific events
    handleAIAgentEvents(socket) {
        // AI agent sends response to farmer
        socket.on('send_ai_response', async (data, callback) => {
            try {
                const { conversationId, content, messageType = 'text', alertType } = data;
                
                if (!conversationId || !content) {
                    const error = { success: false, message: 'conversationId and content are required' };
                    if (callback) callback(error);
                    return;
                }

                // Verify AI agent is authorized for this conversation
                const conversation = await conversationModel.findOne({ 
                    _id: conversationId, 
                    farmerId: socket.farmerId 
                });
                
                if (!conversation) {
                    const error = { success: false, message: 'Unauthorized conversation access' };
                    if (callback) callback(error);
                    return;
                }

                console.log(`🤖 AI Agent sending response to conversation: ${conversationId}`);

                // Create AI response message
                const aiMessage = new messageModel({
                    conversationId,
                    senderId: 'kisaan_sahayak',
                    senderType: 'ai_agent',
                    messageType,
                    content,
                    isProactive: alertType ? true : false,
                    alertType: alertType || undefined,
                    status: 'sent'
                });

                await aiMessage.save();

                // Update conversation
                await conversationModel.findByIdAndUpdate(conversationId, {
                    lastMessage: aiMessage._id,
                    lastActivity: new Date(),
                    $inc: { unreadCount: 1, totalMessages: 1 }
                });

                // Emit to farmer
                this.io.to(`user_${socket.farmerId}`).emit('new_message', {
                    type: 'ai_response',
                    message: aiMessage
                });

                // Emit to conversation room (for admins monitoring)
                this.io.to(`conversation_${conversationId}`).emit('new_message', {
                    type: 'ai_response',
                    message: aiMessage
                });

                if (callback) callback({
                    success: true,
                    message: aiMessage
                });

            } catch (error) {
                console.error('Error sending AI response:', error);
                if (callback) callback({ success: false, error: error.message });
            }
        });

        // AI agent requests conversation context
        socket.on('get_conversation_context', async (data, callback) => {
            try {
                const { conversationId, limit = 10 } = data;
                
                // Verify authorization
                const conversation = await conversationModel.findOne({ 
                    _id: conversationId, 
                    farmerId: socket.farmerId 
                });
                
                if (!conversation) {
                    const error = { success: false, message: 'Unauthorized conversation access' };
                    if (callback) callback(error);
                    return;
                }

                // Get recent messages for context
                const messages = await messageModel.find({ conversationId })
                    .sort({ createdAt: -1 })
                    .limit(limit)
                    .populate('conversationId', 'farmerId');

                // Get farmer details
                const farmer = await userModel.findById(socket.farmerId);

                if (callback) callback({
                    success: true,
                    data: {
                        conversation,
                        messages: messages.reverse(), // Chronological order
                        farmer: {
                            name: farmer.name,
                            state: farmer.state,
                            district: farmer.district,
                            preferredLanguage: farmer.preferredLanguage
                        }
                    }
                });

            } catch (error) {
                console.error('Error getting conversation context:', error);
                if (callback) callback({ success: false, error: error.message });
            }
        });

        // AI agent indicates typing
        socket.on('ai_typing_start', (data) => {
            const { conversationId } = data;
            this.io.to(`user_${socket.farmerId}`).emit('ai_typing', {
                conversationId,
                isTyping: true
            });
        });

        socket.on('ai_typing_stop', (data) => {
            const { conversationId } = data;
            this.io.to(`user_${socket.farmerId}`).emit('ai_typing', {
                conversationId,
                isTyping: false
            });
        });

        // AI agent health check
        socket.on('ai_health_check', (callback) => {
            if (callback) callback({
                success: true,
                status: 'healthy',
                farmerId: socket.farmerId,
                timestamp: new Date()
            });
        });
    }

    // Enhanced farmer events to work with AI agents
    handleFarmerEvents(socket) {
        // Farmer joins conversation (existing code)
        socket.on('join_conversation', async (callback) => {
            try {
                console.log(`💬 ${socket.userName} joining conversation`);
                
                const mockReq = { user: socket.user, io: this.io };
                const mockRes = {
                    status: (code) => ({
                        json: (data) => {
                            if (data.success) {
                                const conversation = data.data;
                                socket.join(`conversation_${conversation._id}`);
                                
                                // Notify AI agent if connected
                                this.notifyAIAgent(socket.userId, 'farmer_joined', {
                                    conversationId: conversation._id
                                });
                                
                                if (callback) callback({
                                    success: true,
                                    conversationId: conversation._id,
                                    conversation: conversation
                                });
                                
                                socket.emit('conversation_joined', {
                                    success: true,
                                    conversationId: conversation._id,
                                    conversation: conversation
                                });
                            } else {
                                if (callback) callback({ success: false, error: data.message });
                            }
                            return this;
                        }
                    })
                };
                
                await getOrCreateConversation(mockReq, mockRes, (error) => {
                    console.error('Error in getOrCreateConversation:', error);
                    if (callback) callback({ success: false, error: error.message });
                });
                
            } catch (error) {
                console.error('Error joining conversation:', error);
                if (callback) callback({ success: false, error: error.message });
            }
        });

        // Enhanced send message to notify AI agent
        socket.on('send_message', async (data, callback) => {
            try {
                const { conversationId, content, messageType = 'text' } = data;
                
                if (!conversationId || !content) {
                    const error = { success: false, message: 'conversationId and content are required' };
                    if (callback) callback(error);
                    return;
                }
                
                console.log(`📝 ${socket.userName} sending ${messageType} message`);
                
                const mockReq = {
                    user: socket.user,
                    body: { conversationId, content, messageType },
                    io: this.io
                };
                
                const mockRes = {
                    status: (code) => ({
                        json: (response) => {
                            if (response.success) {
                                // Emit to conversation room
                                this.io.to(`conversation_${conversationId}`).emit('new_message', {
                                    type: 'farmer_message',
                                    message: response.data
                                });
                                
                                // Notify AI agent about new farmer message
                                this.notifyAIAgent(socket.userId, 'new_farmer_message', {
                                    conversationId,
                                    message: response.data
                                });
                                
                                if (callback) callback({
                                    success: true,
                                    message: response.data
                                });
                            } else {
                                if (callback) callback({ success: false, error: response.message });
                            }
                            return this;
                        }
                    })
                };
                
                await sendFarmerMessage(mockReq, mockRes, (error) => {
                    console.error('Error sending message:', error);
                    if (callback) callback({ success: false, error: error.message });
                });
                
            } catch (error) {
                console.error('Error sending message:', error);
                if (callback) callback({ success: false, error: error.message });
            }
        });

        // Rest of farmer events remain the same...
    }

    // Helper method to notify AI agents
    notifyAIAgent(farmerId, eventType, data) {
        const aiAgent = this.connectedAIAgents.get(farmerId);
        if (aiAgent) {
            aiAgent.socket.emit(eventType, data);
            console.log(`🔔 Notified AI agent for farmer ${farmerId}: ${eventType}`);
        }
    }

    // Method to connect AI agent to farmer's conversation
    async connectAIAgentToFarmer(farmerId) {
        try {
            // Generate bot token for this farmer
            const response = await fetch(`${process.env.BACKEND_URL}/chat/bot-token`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ farmerId })
            });
            
            const { botToken } = await response.json();
            
            // Connect AI agent with bot token
            const aiSocket = require('socket.io-client')(`${process.env.BACKEND_URL}`, {
                auth: { token: botToken },
                transports: ['websocket']
            });
            
            aiSocket.on('connect', () => {
                console.log(`🤖 AI Agent connected for farmer: ${farmerId}`);
            });
            
            return aiSocket;
        } catch (error) {
            console.error('Error connecting AI agent:', error);
            throw error;
        }
    }

    // Enhanced connection stats
    getConnectionStats() {
        const farmers = Array.from(this.connectedUsers.values()).filter(u => u.userRole === 'farmer');
        const admins = Array.from(this.connectedUsers.values()).filter(u => u.userRole === 'admin');
        const aiAgents = Array.from(this.connectedAIAgents.values());
        
        return {
            totalConnections: this.connectedUsers.size + this.connectedAIAgents.size,
            farmers: farmers.length,
            admins: admins.length,
            aiAgents: aiAgents.length,
            activeUploads: this.activeUploads.size,
            typingUsers: this.typingUsers.size,
            farmersOnline: farmers.map(f => ({
                id: f.socketId,
                name: f.name,
                connectedAt: f.connectedAt
            })),
            adminsOnline: admins.map(a => ({
                id: a.socketId,
                name: a.name,
                connectedAt: a.connectedAt
            })),
            aiAgentsOnline: aiAgents.map(ai => ({
                id: ai.socketId,
                name: ai.name,
                farmerId: ai.farmerId,
                connectedAt: ai.connectedAt
            }))
        };
    }

    // Rest of the methods remain the same...
}

export default ChatSocketManager;