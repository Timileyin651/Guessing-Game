const mongoose = require('mongoose');
require('dotenv').config();

const DB = process.env.MONGODB_URI

//connect

function connectToMongoDB() {
    mongoose.connect(DB);

    mongoose.connection.on('connected', () => {
        console.log('Connected to MongoDB successfully')
    });
    mongoose.connection.on('error', (error)=> {
        console.log('Error connecting to MongoDB', error)
    });
}

module.exports = {connectToMongoDB}

