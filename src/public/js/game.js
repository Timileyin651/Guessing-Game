
const socket = io();
const createRoomForm = document.getElementById('create-room-form');
const joinRoomForm = document.getElementById('join-room-form');

const messageElement = document.getElementById('message');
const lobbySection = document.getElementById('lobby-section');

const roomCodeDisplay = document.getElementById('display-room-code');
const hostNameDisplay = document.getElementById('host-name');
const playerCountDisplay = document.getElementById('player-count');
const playerList = document.getElementById('player-list');
const lobbyNote = document.getElementById('lobby-note');

const roundInfo = document.getElementById('round-info');
const questionDisplay = document.getElementById('question-display');
const roundTimer = document.getElementById('round-timer');

const answerReveal = document.getElementById('answer-reveal');
const correctAnswerDisplay = document.getElementById('correct-answer-display');
const winnerDisplay = document.getElementById('winner-display');

const hostControls = document.getElementById('host-controls');
const questionForm = document.getElementById('host-question-form');
const startRoundButton = document.getElementById('start-round-button');
const endGameButton = document.getElementById('end-game-button');
const restartGameButton = document.getElementById('restart-game-button');

const playerControls = document.getElementById('player-controls');
const guessForm = document.getElementById('guess-form');
const guessInput = document.getElementById('guess-input');
const submitGuessButton = document.getElementById('submit-guess-button');
const entrySection = document.getElementById('entry-section');





// Optional copy button. Supports either ID.
const copyCodeButton =
    document.getElementById('copy-code-button') ||
    document.getElementById('copyCodeButton');


// ============================================
// 2. STATE
// ============================================

let countdownInterval = null;
let currentRoom = null;


// ============================================
// 3. HELPER FUNCTIONS
// ============================================

function showMessage(message, isError = false) {
    if (!messageElement) return;

    messageElement.textContent = message;
    messageElement.style.color = isError ? 'red' : 'green';
}

function clearMessage() {
    if (messageElement) {
        messageElement.textContent = '';
    }
}

function clearCountdown() {
    if (countdownInterval) {
        clearInterval(countdownInterval);
        countdownInterval = null;
    }
}

function getSession() {
    return {
        roomCode: sessionStorage.getItem('roomCode'),
        sessionId: sessionStorage.getItem('sessionId'),
        role: sessionStorage.getItem('role'),
        nickname: sessionStorage.getItem('nickname')
    };
}

function saveSession(data) {
    const roomCode =
        data.roomCode ||
        data.room?.roomCode;

    const sessionId =
        data.sessionId ||
        data.user?.sessionId ||
        data.host?.sessionId ||
        data.player?.sessionId;

    const role =
        data.role ||
        data.user?.role ||
        data.host?.role ||
        data.player?.role;

    const nickname =
        data.nickname ||
        data.user?.nickname ||
        data.host?.nickname ||
        data.player?.nickname;

    if (roomCode) sessionStorage.setItem('roomCode', roomCode);
    if (sessionId) sessionStorage.setItem('sessionId', sessionId);
    if (role) sessionStorage.setItem('role', role);
    if (nickname) sessionStorage.setItem('nickname', nickname);
}

function clearSession() {
    sessionStorage.removeItem('roomCode');
    sessionStorage.removeItem('sessionId');
    sessionStorage.removeItem('role');
    sessionStorage.removeItem('nickname');
}

function setFormsDisabled(disabled) {
    if (createRoomForm) {
        createRoomForm.querySelectorAll('input, button').forEach(element => {
            element.disabled = disabled;
        });
    }

    if (joinRoomForm) {
        joinRoomForm.querySelectorAll('input, button').forEach(element => {
            element.disabled = disabled;
        });
    }
}

async function sendRequest(url, method, body) {
    const response = await fetch(url, {
        method,
        headers: {
            'Content-Type': 'application/json'
        },
        body: JSON.stringify(body)
    });

    const result = await response.json();

    if (!response.ok || result.success === false) {
        throw new Error(result.message || 'Something went wrong.');
    }

    return result.data ?? result;
}

function emitWithAck(eventName, payload) {
    return new Promise((resolve, reject) => {
        socket.timeout(10000).emit(
            eventName,
            payload,
            (timeoutError, response) => {
                if (timeoutError) {
                    reject(new Error('The server did not respond. Please try again.'));
                    return;
                }

                if (!response || response.success === false) {
                    reject(new Error(response?.message || 'The request failed.'));
                    return;
                }

                resolve(response.data ?? response);
            }
        );
    });
}


// ============================================
// 4. ENTER A ROOM
// ============================================

function enterRoom(data) {
    saveSession(data);

    const session = getSession();

    if (!session.roomCode || !session.sessionId) {
        showMessage('Room information is missing. Please try again.', true);
        return;
    }

    clearMessage();

    // Hide the Create Room and Join Room forms.
    if (entrySection) {
        entrySection.classList.add('hidden');
    }

    // Show the lobby.
    if (lobbySection) {
        lobbySection.classList.remove('hidden');
    }

    setFormsDisabled(true);

    subscribeToRoom(session.roomCode, session.sessionId);
}

function subscribeToRoom(roomCode, sessionId) {
    socket.emit(
        'room:subscribe',
        { roomCode, sessionId },
        response => {
            if (!response) return;

            if (response.success === false) {
                showMessage(
                    response.message || 'Could not join the room.',
                    true
                );
                return;
            }

            const room = response.data ?? response;

            renderRoom(room);
        }
    );
}


// ============================================
// 5. RENDER ROOM INFORMATION
// ============================================

function renderRoom(room) {
    if (!room) return;

    currentRoom = room;

    const session = getSession();

    if (lobbySection) {
        lobbySection.hidden = false;
    }

    if (roomCodeDisplay) {
        roomCodeDisplay.textContent = room.roomCode || session.roomCode || '';
    }

    if (hostNameDisplay) {
        hostNameDisplay.textContent =
            room.host?.nickname || 'Waiting for host';
    }

    if (playerCountDisplay) {
        playerCountDisplay.textContent =
            `${room.playerCount ?? room.players?.length ?? 0}`;
    }

    // Render the players currently in the room.
    if (playerList) {
        playerList.replaceChildren();

        (room.players || []).forEach(player => {
            const item = document.createElement('li');

            item.textContent =
                typeof player === 'string'
                    ? player
                    : player.nickname || 'Player';

            playerList.appendChild(item);
        });
    }

    const isHost = session.role === 'host';
    const isActive = room.status === 'active';
    const isFinished = room.status === 'finished';
    const isEnded = room.status === 'ended';
    const isWaiting = room.status === 'waiting';

    // Host and player controls.
    if (hostControls) {
        hostControls.hidden = !isHost;
    }

    if (playerControls) {
        playerControls.hidden = isHost;
    }

    if (lobbyNote) {
        if (isHost) {
            lobbyNote.textContent = 'You are the host. Set a question and start the round.';
        } else {
            lobbyNote.textContent = 'Wait for the host to start the round, then submit your guess.';
        }
    }

    // Display the current question.
    if (questionDisplay) {
        questionDisplay.textContent = room.question || 'No question has been set yet.';
    }

    if (roundInfo) {
        roundInfo.hidden = !(isActive || isFinished || isEnded);
    }

    // The host can start a round only when the room is ready.
    if (startRoundButton) {
        startRoundButton.hidden = !isHost || !isWaiting;
        startRoundButton.disabled =
            !isWaiting ||
            !room.question ||
            (room.playerCount ?? room.players?.length ?? 0) < 2;
    }

    // End and restart controls.
    if (endGameButton) {
        endGameButton.hidden = !isHost || isEnded;
        endGameButton.disabled = isEnded;
    }

    if (restartGameButton) {
        restartGameButton.hidden = !isHost || !isEnded;
    }

    // Guessing is allowed only during an active round.
    if (guessInput) {
        guessInput.disabled = !isActive;
    }

    if (submitGuessButton) {
        submitGuessButton.disabled = !isActive;
    }

    // Reveal the answer after a round finishes or the game ends.
    if (answerReveal) {
        answerReveal.hidden = !(isFinished || isEnded);
    }

    if (correctAnswerDisplay) {
        correctAnswerDisplay.textContent =
            (isFinished || isEnded)
                ? (room.correctAnswer || 'No answer available')
                : '';
    }

    if (winnerDisplay) {
        winnerDisplay.textContent = room.winner
            ? `Winner: ${typeof room.winner === 'string'
                ? room.winner
                : room.winner.nickname || 'Player'}`
            : (isEnded ? 'The host ended the game.' : 'No winner this round.');
    }

    // Update the countdown.
    if (isActive && room.endsAt) {
        startCountdown(room.endsAt);
    } else {
        clearCountdown();

        if (roundTimer) {
            roundTimer.textContent = isFinished
                ? 'Round finished'
                : isEnded
                    ? 'Game ended'
                    : 'Not started';
        }
    }
}


// ============================================
// 6. ROUND COUNTDOWN TIMER
// ============================================

function startCountdown(endsAt) {
    clearCountdown();

    if (!roundTimer) return;

    function updateTimer() {
        const remaining = new Date(endsAt).getTime() - Date.now();

        if (remaining <= 0) {
            roundTimer.textContent = 'Time is up!';
            clearCountdown();
            return;
        }

        const seconds = Math.ceil(remaining / 1000);
        const minutes = Math.floor(seconds / 60);
        const remainingSeconds = seconds % 60;

        roundTimer.textContent =
            `${minutes}:${String(remainingSeconds).padStart(2, '0')}`;
    }

    updateTimer();
    countdownInterval = setInterval(updateTimer, 1000);
}


//create room

if (createRoomForm) {
    createRoomForm.addEventListener('submit', async event => {
        event.preventDefault();
        clearMessage();

        const formData = new FormData(createRoomForm);
        const nickname = String(formData.get('nickname') || '').trim();

        try {
            setFormsDisabled(true);

            const data = await sendRequest('/api/rooms', 'POST', {
                nickname
            });

            // Supports controllers returning either a direct object
            // or an object containing room and host information.
            enterRoom(data);
        } catch (error) {
            showMessage(error.message, true);
            setFormsDisabled(false);
        }
    });
}


//join room

if (joinRoomForm) {
    joinRoomForm.addEventListener('submit', async event => {
        event.preventDefault();
        clearMessage();

        const formData = new FormData(joinRoomForm);

        const nickname = String(formData.get('nickname') || '').trim();
        const roomCode = String(formData.get('roomCode') || '')
            .trim()
            .toUpperCase();

        try {
            setFormsDisabled(true);

            const data = await sendRequest(
                `/api/rooms/${encodeURIComponent(roomCode)}/join`,
                'POST',
                { nickname }
            );

            enterRoom(data);
        } catch (error) {
            showMessage(error.message, true);
            setFormsDisabled(false);
        }
    });
}


//copy room code

if (copyCodeButton) {
    copyCodeButton.addEventListener('click', async () => {
        const roomCode =
            roomCodeDisplay?.textContent?.trim() ||
            getSession().roomCode;

        if (!roomCode) {
            showMessage('No room code is available.', true);
            return;
        }

        try {
            await navigator.clipboard.writeText(roomCode);
            showMessage('Room code copied!');
        } catch {
            showMessage('Could not copy the room code.', true);
        }
    });
}


//set question and answer

if (questionForm) {
    questionForm.addEventListener('submit', async event => {
        event.preventDefault();
        clearMessage();

        const session = getSession();
        const formData = new FormData(questionForm);

        const question = String(formData.get('question') || '').trim();
        const correctAnswer = String(
            formData.get('correctAnswer') || ''
        ).trim();

        try {
            await emitWithAck('game:question:set', {
                roomCode: session.roomCode,
                sessionId: session.sessionId,
                question,
                correctAnswer
            });

            showMessage('Question saved successfully.');
        } catch (error) {
            showMessage(error.message, true);
        }
    });
}


//start

if (startRoundButton) {
    startRoundButton.addEventListener('click', async () => {
        clearMessage();

        const session = getSession();

        try {
            await emitWithAck('game:round:start', {
                roomCode: session.roomCode,
                sessionId: session.sessionId
            });

            showMessage('Round started!');
        } catch (error) {
            showMessage(error.message, true);
        }
    });
}


submit //player answer

if (guessForm) {
    guessForm.addEventListener('submit', async event => {
        event.preventDefault();
        clearMessage();

        const session = getSession();
        const guess = String(guessInput?.value || '').trim();

        if (!guess) {
            showMessage('Please enter a guess.', true);
            return;
        }

        try {
            const result = await emitWithAck('game:guess:submit', {
                roomCode: session.roomCode,
                sessionId: session.sessionId,
                guess
            });

            showMessage(
                result.message ||
                (result.correct ? 'Correct guess!' : 'Try again.'),
                !result.correct
            );

            if (result.correct && guessInput) {
                guessInput.value = '';
            }
        } catch (error) {
            showMessage(error.message, true);
        }
    });
}


//end game

if (endGameButton) {
    endGameButton.addEventListener('click', async () => {
        console.log('1. End Game button clicked');
        const shouldEnd = window.confirm(
            'Are you sure you want to end this game for everyone?'
        );

        if (!shouldEnd) return;

        clearMessage();

        const session = getSession();
         console.log('2. Sending end-game request:', {
            roomCode: session.roomCode,
            sessionId: session.sessionId
        });

        try {
            await emitWithAck('game:game:end', {
                roomCode: session.roomCode,
                sessionId: session.sessionId
            });

            // The server should broadcast "game:ended" to everyone.
            // The game:ended listener below performs the redirect.
             console.log('3. Server acknowledged end-game request');
        } catch (error) {
            showMessage(error.message, true);
        }
    });
}


//restart

if (restartGameButton) {
    restartGameButton.addEventListener('click', async () => {
        const shouldRestart = window.confirm(
            'Start a new game in this room? Scores will be reset.'
        );

        if (!shouldRestart) return;

        clearMessage();

        const session = getSession();

        try {
            await emitWithAck('game:game:restart', {
                roomCode: session.roomCode,
                sessionId: session.sessionId
            });

            if (questionForm) {
                questionForm.reset();
            }

            showMessage('New game started. Set the next question.');
        } catch (error) {
            showMessage(error.message, true);
        }
    });
}




socket.on('room:updated', room => {
    renderRoom(room);
});




socket.on('game:ended', () => {
    console.log('Game ended event received');

    clearCountdown();
    clearSession();

    // Hide the old lobby and show the home forms.
    lobbySection?.classList.add('hidden');
    entrySection?.classList.remove('hidden');

    // Reset the forms.
    createRoomForm?.reset();
    joinRoomForm?.reset();
    questionForm?.reset();
    guessForm?.reset();

    // Reset the room information.
    if (roomCodeDisplay) roomCodeDisplay.textContent = '------';

    if (hostNameDisplay) {
        hostNameDisplay.textContent =
            'Waiting for host information...';
    }

    playerList?.replaceChildren();

    if (playerCountDisplay) {
        playerCountDisplay.textContent = '0 players';
    }

    if (questionDisplay) {
        questionDisplay.textContent =
            'The host has not set a question yet.';
    }

    if (roundTimer) roundTimer.textContent = 'Not started';

    if (correctAnswerDisplay) correctAnswerDisplay.textContent = '';
    if (winnerDisplay) winnerDisplay.textContent = '';

    if (answerReveal) answerReveal.hidden = true;
    if (hostControls) hostControls.hidden = true;
    if (playerControls) playerControls.hidden = true;

    currentRoom = null;
    setFormsDisabled(false);

    showMessage('Game ended. You can create or join another room.');
});




socket.on('connect', () => {
    console.log('SOCKET CONNECTED:', socket.id);
    const session = getSession();

    if (session.roomCode && session.sessionId) {
        subscribeToRoom(session.roomCode, session.sessionId);
    }
});

socket.on('disconnect', () => {
    clearCountdown();
    showMessage('Connection lost. Trying to reconnect...', true);
});

socket.on('connect_error', () => {
    showMessage('Unable to connect to the game server.', true);
});


