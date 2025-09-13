class ApiError extends Error{

    constructor(
        statusCode = 500,
        name = 'InternalServerError',
        message = 'Something went wrong',
        errors = [],
        stack = ''

    ){
        super(message);

        this.success = false;
        this.statusCode = statusCode;
        this.name = name
        this.message = message;
        this.data = null;
        this.errors = errors

        if(stack){
            this.stack = stack;
        } else {
            Error.captureStackTrace(this, this.stack)
        }
    }
}

export default ApiError;