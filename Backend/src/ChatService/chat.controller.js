// // chat.controller.js - Updated with voice and video support
// import chatServiceModels from './models/index.js';
// import models from '../models/index.js';
// import mongoose from 'mongoose';
// import ApiResponse from '../Shared/utils/ApiResponse.js';
// import ApiError from '../Shared/utils/ApiError.js';
// import catchAsyncError from '../Shared/utils/catchAsyncError.js';

// const { conversationModel, messageModel } = chatServiceModels;
// const { userModel } = models;

// // Get or create conversation for a farmer
// export const getOrCreateConversation = catchAsyncError(async (req, res, next) => {
//   const { farmerId } = req.body;
  
//   // Validate farmer exists
//   const farmer = await userModel.findById(farmerId);
//   if (!farmer) {
//     throw new ApiError(404, 'NotFound', 'Farmer not found');
//   }

//   // Find existing conversation or create new one
//   let conversation = await conversationModel.findOne({ farmerId })
//     .populate('lastMessage');
  
//   if (!conversation) {
//     conversation = new conversationModel({ farmerId });
//     await conversation.save();
    
//     // Send welcome message from AI
//     await sendWelcomeMessage(conversation._id, farmer.name);
    
//     // Fetch conversation with welcome message
//     conversation = await conversationModel.findById(conversation._id)
//       .populate('lastMessage');
//   }

//   return res.status(200).json(
//     new ApiResponse(200, 'Conversation retrieved successfully', conversation)
//   );
// });



// // Get conversation messages with pagination
// export const getMessages = catchAsyncError(async (req, res, next) => {
//   const { conversationId } = req.body;
//   const page = parseInt(req.query.page) || 1;
//   const limit = parseInt(req.query.limit) || 50;
//   const skip = (page - 1) * limit;

//   // Validate conversation exists
//   const conversation = await conversationModel.findById(conversationId);
//   if (!conversation) {
//     throw new ApiError(404, 'NotFound', 'Conversation not found');
//   }

//   const messages = await messageModel.find({ conversationId })
//     .sort({ createdAt: -1 })
//     .limit(limit)
//     .skip(skip);

//   // Mark messages as read
//   await messageModel.updateMany(
//     { 
//       conversationId, 
//       senderType: 'ai_agent',
//       status: { $ne: 'read' }
//     },
//     { 
//       status: 'read',
//       readAt: new Date()
//     }
//   );

//   // Reset unread count
//   await conversationModel.findByIdAndUpdate(conversationId, {
//     unreadCount: 0
//   });

//   const responseData = {
//     messages: messages.reverse(), // Return in chronological order
//     pagination: {
//       page,
//       limit,
//       hasMore: messages.length === limit,
//       total: await messageModel.countDocuments({ conversationId })
//     }
//   };

//   return res.status(200).json(
//     new ApiResponse(200, 'Messages retrieved successfully', responseData)
//   );
// });



// // Send message from farmer - UPDATED to handle all media types
// export const sendFarmerMessage = catchAsyncError(async (req, res, next) => {
//   const { conversationId } = req.body;
//   const { 
//     content, 
//     messageType = 'text', 
//     imageUrl,
//     voiceUrl,        // NEW
//     voiceDuration,   // NEW
//     voiceSize,       // NEW
//     videoUrl,        // NEW
//     videoDuration,   // NEW
//     videoSize,       // NEW
//     videoThumbnail   // NEW
//   } = req.body;

//   // Validate required fields based on message type
//   if (messageType === 'text' && !content) {
//     throw new ApiError(400, 'BadRequest', 'Text content is required');
//   }
//   if (messageType === 'image' && !imageUrl) {
//     throw new ApiError(400, 'BadRequest', 'Image URL is required');
//   }
//   if (messageType === 'voice' && (!voiceUrl || !voiceDuration)) {
//     throw new ApiError(400, 'BadRequest', 'Voice URL and duration are required');
//   }
//   if (messageType === 'video' && (!videoUrl || !videoDuration)) {
//     throw new ApiError(400, 'BadRequest', 'Video URL and duration are required');
//   }

//   // Validate conversation exists
//   const conversation = await conversationModel.findById(conversationId);
//   if (!conversation) {
//     throw new ApiError(404, 'NotFound', 'Conversation not found');
//   }

//   // Create farmer message with all possible fields
//   const messageData = {
//     conversationId,
//     senderId: conversation.farmerId.toString(),
//     senderType: 'farmer',
//     messageType,
//     status: 'sent'
//   };

//   // Add content based on message type
//   if (messageType === 'text') {
//     messageData.content = content;
//   } else if (messageType === 'image') {
//     messageData.imageUrl = imageUrl;
//     messageData.content = content || 'Image shared';
//   } else if (messageType === 'voice') {
//     messageData.voiceUrl = voiceUrl;
//     messageData.voiceDuration = voiceDuration;
//     messageData.voiceSize = voiceSize;
//     messageData.content = `Voice message (${voiceDuration}s)`;
//   } else if (messageType === 'video') {
//     messageData.videoUrl = videoUrl;
//     messageData.videoDuration = videoDuration;
//     messageData.videoSize = videoSize;
//     messageData.videoThumbnail = videoThumbnail;
//     messageData.content = `Video message (${videoDuration}s)`;
//   }

//   const message = new messageModel(messageData);
//   await message.save();

//   // Update conversation
//   await conversationModel.findByIdAndUpdate(conversationId, {
//     lastMessage: message._id,
//     lastActivity: new Date()
//   });

//   // Emit message via Socket.IO
//   if (req.io) {
//     req.io.emit(`conversation_${conversationId}`, {
//       type: 'new_message',
//       message
//     });
//   }

//   // Generate AI response asynchronously
//   setImmediate(() => {
//     generateAIResponse(conversationId, message, req.io);
//   });

//   return res.status(201).json(
//     new ApiResponse(201, 'Message sent successfully', message)
//   );
// });



// // Send proactive AI message (for autonomous alerts)
// export const sendProactiveMessage = async (conversationId, alertData, io = null) => {
//   try {
//     const { content, alertType, messageType = 'system_alert' } = alertData;

//     // Validate conversation exists
//     const conversation = await conversationModel.findById(conversationId);
//     if (!conversation) {
//       throw new ApiError(404, 'NotFound', 'Conversation not found');
//     }

//     const message = new messageModel({
//       conversationId,
//       senderId: 'kisaan_sahayak',
//       senderType: 'ai_agent',
//       messageType,
//       content,
//       isProactive: true,
//       alertType,
//       status: 'sent'
//     });

//     await message.save();

//     // Update conversation
//     await conversationModel.findByIdAndUpdate(conversationId, {
//       lastMessage: message._id,
//       lastActivity: new Date(),
//       $inc: { unreadCount: 1 }
//     });

//     // Emit via Socket.IO
//     if (io) {
//       io.emit(`conversation_${conversationId}`, {
//         type: 'proactive_alert',
//         message
//       });
//     }

//     return message;
//   } catch (error) {
//     console.error('Error sending proactive message:', error);
//     throw new ApiError(500, 'InternalServerError', 'Failed to send proactive message');
//   }
// };

// // Generate AI response to farmer's message - UPDATED for all media types
// export const generateAIResponse = async (conversationId, farmerMessage, io = null) => {
//   try {
//     // Get farmer details for context
//     const conversation = await conversationModel.findById(conversationId);
//     const farmer = await userModel.findById(conversation.farmerId);
    
//     let aiResponse;
    
//     // Handle different message types
//     switch (farmerMessage.messageType) {
//       case 'text':
//         aiResponse = getBasicAIResponse(farmerMessage.content, farmer);
//         break;
        
//       case 'image':
//         aiResponse = "I can see the image you've shared. " + getImageAnalysisResponse();
//         break;
        
//       case 'voice':
//         // TODO: Integrate with speech-to-text service (e.g., Google Speech-to-Text, AWS Transcribe)
//         aiResponse = await handleVoiceMessage(farmerMessage, farmer);
//         break;
        
//       case 'video':
//         // TODO: Integrate with video analysis service
//         aiResponse = await handleVideoMessage(farmerMessage, farmer);
//         break;
        
//       default:
//         aiResponse = 'I received your message. How can I help you with your farming needs?';
//     }
    
//     // Create AI response message
//     const aiMessage = new messageModel({
//       conversationId,
//       senderId: 'kisaan_sahayak',
//       senderType: 'ai_agent',
//       messageType: 'text',
//       content: aiResponse,
//       isProactive: false,
//       status: 'sent'
//     });

//     await aiMessage.save();

//     // Update conversation
//     await conversationModel.findByIdAndUpdate(conversationId, {
//       lastMessage: aiMessage._id,
//       lastActivity: new Date(),
//       $inc: { unreadCount: 1 }
//     });

//     // Emit via Socket.IO
//     if (io) {
//       io.emit(`conversation_${conversationId}`, {
//         type: 'ai_response',
//         message: aiMessage
//       });
//     }

//     return aiMessage;
//   } catch (error) {
//     console.error('Error generating AI response:', error);
//     throw new ApiError(500, 'InternalServerError', 'Failed to generate AI response');
//   }
// };

// // NEW: Handle voice message processing
// export const handleVoiceMessage = async (voiceMessage, farmer) => {
//   try {
//     // TODO: Implement speech-to-text conversion
//     // const transcript = await speechToTextService(voiceMessage.voiceUrl);
    
//     // For now, return a generic response
//     const duration = voiceMessage.voiceDuration;
//     let response = `I received your voice message (${duration} seconds). `;
    
//     if (duration < 5) {
//       response += "Could you please provide more details about your farming question?";
//     } else if (duration > 60) {
//       response += "That's quite detailed! Let me address the key points you mentioned.";
//     } else {
//       response += "Let me help you with your farming concern.";
//     }
    
//     // In a real implementation, you would:
//     // 1. Convert voice to text using a service like Google Speech-to-Text
//     // 2. Process the transcript with your AI system
//     // 3. Return appropriate farming advice
    
//     return response + " " + getBasicAIResponse("farming help", farmer);
//   } catch (error) {
//     console.error('Error handling voice message:', error);
//     return "I had trouble processing your voice message. Could you please type your question instead?";
//   }
// };

// // NEW: Handle video message processing  
// export const handleVideoMessage = async (videoMessage, farmer) => {
//   try {
//     // TODO: Implement video analysis
//     // This could include:
//     // - Extract frames for crop disease detection
//     // - Analyze farm conditions
//     // - Identify pests or problems in the video
    
//     const duration = videoMessage.videoDuration;
//     let response = `I received your video message (${duration} seconds). `;
    
//     if (duration < 10) {
//       response += "The video is quite short. If you're showing a crop issue, a longer video with different angles would help me analyze better.";
//     } else {
//       response += "I can see what you've recorded. Based on the video, here's my analysis: ";
//     }
    
//     // In a real implementation, you would:
//     // 1. Extract key frames from video
//     // 2. Run image analysis on frames
//     // 3. Analyze movement patterns if relevant
//     // 4. Provide specific farming advice based on visual analysis
    
//     return response + getVideoAnalysisResponse();
//   } catch (error) {
//     console.error('Error handling video message:', error);
//     return "I had trouble processing your video message. Could you please describe the issue in text or send an image instead?";
//   }
// };

// // Welcome message for new conversations
// export const sendWelcomeMessage = async (conversationId, farmerName) => {
//   const welcomeContent = `Hello ${farmerName}! I'm your Agricultural Assistant. I can help you with:

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

//   const message = new messageModel({
//     conversationId,
//     senderId: 'kisaan_sahayak',
//     senderType: 'ai_agent',
//     messageType: 'text',
//     content: welcomeContent,
//     isProactive: true,
//     alertType: 'welcome',
//     status: 'sent'
//   });

//   await message.save();
  
//   await conversationModel.findByIdAndUpdate(conversationId, {
//     lastMessage: message._id,
//     lastActivity: new Date(),
//     unreadCount: 1
//   });

//   return message;
// };

// // Basic AI response (replace with actual AI integration later)
// export const getBasicAIResponse = (question, farmer) => {
//   const questionLower = question.toLowerCase();
  
//   const responses = {
//     'weather': `Today's weather in ${farmer.location || 'your area'} is clear. Good time for irrigation.`,
//     'pest': 'For pest problems, first identify the pest. Send a photo or video for better advice.',
//     'seed': 'Buy seeds only from certified dealers. Which crop seeds do you need?',
//     'fertilizer': 'Apply fertilizer after soil testing. Balance of NPK is important.',
//     'disease': 'Send a photo or video of affected plants for disease identification and treatment advice.',
//     'market': 'Current market prices vary by location. Which crop are you planning to sell?',
//     'irrigation': 'Water your crops early morning or evening. Check soil moisture before watering.',
//     'harvest': 'Harvest time depends on crop maturity. Which crop are you planning to harvest?'
//   };

//   // Simple keyword matching
//   for (let keyword in responses) {
//     if (questionLower.includes(keyword)) {
//       return responses[keyword];
//     }
//   }
  
//   return 'I am here to help you. Please describe your farming issue in detail, or send me photos/videos for better analysis.';
// };

// // Basic image analysis response
// export const getImageAnalysisResponse = () => {
//   return "Based on the image, I can see your crop. For detailed analysis, I'll need to examine it more closely. Can you tell me what specific issue you're facing with this crop?";
// };

// // NEW: Basic video analysis response
// export const getVideoAnalysisResponse = () => {
//   return "From the video, I can observe your farm conditions. The plants appear to be in the growth stage. For more specific advice, please tell me what concerns you have about this crop.";
// };

// // Get all conversations for admin (optional)
// export const getAllConversations = catchAsyncError(async (req, res, next) => {
//   const page = parseInt(req.query.page) || 1;
//   const limit = parseInt(req.query.limit) || 20;
//   const skip = (page - 1) * limit;

//   const conversations = await conversationModel.find()
//     .populate('farmerId', 'name phone location')
//     .populate('lastMessage')
//     .sort({ lastActivity: -1 })
//     .limit(limit)
//     .skip(skip);

//   const total = await conversationModel.countDocuments();

//   const responseData = {
//     conversations,
//     pagination: {
//       page,
//       limit,
//       total,
//       hasMore: skip + conversations.length < total
//     }
//   };

//   return res.status(200).json(
//     new ApiResponse(200, 'Conversations retrieved successfully', responseData)
//   );
// });

// // Mark conversation as read
// export const markAsRead = catchAsyncError(async (req, res, next) => {
//   const { conversationId } = req.params;

//   const conversation = await conversationModel.findById(conversationId);
//   if (!conversation) {
//     throw new ApiError(404, 'NotFound', 'Conversation not found');
//   }

//   // Mark all unread messages as read
//   await messageModel.updateMany(
//     { 
//       conversationId, 
//       senderType: 'ai_agent',
//       status: { $ne: 'read' }
//     },
//     { 
//       status: 'read',
//       readAt: new Date()
//     }
//   );

//   // Reset unread count
//   await conversationModel.findByIdAndUpdate(conversationId, {
//     unreadCount: 0
//   });

//   return res.status(200).json(
//     new ApiResponse(200, 'Conversation marked as read', null)
//   );
// });



// const { io } = require("socket.io-client");
// const axios = require("axios");

// async function connectBot(farmerId) {
//   // 1. Ask backend for temporary token
//   const { data } = await axios.post("http://localhost:4000/api/bot/token", {
//     farmerId,
//   });

//   const botToken = data.botToken;

//   // 2. Connect with temporary token
//   const socket = io("http://localhost:3000", {
//     auth: { token: botToken },
//   });

//   socket.on("connect", () => {
//     console.log("🤖 Bot connected with temporary token");
//   });

//   socket.on("message", (msg) => {
//     console.log("Farmer:", msg);
//     socket.emit("message", { text: "Hello, I am Kisaan Sahayak 🌱" });
//   });
// }

// connectBot("6719f2f1d13a4e0012b33451"); // farmerId


// const chatControllers = {
//   getOrCreateConversation,
//   getMessages,
//   sendFarmerMessage,
//   sendProactiveMessage,
//   markAsRead,
//   generateAIResponse,
//   handleVoiceMessage,
//   handleVideoMessage
// }

// export default chatControllers;