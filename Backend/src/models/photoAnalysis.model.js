import mongoose from "mongoose";

// 4. PHOTO ANALYSIS MODEL
const photoAnalysisSchema = new mongoose.Schema({
    cropId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Crop',
        required: true
    },
    farmerId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: true
    },
    captureDate: {
        type: Date,
        required: true,
        default: Date.now
    },
    daysSincePlanting: {
        type: Number,
        required: true,
        min: 0
    },
    
    // Photo data
    photos: [{
        imageUrl: {
            type: String,
            required: true
        },
        imageType: {
            type: String,
            enum: ['plant_overview', 'leaves', 'stem', 'fruit', 'soil', 'pest_damage', 'disease_symptom'],
            required: true
        },
        
        timestamp: {
            type: Date,
            default: Date.now
        },
    }],
    
    // AI/ML Analysis Results
    healthAnalysis: {
        overallHealth: {
            type: String,
            enum: ['excellent', 'good', 'fair', 'poor', 'critical'],
            default: 'good'
        },
        healthScore: {
            type: Number,
            min: 0,
            max: 100,
            default: 75
        },
        diseaseDetection: [{
            diseaseName: String,
            confidence: {
                type: Number,
                min: 0,
                max: 1
            },
            severity: {
                type: String,
                enum: ['low', 'medium', 'high']
            },
        }],
        pestDetection: [{
            pestName: String,
            confidence: {
                type: Number,
                min: 0,
                max: 1
            },
            severity: {
                type: String,
                enum: ['low', 'medium', 'high']
            },
        }],
        nutritionalDeficiency: [{
            nutrient: {
                type: String,
                enum: ['nitrogen', 'phosphorus', 'potassium', 'magnesium', 'iron', 'zinc']
            },
            deficiencyLevel: {
                type: String,
                enum: ['mild', 'moderate', 'severe']
            },
            confidence: {
                type: Number,
                min: 0,
                max: 1
            }
        }]
    },
    
    // Growth Analysis
    growthAnalysis: {
        plantHeight: Number, // in cm
        leafCount: Number,
        stemThickness: Number, // in mm
        leafColor: {
            type: String,
            enum: ['dark_green', 'light_green', 'yellow', 'brown', 'mixed']
        },
        floweringStatus: Boolean,
        fruitingStatus: Boolean,
        fruitCount: Number
    },
    
    
    
    // AI Recommendations
    aiRecommendations: [{
        type: {
            type: String,
            enum: ['irrigation', 'fertilization', 'pest_control', 'disease_treatment', 'pruning', 'harvesting', 'soil_treatment']
        },
        priority: {
            type: String,
            enum: ['low', 'medium', 'high', 'urgent'],
            default: 'medium'
        },
        description: {
            type: String,
            required: true
        },
        confidence: {
            type: Number,
            min: 0,
            max: 1
        },
        cost: Number, // estimated cost in INR
        isImplemented: {
            type: Boolean,
            default: false
        },
        implementationDate: Date,
        createdAt: {
            type: Date,
            default: Date.now
        }
    }],
    
},
{
    timestamps: true
}
);

// Indexes
photoAnalysisSchema.index({ cropId: 1, captureDate: -1 });
photoAnalysisSchema.index({ farmerId: 1, captureDate: -1 });
photoAnalysisSchema.index({ captureDate: -1 });

// Instance Methods
photoAnalysisSchema.methods.getHealthStatus = function() {
    return {
        status: this.healthAnalysis.overallHealth,
        score: this.healthAnalysis.healthScore,
        hasIssues: this.healthAnalysis.overallHealth === 'poor' || this.healthAnalysis.overallHealth === 'critical'
    };
};



// Static Methods
photoAnalysisSchema.statics.getLatestAnalysisForCrop = function(cropId) {
    return this.findOne({ cropId })
               .sort({ captureDate: -1 })
};

photoAnalysisSchema.statics.getAnalysisHistory = function(cropId, limit = 10) {
    return this.find({ cropId })
               .sort({ captureDate: -1 })
               .limit(limit)
};



export const PhotoAnalysis = mongoose.model('PhotoAnalysis', photoAnalysisSchema);