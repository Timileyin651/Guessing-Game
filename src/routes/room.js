const express = require('express');
const validate = require('../middleware/validate');
const { room } = require('../validation/schema')

const roomRouter = express.Router();

const {
    createRoom,
    joinRoom
    
} = require('../controller/roomController');

roomRouter.post('/', validate(room.createRoom), createRoom);
roomRouter.post('/:roomCode/join',validate(room.roomId),validate(room.joinRoom), joinRoom);

module.exports = roomRouter

