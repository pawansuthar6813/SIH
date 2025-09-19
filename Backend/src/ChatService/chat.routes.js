import express from 'express';
import chatControllers from './chat.controller.js';
import { authFarmer } from '../AuthService/middlewares/auth.middleware.js';
import { getUploadMiddleware } from '../Shared/middlewares/upload.middleware.js';

const {
    getOrCreateConversation,
    getMessages,
    sendFarmerMessage,
    markAsRead,
    getAllConversations,
    broadcastEmergencyMessage
} = chatControllers;

const router = express.Router();

// Middleware to authenticate all chat routes
router.use(authFarmer);

// ===== FARMER ROUTES =====

// Get or create conversation for authenticated farmer
router.get('/conversation', getOrCreateConversation);

// Get messages for a specific conversation with pagination
router.get('/messages/:conversationId', getMessages);

// Send text message (REST fallback)
router.post('/send-message', sendFarmerMessage);

// Send image message with file upload
router.post('/send-image', 
    ...getUploadMiddleware('image'), 
    sendFarmerMessage
);

// Send voice message with file upload
router.post('/send-voice', 
    ...getUploadMiddleware('voice'), 
    sendFarmerMessage
);

// Send video message with file upload
router.post('/send-video', 
    ...getUploadMiddleware('video'), 
    sendFarmerMessage
);

// Mark messages as read in a conversation
router.patch('/mark-read/:conversationId', markAsRead);

// Get conversation summary/info
router.get('/conversation/:conversationId/info', async (req, res, next) => {
    try {
        const { conversationId } = req.params;
        const farmerId = req.user._id;

        // Validate conversation belongs to farmer
        const conversation = await conversationModel.findOne({ 
            _id: conversationId, 
            farmerId 
        }).populate('lastMessage');

        if (!conversation) {
            throw new ApiError(404, 'NotFound', 'Conversation not found');
        }

        const unreadCount = await messageModel.countDocuments({
            conversationId,
            senderType: 'ai_agent',
            status: { $ne: 'read' }
        });

        const responseData = {
            _id: conversation._id,
            totalMessages: conversation.totalMessages,
            unreadCount,
            lastActivity: conversation.lastActivity,
            lastMessage: conversation.lastMessage,
            isActive: conversation.isActive
        };

        return res.status(200).json(
            new ApiResponse(200, 'Conversation info retrieved', responseData)
        );
    } catch (error) {
        next(error);
    }
});

// ===== ADMIN ROUTES =====

// Admin middleware
const adminAuth = (req, res, next) => {
    if (req.user.role !== 'admin') {
        throw new ApiError(403, 'Forbidden', 'Admin access required');
    }
    next();
};

// Get all conversations (admin only)
router.get('/admin/conversations', adminAuth, getAllConversations);

// Send proactive message to specific farmer
router.post('/admin/proactive-message', adminAuth, async (req, res, next) => {
    try {
        const { farmerId, content, alertType = 'general', messageType = 'text' } = req.body;

        if (!farmerId || !content) {
            throw new ApiError(400, 'BadRequest', 'farmerId and content are required');
        }

        // Get farmer's conversation
        const conversation = await conversationModel.findOne({ farmerId });
        if (!conversation) {
            throw new ApiError(404, 'NotFound', 'Conversation not found for farmer');
        }

        const messageData = {
            content,
            alertType,
            messageType
        };

        const message = await sendProactiveMessage(conversation._id, messageData, req.io);

        return res.status(201).json(
            new ApiResponse(201, 'Proactive message sent successfully', message)
        );
    } catch (error) {
        next(error);
    }
});

// Broadcast emergency message to all farmers
router.post('/admin/broadcast', adminAuth, async (req, res, next) => {
    try {
        const { message, alertType = 'emergency' } = req.body;

        if (!message) {
            throw new ApiError(400, 'BadRequest', 'Message content is required');
        }

        const results = await broadcastEmergencyMessage(message, alertType, req.io);

        return res.status(200).json(
            new ApiResponse(200, `Emergency broadcast sent to ${results.length} farmers`, {
                broadcastCount: results.length,
                alertType,
                message
            })
        );
    } catch (error) {
        next(error);
    }
});

// Get conversation analytics (admin only)
router.get('/admin/analytics', adminAuth, async (req, res, next) => {
    try {
        const { startDate, endDate } = req.query;
        
        const matchFilter = {};
        if (startDate || endDate) {
            matchFilter.createdAt = {};
            if (startDate) matchFilter.createdAt.$gte = new Date(startDate);
            if (endDate) matchFilter.createdAt.$lte = new Date(endDate);
        }

        // Aggregate conversation statistics
        const stats = await conversationModel.aggregate([
            { $match: matchFilter },
            {
                $group: {
                    _id: null,
                    totalConversations: { $sum: 1 },
                    activeConversations: { 
                        $sum: { $cond: ['$isActive', 1, 0] } 
                    },
                    totalMessages: { $sum: '$totalMessages' },
                    averageMessages: { $avg: '$totalMessages' }
                }
            }
        ]);

        // Message type distribution
        const messageTypeStats = await messageModel.aggregate([
            { $match: matchFilter },
            {
                $group: {
                    _id: '$messageType',
                    count: { $sum: 1 }
                }
            }
        ]);

        const responseData = {
            conversationStats: stats[0] || {
                totalConversations: 0,
                activeConversations: 0,
                totalMessages: 0,
                averageMessages: 0
            },
            messageTypeDistribution: messageTypeStats,
            timeRange: { startDate, endDate }
        };

        return res.status(200).json(
            new ApiResponse(200, 'Analytics retrieved successfully', responseData)
        );
    } catch (error) {
        next(error);
    }
});

// Get farmer conversation details (admin only)
router.get('/admin/farmer/:farmerId/conversation', adminAuth, async (req, res, next) => {
    try {
        const { farmerId } = req.params;
        const page = parseInt(req.query.page) || 1;
        const limit = parseInt(req.query.limit) || 50;
        const skip = (page - 1) * limit;

        // Get farmer info
        const farmer = await userModel.findById(farmerId);
        if (!farmer) {
            throw new ApiError(404, 'NotFound', 'Farmer not found');
        }

        // Get conversation
        const conversation = await conversationModel.findOne({ farmerId })
            .populate('lastMessage');
        
        if (!conversation) {
            throw new ApiError(404, 'NotFound', 'Conversation not found for farmer');
        }

        // Get messages
        const messages = await messageModel.find({ conversationId: conversation._id })
            .sort({ createdAt: -1 })
            .limit(limit)
            .skip(skip);

        const total = await messageModel.countDocuments({ conversationId: conversation._id });

        const responseData = {
            farmer: {
                _id: farmer._id,
                name: farmer.name,
                mobileNumber: farmer.mobileNumber,
                state: farmer.state,
                district: farmer.district,
                preferredLanguage: farmer.preferredLanguage
            },
            conversation,
            messages: messages.reverse(),
            pagination: {
                page,
                limit,
                total,
                hasMore: skip + messages.length < total
            }
        };

        return res.status(200).json(
            new ApiResponse(200, 'Farmer conversation retrieved successfully', responseData)
        );
    } catch (error) {
        next(error);
    }
});

// ===== UTILITY ROUTES =====

// Health check
router.get('/health', (req, res) => {
    res.status(200).json({
        success: true,
        message: 'Chat service is healthy',
        timestamp: new Date().toISOString(),
        user: {
            id: req.user._id,
            name: req.user.name,
            role: req.user.role
        }
    });
});

// Get chat statistics for farmer
router.get('/stats', async (req, res, next) => {
    try {
        const farmerId = req.user._id;

        const conversation = await conversationModel.findOne({ farmerId });
        if (!conversation) {
            return res.status(200).json(
                new ApiResponse(200, 'No conversation found', {
                    totalMessages: 0,
                    unreadMessages: 0,
                    lastActivity: null
                })
            );
        }

        const unreadCount = await messageModel.countDocuments({
            conversationId: conversation._id,
            senderType: 'ai_agent',
            status: { $ne: 'read' }
        });

        const responseData = {
            totalMessages: conversation.totalMessages,
            unreadMessages: unreadCount,
            lastActivity: conversation.lastActivity,
            conversationId: conversation._id
        };

        return res.status(200).json(
            new ApiResponse(200, 'Chat statistics retrieved', responseData)
        );
    } catch (error) {
        next(error);
    }
});

export default router;