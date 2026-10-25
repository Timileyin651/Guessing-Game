const roomService = require('../services/room.service');

async function createRoom(req,res){
    try {
        const { nickname } = req.body;
        const { room, host } = await roomService.createRoom(
            nickname.trim()
        );

        return res.status(201).json({
            success:true,
            message: 'Room created successfully',
            data:{
                roomCode: room.roomCode,
                nickname: host.nickname,
                sessionId: host.sessionId,
                role: host.role,
                playerCount: room.players.length
            }
        });
    } catch (error) {
        console.log('Create room server:', error.message);
        
    }
}

async function joinRoom(req,res) {
    try {
        const { nickname } = req.body;
        const { roomCode } = req.params;

        const {room,player} = await roomService.joinRoom(
            roomCode,
            nickname.trim()
        );
        return res.status(200).json({
            success:true,
            message: 'You joined the room successfully',
            data: {
                roomCode: room.roomCode,
                nickname: player.nickname,
                sessionId: player.sessionId,
                role: player.role,
                playerCount: room.players.length
            }
        });
    } catch (error) {
        const KnownErrors = [
            'Room not found.',
            'This room is no longer accepting players.',
            'This room is full.'
        ]

        if(KnownErrors.includes(error.message)){
            const statusCode = error.message === 'Room not found' ? 404 : 409;
            return res.status(statusCode).json({
                success:false,
                message:error.message
            });

            console.error('Join room error:', error.message)

            return res.status(500).json({
                success: false,
                message: 'Unable to join room'
            });

        }
    }
}

module.exports = {
    createRoom,
    joinRoom
}