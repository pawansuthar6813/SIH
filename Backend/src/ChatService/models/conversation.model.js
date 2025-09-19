import mongoose from "mongoose";

const conversationSchema = new mongoose.Schema({
  farmerId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User', // References your existing User model
    required: true
  },
  aiAgentId: {
    type: String,
    default: 'kisaan_sahayak' // Fixed ID for AI agent
  },
  lastMessage: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Message'
  },
  lastActivity: {
    type: Date,
    default: Date.now
  },
  unreadCount: {
    type: Number,
    default: 0
  },
  isActive: {
    type: Boolean,
    default: true
  }
}, {
  timestamps: true
});

// Ensure one conversation per farmer
conversationSchema.index({ farmerId: 1 }, { unique: true });
conversationSchema.index({ lastActivity: -1 });

export const Conversation = mongoose.model('Conversation', conversationSchema);