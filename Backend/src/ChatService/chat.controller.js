import chatServiceModels from './models/index.js';
import models from '../models/index.js';
import ApiResponse from '../Shared/utils/ApiResponse.js';
import ApiError from '../Shared/utils/ApiError.js';
import catchAsyncError from '../Shared/utils/catchAsyncError.js';

const { conversationModel, messageModel } = chatServiceModels;
const { userModel } = models;

// Get or create conversation for a farmer
export const getOrCreateConversation = catchAsyncError(async (req, res, next) => {
  const farmerId = req.user._id;
  
  // Validate farmer exists and is verified
  const farmer = await userModel.findById(farmerId);
  if (!farmer) {
    throw new ApiError(404, 'NotFound', 'Farmer not found');
  }

  if (!farmer.isVerified) {
    throw new ApiError(403, 'Forbidden', 'Please verify your account first');
  }

  // Find existing conversation or create new one
  let conversation = await conversationModel.findOne({ farmerId })
    .populate('lastMessage');
  
  if (!conversation) {
    conversation = new conversationModel({ 
      farmerId,
      conversationMetadata: {
        preferredLanguage: farmer.preferredLanguage || 'English'
      }
    });
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
  const { conversationId } = req.params;
  const farmerId = req.user._id;
  const page = parseInt(req.query.page) || 1;
  const limit = parseInt(req.query.limit) || 50;
  const skip = (page - 1) * limit;

  // Validate conversation exists and belongs to farmer
  const conversation = await conversationModel.findOne({ 
    _id: conversationId, 
    farmerId 
  });
  
  if (!conversation) {
    throw new ApiError(404, 'NotFound', 'Conversation not found');
  }

  const messages = await messageModel.find({ conversationId })
    .sort({ createdAt: -1 })
    .limit(limit)
    .skip(skip);

  // Mark AI messages as read
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
    unreadCount: 0,
    'conversationMetadata.lastSeenByFarmer': new Date()
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

// Send message from farmer to AI
export const sendFarmerMessage = catchAsyncError(async (req, res, next) => {
  const farmerId = req.user._id;
  const { 
    conversationId,
    content, 
    messageType = 'text'
  } = req.body;

  // Get image/media data from upload middleware if present
  const mediaData = req.mediaMetadata || {};

  // Validate conversation belongs to farmer
  const conversation = await conversationModel.findOne({ 
    _id: conversationId, 
    farmerId 
  });
  
  if (!conversation) {
    throw new ApiError(404, 'NotFound', 'Conversation not found');
  }

  // Validate message content based on type
  if (messageType === 'text' && !content) {
    throw new ApiError(400, 'BadRequest', 'Text content is required');
  }

  if (messageType === 'image' && !mediaData.cloudinaryUrl) {
    throw new ApiError(400, 'BadRequest', 'Image is required for image message');
  }

  // Create message data
  const messageData = {
    conversationId,
    senderId: farmerId.toString(),
    senderType: 'farmer',
    messageType,
    status: 'sent'
  };

  // Add content based on message type
  if (messageType === 'text') {
    messageData.content = content;
  } else if (messageType === 'image') {
    messageData.imageUrl = mediaData.cloudinaryUrl;
    messageData.content = content || 'Image shared';
  } else if (messageType === 'voice') {
    messageData.voiceUrl = mediaData.cloudinaryUrl;
    messageData.voiceDuration = mediaData.duration || 0;
    messageData.voiceSize = mediaData.size || 0;
    messageData.content = `Voice message (${mediaData.duration || 0}s)`;
  } else if (messageType === 'video') {
    messageData.videoUrl = mediaData.cloudinaryUrl;
    messageData.videoDuration = mediaData.duration || 0;
    messageData.videoSize = mediaData.size || 0;
    messageData.videoThumbnail = mediaData.thumbnail;
    messageData.content = `Video message (${mediaData.duration || 0}s)`;
  }

  const message = new messageModel(messageData);
  await message.save();

  // Update conversation
  await conversationModel.findByIdAndUpdate(conversationId, {
    lastMessage: message._id,
    lastActivity: new Date(),
    $inc: { totalMessages: 1 }
  });

  // Emit message via Socket.IO if available
  if (req.io) {
    req.io.to(`conversation_${conversationId}`).emit('new_message', {
      type: 'farmer_message',
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

// Generate AI response to farmer's message
export const generateAIResponse = async (conversationId, farmerMessage, io = null) => {
  try {
    // Get farmer details for context
    const conversation = await conversationModel.findById(conversationId).populate('farmerId');
    if (!conversation) {
      throw new Error('Conversation not found');
    }

    const farmer = conversation.farmerId;
    
    let aiResponse;
    
    // Handle different message types
    switch (farmerMessage.messageType) {
      case 'text':
        aiResponse = await getAITextResponse(farmerMessage.content, farmer);
        break;
        
      case 'image':
        aiResponse = await getAIImageResponse(farmerMessage, farmer);
        break;
        
      case 'voice':
        aiResponse = await getAIVoiceResponse(farmerMessage, farmer);
        break;
        
      case 'video':
        aiResponse = await getAIVideoResponse(farmerMessage, farmer);
        break;
        
      default:
        aiResponse = 'I received your message. How can I help you with your farming needs?';
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
      $inc: { unreadCount: 1, totalMessages: 1 }
    });

    // Emit via Socket.IO
    if (io) {
      io.to(`conversation_${conversationId}`).emit('new_message', {
        type: 'ai_response',
        message: aiMessage
      });
    }

    return aiMessage;
  } catch (error) {
    console.error('Error generating AI response:', error);
    
    // Send fallback error message
    try {
      const errorMessage = new messageModel({
        conversationId,
        senderId: 'kisaan_sahayak',
        senderType: 'ai_agent',
        messageType: 'text',
        content: 'I apologize, I\'m having trouble processing your message right now. Please try again or rephrase your question.',
        isProactive: false,
        status: 'sent'
      });

      await errorMessage.save();
      
      if (io) {
        io.to(`conversation_${conversationId}`).emit('new_message', {
          type: 'ai_response',
          message: errorMessage
        });
      }
    } catch (fallbackError) {
      console.error('Error sending fallback message:', fallbackError);
    }
  }
};

// Send proactive AI message (for autonomous alerts)
export const sendProactiveMessage = async (conversationId, alertData, io = null) => {
  try {
    const { content, alertType, messageType = 'system_alert' } = alertData;

    // Validate conversation exists
    const conversation = await conversationModel.findById(conversationId);
    if (!conversation) {
      throw new Error('Conversation not found');
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
      $inc: { unreadCount: 1, totalMessages: 1 }
    });

    // Emit via Socket.IO
    if (io) {
      io.to(`conversation_${conversationId}`).emit('proactive_alert', {
        type: 'proactive_message',
        message,
        alertType
      });
    }

    return message;
  } catch (error) {
    console.error('Error sending proactive message:', error);
    throw error;
  }
};

// Mark messages as read
export const markAsRead = catchAsyncError(async (req, res, next) => {
  const { conversationId } = req.params;
  const farmerId = req.user._id;

  // Validate conversation belongs to farmer
  const conversation = await conversationModel.findOne({ 
    _id: conversationId, 
    farmerId 
  });
  
  if (!conversation) {
    throw new ApiError(404, 'NotFound', 'Conversation not found');
  }

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
    unreadCount: 0,
    'conversationMetadata.lastSeenByFarmer': new Date()
  });

  return res.status(200).json(
    new ApiResponse(200, 'Messages marked as read', null)
  );
});

// Get all conversations (admin only)
export const getAllConversations = catchAsyncError(async (req, res, next) => {
  // Check if user is admin
  if (req.user.role !== 'admin') {
    throw new ApiError(403, 'Forbidden', 'Admin access required');
  }

  const page = parseInt(req.query.page) || 1;
  const limit = parseInt(req.query.limit) || 20;
  const skip = (page - 1) * limit;

  const conversations = await conversationModel.find()
    .populate('farmerId', 'name mobileNumber state district')
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

// Welcome message for new conversations
export const sendWelcomeMessage = async (conversationId, farmerName) => {
  const welcomeContent = `🌾 Namaste ${farmerName}! 

I'm Kisaan Sahayak, your AI Agricultural Assistant. I'm here to help you with all your farming needs!

I can assist you with:
🌱 Crop disease identification and treatment
🌦️ Weather updates and farming advice
🐛 Pest control solutions
💰 Government schemes and subsidies
📊 Market prices and selling tips
🚰 Irrigation and water management
🌾 Seed varieties and planting guidance

You can:
📝 Type your questions in Hindi or English
📷 Send photos of your crops for analysis
🎤 Send voice messages (I understand both languages)
🎥 Share videos of your farm issues

Feel free to ask me anything about farming. I'm here 24/7 to help you grow better crops! 🌾`;

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
    unreadCount: 1,
    totalMessages: 1
  });

  return message;
};

// AI Response Generators
const getAITextResponse = async (question, farmer) => {
  const questionLower = question.toLowerCase();
  
  // Enhanced keyword-based responses
  const responses = {
    'weather': `Based on current weather patterns in ${farmer.district}, ${farmer.state}, I recommend checking soil moisture before irrigation. Would you like specific weather updates for your area?`,
    'pest': 'I can help identify pests affecting your crops. Please share a clear photo of the affected plant parts (leaves, stems, fruits) for accurate identification and treatment recommendations.',
    'disease': 'For crop disease diagnosis, please send photos showing symptoms clearly. Include images of affected leaves, stems, or fruits from different angles.',
    'seed': `For ${farmer.district} region, I can recommend the best seed varieties for your soil type. Which crop are you planning to plant?`,
    'fertilizer': 'Fertilizer recommendations depend on your soil type and crop stage. Have you done soil testing recently? Which crop needs fertilization?',
    'market': `Current market rates vary by location. For ${farmer.state}, which crop are you planning to sell? I can provide pricing trends.`,
    'irrigation': 'Irrigation timing is crucial for crop health. Early morning (5-7 AM) or evening (6-8 PM) are best. Which crop are you irrigating?',
    'harvest': 'Harvest timing depends on crop maturity indicators. Which crop are you planning to harvest? I can guide you on the right time.',
    'loan': 'I can provide information about various agricultural loans and government schemes available for farmers. Which type of financial assistance do you need?',
    'insurance': 'Crop insurance is important for risk management. Are you looking for information about Pradhan Mantri Fasal Bima Yojana or other schemes?'
  };

  // Simple keyword matching
  for (let keyword in responses) {
    if (questionLower.includes(keyword)) {
      return responses[keyword];
    }
  }
  
  // Default response with farmer's name
  return `I'm here to help you with your farming questions. Please describe your specific concern about crops, soil, pests, weather, or market prices. You can also send photos or voice messages for better assistance.`;
};

const getAIImageResponse = async (imageMessage, farmer) => {
  // TODO: Integrate with image analysis AI service
  // For now, provide a structured response template
  
  const response = `I can see the image you've shared. To provide the most accurate analysis, please tell me:

🌾 Which crop is this?
📍 What specific issue are you facing?
📅 When did you first notice this problem?
🌱 What growth stage is your crop in?

Based on the image, I'll analyze for:
• Disease symptoms
• Pest damage
• Nutrient deficiencies
• Growth abnormalities

Please provide these details so I can give you precise recommendations for treatment and prevention.`;

  return response;
};

const getAIVoiceResponse = async (voiceMessage, farmer) => {
  // TODO: Implement speech-to-text conversion
  // For now, return a helpful response
  
  const duration = voiceMessage.voiceDuration;
  let response = `I received your voice message (${duration} seconds). `;
  
  if (duration < 5) {
    response += "The message seems short. Could you provide more details about your farming question?";
  } else if (duration > 60) {
    response += "Thank you for the detailed message. Let me address your farming concerns step by step.";
  } else {
    response += "I'll help you with your farming question.";
  }
  
  response += "\n\nFor better assistance, you can also:\n📝 Type your question in text\n📷 Send photos of the crop issue\n🗣️ Record a clearer voice message";
  
  return response;
};

const getAIVideoResponse = async (videoMessage, farmer) => {
  // TODO: Implement video analysis
  const duration = videoMessage.videoDuration;
  
  let response = `I received your video message (${duration} seconds). `;
  
  if (duration < 10) {
    response += "The video is quite short. For better crop analysis, please record a longer video showing the issue from different angles.";
  } else {
    response += "Thank you for the detailed video. I can observe your crop conditions.";
  }
  
  response += "\n\nTo provide specific recommendations, please tell me:\n🌾 Crop name and variety\n🗓️ Planting date\n🌡️ Recent weather conditions\n💧 Irrigation schedule\n🌱 Any specific concerns you notice";
  
  return response;
};

// Broadcast emergency message to all farmers
export const broadcastEmergencyMessage = async (message, alertType = 'emergency', io = null) => {
  try {
    // Get all active conversations
    const conversations = await conversationModel.find({ isActive: true });
    
    const broadcastPromises = conversations.map(async (conversation) => {
      const emergencyMessage = new messageModel({
        conversationId: conversation._id,
        senderId: 'kisaan_sahayak',
        senderType: 'ai_agent',
        messageType: 'system_alert',
        content: message,
        isProactive: true,
        alertType,
        status: 'sent'
      });
      
      await emergencyMessage.save();
      
      // Update conversation
      await conversationModel.findByIdAndUpdate(conversation._id, {
        lastMessage: emergencyMessage._id,
        lastActivity: new Date(),
        $inc: { unreadCount: 1, totalMessages: 1 }
      });
      
      // Emit to farmer if online
      if (io) {
        io.to(`user_${conversation.farmerId}`).emit('emergency_alert', {
          message: emergencyMessage,
          alertType
        });
      }
      
      return emergencyMessage;
    });
    
    const results = await Promise.all(broadcastPromises);
    console.log(`Emergency broadcast sent to ${results.length} farmers`);
    
    return results;
  } catch (error) {
    console.error('Error broadcasting emergency message:', error);
    throw error;
  }
};

const chatControllers = {
  getOrCreateConversation,
  getMessages,
  sendFarmerMessage,
  generateAIResponse,
  sendProactiveMessage,
  markAsRead,
  getAllConversations,
  sendWelcomeMessage,
  broadcastEmergencyMessage
};

export default chatControllers;