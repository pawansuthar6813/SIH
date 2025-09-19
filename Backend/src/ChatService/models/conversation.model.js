
import mongoose from "mongoose";

const conversationSchema = new mongoose.Schema({
  farmerId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User', // References your existing Farmer model
    required: true
  },
  aiAgentId: {
    type: String,
    default: 'kisaan_sahayak' // We'll use a fixed ID for AI agent
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
  }
}, {
  timestamps: true
});

// Ensure one conversation per farmer
conversationSchema.index({ farmerId: 1 }, { unique: true });

export const Conversation = mongoose.model('Conversation', conversationSchema);


