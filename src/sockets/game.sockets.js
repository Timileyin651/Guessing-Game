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
      room.status === "finished" || room.status === "ended"
        ? room.correctAnswer
        : null,

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

    socket.on("room:subscribe", async (data, callback) => {
  try {
    const { roomCode, sessionId } = data || {};

    if (!roomCode || !sessionId) {
      throw new Error("Room code and session ID are required.");
    }

    const normalizedCode = roomCode.trim().toUpperCase();

    const room = await Room.findOne({
      roomCode: normalizedCode
    });

    if (!room) {
      throw new Error("Room not found.");
    }

    const user = await User.findOne({ sessionId });

    if (!user) {
      throw new Error("User session not found.");
    }

    const isHost = room.host.toString() === user._id.toString();

    const isPlayer = room.players.some(
      playerId => playerId.toString() === user._id.toString()
    );

    if (!isHost && !isPlayer) {
      throw new Error("You are not a member of this room.");
    }

    // Join the correct Socket.IO room before sending updates.
    await socket.join(getSocketRoom(normalizedCode));

    const roomData = await getRoomData(normalizedCode);

    callback?.({
      success: true,
      data: roomData
    });

    // Resume the round timer if an active room is rejoined.
    if (room.status === "active" && room.endsAt) {
      scheduleRoundEnd(io, normalizedCode, room.endsAt);
    }

  } catch (error) {
    console.error("Room subscription failed:", error.message);

    callback?.({
      success: false,
      message: error.message || "Could not subscribe to the room."
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

    socket.on("game:game:end", async (data, callback) => {
        console.log("SERVER: Received game:game:end", data);
      try {
        const { roomCode, sessionId } = data;

        await gameService.endGame(roomCode, sessionId);

        const roomName = `game:${roomCode}`;

        console.log(`Broadcasting game:ended to ${roomName}`);

        io.to(roomName).emit("game:ended");

        if (typeof callback === "function") {
          callback({
            success: true,
            message: "Game ended successfully.",
          });
        }
      } catch (error) {
        console.error("Error ending game:", error.message);

        if (typeof callback === "function") {
          callback({
            success: false,
            message: error.message,
          });
        }
      }
    });

    // socket.on("game:ended", () => {
    //   console.log("Game ended event received");

    //   document.getElementById("lobby-section")?.classList.add("hidden");
    //   document.getElementById("entry-section")?.classList.remove("hidden");
    // });

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
