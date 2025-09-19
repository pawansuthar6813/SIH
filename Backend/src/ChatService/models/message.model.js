import mongoose from "mongoose";

const messageSchema = new mongoose.Schema({
  conversationId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Conversation',
    required: true
  },
  senderId: {
    type: String, // 'farmer_id' or 'kisaan_sahayak'
    required: true
  },
  senderType: {
    type: String,
    enum: ['farmer', 'ai_agent'],
    required: true
  },
  messageType: {
    type: String,
    enum: ['text', 'image', 'voice', 'video', 'system_alert', 'weather_alert', 'scheme_alert'],
    default: 'text'
  },
  content: {
    type: String,
    required: function() {
      return ['text', 'system_alert', 'weather_alert', 'scheme_alert'].includes(this.messageType);
    }
  },
  
  // Media URLs
  imageUrl: {
    type: String,
    required: function() {
      return this.messageType === 'image';
    }
  },
  voiceUrl: {
    type: String,
    required: function() {
      return this.messageType === 'voice';
    }
  },
  voiceDuration: {
    type: Number, // in seconds
  },
  voiceSize: {
    type: Number, // in bytes
  },
  videoUrl: {
    type: String,
    required: function() {
      return this.messageType === 'video';
    }
  },
  videoDuration: {
    type: Number, // in seconds
  },
  videoSize: {
    type: Number, // in bytes
  },
  videoThumbnail: {
    type: String,
  },
  
  // AI analysis results
  imageAnalysis: {
    cropHealth: String,
    diseases: [String],
    recommendations: [String],
    confidence: Number
  },
  
  // Proactive message fields
  isProactive: {
    type: Boolean,
    default: false // true for AI's autonomous messages
  },
  alertType: {
    type: String,
    enum: ['weather', 'government_scheme', 'crop_stage', 'pest_warning', 'welcome', 'general'],
    required: function() {
      return this.isProactive === true;
    }
  },
  
  // Message status tracking
  status: {
    type: String,
    enum: ['sent', 'delivered', 'read'],
    default: 'sent'
  },
  readAt: {
    type: Date
  },
  
  // Media playback tracking
  playbackHistory: [{
    playedAt: {
      type: Date,
      default: Date.now
    },
    duration: Number,
    playedBy: String
  }]
}, {
  timestamps: true
});

// Indexes for fast queries
messageSchema.index({ conversationId: 1, createdAt: -1 });
messageSchema.index({ senderId: 1, createdAt: -1 });
messageSchema.index({ senderType: 1, status: 1 });

export const Message = mongoose.model('Message', messageSchema);