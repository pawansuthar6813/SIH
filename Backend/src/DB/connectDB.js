import mongoose from 'mongoose';

const connectDb = async () => {
    const DB_NAME = process.env.DB_NAME;
    const path = `${process.env.MONGODB_URL}/${DB_NAME}`
    await mongoose.connect(path);
    console.log("db connected successfully")
}

export default connectDb;