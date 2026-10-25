const { randomInt } = require('crypto');
const User = require('../model/user');
const Room = require('../model/room');

const CODE_CHARACTERS = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
const MAX_PLAYERS = 8;

function generateCode(){
    let code = '';

    for(let i=0; i < 6; i++){
        code += CODE_CHARACTERS[
            randomInt(0, CODE_CHARACTERS.length)
        ]
    }
    return code;
}

async function createRoom(nickname){
    const host = await User.create({
        nickname,
        role: 'host'
    });

    try {
        let room;

        //retry if the henerated room code exist
        for(let attempt = 0; attempt < 5; attempt++) {
            try {
                room = await Room.create({
                    roomCode: generateCode(),
                    host: host._id,
                    players: []
                });

                break;
            } catch (error) {
                if(error.code !== 11000){
                    throw error;
                } 
            }
        }
        if(!room){
            throw new Error('Could not generate a unique code room.')

        }
        return {room, host}
    } catch (error) {
        await User.deleteOne({_id: host._id});
        throw error;
        
    }
}

async function joinRoom(roomCode,nickname){
    const room = await Room.findOne({
        roomCode: roomCode.toUpperCase()
    });

    if(!room){
        throw new Error('Room not found')
    }

    if(room.status !== 'waiting'){
        throw new Error('This room is no longer accepting players.')
    }

    if(room.players.length >= MAX_PLAYERS){
        throw new Error('This room is full')
    }

    const player = await User.create({
        nickname,
        role: 'player'
    });

    try {
        room.players.push(player._id);
        await room.save();

        return {room,player}
    } catch (error) {
        await User.deleteOne({_id: player._id});
        throw error;
        
    }
}

module.exports = {
    createRoom,
    joinRoom
};