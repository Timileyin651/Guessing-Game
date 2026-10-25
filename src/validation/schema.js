const Joi = require('joi');

const objectId = Joi.string().hex().length(24);

const room = {
    createRoom: Joi.object({
        nickname: Joi.string().trim().min(2).max(20).required()
    }),
    joinRoom: Joi.object({
        nickname: Joi.string().trim().min(2).max(20).required(),
    }),
    roomId: Joi.object({
        roomCode: Joi.string().trim().min(6).max(6).uppercase().required()
    })
    
}

module.exports = { room }