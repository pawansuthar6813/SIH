import chatServiceModels from './models/index.js';
import models from '../models/index.js';
import mongoose from 'mongoose';
import ApiResponse from '../Shared/utils/ApiResponse.js';
import ApiError from '../Shared/utils/ApiError.js';
import catchAsyncError from '../Shared/utils/catchAsyncError.js';

const { conversationModel, messageModel } = chatServiceModels;
const { userModel } = models;

// Get or create conversation for a farmer
export const getOrCreateConversation = catchAsyncError(async (req, res, next) => {
  const { farmerId } = req.body;
  
  // Validate farmer exists
  const farmer = await userModel.findById(farmerId);
  if (!farmer) {
    throw new ApiError(404, 'NotFound', 'Farmer not found');
  }

  // Find existing conversation or create new one
  let conversation = await conversationModel.findOne({ farmerId })
    .populate('lastMessage');
  
  if (!conversation) {
    conversation = new conversationModel({ farmerId });
    await conversation.save();
    
    // Send welcome message from AI
    await sendWelcomeMessage(conversation._id, farmer.name);
    
    // Fetch conversation with welcome message
    conversation = await conversationModel.findById(conversation._id)
      .populate('lastMessage');
  }

  return res.status(200).json(
    new ApiResponse(200, 'Conversation retrieved successfully', conversation)
  );
});

// Get conversation messages with pagination
export const getMessages = catchAsyncError(async (req, res, next) => {
  const { conversationId } = req.body;
  const page = parseInt(req.query.page) || 1;
  const limit = parseInt(req.query.limit) || 50;
  const skip = (page - 1) * limit;

  // Validate conversation exists
  const conversation = await conversationModel.findById(conversationId);
  if (!conversation) {
    throw new ApiError(404, 'NotFound', 'Conversation not found');
  }

  const messages = await messageModel.find({ conversationId })
    .sort({ createdAt: -1 })
    .limit(limit)
    .skip(skip);

  // Mark messages as read
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

  const responseData = {
    messages: messages.reverse(), // Return in chronological order
    pagination: {
      page,
      limit,
      hasMore: messages.length === limit,
      total: await messageModel.countDocuments({ conversationId })
    }
  };

  return res.status(200).json(
    new ApiResponse(200, 'Messages retrieved successfully', responseData)
  );
});

// Send message from farmer
export const sendFarmerMessage = catchAsyncError(async (req, res, next) => {
  const { conversationId } = req.body;
  const { content, messageType = 'text', imageUrl } = req.body;

  // Validate required fields
  if (!content && !imageUrl) {
    throw new ApiError(400, 'BadRequest', 'Message content or image is required');
  }

  // Validate conversation exists
  const conversation = await conversationModel.findById(conversationId);
  if (!conversation) {
    throw new ApiError(404, 'NotFound', 'Conversation not found');
  }

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

  // Emit message via Socket.IO (we'll implement this next)
  if (req.io) {
    req.io.emit(`conversation_${conversationId}`, {
      type: 'new_message',
      message
    });
  }

  // Generate AI response asynchronously
  setImmediate(() => {
    generateAIResponse(conversationId, message, req.io);
  });

  return res.status(201).json(
    new ApiResponse(201, 'Message sent successfully', message)
  );
});

// Send proactive AI message (for autonomous alerts)
export const sendProactiveMessage = async (conversationId, alertData, io = null) => {
  try {
    const { content, alertType, messageType = 'system_alert' } = alertData;

    // Validate conversation exists
    const conversation = await conversationModel.findById(conversationId);
    if (!conversation) {
      throw new ApiError(404, 'NotFound', 'Conversation not found');
    }

    const message = new messageModel({
      conversationId,
      senderId: 'kisaan_sahayak',
      senderType: 'ai_agent',
      messageType,
      content,
      isProactive: true,
      alertType,
      status: 'sent'
    });

    await message.save();

    // Update conversation
    await conversationModel.findByIdAndUpdate(conversationId, {
      lastMessage: message._id,
      lastActivity: new Date(),
      $inc: { unreadCount: 1 }
    });

    // Emit via Socket.IO
    if (io) {
      io.emit(`conversation_${conversationId}`, {
        type: 'proactive_alert',
        message
      });
    }

    return message;
  } catch (error) {
    console.error('Error sending proactive message:', error);
    throw new ApiError(500, 'InternalServerError', 'Failed to send proactive message');
  }
};

// Generate AI response to farmer's message
export const generateAIResponse = async (conversationId, farmerMessage, io = null) => {
  try {
    // Get farmer details for context
    const conversation = await conversationModel.findById(conversationId);
    const farmer = await userModel.findById(conversation.farmerId);
    
    // Simple AI response logic (you can integrate with OpenAI/Gemini later)
    let aiResponse = getBasicAIResponse(farmerMessage.content, farmer);
    
    // Add image analysis if farmer sent an image
    if (farmerMessage.messageType === 'image') {
      aiResponse = "I can see the image you've shared. " + getImageAnalysisResponse();
    }
    
    // Create AI response message
    const aiMessage = new messageModel({
      conversationId,
      senderId: 'kisaan_sahayak',
      senderType: 'ai_agent',
      messageType: 'text',
      content: aiResponse,
      isProactive: false,
      status: 'sent'
    });

    await aiMessage.save();

    // Update conversation
    await conversationModel.findByIdAndUpdate(conversationId, {
      lastMessage: aiMessage._id,
      lastActivity: new Date(),
      $inc: { unreadCount: 1 }
    });

    // Emit via Socket.IO
    if (io) {
      io.emit(`conversation_${conversationId}`, {
        type: 'ai_response',
        message: aiMessage
      });
    }

    return aiMessage;
  } catch (error) {
    console.error('Error generating AI response:', error);
    throw new ApiError(500, 'InternalServerError', 'Failed to generate AI response');
  }
};

// Welcome message for new conversations
export const sendWelcomeMessage = async (conversationId, farmerName) => {
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
};

// Basic AI response (replace with actual AI integration later)
export const getBasicAIResponse = (question, farmer) => {
  const questionLower = question.toLowerCase();
  
  const responses = {
    'weather': `Today's weather in ${farmer.location || 'your area'} is clear. Good time for irrigation.`,
    'pest': 'For pest problems, first identify the pest. Send a photo for better advice.',
    'seed': 'Buy seeds only from certified dealers. Which crop seeds do you need?',
    'fertilizer': 'Apply fertilizer after soil testing. Balance of NPK is important.',
    'disease': 'Send a photo of affected plants for disease identification and treatment advice.',
    'market': 'Current market prices vary by location. Which crop are you planning to sell?',
    'irrigation': 'Water your crops early morning or evening. Check soil moisture before watering.',
    'harvest': 'Harvest time depends on crop maturity. Which crop are you planning to harvest?'
  };

  // Simple keyword matching
  for (let keyword in responses) {
    if (questionLower.includes(keyword)) {
      return responses[keyword];
    }
  }
  
  return 'I am here to help you. Please describe your farming issue in detail.';
};

// Basic image analysis response
export const getImageAnalysisResponse = () => {
  return "Based on the image, I can see your crop. For detailed analysis, I'll need to examine it more closely. Can you tell me what specific issue you're facing with this crop?";
};

// Get all conversations for admin (optional)
export const getAllConversations = catchAsyncError(async (req, res, next) => {
  const page = parseInt(req.query.page) || 1;
  const limit = parseInt(req.query.limit) || 20;
  const skip = (page - 1) * limit;

  const conversations = await conversationModel.find()
    .populate('farmerId', 'name phone location')
    .populate('lastMessage')
    .sort({ lastActivity: -1 })
    .limit(limit)
    .skip(skip);

  const total = await conversationModel.countDocuments();

  const responseData = {
    conversations,
    pagination: {
      page,
      limit,
      total,
      hasMore: skip + conversations.length < total
    }
  };

  return res.status(200).json(
    new ApiResponse(200, 'Conversations retrieved successfully', responseData)
  );
});

// Mark conversation as read
export const markAsRead = catchAsyncError(async (req, res, next) => {
  const { conversationId } = req.params;

  const conversation = await conversationModel.findById(conversationId);
  if (!conversation) {
    throw new ApiError(404, 'NotFound', 'Conversation not found');
  }

  // Mark all unread messages as read
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

  return res.status(200).json(
    new ApiResponse(200, 'Conversation marked as read', null)
  );
});


const chatControllers = {
  getOrCreateConversation,
  getMessages,
  sendFarmerMessage,
  sendProactiveMessage,
  markAsRead
}


export default chatControllers