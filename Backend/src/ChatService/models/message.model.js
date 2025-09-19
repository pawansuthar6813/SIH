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
    enum: ['text', 'image', 'system_alert', 'weather_alert', 'scheme_alert'],
    default: 'text'
  },
  content: {
    type: String,
    required: function() {
      return ['text', 'system_alert', 'weather_alert', 'scheme_alert'].includes(this.messageType);
    }
  },
  imageUrl: {
    type: String,
    required: function() {
      return this.messageType === 'image';
    }
  },
  imageAnalysis: {
    cropHealth: String,
    diseases: [String],
    recommendations: [String],
    confidence: Number
  },
  isProactive: {
    type: Boolean,
    default: false // true for AI's autonomous messages
  },
  alertType: {
    type: String,
    enum: ['weather', 'government_scheme', 'crop_stage', 'pest_warning'],
    required: function() {
      return this.isProactive === true;
    }
  },
  status: {
    type: String,
    enum: ['sent', 'delivered', 'read'],
    default: 'sent'
  },
  readAt: {
    type: Date
  }
}, {
  timestamps: true
});

// Index for fast message retrieval
messageSchema.index({ conversationId: 1, createdAt: -1 });
messageSchema.index({ senderId: 1, createdAt: -1 });

export const Message = mongoose.model('Message', messageSchema);