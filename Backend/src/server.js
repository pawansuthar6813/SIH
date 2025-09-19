import dotenv from 'dotenv';
dotenv.config({path: './.env'}); // Fixed path - should be relative to server.js location

import { server } from './app.js'; // Import server instead of app
import connectDb from './Db/connectDB.js';

const port = process.env.PORT || 4000;

await connectDb()
.then(() => {
    // Use server.listen instead of app.listen for Socket.IO support
    server.listen(port, () => {
        console.log(`🚀 Kisaan Sahayak server is running on port: ${port}`);
        console.log(`🌐 Server URL: http://localhost:${port}`);
        console.log(`⚡ Socket.IO enabled for real-time chat`);
    });
})
.catch((err) => {
    console.log("❌ MongoDB not connected. Server can't start");
    console.log("Error:", err.message);
    process.exit(1); // Exit process on DB connection failure
});