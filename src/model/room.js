const mongoose = require('mongoose');

const roomSchema = new mongoose.Schema(
    {
        roomCode: {
            type: String,
            required: true,
            unique: true,
            uppercase:true,
            trim: true,
            minlength: 6,
            maxlength: 6
        },
        host: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'User',
            required: true
        },
        players: [
            {
                type: mongoose.Schema.Types.ObjectId,
                ref: 'User'
            }
        ],
        question: {
            type: String,
            trim: true,
            maxlength: 500,
            default: null
        },
        correctAnswer: {
            type: String,
            select: false,
            default: null
        },
        status: {
            type: String,
            enum: ['waiting', 'active', 'finished', 'ended'],
            default: 'waiting'
        },

        startedAt: {
            type: Date,
            default: null
        },

        endsAt: {
            type: Date,
            default: null
        },

        winner: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'User',
            default: null
        }

    },{timestamps: true}
)

module.exports = mongoose.model('Room', roomSchema)