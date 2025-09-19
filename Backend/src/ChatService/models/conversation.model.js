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
  },
  // Additional metadata
  totalMessages: {
    type: Number,
    default: 0
  },
  conversationMetadata: {
    preferredLanguage: {
      type: String,
      enum: ['Hindi', 'English'],
      default: 'English'
    },
    lastSeenByFarmer: {
      type: Date,
      default: Date.now
    }
  }
}, {
  timestamps: true
});

// Ensure one conversation per farmer
conversationSchema.index({ farmerId: 1 }, { unique: true });
conversationSchema.index({ lastActivity: -1 });
conversationSchema.index({ isActive: 1, lastActivity: -1 });

// Instance methods
conversationSchema.methods.incrementMessageCount = function() {
  this.totalMessages += 1;
  return this.save();
};

conversationSchema.methods.markAsReadByFarmer = function() {
  this.unreadCount = 0;
  this.conversationMetadata.lastSeenByFarmer = new Date();
  return this.save();
};

export const Conversation = mongoose.model('Conversation', conversationSchema);