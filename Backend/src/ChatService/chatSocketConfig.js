import { Server } from 'socket.io';
import jwt from 'jsonwebtoken';
import chatControllers from './chat.controller.js';
import chatServiceModels from './models/index.js';
import models from '../models/index.js';

const { conversationModel, messageModel } = chatServiceModels;
const { userModel } = models;

const {
    getOrCreateConversation,
    getMessages,
    sendFarmerMessage,
    sendProactiveMessage,
    markAsRead,
    generateAIResponse
} = chatControllers;

class ChatSocketManager {
    constructor(server) {
        this.io = new Server(server, {
            cors: {
                origin: process.env.CLIENT_URL || "http://localhost:3000",
                methods: ["GET", "POST"],
                credentials: true
            },
            pingTimeout: 60000,
            pingInterval: 25000
        });

        this.connectedUsers = new Map(); // Store user connections
        this.setupMiddleware();
        this.setupEventHandlers();
        
        console.log('🌾 Kisaan Sahayak Chat Socket Server initialized');
    }

    // Authentication middleware for socket connections
    setupMiddleware() {
        this.io.use(async (socket, next) => {
            try {
                const token = socket.handshake.auth.token || socket.handshake.headers.authorization?.split(' ')[1];
                
                if (!token) {
                    return next(new Error('Authentication token required'));
                }

                // Verify JWT token
                const decoded = jwt.verify(token, process.env.JWT_SECRET);
                
                // Attach user info to socket
                socket.userId = decoded.id || decoded._id;
                socket.userRole = decoded.role || 'farmer';
                socket.name = decoded.name;
                
                console.log(`🔐 User authenticated: ${socket.name} (${socket.userId})`);
                next();
                
            } catch (error) {
                console.error('Socket authentication error:', error.message);
                next(new Error('Invalid authentication token'));
            }
        });
    }

    setupEventHandlers() {
        this.io.on('connection', (socket) => {
            console.log(`👤 User connected: ${socket.name} (${socket.userId})`);
            
            // Store user connection
            this.connectedUsers.set(socket.userId, {
                socketId: socket.id,
                socket: socket,
                name: socket.name,
                userRole: socket.userRole,
                connectedAt: new Date()
            });

            // Join user to their personal room for direct AI communication
            socket.join(`user_${socket.userId}`);
            
            // Setup event handlers for this socket
            this.handleFarmerEvents(socket);
            this.handleAdminEvents(socket);
            this.handleGeneralEvents(socket);
            
            // Handle disconnection
            socket.on('disconnect', () => {
                console.log(`👋 User disconnected: ${socket.name} (${socket.userId})`);
                this.connectedUsers.delete(socket.userId);
            });
        });
    }

    // Handle farmer-specific events
    handleFarmerEvents(socket) {
        // Farmer joins their conversation with AI
        socket.on('join_conversation', async (data) => {
            try {
                console.log(`💬 ${socket.name} joining conversation with AI`);
                
                // Get or create conversation with AI
                const conversation = await this.getOrCreateConversationForSocket(socket.userId);
                
                // Join conversation room (farmer + AI)
                socket.join(`conversation_${conversation._id}`);
                
                // Send conversation info back
                socket.emit('conversation_joined', {
                    success: true,
                    conversationId: conversation._id,
                    message: 'Successfully joined conversation with AI assistant'
                });
                
                // Send recent messages
                const messages = await this.getRecentMessages(conversation._id);
                socket.emit('message_history', {
                    success: true,
                    messages: messages
                });
                
            } catch (error) {
                console.error('Error joining conversation:', error);
                socket.emit('error', {
                    success: false,
                    message: 'Failed to join conversation',
                    error: error.message
                });
            }
        });

        // Handle farmer sending message to AI
        socket.on('send_message', async (data) => {
            try {
                const { content, messageType = 'text', imageUrl = null } = data;
                
                console.log(`📝 ${socket.name} sending message to AI: ${content?.substring(0, 50)}...`);
                
                // Get conversation first
                const conversation = await this.getOrCreateConversationForSocket(socket.userId);
                
                // Save farmer message to database
                const message = await this.saveFarmerMessage(conversation._id, {
                    content,
                    messageType,
                    imageUrl
                });
                
                // Emit message to farmer (confirmation)
                socket.emit('message_sent', {
                    success: true,
                    message: message
                });
                
                // Generate AI response
                setTimeout(async () => {
                    await this.generateAndSendAIResponse(conversation._id, message, socket);
                }, 1000); // Small delay for natural feel
                
            } catch (error) {
                console.error('Error sending message:', error);
                socket.emit('error', {
                    success: false,
                    message: 'Failed to send message',
                    error: error.message
                });
            }
        });

        // Handle typing indicators (farmer typing to AI)
        socket.on('typing_start', (data) => {
            // In one-on-one chat, we can show "farmer is typing" to admins monitoring
            this.io.to('admin_monitoring').emit('farmer_typing', {
                farmerId: socket.userId,
                farmerName: socket.name,
                conversationId: data.conversationId,
                isTyping: true
            });
        });

        socket.on('typing_stop', (data) => {
            this.io.to('admin_monitoring').emit('farmer_typing', {
                farmerId: socket.userId,
                farmerName: socket.name,
                conversationId: data.conversationId,
                isTyping: false
            });
        });

        // Mark messages as read
        socket.on('mark_messages_read', async (data) => {
            try {
                const { conversationId } = data;
                
                await this.markMessagesAsRead(conversationId, socket.userId);
                
                socket.emit('messages_marked_read', {
                    success: true,
                    conversationId
                });
                
            } catch (error) {
                console.error('Error marking messages as read:', error);
                socket.emit('error', {
                    success: false,
                    message: 'Failed to mark messages as read'
                });
            }
        });
    }

    // Handle admin-specific events
    handleAdminEvents(socket) {
        if (socket.userRole !== 'admin') return;

        // Admin joins monitoring mode for all farmer-AI conversations
        socket.on('admin_monitor_all', () => {
            socket.join('admin_monitoring');
            console.log(`👨‍💼 Admin ${socket.name} started monitoring all farmer-AI conversations`);
        });

        // Admin sends proactive message to specific farmer
        socket.on('send_proactive_message', async (data) => {
            try {
                const { farmerId, content, alertType } = data;
                
                // Get farmer's conversation
                const conversation = await conversationModel.findOne({ farmerId });
                if (!conversation) {
                    throw new Error('Conversation not found for farmer');
                }
                
                const message = await sendProactiveMessage(conversation._id, {
                    content,
                    alertType
                });
                
                // Send to specific farmer if online
                this.io.to(`user_${farmerId}`).emit('proactive_alert', {
                    message: message,
                    alertType: alertType
                });
                
                socket.emit('proactive_message_sent', {
                    success: true,
                    message: message
                });
                
            } catch (error) {
                console.error('Error sending proactive message:', error);
                socket.emit('error', {
                    success: false,
                    message: 'Failed to send proactive message',
                    error: error.message
                });
            }
        });
    }

    // Handle general events
    handleGeneralEvents(socket) {
        // Ping/pong for connection health
        socket.on('ping', () => {
            socket.emit('pong', { timestamp: Date.now() });
        });

        // Get online status
        socket.on('get_online_users', () => {
            const onlineUsers = Array.from(this.connectedUsers.values()).map(user => ({
                userId: user.socketId,
                name: user.name,
                userRole: user.userRole
            }));
            
            socket.emit('online_users', onlineUsers);
        });

        // Handle errors
        socket.on('error', (error) => {
            console.error(`Socket error from ${socket.name}:`, error);
        });
    }

    // Helper methods
    async getOrCreateConversationForSocket(farmerId) {
        try {
            // Check if farmer exists
            const farmer = await userModel.findById(farmerId);
            if (!farmer) {
                throw new Error('Farmer not found');
            }

            // Find existing conversation or create new one
            let conversation = await conversationModel.findOne({ farmerId })
                .populate('lastMessage');
            
            if (!conversation) {
                conversation = new conversationModel({ farmerId });
                await conversation.save();
                
                // Send welcome message from AI
                await this.sendWelcomeMessage(conversation._id, farmer.name);
                
                // Fetch conversation with welcome message
                conversation = await conversationModel.findById(conversation._id)
                    .populate('lastMessage');
            }

            return conversation;
        } catch (error) {
            console.error('Error getting/creating conversation:', error);
            throw error;
        }
    }

    async getRecentMessages(conversationId) {
        try {
            const messages = await messageModel.find({ conversationId })
                .sort({ createdAt: -1 })
                .limit(50);

            return messages.reverse(); // Return in chronological order
        } catch (error) {
            console.error('Error getting recent messages:', error);
            throw error;
        }
    }

    async saveFarmerMessage(conversationId, messageData) {
        try {
            const conversation = await conversationModel.findById(conversationId);
            if (!conversation) {
                throw new Error('Conversation not found');
            }

            const { content, messageType = 'text', imageUrl } = messageData;

            // Create farmer message
            const message = new messageModel({
                conversationId,
                senderId: conversation.farmerId.toString(),
                senderType: 'farmer',
                messageType,
                content,
                imageUrl,
                status: 'sent'
            });

            await message.save();

            // Update conversation
            await conversationModel.findByIdAndUpdate(conversationId, {
                lastMessage: message._id,
                lastActivity: new Date()
            });

            return message;
        } catch (error) {
            console.error('Error saving farmer message:', error);
            throw error;
        }
    }

    async generateAndSendAIResponse(conversationId, farmerMessage, socket) {
        try {
            console.log('🤖 Generating AI response...');
            
            // Simulate AI thinking time
            socket.emit('ai_typing', { isTyping: true });
            
            // Generate AI response using controller function
            const aiResponse = await generateAIResponse(conversationId, farmerMessage, this.io);
            
            socket.emit('ai_typing', { isTyping: false });
            
            // Send AI response directly to the farmer
            socket.emit('new_message', {
                message: aiResponse,
                from: 'ai'
            });
            
            // Notify admins monitoring about the AI response
            this.io.to('admin_monitoring').emit('ai_response_sent', {
                farmerId: socket.userId,
                farmerName: socket.name,
                conversationId: conversationId,
                aiResponse: aiResponse
            });
            
        } catch (error) {
            console.error('Error generating AI response:', error);
            socket.emit('ai_typing', { isTyping: false });
            socket.emit('ai_error', {
                message: 'AI temporarily unavailable. Please try again.'
            });
        }
    }

    async markMessagesAsRead(conversationId, userId) {
        try {
            // Mark all unread AI messages as read
            await messageModel.updateMany(
                { 
                    conversationId, 
                    senderType: 'ai_agent',
                    status: { $ne: 'read' }
                },
                { 
                    status: 'read',
                    readAt: new Date()
                }
            );

            // Reset unread count
            await conversationModel.findByIdAndUpdate(conversationId, {
                unreadCount: 0
            });

            return true;
        } catch (error) {
            console.error('Error marking messages as read:', error);
            throw error;
        }
    }

    async sendWelcomeMessage(conversationId, farmerName) {
        const welcomeContent = `Hello ${farmerName}! I'm your Agricultural Assistant. I can help you with:

🌱 Crop problem solutions
🌦️ Weather updates and advice  
🐛 Pest and disease identification
💰 Government scheme information
📊 Market prices and selling advice

Feel free to ask me any farming-related questions!`;

        const message = new messageModel({
            conversationId,
            senderId: 'kisaan_sahayak',
            senderType: 'ai_agent',
            messageType: 'text',
            content: welcomeContent,
            isProactive: true,
            alertType: 'welcome',
            status: 'sent'
        });

        await message.save();
        
        await conversationModel.findByIdAndUpdate(conversationId, {
            lastMessage: message._id,
            lastActivity: new Date(),
            unreadCount: 1
        });

        return message;
    }

    // Method to send proactive messages from external services
    async sendProactiveMessageToFarmer(farmerId, messageData) {
        try {
            // Get farmer's conversation
            const conversation = await conversationModel.findOne({ farmerId });
            if (!conversation) {
                throw new Error('Conversation not found for farmer');
            }

            const message = await sendProactiveMessage(conversation._id, messageData);
            
            // Send to farmer if online
            this.io.to(`user_${farmerId}`).emit('proactive_alert', {
                message: message,
                alertType: messageData.alertType || 'general'
            });
            
            return message;
        } catch (error) {
            console.error('Error sending proactive message:', error);
            throw error;
        }
    }

    // Method to broadcast to all farmers (for emergency alerts)
    async broadcastToAllFarmers(message, alertType = 'emergency') {
        console.log(`📢 Broadcasting ${alertType} alert to all farmers`);
        
        this.io.emit('emergency_alert', {
            message: message,
            alertType: alertType,
            timestamp: new Date()
        });
    }

    // Get connection stats
    getConnectionStats() {
        return {
            totalConnections: this.connectedUsers.size,
            farmers: Array.from(this.connectedUsers.values()).filter(u => u.userRole === 'farmer').length,
            admins: Array.from(this.connectedUsers.values()).filter(u => u.userRole === 'admin').length
        };
    }

    // Get IO instance for external use
    getIO() {
        return this.io;
    }
}

export default ChatSocketManager;