const handleAsyncErrors = async (err, req, res, next) => {
    
    const response = {
        success: false,
        statusCode: err.statusCode || 500,
        errorName: err.name || 'InternalServerError',
        message: err.message || 'Something went wrong',
        errors: err.errors || [],
        stack : err.stack || '',
        timestamp: new Date().toISOString(),
        path: req.originalUrl
    }

   // Handle specific error types
    if (err.name === 'CastError') {
        response.statusCode = 400;
        response.message = `Invalid ${err.path}: ${err.value}`;
        response.type = 'CAST_ERROR';
    } 
    else if (err.name === 'JsonWebTokenError') {
        response.statusCode = 401;
        response.message = 'Invalid authentication token';
        response.type = 'JWT_ERROR';
    }
    else if (err.name === 'TokenExpiredError') {
        response.statusCode = 401;
        response.message = 'Authentication token expired';
        response.type = 'JWT_EXPIRED';
    }
    else if (err.code === 11000) {
        const field = Object.keys(err.keyValue || {})[0];
        response.statusCode = 400;
        response.message = `Duplicate value for ${field}`;
        response.type = 'DUPLICATE_KEY';
        response.field = field;
    }

    // Log the complete error for server-side debugging
    console.error('Error Details:', {
        timestamp: response.timestamp,
        path: req.originalUrl,
        method: req.method,
        ip: req.ip,
        originalError: {
            name: err.name,
            message: err.message,
            stack: err.stack,
            code: err.code,
            errors: err.errors,
            statusCode: err.statusCode
        }
    });

    console.error('Errors: ', err.errors)

    return res.status(response.statusCode).json(response);
}

export default handleAsyncErrors;