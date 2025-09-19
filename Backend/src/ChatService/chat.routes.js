import express from 'express';
import chatControllers from './chat.controller.js';
import { authFarmer } from '../AuthService/middlewares/auth.middleware.js';
import upload from '../Shared/middlewares/upload.middleware.js';
import chatServiceModels from './models/index.js';

const {
    getOrCreateConversation,
    getMessages,
    sendFarmerMessage,
    sendProactiveMessage,
    markAsRead,
    getAllConversations
} = chatControllers;

const { conversationModel } = chatServiceModels;

const router = express.Router();

// Middleware to authenticate all chat routes
router.use(authFarmer);

// Get or create conversation for farmer
router.get('/conversation', getOrCreateConversation);

// Get messages for a conversation
router.get('/messages/:conversationId', getMessages);

// Send text message (REST endpoint as fallback)
router.post('/send-message', async (req, res) => {
    try {
        const { conversationId, content, messageType = 'text' } = req.body;
        
        if (!conversationId || !content) {
            return res.status(400).json({
                success: false,
                message: 'conversationId and content are required'
            });
        }
        
        const message = await sendFarmerMessage(conversationId, {
            content,
            messageType
        });
        
        // Emit to socket if available
        if (req.io) {
            req.io.to(`conversation_${conversationId}`).emit('new_message', {
                message,
                from: 'farmer'
            });
        }
        
        res.json({
            success: true,
            data: { message }
        });
    } catch (error) {
        res.status(500).json({
            success: false,
            message: 'Failed to send message',
            error: error.message
        });
    }
});

// Send image message
router.post('/send-image', upload.single('image'), async (req, res) => {
    try {
        const { conversationId } = req.body;
        
        if (!conversationId || !req.file) {
            return res.status(400).json({
                success: false,
                message: 'conversationId and image are required'
            });
        }
        
        const imageUrl = req.file.path; // Cloudinary URL
        
        const message = await sendFarmerMessage(conversationId, {
            messageType: 'image',
            imageUrl,
            content: 'Image uploaded'
        });
        
        // Emit to socket
        if (req.io) {
            req.io.to(`conversation_${conversationId}`).emit('new_message', {
                message,
                from: 'farmer'
            });
        }
        
        res.json({
            success: true,
            data: { message }
        });
    } catch (error) {
        res.status(500).json({
            success: false,
            message: 'Failed to send image',
            error: error.message
        });
    }
});

// Mark messages as read
router.patch('/mark-read/:conversationId', async (req, res) => {
    try {
        const { conversationId } = req.params;
        const userId = req.user._id;
        
        await markAsRead(conversationId, userId);
        
        res.json({
            success: true,
            message: 'Messages marked as read'
        });
    } catch (error) {
        res.status(500).json({
            success: false,
            message: 'Failed to mark messages as read',
            error: error.message
        });
    }
});

// Admin routes
router.post('/admin/proactive-message', async (req, res) => {
    try {
        if (req.user.role !== 'admin') {
            return res.status(403).json({
                success: false,
                message: 'Admin access required'
            });
        }
        
        const { conversationId, content, alertType } = req.body;
        
        if (!conversationId || !content || !alertType) {
            return res.status(400).json({
                success: false,
                message: 'conversationId, content, and alertType are required'
            });
        }
        
        const message = await sendProactiveMessage(conversationId, {
            content,
            alertType
        });
        
        // Emit to farmer via socket
        if (req.io) {
            const conversation = await conversationModel.findById(conversationId);
            req.io.to(`user_${conversation.farmerId}`).emit('proactive_alert', {
                message,
                alertType
            });
        }
        
        res.json({
            success: true,
            data: { message }
        });
    } catch (error) {
        res.status(500).json({
            success: false,
            message: 'Failed to send proactive message',
            error: error.message
        });
    }
});

// Get all conversations (admin only)
router.get('/admin/conversations', getAllConversations);

// Broadcast emergency message (admin only)
router.post('/admin/broadcast', async (req, res) => {
    try {
        if (req.user.role !== 'admin') {
            return res.status(403).json({
                success: false,
                message: 'Admin access required'
            });
        }
        
        const { message, alertType = 'emergency' } = req.body;
        
        if (!message) {
            return res.status(400).json({
                success: false,
                message: 'Message content is required'
            });
        }
        
        // Broadcast via socket manager
        if (req.chatManager) {
            await req.chatManager.broadcastToAllFarmers(message, alertType);
        }
        
        res.json({
            success: true,
            message: 'Emergency broadcast sent successfully'
        });
    } catch (error) {
        res.status(500).json({
            success: false,
            message: 'Failed to send broadcast',
            error: error.message
        });
    }
});

export default router;