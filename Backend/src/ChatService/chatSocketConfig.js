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
    generateAIResponse,
    broadcastEmergencyMessage
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
            pingInterval: 25000,
            maxHttpBufferSize: 50e6, // 50MB for large media files
            allowEIO3: true,
            transports: ['websocket', 'polling']
        });

        this.connectedUsers = new Map(); // Store user connections
        this.activeUploads = new Map(); // Track active file uploads
        this.typingUsers = new Map(); // Track typing status
        
        this.setupMiddleware();
        this.setupEventHandlers();
        
        console.log('🌾 Kisaan Sahayak Chat Socket Server initialized');
    }

    // Authentication middleware for socket connections
    setupMiddleware() {
        this.io.use(async (socket, next) => {
            try {
                const token = socket.handshake.auth.token || 
                            socket.handshake.headers.authorization?.split(' ')[1] ||
                            socket.handshake.query.token;
                
                if (!token) {
                    return next(new Error('Authentication token required'));
                }

                // Verify JWT token
                let decoded;
                try {
                    decoded = jwt.verify(token, process.env.ACCESS_TOKEN_SECRET_KEY);
                } catch (jwtError) {
                    return next(new Error('Invalid authentication token'));
                }
                
                // Get user from database
                const user = await userModel.findById(decoded.id);
                if (!user) {
                    return next(new Error('User not found'));
                }

                // Attach user info to socket
                socket.userId = user._id.toString();
                socket.userRole = user.role;
                socket.userName = user.name;
                socket.user = user;
                
                console.log(`🔐 User authenticated: ${socket.userName} (${socket.userId})`);
                next();
                
            } catch (error) {
                console.error('Socket authentication error:', error.message);
                next(new Error('Authentication failed'));
            }
        });
    }

    setupEventHandlers() {
        this.io.on('connection', (socket) => {
            console.log(`👤 User connected: ${socket.userName} (${socket.userId})`);
            
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
            
            this.handleMediaEvents(socket);
            this.handleGeneralEvents(socket);
            
            // Handle disconnection
            socket.on('disconnect', (reason) => {
                console.log(`👋 User disconnected: ${socket.userName} (${reason})`);
                this.connectedUsers.delete(socket.userId);
                this.typingUsers.delete(socket.userId);
                this.cleanupActiveUploads(socket.userId);
            });
        });
    }

    // Handle farmer-specific events
    handleFarmerEvents(socket) {
        // Farmer joins their conversation with AI
        socket.on('join_conversation', async (callback) => {
            try {
                console.log(`💬 ${socket.userName} joining conversation`);
                
                // Create mock request object for controller
                const mockReq = {
                    user: socket.user,
                    io: this.io
                };
                const mockRes = {
                    status: (code) => ({
                        json: (data) => {
                            if (data.success) {
                                const conversation = data.data;
                                // Join conversation room
                                socket.join(`conversation_${conversation._id}`);
                                
                                // Send success response
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
                socket.emit('error', {
                    type: 'JOIN_CONVERSATION_ERROR',
                    message: 'Failed to join conversation',
                    error: error.message
                });
            }
        });

        // Get conversation messages
        socket.on('get_messages', async (data, callback) => {
            try {
                const { conversationId, page = 1, limit = 50 } = data;
                
                const mockReq = {
                    user: socket.user,
                    params: { conversationId },
                    query: { page, limit }
                };
                
                const mockRes = {
                    status: (code) => ({
                        json: (response) => {
                            if (callback) callback({
                                success: response.success,
                                data: response.data
                            });
                            return this;
                        }
                    })
                };
                
                await getMessages(mockReq, mockRes, (error) => {
                    console.error('Error getting messages:', error);
                    if (callback) callback({ success: false, error: error.message });
                });
                
            } catch (error) {
                console.error('Error getting messages:', error);
                if (callback) callback({ success: false, error: error.message });
            }
        });

        // Handle farmer sending message to AI
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
                socket.emit('error', {
                    type: 'SEND_MESSAGE_ERROR',
                    message: 'Failed to send message',
                    error: error.message
                });
            }
        });

        // Handle typing indicators
        socket.on('typing_start', (data) => {
            const { conversationId } = data;
            this.typingUsers.set(socket.userId, {
                conversationId,
                startedAt: new Date()
            });
            
            // Notify admins monitoring this conversation
            this.io.to('admin_monitoring').emit('farmer_typing', {
                farmerId: socket.userId,
                farmerName: socket.userName,
                conversationId,
                isTyping: true
            });
        });

        socket.on('typing_stop', (data) => {
            const { conversationId } = data;
            this.typingUsers.delete(socket.userId);
            
            this.io.to('admin_monitoring').emit('farmer_typing', {
                farmerId: socket.userId,
                farmerName: socket.userName,
                conversationId,
                isTyping: false
            });
        });

        // Mark messages as read
        socket.on('mark_messages_read', async (data, callback) => {
            try {
                const { conversationId } = data;
                
                const mockReq = {
                    user: socket.user,
                    params: { conversationId }
                };
                
                const mockRes = {
                    status: (code) => ({
                        json: (response) => {
                            if (callback) callback({
                                success: response.success,
                                message: response.message
                            });
                            return this;
                        }
                    })
                };
                
                await markAsRead(mockReq, mockRes, (error) => {
                    console.error('Error marking as read:', error);
                    if (callback) callback({ success: false, error: error.message });
                });
                
            } catch (error) {
                console.error('Error marking messages as read:', error);
                if (callback) callback({ success: false, error: error.message });
            }
        });
    }

    // Handle media upload events
    handleMediaEvents(socket) {
        // Handle chunked file upload for large files
        socket.on('upload_chunk', async (data) => {
            try {
                const { 
                    fileId, 
                    chunkIndex, 
                    chunkData, 
                    totalChunks, 
                    fileType, 
                    fileName,
                    conversationId 
                } = data;
                
                // Initialize upload tracking if first chunk
                if (chunkIndex === 0) {
                    this.activeUploads.set(fileId, {
                        userId: socket.userId,
                        conversationId,
                        fileType,
                        fileName,
                        totalChunks,
                        receivedChunks: new Map(),
                        startedAt: new Date()
                    });
                    
                    console.log(`📤 ${socket.userName} starting file upload: ${fileName}`);
                }
                
                const upload = this.activeUploads.get(fileId);
                if (!upload) {
                    throw new Error('Upload session not found');
                }
                
                // Validate chunk belongs to user
                if (upload.userId !== socket.userId) {
                    throw new Error('Upload session does not belong to user');
                }
                
                // Store chunk
                upload.receivedChunks.set(chunkIndex, Buffer.from(chunkData, 'base64'));
                
                // Calculate and emit progress
                const progress = (upload.receivedChunks.size / totalChunks) * 100;
                socket.emit('upload_progress', {
                    fileId,
                    progress: Math.round(progress),
                    receivedChunks: upload.receivedChunks.size,
                    totalChunks
                });
                
                // Check if all chunks received
                if (upload.receivedChunks.size === totalChunks) {
                    await this.processCompleteUpload(fileId, socket);
                }
                
            } catch (error) {
                console.error('Error handling upload chunk:', error);
                socket.emit('upload_error', {
                    fileId: data.fileId,
                    error: error.message
                });
                // Clean up failed upload
                this.activeUploads.delete(data.fileId);
            }
        });

        // Handle upload cancellation
        socket.on('cancel_upload', (data) => {
            const { fileId } = data;
            console.log(`❌ ${socket.userName} cancelled upload: ${fileId}`);
            this.activeUploads.delete(fileId);
            socket.emit('upload_cancelled', { fileId });
        });

        // Handle simple media message (for small files sent directly)
        socket.on('send_media_message', async (data, callback) => {
            try {
                const { 
                    conversationId, 
                    mediaData, 
                    messageType, 
                    fileName,
                    fileSize 
                } = data;
                
                if (!conversationId || !mediaData || !messageType) {
                    const error = { success: false, message: 'Missing required media data' };
                    if (callback) callback(error);
                    return;
                }
                
                console.log(`🎬 ${socket.userName} sending ${messageType} message: ${fileName}`);
                
                // TODO: Upload media to cloud storage
                // For now, we'll simulate the upload
                const mediaUrl = await this.simulateMediaUpload(mediaData, messageType, socket.userId);
                
                // Create message based on media type
                let messageData = {
                    conversationId,
                    messageType,
                    content: `${messageType} message`
                };
                
                if (messageType === 'image') {
                    messageData.imageUrl = mediaUrl;
                } else if (messageType === 'voice') {
                    messageData.voiceUrl = mediaUrl;
                    messageData.voiceDuration = data.duration || 0;
                    messageData.voiceSize = fileSize;
                } else if (messageType === 'video') {
                    messageData.videoUrl = mediaUrl;
                    messageData.videoDuration = data.duration || 0;
                    messageData.videoSize = fileSize;
                    messageData.videoThumbnail = data.thumbnail;
                }
                
                const mockReq = {
                    user: socket.user,
                    body: messageData,
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
                    console.error('Error sending media message:', error);
                    if (callback) callback({ success: false, error: error.message });
                });
                
            } catch (error) {
                console.error('Error sending media message:', error);
                if (callback) callback({ success: false, error: error.message });
            }
        });
    }

    // Handle admin-specific events
    handleAdminEvents(socket) {
        // Admin joins monitoring mode
        socket.on('admin_monitor_all', () => {
            socket.join('admin_monitoring');
            console.log(`👨‍💼 Admin ${socket.userName} monitoring all conversations`);
            
            socket.emit('admin_monitoring_started', {
                success: true,
                message: 'Now monitoring all farmer conversations'
            });
        });

        // Admin joins specific conversation monitoring
        socket.on('admin_monitor_conversation', (data) => {
            const { conversationId } = data;
            socket.join(`admin_monitor_${conversationId}`);
            console.log(`👨‍💼 Admin ${socket.userName} monitoring conversation: ${conversationId}`);
        });

        // Admin sends proactive message
        socket.on('send_proactive_message', async (data, callback) => {
            try {
                const { farmerId, content, alertType = 'general', messageType = 'text' } = data;
                
                if (!farmerId || !content) {
                    const error = { success: false, message: 'farmerId and content are required' };
                    if (callback) callback(error);
                    return;
                }
                
                // Get farmer's conversation
                const conversation = await conversationModel.findOne({ farmerId });
                if (!conversation) {
                    const error = { success: false, message: 'Conversation not found for farmer' };
                    if (callback) callback(error);
                    return;
                }
                
                const messageData = { content, alertType, messageType };
                const message = await sendProactiveMessage(conversation._id, messageData, this.io);
                
                // Send to specific farmer if online
                this.io.to(`user_${farmerId}`).emit('proactive_alert', {
                    message: message,
                    alertType: alertType
                });
                
                if (callback) callback({
                    success: true,
                    message: message
                });
                
                console.log(`📢 Admin ${socket.userName} sent proactive message to farmer ${farmerId}`);
                
            } catch (error) {
                console.error('Error sending proactive message:', error);
                if (callback) callback({ success: false, error: error.message });
            }
        });

        // Admin broadcasts emergency message
        socket.on('broadcast_emergency', async (data, callback) => {
            try {
                const { message, alertType = 'emergency' } = data;
                
                if (!message) {
                    const error = { success: false, message: 'Message content is required' };
                    if (callback) callback(error);
                    return;
                }
                
                const results = await broadcastEmergencyMessage(message, alertType, this.io);
                
                if (callback) callback({
                    success: true,
                    broadcastCount: results.length,
                    message: `Emergency broadcast sent to ${results.length} farmers`
                });
                
                console.log(`🚨 Admin ${socket.userName} broadcasted emergency to ${results.length} farmers`);
                
            } catch (error) {
                console.error('Error broadcasting emergency:', error);
                if (callback) callback({ success: false, error: error.message });
            }
        });
    }

    // Handle general events
    handleGeneralEvents(socket) {
        // Ping/pong for connection health
        socket.on('ping', (callback) => {
            const pong = { timestamp: Date.now(), server: 'kisaan_sahayak' };
            if (callback) callback(pong);
            socket.emit('pong', pong);
        });

        // Get online status
        socket.on('get_online_users', (callback) => {
            const onlineUsers = Array.from(this.connectedUsers.values()).map(user => ({
                userId: user.socketId,
                name: user.name,
                userRole: user.userRole,
                connectedAt: user.connectedAt
            }));
            
            const response = {
                success: true,
                onlineUsers,
                totalOnline: onlineUsers.length
            };
            
            if (callback) callback(response);
            socket.emit('online_users_list', response);
        });

        // Get connection stats
        socket.on('get_connection_stats', (callback) => {
            const stats = this.getConnectionStats();
            if (callback) callback({ success: true, stats });
        });

        // Handle errors
        socket.on('error', (error) => {
            console.error(`Socket error from ${socket.userName}:`, error);
        });
    }

    // Helper methods for media handling
    async processCompleteUpload(fileId, socket) {
        try {
            const upload = this.activeUploads.get(fileId);
            if (!upload) throw new Error('Upload not found');
            
            console.log(`✅ ${socket.userName} completed file upload: ${upload.fileName}`);
            
            // Reconstruct file from chunks
            const chunks = [];
            for (let i = 0; i < upload.totalChunks; i++) {
                chunks.push(upload.receivedChunks.get(i));
            }
            const completeFile = Buffer.concat(chunks);
            
            // TODO: Upload to cloud storage based on file type
            // For now, simulate upload
            let mediaUrl;
            let messageType;
            
            if (upload.fileType.startsWith('image/')) {
                mediaUrl = await this.simulateMediaUpload(completeFile, 'image', upload.userId);
                messageType = 'image';
            } else if (upload.fileType.startsWith('audio/')) {
                mediaUrl = await this.simulateMediaUpload(completeFile, 'voice', upload.userId);
                messageType = 'voice';
            } else if (upload.fileType.startsWith('video/')) {
                mediaUrl = await this.simulateMediaUpload(completeFile, 'video', upload.userId);
                messageType = 'video';
            } else {
                throw new Error('Unsupported file type');
            }
            
            // Create message data
            let messageData = {
                conversationId: upload.conversationId,
                messageType,
                content: `${messageType} message: ${upload.fileName}`
            };
            
            if (messageType === 'image') {
                messageData.imageUrl = mediaUrl;
            } else if (messageType === 'voice') {
                messageData.voiceUrl = mediaUrl;
                messageData.voiceDuration = upload.duration || 0;
                messageData.voiceSize = completeFile.length;
            } else if (messageType === 'video') {
                messageData.videoUrl = mediaUrl;
                messageData.videoDuration = upload.duration || 0;
                messageData.videoSize = completeFile.length;
                messageData.videoThumbnail = upload.thumbnail || null;
            }
            
            // Send message using controller
            const mockReq = {
                user: socket.user,
                body: messageData,
                io: this.io
            };
            
            const mockRes = {
                status: (code) => ({
                    json: (response) => {
                        if (response.success) {
                            // Clean up upload tracking
                            this.activeUploads.delete(fileId);
                            
                            // Emit success to farmer
                            socket.emit('upload_complete', {
                                success: true,
                                fileId,
                                message: response.data
                            });
                            
                            // Emit to conversation room
                            this.io.to(`conversation_${upload.conversationId}`).emit('new_message', {
                                type: 'farmer_message',
                                message: response.data
                            });
                        } else {
                            throw new Error(response.message);
                        }
                        return this;
                    }
                })
            };
            
            await sendFarmerMessage(mockReq, mockRes, (error) => {
                throw error;
            });
            
        } catch (error) {
            console.error('Error processing complete upload:', error);
            this.activeUploads.delete(fileId);
            socket.emit('upload_error', {
                fileId,
                error: error.message
            });
        }
    }

    // Simulate media upload (replace with actual cloud storage implementation)
    async simulateMediaUpload(mediaData, mediaType, userId) {
        // TODO: Implement actual cloud storage upload (Cloudinary, AWS S3, etc.)
        // For now, return simulated URLs
        const timestamp = Date.now();
        const fileExtensions = {
            image: 'jpg',
            voice: 'mp3',
            video: 'mp4'
        };
        
        const extension = fileExtensions[mediaType] || 'bin';
        return `https://res.cloudinary.com/kisaan-sahayak/${mediaType}/upload/v${timestamp}/${userId}_${mediaType}.${extension}`;
    }

    // Clean up active uploads for disconnected user
    cleanupActiveUploads(userId) {
        const uploadsToDelete = [];
        for (const [fileId, upload] of this.activeUploads.entries()) {
            if (upload.userId === userId) {
                uploadsToDelete.push(fileId);
            }
        }
        uploadsToDelete.forEach(fileId => {
            this.activeUploads.delete(fileId);
            console.log(`🧹 Cleaned up abandoned upload: ${fileId}`);
        });
    }

    // Public methods for external use
    
    // Send message to specific user
    async sendMessageToUser(userId, eventName, data) {
        this.io.to(`user_${userId}`).emit(eventName, data);
    }

    // Send message to all users with specific role
    async sendMessageToRole(role, eventName, data) {
        const targetUsers = Array.from(this.connectedUsers.values())
            .filter(user => user.userRole === role);
        
        targetUsers.forEach(user => {
            user.socket.emit(eventName, data);
        });
    }

    // Send proactive message from external services
    async sendProactiveMessageToFarmer(farmerId, messageData) {
        try {
            // Get farmer's conversation
            const conversation = await conversationModel.findOne({ farmerId });
            if (!conversation) {
                throw new Error('Conversation not found for farmer');
            }

            const message = await sendProactiveMessage(conversation._id, messageData, this.io);
            
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
        
        // Send via socket to all connected farmers
        const farmers = Array.from(this.connectedUsers.values())
            .filter(user => user.userRole === 'farmer');
        
        farmers.forEach(farmer => {
            farmer.socket.emit('emergency_alert', {
                message: message,
                alertType: alertType,
                timestamp: new Date()
            });
        });
        
        // Also save to database via controller
        try {
            await broadcastEmergencyMessage(message, alertType, this.io);
        } catch (error) {
            console.error('Error saving broadcast to database:', error);
        }
        
        return farmers.length;
    }

    // Send weather alerts to farmers in specific regions
    async sendWeatherAlert(states, districts, weatherData) {
        try {
            const targetFarmers = [];
            
            // Get farmers in specified regions
            const farmers = await userModel.find({
                role: 'farmer',
                $or: [
                    { state: { $in: states } },
                    { district: { $in: districts } }
                ]
            });
            
            for (const farmer of farmers) {
                // Check if farmer is online
                const connection = this.connectedUsers.get(farmer._id.toString());
                if (connection) {
                    targetFarmers.push(farmer);
                    
                    // Send weather alert
                    connection.socket.emit('weather_alert', {
                        message: weatherData.message,
                        alertType: 'weather',
                        weatherData: weatherData,
                        timestamp: new Date()
                    });
                }
                
                // Also send proactive message to conversation
                await this.sendProactiveMessageToFarmer(farmer._id, {
                    content: weatherData.message,
                    alertType: 'weather',
                    messageType: 'weather_alert'
                });
            }
            
            console.log(`🌦️ Weather alert sent to ${targetFarmers.length} farmers in regions: ${states.join(', ')}, ${districts.join(', ')}`);
            return targetFarmers.length;
            
        } catch (error) {
            console.error('Error sending weather alert:', error);
            throw error;
        }
    }

    // Send government scheme notifications
    async sendSchemeAlert(schemeData, targetCriteria = {}) {
        try {
            const query = { role: 'farmer', ...targetCriteria };
            const farmers = await userModel.find(query);
            
            let notificationsSent = 0;
            
            for (const farmer of farmers) {
                const connection = this.connectedUsers.get(farmer._id.toString());
                if (connection) {
                    connection.socket.emit('scheme_alert', {
                        message: schemeData.message,
                        alertType: 'government_scheme',
                        schemeData: schemeData,
                        timestamp: new Date()
                    });
                    notificationsSent++;
                }
                
                // Also send proactive message
                await this.sendProactiveMessageToFarmer(farmer._id, {
                    content: schemeData.message,
                    alertType: 'government_scheme',
                    messageType: 'scheme_alert'
                });
            }
            
            console.log(`🏛️ Government scheme alert sent to ${notificationsSent} farmers`);
            return notificationsSent;
            
        } catch (error) {
            console.error('Error sending scheme alert:', error);
            throw error;
        }
    }

    // Get connection statistics
    getConnectionStats() {
        const farmers = Array.from(this.connectedUsers.values()).filter(u => u.userRole === 'farmer');
        const admins = Array.from(this.connectedUsers.values()).filter(u => u.userRole === 'admin');
        
        return {
            totalConnections: this.connectedUsers.size,
            farmers: farmers.length,
            admins: admins.length,
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
            }))
        };
    }

    // Get specific user connection status
    isUserOnline(userId) {
        return this.connectedUsers.has(userId);
    }

    // Get all connected users of a specific role
    getConnectedUsersByRole(role) {
        return Array.from(this.connectedUsers.values())
            .filter(user => user.userRole === role);
    }

    // Disconnect user (admin function)
    disconnectUser(userId, reason = 'Admin action') {
        const user = this.connectedUsers.get(userId);
        if (user) {
            user.socket.disconnect(reason);
            console.log(`🔌 Admin disconnected user: ${user.name} (${reason})`);
            return true;
        }
        return false;
    }

    // Get IO instance for external use
    getIO() {
        return this.io;
    }

    // Graceful shutdown
    async shutdown() {
        console.log('🛑 Shutting down Chat Socket Manager...');
        
        // Notify all connected users
        this.io.emit('server_shutdown', {
            message: 'Server is shutting down. Please reconnect in a few moments.',
            timestamp: new Date()
        });
        
        // Clean up active uploads
        this.activeUploads.clear();
        this.typingUsers.clear();
        
        // Close all connections
        this.io.close();
        
        console.log('✅ Chat Socket Manager shutdown complete');
    }
}

export default ChatSocketManager;