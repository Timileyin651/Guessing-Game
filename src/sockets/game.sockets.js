const User = require("../model/user");
const Room = require("../model/room");
const gameService = require("../services/game.service");

const roundTimers = new Map();

function getSocketRoom(roomCode) {
  return `game:${roomCode}`;
}

async function getRoomData(roomCode) {
  const room = await Room.findOne({ roomCode })
    .select("+correctAnswer")
    .populate("host", "nickname role")
    .populate("players", "nickname role score")
    .populate("winner", "nickname");

  if (!room) {
    return null;
  }

  return {
    roomCode: room.roomCode,
    status: room.status,
    host: {
      nickname: room.host.nickname,
      role: room.host.role,
    },
    players: room.players.map((player) => ({
      nickname: player.nickname,
      role: player.role,
      score: player.score,
    })),
    playerCount: room.players.length,
    question: room.question,
    startedAt: room.startedAt,
    endsAt: room.endsAt,

    // Reveal the answer only after the round has finished.
    correctAnswer:
      room.status === "finished" || room.status === "ended" ? room.correctAnswer : null,

    winner: room.winner ? { nickname: room.winner.nickname } : null,
  };
}

async function broadcastRoom(io, roomCode) {
  const roomData = await getRoomData(roomCode);

  if (roomData) {
    io.to(getSocketRoom(roomCode)).emit("room:updated", roomData);
  }
}

function scheduleRoundEnd(io, roomCode, endsAt) {
  const existingTimer = roundTimers.get(roomCode);

  if (existingTimer) {
    clearTimeout(existingTimer);
  }

  const delay = Math.max(0, new Date(endsAt).getTime() - Date.now());

  const timer = setTimeout(async () => {
    try {
      const ended = await gameService.endRound(roomCode);

      if (ended) {
        await broadcastRoom(io, roomCode);
      }
    } catch (error) {
      console.error("Round timer error:", error.message);
    } finally {
      roundTimers.delete(roomCode);
    }
  }, delay);

  roundTimers.set(roomCode, timer);
}

function registerGameSocket(io) {
  io.on("connection", (socket) => {
    console.log(`Connected: ${socket.id}`);

    socket.on("room:subscribe", async (payload, callback) => {
      try {
        const { roomCode, sessionId } = payload || {};

        if (typeof roomCode !== "string" || typeof sessionId !== "string") {
          return callback?.({
            success: false,
            message: "Room code and session ID are required.",
          });
        }

        const normalizedCode = roomCode.trim().toUpperCase();

        const room = await Room.findOne({
          roomCode: normalizedCode,
        });

        if (!room) {
          return callback?.({
            success: false,
            message: "Room not found.",
          });
        }

        const user = await User.findOne({ sessionId });

        if (!user) {
          return callback?.({
            success: false,
            message: "Invalid session.",
          });
        }

        const isHost = room.host.equals(user._id);
        const isPlayer = room.players.some((id) => id.equals(user._id));

        if (!isHost && !isPlayer) {
          return callback?.({
            success: false,
            message: "You do not belong to this room.",
          });
        }

        await socket.join(getSocketRoom(normalizedCode));

        const roomData = await getRoomData(normalizedCode);

        callback?.({
          success: true,
          data: roomData,
        });

        // Restore the round timer if the server has no timer for it.
        if (
          room.status === "active" &&
          room.endsAt &&
          !roundTimers.has(normalizedCode)
        ) {
          scheduleRoundEnd(io, normalizedCode, room.endsAt);
        }

        io.to(getSocketRoom(normalizedCode)).emit("room:updated", roomData);
      } catch (error) {
        console.error("Room subscription error:", error.message);

        callback?.({
          success: false,
          message: "Unable to subscribe to room updates.",
        });
      }
    });

    socket.on("game:question:set", async (payload, callback) => {
      try {
        const { roomCode, sessionId, question, correctAnswer } = payload || {};

        await gameService.setQuestion(
          roomCode,
          sessionId,
          question,
          correctAnswer,
        );

        await broadcastRoom(io, roomCode.trim().toUpperCase());

        callback?.({
          success: true,
          message: "Question saved successfully.",
        });
      } catch (error) {
        callback?.({
          success: false,
          message: error.message || "Unable to save the question.",
        });
      }
    });

    socket.on("game:round:start", async (payload, callback) => {
      try {
        const { roomCode, sessionId } = payload || {};

        const room = await gameService.startRound(roomCode, sessionId);

        const normalizedCode = room.roomCode;

        scheduleRoundEnd(io, normalizedCode, room.endsAt);
        await broadcastRoom(io, normalizedCode);

        callback?.({
          success: true,
          message: "The round has started.",
        });
      } catch (error) {
        callback?.({
          success: false,
          message: error.message || "Unable to start the round.",
        });
      }
    });

    socket.on("game:guess:submit", async (payload, callback) => {
      try {
        const { roomCode, sessionId, guess } = payload || {};

        const result = await gameService.submitGuess(
          roomCode,
          sessionId,
          guess,
        );

        callback?.({
          success: true,
          ...result,
        });

        if (result.correct) {
          const normalizedCode = roomCode.trim().toUpperCase();

          const timer = roundTimers.get(normalizedCode);

          if (timer) {
            clearTimeout(timer);
            roundTimers.delete(normalizedCode);
          }

          await broadcastRoom(io, normalizedCode);
        }
      } catch (error) {
        callback?.({
          success: false,
          message: error.message || "Unable to submit your guess.",
        });
      }
    });

    socket.on("game:game:end", async (payload, callback) => {
      try {
        const { roomCode, sessionId } = payload || {};

        const room = await gameService.endGame(roomCode, sessionId);
        const normalizedCode = room.roomCode;

        // Stop the current round timer.
        const timer = roundTimers.get(normalizedCode);

        if (timer) {
          clearTimeout(timer);
          roundTimers.delete(normalizedCode);
        }

        await broadcastRoom(io, normalizedCode);

        callback?.({
          success: true,
          message: "The game has ended.",
        });
      } catch (error) {
        callback?.({
          success: false,
          message: error.message || "Unable to end the game.",
        });
      }
    });

    socket.on("game:game:restart", async (payload, callback) => {
      try {
        const { roomCode, sessionId } = payload || {};

        const room = await gameService.restartGame(roomCode, sessionId);
        const normalizedCode = room.roomCode;

        // Make sure no timer from the previous game remains.
        const timer = roundTimers.get(normalizedCode);

        if (timer) {
          clearTimeout(timer);
          roundTimers.delete(normalizedCode);
        }

        await broadcastRoom(io, normalizedCode);

        callback?.({
          success: true,
          message: "New game ready! Set your next question.",
        });
      } catch (error) {
        callback?.({
          success: false,
          message: error.message || "Unable to restart the game.",
        });
      }
    });

    socket.on("disconnect", () => {
      console.log(`Disconnected: ${socket.id}`);
    });
  });
}

module.exports = registerGameSocket;
