// import { Server } from 'socket.io';
// import jwt from 'jsonwebtoken';
// import chatControllers from './chat.controller.js';
// import chatServiceModels from './models/index.js';
// import models from '../models/index.js';

// const { conversationModel, messageModel } = chatServiceModels;
// const { userModel } = models;

// const {
//     getOrCreateConversation,
//     getMessages,
//     sendFarmerMessage,
//     sendProactiveMessage,
//     markAsRead,
//     generateAIResponse
// } = chatControllers;

// class ChatSocketManager {
//     constructor(server) {
//         this.io = new Server(server, {
//             cors: {
//                 origin: process.env.CLIENT_URL || "http://localhost:3000",
//                 methods: ["GET", "POST"],
//                 credentials: true
//             },
//             pingTimeout: 60000,
//             pingInterval: 25000,
//             maxHttpBufferSize: 50e6, // 50MB for large video files
//             allowEIO3: true // Allow Engine.IO v3 clients
//         });

//         this.connectedUsers = new Map(); // Store user connections
//         this.activeUploads = new Map(); // Track active file uploads
//         this.setupMiddleware();
//         this.setupEventHandlers();
        
//         console.log('🌾 Kisaan Sahayak Chat Socket Server initialized with media support');
//     }

//     // Authentication middleware for socket connections
//     setupMiddleware() {
//         this.io.use(async (socket, next) => {
//             try {
//                 const token = socket.handshake.auth.token || socket.handshake.headers.authorization?.split(' ')[1];
                
//                 if (!token) {
//                     return next(new Error('Authentication token required'));
//                 }

//                 // Verify JWT token
//                 const decoded = jwt.verify(token, process.env.JWT_SECRET);
                
//                 // Attach user info to socket
//                 socket.userId = decoded.id || decoded._id;
//                 socket.userRole = decoded.role || 'farmer';
//                 socket.name = decoded.name;
                
//                 console.log(`🔐 User authenticated: ${socket.name} (${socket.userId})`);
//                 next();
                
//             } catch (error) {
//                 console.error('Socket authentication error:', error.message);
//                 next(new Error('Invalid authentication token'));
//             }
//         });
//     }

//     setupEventHandlers() {
//         this.io.on('connection', (socket) => {
//             console.log(`👤 User connected: ${socket.name} (${socket.userId})`);
            
//             // Store user connection
//             this.connectedUsers.set(socket.userId, {
//                 socketId: socket.id,
//                 socket: socket,
//                 name: socket.name,
//                 userRole: socket.userRole,
//                 connectedAt: new Date()
//             });

//             // Join user to their personal room for direct AI communication
//             socket.join(`user_${socket.userId}`);
            
//             // Setup event handlers for this socket
//             this.handleFarmerEvents(socket);
//             this.handleMediaEvents(socket); // NEW: Handle media events
//             this.handleAdminEvents(socket);
//             this.handleGeneralEvents(socket);
            
//             // Handle disconnection
//             socket.on('disconnect', () => {
//                 console.log(`👋 User disconnected: ${socket.name} (${socket.userId})`);
//                 this.connectedUsers.delete(socket.userId);
//                 // Clean up any active uploads for this user
//                 this.cleanupActiveUploads(socket.userId);
//             });
//         });
//     }

//     // Handle farmer-specific events
//     handleFarmerEvents(socket) {
//         // Farmer joins their conversation with AI
//         socket.on('join_conversation', async (data) => {
//             try {
//                 console.log(`💬 ${socket.name} joining conversation with AI`);
                
//                 // Get or create conversation with AI
//                 const conversation = await this.getOrCreateConversationForSocket(socket.userId);
                
//                 // Join conversation room (farmer + AI)
//                 socket.join(`conversation_${conversation._id}`);
                
//                 // Send conversation info back
//                 socket.emit('conversation_joined', {
//                     success: true,
//                     conversationId: conversation._id,
//                     message: 'Successfully joined conversation with AI assistant'
//                 });
                
//                 // Send recent messages
//                 const messages = await this.getRecentMessages(conversation._id);
//                 socket.emit('message_history', {
//                     success: true,
//                     messages: messages
//                 });
                
//             } catch (error) {
//                 console.error('Error joining conversation:', error);
//                 socket.emit('error', {
//                     success: false,
//                     message: 'Failed to join conversation',
//                     error: error.message
//                 });
//             }
//         });

//         // Handle farmer sending TEXT message to AI
//         socket.on('send_message', async (data) => {
//             try {
//                 const { content, messageType = 'text', imageUrl = null } = data;
                
//                 console.log(`📝 ${socket.name} sending ${messageType} message to AI`);
                
//                 // Get conversation first
//                 const conversation = await this.getOrCreateConversationForSocket(socket.userId);
                
//                 // Save farmer message to database
//                 const message = await this.saveFarmerMessage(conversation._id, {
//                     content,
//                     messageType,
//                     imageUrl
//                 });
                
//                 // Emit message to farmer (confirmation)
//                 socket.emit('message_sent', {
//                     success: true,
//                     message: message
//                 });
                
//                 // Generate AI response
//                 setTimeout(async () => {
//                     await this.generateAndSendAIResponse(conversation._id, message, socket);
//                 }, 1000); // Small delay for natural feel
                
//             } catch (error) {
//                 console.error('Error sending message:', error);
//                 socket.emit('error', {
//                     success: false,
//                     message: 'Failed to send message',
//                     error: error.message
//                 });
//             }
//         });

//         // Handle typing indicators (farmer typing to AI)
//         socket.on('typing_start', (data) => {
//             // In one-on-one chat, we can show "farmer is typing" to admins monitoring
//             this.io.to('admin_monitoring').emit('farmer_typing', {
//                 farmerId: socket.userId,
//                 farmerName: socket.name,
//                 conversationId: data.conversationId,
//                 isTyping: true
//             });
//         });

//         socket.on('typing_stop', (data) => {
//             this.io.to('admin_monitoring').emit('farmer_typing', {
//                 farmerId: socket.userId,
//                 farmerName: socket.name,
//                 conversationId: data.conversationId,
//                 isTyping: false
//             });
//         });

//         // Mark messages as read
//         socket.on('mark_messages_read', async (data) => {
//             try {
//                 const { conversationId } = data;
                
//                 await this.markMessagesAsRead(conversationId, socket.userId);
                
//                 socket.emit('messages_marked_read', {
//                     success: true,
//                     conversationId
//                 });
                
//             } catch (error) {
//                 console.error('Error marking messages as read:', error);
//                 socket.emit('error', {
//                     success: false,
//                     message: 'Failed to mark messages as read'
//                 });
//             }
//         });
//     }

//     // NEW: Handle media-specific events (voice, video, image)
//     handleMediaEvents(socket) {
//         // Handle voice message from farmer
//         socket.on('send_voice_message', async (data) => {
//             try {
//                 const { conversationId, voiceData, duration, size } = data;
                
//                 console.log(`🎤 ${socket.name} sending voice message (${duration}s)`);
                
//                 if (!conversationId || !voiceData || !duration) {
//                     throw new Error('Missing required voice data');
//                 }
                
//                 // Get conversation
//                 const conversation = await this.getOrCreateConversationForSocket(socket.userId);
                
//                 // In a real implementation, you would upload voiceData to cloud storage
//                 // For now, we'll simulate the voice URL
//                 const voiceUrl = await this.uploadAudioToCloudinary(voiceData, socket.userId);
                
//                 // Save voice message
//                 const message = await this.saveFarmerMessage(conversation._id, {
//                     messageType: 'voice',
//                     voiceUrl,
//                     voiceDuration: duration,
//                     voiceSize: size,
//                     content: `Voice message (${duration}s)`
//                 });
                
//                 // Emit confirmation to farmer
//                 socket.emit('voice_message_sent', {
//                     success: true,
//                     message: message
//                 });
                
//                 // Generate AI response
//                 setTimeout(async () => {
//                     await this.generateAndSendAIResponse(conversation._id, message, socket);
//                 }, 1500); // Longer delay for voice processing
                
//             } catch (error) {
//                 console.error('Error sending voice message:', error);
//                 socket.emit('error', {
//                     success: false,
//                     message: 'Failed to send voice message',
//                     error: error.message
//                 });
//             }
//         });

//         // Handle video message from farmer
//         socket.on('send_video_message', async (data) => {
//             try {
//                 const { conversationId, videoData, duration, size, thumbnail } = data;
                
//                 console.log(`🎥 ${socket.name} sending video message (${duration}s)`);
                
//                 if (!conversationId || !videoData || !duration) {
//                     throw new Error('Missing required video data');
//                 }
                
//                 // Get conversation
//                 const conversation = await this.getOrCreateConversationForSocket(socket.userId);
                
//                 // Upload video to cloud storage
//                 const videoUrl = await this.uploadVideoToCloudinary(videoData, socket.userId);
//                 const videoThumbnail = thumbnail ? await this.uploadImageToCloudinary(thumbnail, socket.userId) : null;
                
//                 // Save video message
//                 const message = await this.saveFarmerMessage(conversation._id, {
//                     messageType: 'video',
//                     videoUrl,
//                     videoDuration: duration,
//                     videoSize: size,
//                     videoThumbnail,
//                     content: `Video message (${duration}s)`
//                 });
                
//                 // Emit confirmation to farmer
//                 socket.emit('video_message_sent', {
//                     success: true,
//                     message: message
//                 });
                
//                 // Generate AI response
//                 setTimeout(async () => {
//                     await this.generateAndSendAIResponse(conversation._id, message, socket);
//                 }, 2000); // Even longer delay for video processing
                
//             } catch (error) {
//                 console.error('Error sending video message:', error);
//                 socket.emit('error', {
//                     success: false,
//                     message: 'Failed to send video message',
//                     error: error.message
//                 });
//             }
//         });

//         // Handle chunked file upload for large files
//         socket.on('upload_chunk', async (data) => {
//             try {
//                 const { fileId, chunkIndex, chunkData, totalChunks, fileType, conversationId } = data;
                
//                 // Initialize upload tracking if first chunk
//                 if (chunkIndex === 0) {
//                     this.activeUploads.set(fileId, {
//                         userId: socket.userId,
//                         conversationId,
//                         fileType,
//                         totalChunks,
//                         receivedChunks: new Map(),
//                         startedAt: new Date()
//                     });
//                 }
                
//                 const upload = this.activeUploads.get(fileId);
//                 if (!upload) {
//                     throw new Error('Upload session not found');
//                 }
                
//                 // Store chunk
//                 upload.receivedChunks.set(chunkIndex, chunkData);
                
//                 // Emit progress
//                 socket.emit('upload_progress', {
//                     fileId,
//                     progress: (upload.receivedChunks.size / totalChunks) * 100
//                 });
                
//                 // Check if all chunks received
//                 if (upload.receivedChunks.size === totalChunks) {
//                     await this.processCompleteUpload(fileId, socket);
//                 }
                
//             } catch (error) {
//                 console.error('Error handling upload chunk:', error);
//                 socket.emit('upload_error', {
//                     fileId: data.fileId,
//                     error: error.message
//                 });
//             }
//         });

//         // Handle upload cancellation
//         socket.on('cancel_upload', (data) => {
//             const { fileId } = data;
//             this.activeUploads.delete(fileId);
//             socket.emit('upload_cancelled', { fileId });
//         });

//         // Handle media playback status (for analytics)
//         socket.on('media_played', async (data) => {
//             try {
//                 const { messageId, mediaType, duration } = data;
                
//                 // Update message with playback info (optional analytics)
//                 await messageModel.findByIdAndUpdate(messageId, {
//                     $push: {
//                         playbackHistory: {
//                             playedAt: new Date(),
//                             duration: duration || 0,
//                             playedBy: socket.userId
//                         }
//                     }
//                 });
                
//             } catch (error) {
//                 console.error('Error updating media playback:', error);
//             }
//         });
//     }

//     // Handle admin-specific events
//     handleAdminEvents(socket) {
//         if (socket.userRole !== 'admin') return;

//         // Admin joins monitoring mode for all farmer-AI conversations
//         socket.on('admin_monitor_all', () => {
//             socket.join('admin_monitoring');
//             console.log(`👨‍💼 Admin ${socket.name} started monitoring all farmer-AI conversations`);
//         });

//         // Admin sends proactive message to specific farmer
//         socket.on('send_proactive_message', async (data) => {
//             try {
//                 const { farmerId, content, alertType, messageType = 'text', mediaUrl } = data;
                
//                 // Get farmer's conversation
//                 const conversation = await conversationModel.findOne({ farmerId });
//                 if (!conversation) {
//                     throw new Error('Conversation not found for farmer');
//                 }
                
//                 const messageData = {
//                     content,
//                     alertType,
//                     messageType
//                 };
                
//                 // Add media URL if provided
//                 if (mediaUrl && messageType === 'image') {
//                     messageData.imageUrl = mediaUrl;
//                 } else if (mediaUrl && messageType === 'voice') {
//                     messageData.voiceUrl = mediaUrl;
//                 } else if (mediaUrl && messageType === 'video') {
//                     messageData.videoUrl = mediaUrl;
//                 }
                
//                 const message = await sendProactiveMessage(conversation._id, messageData);
                
//                 // Send to specific farmer if online
//                 this.io.to(`user_${farmerId}`).emit('proactive_alert', {
//                     message: message,
//                     alertType: alertType
//                 });
                
//                 socket.emit('proactive_message_sent', {
//                     success: true,
//                     message: message
//                 });
                
//             } catch (error) {
//                 console.error('Error sending proactive message:', error);
//                 socket.emit('error', {
//                     success: false,
//                     message: 'Failed to send proactive message',
//                     error: error.message
//                 });
//             }
//         });
//     }

//     // Handle general events
//     handleGeneralEvents(socket) {
//         // Ping/pong for connection health
//         socket.on('ping', () => {
//             socket.emit('pong', { timestamp: Date.now() });
//         });

//         // Get online status
//         socket.on('get_online_users', () => {
//             const onlineUsers = Array.from(this.connectedUsers.values()).map(user => ({
//                 userId: user.socketId,
//                 name: user.name,
//                 userRole: user.userRole
//             }));
            
//             socket.emit('online_users', onlineUsers);
//         });

//         // Handle errors
//         socket.on('error', (error) => {
//             console.error(`Socket error from ${socket.name}:`, error);
//         });
//     }

//     // Helper methods for media handling
//     async processCompleteUpload(fileId, socket) {
//         try {
//             const upload = this.activeUploads.get(fileId);
//             if (!upload) throw new Error('Upload not found');
            
//             // Reconstruct file from chunks
//             const chunks = [];
//             for (let i = 0; i < upload.totalChunks; i++) {
//                 chunks.push(upload.receivedChunks.get(i));
//             }
//             const completeFile = Buffer.concat(chunks);
            
//             // Upload to cloud storage based on file type
//             let mediaUrl;
//             if (upload.fileType.startsWith('image/')) {
//                 mediaUrl = await this.uploadImageToCloudinary(completeFile, upload.userId);
//             } else if (upload.fileType.startsWith('audio/')) {
//                 mediaUrl = await this.uploadAudioToCloudinary(completeFile, upload.userId);
//             } else if (upload.fileType.startsWith('video/')) {
//                 mediaUrl = await this.uploadVideoToCloudinary(completeFile, upload.userId);
//             } else {
//                 throw new Error('Unsupported file type');
//             }
            
//             // Create message based on file type
//             const conversation = await this.getOrCreateConversationForSocket(upload.userId);
//             let messageData = {
//                 messageType: upload.fileType.startsWith('image/') ? 'image' : 
//                            upload.fileType.startsWith('audio/') ? 'voice' : 'video'
//             };
            
//             if (messageData.messageType === 'image') {
//                 messageData.imageUrl = mediaUrl;
//                 messageData.content = 'Image uploaded';
//             } else if (messageData.messageType === 'voice') {
//                 messageData.voiceUrl = mediaUrl;
//                 messageData.voiceDuration = upload.duration || 0;
//                 messageData.voiceSize = completeFile.length;
//                 messageData.content = `Voice message (${upload.duration || 0}s)`;
//             } else if (messageData.messageType === 'video') {
//                 messageData.videoUrl = mediaUrl;
//                 messageData.videoDuration = upload.duration || 0;
//                 messageData.videoSize = completeFile.length;
//                 messageData.videoThumbnail = upload.thumbnail || null;
//                 messageData.content = `Video message (${upload.duration || 0}s)`;
//             }
            
//             // Save message
//             const message = await this.saveFarmerMessage(conversation._id, messageData);
            
//             // Clean up upload tracking
//             this.activeUploads.delete(fileId);
            
//             // Emit success to farmer
//             socket.emit('upload_complete', {
//                 success: true,
//                 fileId,
//                 message
//             });
            
//             // Generate AI response
//             setTimeout(async () => {
//                 await this.generateAndSendAIResponse(conversation._id, message, socket);
//             }, 1500);
            
//         } catch (error) {
//             console.error('Error processing complete upload:', error);
//             this.activeUploads.delete(fileId);
//             socket.emit('upload_error', {
//                 fileId,
//                 error: error.message
//             });
//         }
//     }

//     // Simulated cloud upload methods (replace with actual cloud storage implementation)
//     async uploadImageToCloudinary(imageData, userId) {
//         // TODO: Implement actual Cloudinary image upload
//         // For now, return a simulated URL
//         const timestamp = Date.now();
//         return `https://res.cloudinary.com/your-cloud/image/upload/v${timestamp}/${userId}_image.jpg`;
//     }

//     async uploadAudioToCloudinary(audioData, userId) {
//         // TODO: Implement actual Cloudinary audio upload
//         // For now, return a simulated URL
//         const timestamp = Date.now();
//         return `https://res.cloudinary.com/your-cloud/video/upload/v${timestamp}/${userId}_audio.mp3`;
//     }

//     async uploadVideoToCloudinary(videoData, userId) {
//         // TODO: Implement actual Cloudinary video upload
//         // For now, return a simulated URL
//         const timestamp = Date.now();
//         return `https://res.cloudinary.com/your-cloud/video/upload/v${timestamp}/${userId}_video.mp4`;
//     }

//     // Clean up active uploads for disconnected user
//     cleanupActiveUploads(userId) {
//         const uploadsToDelete = [];
//         for (const [fileId, upload] of this.activeUploads.entries()) {
//             if (upload.userId === userId) {
//                 uploadsToDelete.push(fileId);
//             }
//         }
//         uploadsToDelete.forEach(fileId => this.activeUploads.delete(fileId));
//     }

//     // Helper methods (existing methods from original file)
//     async getOrCreateConversationForSocket(farmerId) {
//         try {
//             // Check if farmer exists
//             const farmer = await userModel.findById(farmerId);
//             if (!farmer) {
//                 throw new Error('Farmer not found');
//             }

//             // Find existing conversation or create new one
//             let conversation = await conversationModel.findOne({ farmerId })
//                 .populate('lastMessage');
            
//             if (!conversation) {
//                 conversation = new conversationModel({ farmerId });
//                 await conversation.save();
                
//                 // Send welcome message from AI
//                 await this.sendWelcomeMessage(conversation._id, farmer.name);
                
//                 // Fetch conversation with welcome message
//                 conversation = await conversationModel.findById(conversation._id)
//                     .populate('lastMessage');
//             }

//             return conversation;
//         } catch (error) {
//             console.error('Error getting/creating conversation:', error);
//             throw error;
//         }
//     }

//     async getRecentMessages(conversationId) {
//         try {
//             const messages = await messageModel.find({ conversationId })
//                 .sort({ createdAt: -1 })
//                 .limit(50);

//             return messages.reverse(); // Return in chronological order
//         } catch (error) {
//             console.error('Error getting recent messages:', error);
//             throw error;
//         }
//     }

//     async saveFarmerMessage(conversationId, messageData) {
//         try {
//             const conversation = await conversationModel.findById(conversationId);
//             if (!conversation) {
//                 throw new Error('Conversation not found');
//             }

//             const { 
//                 content, 
//                 messageType = 'text', 
//                 imageUrl,
//                 voiceUrl,
//                 voiceDuration,
//                 voiceSize,
//                 videoUrl,
//                 videoDuration,
//                 videoSize,
//                 videoThumbnail
//             } = messageData;

//             // Create farmer message with all possible fields
//             const messageFields = {
//                 conversationId,
//                 senderId: conversation.farmerId.toString(),
//                 senderType: 'farmer',
//                 messageType,
//                 status: 'sent'
//             };

//             // Add content based on message type
//             if (messageType === 'text') {
//                 messageFields.content = content;
//             } else if (messageType === 'image') {
//                 messageFields.imageUrl = imageUrl;
//                 messageFields.content = content || 'Image shared';
//             } else if (messageType === 'voice') {
//                 messageFields.voiceUrl = voiceUrl;
//                 messageFields.voiceDuration = voiceDuration;
//                 messageFields.voiceSize = voiceSize;
//                 messageFields.content = content || `Voice message (${voiceDuration}s)`;
//             } else if (messageType === 'video') {
//                 messageFields.videoUrl = videoUrl;
//                 messageFields.videoDuration = videoDuration;
//                 messageFields.videoSize = videoSize;
//                 messageFields.videoThumbnail = videoThumbnail;
//                 messageFields.content = content || `Video message (${videoDuration}s)`;
//             }

//             const message = new messageModel(messageFields);
//             await message.save();

//             // Update conversation
//             await conversationModel.findByIdAndUpdate(conversationId, {
//                 lastMessage: message._id,
//                 lastActivity: new Date()
//             });

//             return message;
//         } catch (error) {
//             console.error('Error saving farmer message:', error);
//             throw error;
//         }
//     }

//     async generateAndSendAIResponse(conversationId, farmerMessage, socket) {
//         try {
//             console.log('AI generating response...');
            
//             // Simulate AI thinking time
//             socket.emit('ai_typing', { isTyping: true });
            
//             // Generate AI response using controller function
//             const aiResponse = await generateAIResponse(conversationId, farmerMessage, this.io);
            
//             socket.emit('ai_typing', { isTyping: false });
            
//             // Send AI response directly to the farmer
//             socket.emit('new_message', {
//                 message: aiResponse,
//                 from: 'ai'
//             });
            
//             // Notify admins monitoring about the AI response
//             this.io.to('admin_monitoring').emit('ai_response_sent', {
//                 farmerId: socket.userId,
//                 farmerName: socket.name,
//                 conversationId: conversationId,
//                 aiResponse: aiResponse
//             });
            
//         } catch (error) {
//             console.error('Error generating AI response:', error);
//             socket.emit('ai_typing', { isTyping: false });
//             socket.emit('ai_error', {
//                 message: 'AI temporarily unavailable. Please try again.'
//             });
//         }
//     }

//     async markMessagesAsRead(conversationId, userId) {
//         try {
//             // Mark all unread AI messages as read
//             await messageModel.updateMany(
//                 { 
//                     conversationId, 
//                     senderType: 'ai_agent',
//                     status: { $ne: 'read' }
//                 },
//                 { 
//                     status: 'read',
//                     readAt: new Date()
//                 }
//             );

//             // Reset unread count
//             await conversationModel.findByIdAndUpdate(conversationId, {
//                 unreadCount: 0
//             });

//             return true;
//         } catch (error) {
//             console.error('Error marking messages as read:', error);
//             throw error;
//         }
//     }

//     async sendWelcomeMessage(conversationId, farmerName) {
//         const welcomeContent = `Hello ${farmerName}! I'm your Agricultural Assistant. I can help you with:

// 🌱 Crop problem solutions
// 🌦️ Weather updates and advice  
// 🐛 Pest and disease identification
// 💰 Government scheme information
// 📊 Market prices and selling advice

// You can send me:
// 📝 Text messages with your questions
// 📷 Photos of your crops or issues  
// 🎤 Voice messages (I can understand Hindi and English)
// 🎥 Videos showing your farm conditions

// Feel free to ask me any farming-related questions!`;

//         const message = new messageModel({
//             conversationId,
//             senderId: 'kisaan_sahayak',
//             senderType: 'ai_agent',
//             messageType: 'text',
//             content: welcomeContent,
//             isProactive: true,
//             alertType: 'welcome',
//             status: 'sent'
//         });

//         await message.save();
        
//         await conversationModel.findByIdAndUpdate(conversationId, {
//             lastMessage: message._id,
//             lastActivity: new Date(),
//             unreadCount: 1
//         });

//         return message;
//     }

//     // Method to send proactive messages from external services
//     async sendProactiveMessageToFarmer(farmerId, messageData) {
//         try {
//             // Get farmer's conversation
//             const conversation = await conversationModel.findOne({ farmerId });
//             if (!conversation) {
//                 throw new Error('Conversation not found for farmer');
//             }

//             const message = await sendProactiveMessage(conversation._id, messageData);
            
//             // Send to farmer if online
//             this.io.to(`user_${farmerId}`).emit('proactive_alert', {
//                 message: message,
//                 alertType: messageData.alertType || 'general'
//             });
            
//             return message;
//         } catch (error) {
//             console.error('Error sending proactive message:', error);
//             throw error;
//         }
//     }

//     // Method to broadcast to all farmers (for emergency alerts)
//     async broadcastToAllFarmers(message, alertType = 'emergency') {
//         console.log(`Broadcasting ${alertType} alert to all farmers`);
        
//         this.io.emit('emergency_alert', {
//             message: message,
//             alertType: alertType,
//             timestamp: new Date()
//         });
//     }

//     // Get connection stats
//     getConnectionStats() {
//         return {
//             totalConnections: this.connectedUsers.size,
//             farmers: Array.from(this.connectedUsers.values()).filter(u => u.userRole === 'farmer').length,
//             admins: Array.from(this.connectedUsers.values()).filter(u => u.userRole === 'admin').length,
//             activeUploads: this.activeUploads.size
//         };
//     }

//     // Get IO instance for external use
//     getIO() {
//         return this.io;
//     }
// }

// export default ChatSocketManager;