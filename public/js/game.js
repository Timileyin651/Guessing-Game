const socket = io();

// Get the elements we need from the page.
const createRoomForm = document.getElementById("create-room-form");
const joinRoomForm = document.getElementById("join-room-form");
const entrySection = document.getElementById("entry-section");
const lobbySection = document.getElementById("lobby-section");

const messageElement = document.getElementById("message");
const roomCodeElement = document.getElementById("display-room-code");
const hostNameElement = document.getElementById("host-name");
const playerCountElement = document.getElementById("player-count");
const playerListElement = document.getElementById("player-list");
const roomStatusElement = document.getElementById("room-status");
const lobbyNoteElement = document.getElementById("lobby-note");
const copyCodeButton = document.getElementById("copy-code-button");

const hostControls = document.getElementById("host-controls");
const playerControls = document.getElementById("player-controls");

const questionForm = document.getElementById("host-question-form");
const startRoundButton = document.getElementById("start-round-button");
const guessForm = document.getElementById("guess-form");

const questionDisplay = document.getElementById("question-display");
const roundTimer = document.getElementById("round-timer");
const answerReveal = document.getElementById("answer-reveal");
const correctAnswerDisplay = document.getElementById("correct-answer-display");
const winnerDisplay = document.getElementById("winner-display");
const endGameButton = document.getElementById("end-game-button");
const restartGameButton = document.getElementById("restart-game-button");

let countdownInterval = null;

function showMessage(message, type = "") {
  messageElement.textContent = message;
  messageElement.className = `message ${type}`;
}

function setFormsDisabled(disabled) {
  createRoomForm.querySelector("button").disabled = disabled;
  joinRoomForm.querySelector("button").disabled = disabled;
}

function saveSession(data) {
  sessionStorage.setItem("guessmasterRoomCode", data.roomCode);
  sessionStorage.setItem("guessmasterSessionId", data.sessionId);
  sessionStorage.setItem("guessmasterRole", data.role);
  sessionStorage.setItem("guessmasterNickname", data.nickname);
}

async function sendRequest(url, body) {
  const response = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });

  const result = await response.json();

  if (!response.ok || !result.success) {
    throw new Error(result.message || "Something went wrong.");
  }

  return result.data;
}

function enterRoom(data) {
  saveSession(data);

  entrySection.classList.add("hidden");
  lobbySection.classList.remove("hidden");

  roomCodeElement.textContent = data.roomCode;

  showMessage("Connected to your room.", "success");

  subscribeToRoom(data.roomCode, data.sessionId);
}

function subscribeToRoom(roomCode, sessionId) {
  socket.emit("room:subscribe", { roomCode, sessionId }, (response) => {
    if (!response || !response.success) {
      showMessage(
        response?.message || "Could not connect to the room.",
        "error",
      );
      return;
    }

    renderRoom(response.data);
  });
}

function renderRoom(room) {
  roomCodeElement.textContent = room.roomCode;
  hostNameElement.textContent = room.host.nickname;

  playerCountElement.textContent = `${room.playerCount} ${room.playerCount === 1 ? "player" : "players"}`;

  roomStatusElement.textContent =
    room.status.charAt(0).toUpperCase() + room.status.slice(1);

  playerListElement.replaceChildren();

  if (room.players.length === 0) {
    const emptyItem = document.createElement("li");
    emptyItem.className = "empty-state";
    emptyItem.textContent = "No players have joined yet.";
    playerListElement.appendChild(emptyItem);
  } else {
    room.players.forEach((player) => {
      const item = document.createElement("li");
      item.textContent = `${player.nickname} — ${player.score} points`;
      playerListElement.appendChild(item);
    });
  }

  const role = sessionStorage.getItem("guessmasterRole");
  const isHost = role === "host";

  hostControls.classList.toggle("hidden", !isHost);
  playerControls.classList.toggle("hidden", isHost);

  questionDisplay.textContent =
    room.question || "The host has not set a question yet.";

  startRoundButton.disabled = !(
    isHost &&
    room.status === "waiting" &&
    room.playerCount >= 2 &&
    room.question
  );

  // Only show guessing controls while a round is active.
  guessForm.querySelector("button").disabled = room.status !== "active";

  guessForm.querySelector("input").disabled = room.status !== "active";

  const isFinished = room.status === "finished" || room.status === "ended";

  answerReveal.classList.toggle("hidden", !isFinished);

  if (isFinished) {
    correctAnswerDisplay.textContent = room.correctAnswer || "Not available";

    if (room.winner) {
      winnerDisplay.textContent = `${room.winner.nickname} won this round!`;
    } else if (room.status === "ended") {
      winnerDisplay.textContent = "The host ended the game.";
    } else {
      winnerDisplay.textContent = "Time is up! Nobody guessed correctly.";
    }
  } else {
    correctAnswerDisplay.textContent = "";
    winnerDisplay.textContent = "";
  }

  endGameButton.classList.toggle(
    "hidden",
    role !== "host" || room.status === "ended",
  );

  restartGameButton.classList.toggle(
    "hidden",
    role !== "host" || room.status !== "ended",
  );

  if (role === "host") {
    lobbyNoteElement.textContent =
      "You are the host. You cannot submit guesses.";
  } else {
    lobbyNoteElement.textContent =
      "Submit your guess before the 60-second timer expires.";
  }

  // Restart the countdown whenever the server sends updated room data.
  if (countdownInterval) {
    clearInterval(countdownInterval);
    countdownInterval = null;
  }

  if (room.status === "active" && room.endsAt) {
    const updateCountdown = () => {
      const remaining = Math.max(
        0,
        new Date(room.endsAt).getTime() - Date.now(),
      );

      const seconds = Math.ceil(remaining / 1000);
      roundTimer.textContent = `${seconds} seconds`;

      if (seconds === 0 && countdownInterval) {
        clearInterval(countdownInterval);
        countdownInterval = null;
      }
    };

    updateCountdown();
    countdownInterval = setInterval(updateCountdown, 1000);
  } else if (room.status === "finished") {
    roundTimer.textContent = "Round ended";
  } else {
    roundTimer.textContent = "Not started";
  }
}

// Host creates a room.
createRoomForm.addEventListener("submit", async (event) => {
  event.preventDefault();

  const formData = new FormData(createRoomForm);
  const nickname = formData.get("nickname").trim();

  setFormsDisabled(true);
  showMessage("Creating your room...");

  try {
    const data = await sendRequest("/api/rooms", { nickname });
    enterRoom(data);
  } catch (error) {
    showMessage(error.message, "error");
  } finally {
    setFormsDisabled(false);
  }
});

// Player joins an existing room.
joinRoomForm.addEventListener("submit", async (event) => {
  event.preventDefault();

  const formData = new FormData(joinRoomForm);
  const nickname = formData.get("nickname").trim();
  const roomCode = formData.get("roomCode").trim().toUpperCase();

  setFormsDisabled(true);
  showMessage("Joining room...");

  try {
    const data = await sendRequest(
      `/api/rooms/${encodeURIComponent(roomCode)}/join`,
      { nickname },
    );

    enterRoom(data);
  } catch (error) {
    showMessage(error.message, "error");
  } finally {
    setFormsDisabled(false);
  }
});

// Copy the room code so the host can invite friends.
copyCodeButton.addEventListener("click", async () => {
  const roomCode = roomCodeElement.textContent;

  try {
    await navigator.clipboard.writeText(roomCode);
    showMessage("Room code copied!", "success");
  } catch (error) {
    showMessage(`Your room code is ${roomCode}. Copy it manually.`, "error");
  }
});

// Update every connected player's lobby when the server broadcasts changes.
socket.on("room:updated", (room) => {
  renderRoom(room);
});

// Reconnect to the room after refreshing the same browser tab.
socket.on("connect", () => {
  const roomCode = sessionStorage.getItem("guessmasterRoomCode");
  const sessionId = sessionStorage.getItem("guessmasterSessionId");

  if (roomCode && sessionId) {
    entrySection.classList.add("hidden");
    lobbySection.classList.remove("hidden");

    subscribeToRoom(roomCode, sessionId);
  }
});

socket.on("disconnect", () => {
  showMessage("Connection lost. Trying to reconnect...", "error");
});

questionForm.addEventListener("submit", (event) => {
  event.preventDefault();

  const formData = new FormData(questionForm);

  const roomCode = sessionStorage.getItem("guessmasterRoomCode");
  const sessionId = sessionStorage.getItem("guessmasterSessionId");

  const question = formData.get("question").trim();
  const correctAnswer = formData.get("correctAnswer").trim();

  showMessage("Saving question...");

  socket.emit(
    "game:question:set",
    { roomCode, sessionId, question, correctAnswer },
    (response) => {
      if (!response || !response.success) {
        showMessage(
          response?.message || "Could not save the question.",
          "error",
        );
        return;
      }

      showMessage(response.message, "success");
    },
  );
});

startRoundButton.addEventListener("click", () => {
  const roomCode = sessionStorage.getItem("guessmasterRoomCode");
  const sessionId = sessionStorage.getItem("guessmasterSessionId");

  startRoundButton.disabled = true;
  showMessage("Starting the round...");

  socket.emit("game:round:start", { roomCode, sessionId }, (response) => {
    if (!response || !response.success) {
      showMessage(response?.message || "Could not start the round.", "error");
      return;
    }

    showMessage(response.message, "success");
  });
});

guessForm.addEventListener("submit", (event) => {
  event.preventDefault();

  const guessInput = document.getElementById("guess-input");
  const submitButton = document.getElementById("submit-guess-button");

  const roomCode = sessionStorage.getItem("guessmasterRoomCode");
  const sessionId = sessionStorage.getItem("guessmasterSessionId");
  const guess = guessInput.value.trim();

  if (!guess) {
    showMessage("Enter a guess first.", "error");
    return;
  }

  submitButton.disabled = true;

  socket.emit(
    "game:guess:submit",
    { roomCode, sessionId, guess },
    (response) => {
      showMessage(
        response?.message || "Could not submit your guess.",
        response?.success && response?.correct ? "success" : "error",
      );

      // Allow another attempt if the round is still active.
      if (response?.success && !response.correct) {
        submitButton.disabled = false;
      }

      if (response?.correct) {
        guessInput.value = "";
      }
    },
  );
});


endGameButton.addEventListener('click', () => {
  const confirmed = window.confirm(
    'Are you sure you want to end this game for everyone?'
  );

  if (!confirmed) return;

  const roomCode = sessionStorage.getItem('guessmasterRoomCode');
  const sessionId = sessionStorage.getItem('guessmasterSessionId');

  endGameButton.disabled = true;

  socket.emit(
    'game:game:end',
    { roomCode, sessionId },
    (response) => {
      endGameButton.disabled = false;

      showMessage(
        response?.message || 'Unable to end the game.',
        response?.success ? 'success' : 'error'
      );
    }
  );
});

restartGameButton.addEventListener('click', () => {
  const confirmed = window.confirm(
    'Start a new game? This will clear the current question and reset all player scores to zero.'
  );

  if (!confirmed) return;

  const roomCode = sessionStorage.getItem('guessmasterRoomCode');
  const sessionId = sessionStorage.getItem('guessmasterSessionId');

  restartGameButton.disabled = true;

  socket.emit(
    'game:game:restart',
    { roomCode, sessionId },
    (response) => {
      restartGameButton.disabled = false;

      showMessage(
        response?.message || 'Unable to start a new game.',
        response?.success ? 'success' : 'error'
      );

      if (response?.success) {
        questionForm.reset();
      }
    }
  );
});

