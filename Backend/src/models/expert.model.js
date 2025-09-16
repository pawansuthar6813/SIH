import mongoose from "mongoose";

// 2. EXPERT MODEL (Separate from User)
const expertSchema = new mongoose.Schema({
    mobileNumber: {
        type: String,
        required: true,
        unique: true,
    },

    name: {
        type: String,
        required: true,
        trim: true,
        maxlength: 100
    },
    email: {
        type: String,
        required: true,
        unique: true,
        lowercase: true
    },
    profileImage: {
        type: String,
        default: null
    },
    
    // Professional Information
    specialization: {
        type: String,
        enum: ['plant_pathology', 'soil_science', 'entomology', 'agronomy', 'horticulture', 'plant_breeding', 'agricultural_engineering'],
        required: true
    },
    qualifications: [{
        degree: {
            type: String,
            required: true
        },
        institution: {
            type: String,
            required: true
        },
        year: {
            type: Number,
            required: true
        }
    }],
    certifications: [{
        name: String,
        issuedBy: String,
        issuedDate: Date,
        expiryDate: Date,
        certificateUrl: String
    }],
    yearsOfExperience: {
        type: Number,
        required: true,
        min: 0
    },
    
    // Work Information

    
    // Service Areas
    
    languages: [{
        type: String,
        enum: ['hindi', 'english', 'tamil', 'telugu', 'bengali', 'marathi', 'gujarati', 'kannada', 'malayalam', 'punjabi', 'odia', 'assamese']
    }],
    
    // Expert Statistics
    totalConsultations: {
        type: Number,
        default: 0
    },

    averageRating: {
        type: Number,
        min: 0,
        max: 5,
        default: 0
    },

    // total number of peoples rated till now
    totalRatings: {
        type: Number,
        min: 0
    },

    consultationHours: {
        start: {
            type: String, // "09:00"
            default: "09:00"
        },
        end: {
            type: String, // "18:00"
            default: "18:00"
        }
    },
    
    // Account Status
    isVerified: {
        type: Boolean,
        default: false
    },

    verificationDocuments: [{
        type: {
            type: String,
            enum: ['degree', 'certification', 'id_proof', 'experience_letter']
        },
        documentUrl: String,
        uploadDate: {
            type: Date,
            default: Date.now
        },
        isVerified: {
            type: Boolean,
            default: false
        }
    }],
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
expertSchema.index({ averageRating: -1});
expertSchema.index({ isAvailable: 1, isVerified: 1 });
expertSchema.index({ createdAt: -1 });

// Instance Methods
expertSchema.methods.updateRating = function(newRating) {
    const totalScore = (this.averageRating * this.totalRatings) + newRating;
    this.totalRatings += 1;
    this.averageRating = totalScore / this.totalRatings;
    this.totalConsultations += 1;
    return this.save();
};


expertSchema.statics.getTopExperts = function(limit = 10) {
    return this.find({ 
        isVerified: true, 
        isActive: true 
    })
    .sort({ averageRating: -1, totalRatings: -1 })
    .limit(limit);
};

export const Expert = mongoose.model('Expert', expertSchema);
