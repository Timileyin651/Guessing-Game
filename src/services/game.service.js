const User = require("../model/user");
const Room = require("../model/room");

const ROUND_DURATION_MS = 60 * 1000;
const WINNING_POINTS = 10;

async function getRoomAndUser(roomCode, sessionId) {
  if (typeof roomCode !== "string" || typeof sessionId !== "string") {
    throw new Error("Room code and session ID are required.");
  }

  const room = await Room.findOne({
    roomCode: roomCode.trim().toUpperCase(),
  }).select("+correctAnswer");

  if (!room) {
    throw new Error("Room not found.");
  }

  const user = await User.findOne({ sessionId });

  if (!user) {
    throw new Error("Invalid session.");
  }

  return { room, user };
}

function ensureHost(room, user) {
  if (!room.host.equals(user._id) || user.role !== "host") {
    throw new Error("Only the host can perform this action.");
  }
}

async function setQuestion(roomCode, sessionId, question, correctAnswer) {
  const { room, user } = await getRoomAndUser(roomCode, sessionId);

  ensureHost(room, user);
  if (room.status === "ended") {
    throw new Error("Start a new game before setting a question.");
  }

  if (room.status === "active") {
    throw new Error("You cannot change the question during a round.");
  }

  if (
    typeof question !== "string" ||
    !question.trim() ||
    question.trim().length > 500
  ) {
    throw new Error("Enter a question between 1 and 500 characters.");
  }

  if (
    typeof correctAnswer !== "string" ||
    !correctAnswer.trim() ||
    correctAnswer.trim().length > 100
  ) {
    throw new Error("Enter an answer between 1 and 100 characters.");
  }

  room.question = question.trim();
  room.correctAnswer = correctAnswer.trim();
  room.status = "waiting";
  room.startedAt = null;
  room.endsAt = null;
  room.winner = null;

  await room.save();

  return room;
}

async function startRound(roomCode, sessionId) {
  const { room, user } = await getRoomAndUser(roomCode, sessionId);

  ensureHost(room, user);

  if (room.status === "active") {
    throw new Error("A round is already in progress.");
  }

  if (!room.question || !room.correctAnswer) {
    throw new Error("The host must set a question and answer first.");
  }

  if (room.players.length < 2) {
    throw new Error("At least two players are required to start.");
  }

  const now = new Date();

  room.status = "active";
  room.startedAt = now;
  room.endsAt = new Date(now.getTime() + ROUND_DURATION_MS);
  room.winner = null;

  await room.save();

  return room;
}

async function submitGuess(roomCode, sessionId, guess) {
  const { room, user } = await getRoomAndUser(roomCode, sessionId);

  const isPlayer = room.players.some((playerId) => playerId.equals(user._id));

  if (!isPlayer || user.role !== "player") {
    throw new Error("Only players in this room can submit guesses.");
  }

  if (typeof guess !== "string" || !guess.trim()) {
    throw new Error("Enter a guess first.");
  }

  const now = new Date();

  if (room.status !== "active" || !room.endsAt || room.endsAt <= now) {
    return {
      correct: false,
      message: "This round has ended.",
    };
  }

  const normalize = (value) => value.trim().toLowerCase();

  if (normalize(guess) !== normalize(room.correctAnswer)) {
    return {
      correct: false,
      message: "Not quite! Try again.",
    };
  }

  // Atomically claim the win so two correct guesses cannot both win.
  const updatedRoom = await Room.findOneAndUpdate(
    {
      _id: room._id,
      status: "active",
      winner: null,
      endsAt: { $gt: now },
    },
    {
      $set: {
        winner: user._id,
        status: "finished",
      },
    },
    { new: true },
  );

  if (!updatedRoom) {
    return {
      correct: false,
      message: "The round has ended or another player won.",
    };
  }

  await User.updateOne({ _id: user._id }, { $inc: { score: WINNING_POINTS } });

  return {
    correct: true,
    message: `Correct! You earned ${WINNING_POINTS} points.`,
    winner: user.nickname,
  };
}

async function endRound(roomCode) {
  const now = new Date();

  const result = await Room.updateOne(
    {
      roomCode: roomCode.toUpperCase(),
      status: "active",
      endsAt: { $lte: now },
    },
    {
      $set: {
        status: "finished",
      },
    },
  );

  return result.modifiedCount > 0;
}

async function endGame(roomCode, sessionId) {
  const { room, user } = await getRoomAndUser(roomCode, sessionId);

  ensureHost(room, user);

  if (room.status === "ended") {
    throw new Error("This game has already ended.");
  }

  room.status = "ended";
  await room.save();

  return room;
}

async function restartGame(roomCode, sessionId) {
  const { room, user } = await getRoomAndUser(roomCode, sessionId);

  ensureHost(room, user);

  if (room.status !== "ended") {
    throw new Error("End the current game before starting a new one.");
  }

  // Reset the room for a fresh game.
  room.status = "waiting";
  room.question = null;
  room.correctAnswer = null;
  room.startedAt = null;
  room.endsAt = null;
  room.winner = null;

  await room.save();

  // Reset scores for all players in this room.
  await User.updateMany({ _id: { $in: room.players } }, { $set: { score: 0 } });

  return room;
}

module.exports = {
  setQuestion,
  startRound,
  submitGuess,
  endRound,
  endGame,
  restartGame,
  ROUND_DURATION_MS,
};
