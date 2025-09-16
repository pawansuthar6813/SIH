import mongoose from "mongoose";


// 3. CROP MODEL
const cropSchema = new mongoose.Schema({
    farmerId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: true
    },
    cropName: {
        type: String,
        required: true,
        trim: true,
        enum: ['rice', 'wheat', 'cotton', 'sugarcane', 'maize', 'barley', 'soybean', 'groundnut', 'sunflower', 'mustard', 'potato', 'onion', 'tomato', 'other']
    },
    cropVariety: {
        type: String,
        required: true,
        trim: true
    },
    season: {
        type: String,
        enum: ['kharif', 'rabi', 'zaid'],
        required: true
    },
    plantingDate: {
        type: Date,
        required: true
    },
    expectedHarvestDate: {
        type: Date,
        required: true
    },
    actualHarvestDate: {
        type: Date,
        default: null
    },
    fieldArea: {
        type: Number, // in acres
        required: true,
        min: 0.1
    },
    farmingType: {
        type: String,
        enum: ['organic', 'conventional', 'mixed'],
        required: function() { return this.role === 'farmer'; }
    },
    fieldLocation: {
        latitude: {
            type: Number,
            min: 6.4627,
            max: 37.6
        },
        longitude: {
            type: Number,
            min: 68.7,
            max: 97.25
        },
        coordinates: {
            type: [Number], // [longitude, latitude] for GeoJSON
            index: '2dsphere'
        }
    },
    soilType: {
        type: String,
        enum: ['clay', 'sandy', 'loamy', 'silt', 'peaty', 'chalky', 'red', 'black', 'alluvial']
    },
    soilImage: {
        type: String
    },
    irrigationType: {
        type: String,
        enum: ['drip', 'sprinkler', 'flood', 'manual', 'rain_fed', 'canal', 'tube_well']
    },
    cropStage: {
        type: String,
        enum: ['germination', 'vegetative', 'flowering', 'fruiting', 'maturity', 'harvested'],
        default: 'germination'
    },
    
    // Yield tracking
    expectedYield: {
        amount: Number,
        unit: {
            type: String,
            enum: ['kg', 'quintal', 'ton'],
            default: 'quintal'
        }
    },
    actualYield: {
        amount: Number,
        unit: {
            type: String,
            enum: ['kg', 'quintal', 'ton'],
            default: 'quintal'
        }
    },
    
    // Financial tracking
    investmentAmount: {
        type: Number,
        min: 0
    },
    revenue: {
        type: Number,
        min: 0
    },
    profitLoss: Number,
    
    // Metadata
    isActive: {
        type: Boolean,
        default: true
    },
    
    
},
{
    timestamps: true
}
);

// Indexes
cropSchema.index({ farmerId: 1, status: 1 });
cropSchema.index({ cropName: 1, season: 1, plantingDate: -1 });
cropSchema.index({ expectedHarvestDate: 1 });
cropSchema.index({ createdAt: -1 });

// Instance Methods
cropSchema.methods.getDaysSincePlanting = function() {
    const today = new Date();
    const diffTime = Math.abs(today - this.plantingDate);
    return Math.ceil(diffTime / (1000 * 60 * 60 * 24));
};

cropSchema.methods.getDaysToHarvest = function() {
    const today = new Date();
    const diffTime = this.expectedHarvestDate - today;
    return Math.ceil(diffTime / (1000 * 60 * 60 * 24));
};

cropSchema.methods.calculateProfitLoss = function() {
    if (this.revenue && this.investmentAmount) {
        this.profitLoss = this.revenue - this.investmentAmount;
        return this.profitLoss;
    }
    return 0;
};

cropSchema.methods.isReadyForHarvest = function() {
    return this.cropStage === 'maturity' && this.status === 'active';
};

export const Crop = mongoose.model('Crop', cropSchema);

