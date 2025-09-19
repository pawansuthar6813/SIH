import multer from 'multer';
import { v2 as cloudinary } from 'cloudinary';
import { CloudinaryStorage } from 'multer-storage-cloudinary';
import path from 'path';

// Configure Cloudinary
cloudinary.config({
    cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
    api_key: process.env.CLOUDINARY_API_KEY,
    api_secret: process.env.CLOUDINARY_API_SECRET,
});

// File type validation
const allowedImageTypes = ['image/jpeg', 'image/png', 'image/jpg', 'image/webp'];
const allowedAudioTypes = ['audio/mpeg', 'audio/mp3', 'audio/wav', 'audio/ogg', 'audio/m4a'];
const allowedVideoTypes = ['video/mp4', 'video/webm', 'video/quicktime', 'video/x-msvideo'];

// File size limits
const MAX_IMAGE_SIZE = 10 * 1024 * 1024; // 10MB
const MAX_AUDIO_SIZE = 50 * 1024 * 1024; // 50MB
const MAX_VIDEO_SIZE = 100 * 1024 * 1024; // 100MB

// Create Cloudinary storage
const createCloudinaryStorage = (resourceType, folder, allowedFormats) => {
    return new CloudinaryStorage({
        cloudinary,
        params: {
            resource_type: resourceType,
            folder,
            allowed_formats: allowedFormats,
            transformation: resourceType === 'image' ? [
                { width: 1920, height: 1080, crop: 'limit', quality: 'auto:good' }
            ] : undefined,
            public_id: (req, file) => {
                const userId = req.user?._id || 'anonymous';
                const timestamp = Date.now();
                const originalName = path.parse(file.originalname).name;
                return `${userId}_${timestamp}_${originalName}`;
            }
        }
    });
};

// Storages
const imageStorage = createCloudinaryStorage('image', 'kisaan_sahayak/images', ['jpg', 'jpeg', 'png', 'webp']);
const audioStorage = createCloudinaryStorage('video', 'kisaan_sahayak/audio', ['mp3', 'wav', 'ogg', 'm4a']);
const videoStorage = createCloudinaryStorage('video', 'kisaan_sahayak/videos', ['mp4', 'webm', 'mov', 'avi']);

// File filter
const createFileFilter = (allowedTypes) => {
    return (req, file, cb) => {
        if (!allowedTypes.includes(file.mimetype)) {
            const error = new Error(`Invalid file type. Allowed types: ${allowedTypes.join(', ')}`);
            error.code = 'INVALID_FILE_TYPE';
            return cb(error, false);
        }
        cb(null, true);
    };
};

// Multer uploaders
const imageUpload = multer({
    storage: imageStorage,
    fileFilter: createFileFilter(allowedImageTypes),
    limits: { fileSize: MAX_IMAGE_SIZE, files: 1 }
});

const audioUpload = multer({
    storage: audioStorage,
    fileFilter: createFileFilter(allowedAudioTypes),
    limits: { fileSize: MAX_AUDIO_SIZE, files: 1 }
});

const videoUpload = multer({
    storage: videoStorage,
    fileFilter: createFileFilter(allowedVideoTypes),
    limits: { fileSize: MAX_VIDEO_SIZE, files: 1 }
});

// Generic media storage
const mediaStorage = new CloudinaryStorage({
    cloudinary,
    params: (req, file) => {
        let resourceType = 'auto';
        let folder = 'kisaan_sahayak/media';

        if (allowedImageTypes.includes(file.mimetype)) {
            resourceType = 'image';
            folder = 'kisaan_sahayak/images';
        } else if (allowedAudioTypes.includes(file.mimetype)) {
            resourceType = 'video'; // audio = video resource in cloudinary
            folder = 'kisaan_sahayak/audio';
        } else if (allowedVideoTypes.includes(file.mimetype)) {
            resourceType = 'video';
            folder = 'kisaan_sahayak/videos';
        }

        const userId = req.user?._id || 'anonymous';
        const timestamp = Date.now();
        const originalName = path.parse(file.originalname).name;

        return {
            resource_type: resourceType,
            folder,
            public_id: `${userId}_${timestamp}_${originalName}`,
            transformation: resourceType === 'image' ? [
                { width: 1920, height: 1080, crop: 'limit', quality: 'auto:good' }
            ] : undefined
        };
    }
});

const mediaUpload = multer({
    storage: mediaStorage,
    fileFilter: (req, file, cb) => {
        const allAllowedTypes = [...allowedImageTypes, ...allowedAudioTypes, ...allowedVideoTypes];
        if (!allAllowedTypes.includes(file.mimetype)) {
            const error = new Error(`Invalid file type. Allowed: images, audio, video`);
            error.code = 'INVALID_FILE_TYPE';
            return cb(error, false);
        }
        cb(null, true);
    },
    limits: { fileSize: MAX_VIDEO_SIZE, files: 1 }
});

// Error handling
const handleUploadError = (error, req, res, next) => {
    if (error instanceof multer.MulterError) {
        switch (error.code) {
            case 'LIMIT_FILE_SIZE':
                return res.status(400).json({ success: false, message: 'File too large' });
            case 'LIMIT_UNEXPECTED_FILE':
                return res.status(400).json({ success: false, message: 'Unexpected file field' });
            default:
                return res.status(400).json({ success: false, message: 'Upload error', error: error.message });
        }
    }

    if (error.code === 'INVALID_FILE_TYPE') {
        return res.status(400).json({ success: false, message: 'Invalid file type', error: error.message });
    }

    if (error.http_code) {
        return res.status(400).json({ success: false, message: 'Cloudinary upload failed', error: error.message });
    }

    next(error);
};

// Metadata extractor
const extractMediaMetadata = (req, res, next) => {
    if (req.file) {
        req.mediaMetadata = {
            originalName: req.file.originalname,
            mimetype: req.file.mimetype,
            size: req.file.size,
            cloudinaryUrl: req.file.path,
            cloudinaryPublicId: req.file.public_id, // FIXED
            uploadedAt: new Date()
        };

        if (allowedImageTypes.includes(req.file.mimetype)) {
            req.mediaMetadata.type = 'image';
        } else if (allowedAudioTypes.includes(req.file.mimetype)) {
            req.mediaMetadata.type = 'audio';
        } else if (allowedVideoTypes.includes(req.file.mimetype)) {
            req.mediaMetadata.type = 'video';
        }
    }
    next();
};

// Validation
const validateFileUpload = (req, res, next) => {
    if (!req.file) {
        return res.status(400).json({ success: false, message: 'No file uploaded' });
    }
    next();
};

// Utility
const getUploadMiddleware = (type) => {
    switch (type) {
        case 'image':
            return [imageUpload.single('image'), handleUploadError, extractMediaMetadata, validateFileUpload];
        case 'audio':
        case 'voice':
            return [audioUpload.single('voice'), handleUploadError, extractMediaMetadata, validateFileUpload];
        case 'video':
            return [videoUpload.single('video'), handleUploadError, extractMediaMetadata, validateFileUpload];
        default:
            return [mediaUpload.single('media'), handleUploadError, extractMediaMetadata, validateFileUpload];
    }
};

// Exports
export { 
    imageUpload as uploadImage, 
    audioUpload as uploadAudio, 
    videoUpload as uploadVideo, 
    mediaUpload as uploadMedia, 
    handleUploadError, 
    extractMediaMetadata, 
    validateFileUpload, 
    getUploadMiddleware 
};

export const FILE_TYPES = { IMAGE: allowedImageTypes, AUDIO: allowedAudioTypes, VIDEO: allowedVideoTypes };
export const FILE_SIZE_LIMITS = { IMAGE: MAX_IMAGE_SIZE, AUDIO: MAX_AUDIO_SIZE, VIDEO: MAX_VIDEO_SIZE };

export default mediaUpload;
