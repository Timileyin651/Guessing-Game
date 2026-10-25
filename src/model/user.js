const mongoose = require('mongoose');
const { randomUUID } = require('crypto')

const userSchema = new mongoose.Schema({
    nickname: {
        type: String,
        required: true,
        trim: true,
        minlength: 2,
        maxlength: 20
    },

    sessionId: {
        type: String,
        required: true,
        unique: true,
        default: () => randomUUID()
    },

    role: {
        type: String,
        enum: ['host','player'],
        required: true
    },

    score: {
        type: Number,
        default: 0,
        min: 0
    }

},{timestamps:true});

module.exports = mongoose.model('User', userSchema);