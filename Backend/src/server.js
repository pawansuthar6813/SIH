import dotenv from 'dotenv';
dotenv.config({path: '../.env'});

import app from './app.js';
import connectDb from './Db/connectDB.js';

const port = process.env.PORT || 4000;

await connectDb()
.then(() => {
    app.listen(port, () => {
        console.log('server is running on port : ', port);
    })
})
.catch((err) => {
    console.log("mongodb not connected. server can't start");
    console.log(err.message);
});