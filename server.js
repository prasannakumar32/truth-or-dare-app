const express = require('express');
const http = require('http');
const socketIo = require('socket.io');
const cors = require('cors');
const { v4: uuidv4 } = require('uuid');
const path = require('path');

let db;
try {
  db = require('./db');
} catch (e) {
  console.warn('⚠️  DB module not available, running without persistence:', e.message);
  db = null;
}

const app = express();
const server = http.createServer(app);
const io = socketIo(server, {
  cors: { origin: '*', methods: ['GET', 'POST'] }
});

app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// ── REST Endpoints ─────────────────────────────────────────────────────────────

// Look up a player profile (used by frontend to pre-fill level)
app.get('/api/player/:username', (req, res) => {
  if (!db) return res.json({ exists: false });
  const player = db.getPlayer(req.params.username);
  if (!player) return res.json({ exists: false });
  res.json({ exists: true, player });
});

// Leaderboard
app.get('/api/leaderboard', (req, res) => {
  if (!db) return res.json([]);
  res.json(db.getLeaderboard(20));
});

// ── In-memory Room State ───────────────────────────────────────────────────────

const rooms = {};        // roomId → room object
const socketPlayer = {}; // socketId → { roomId, username }
const chatHistory = {};  // roomId → messages[]
const publicRoomIndex = {}; // roomId → public room meta

// ── Content ───────────────────────────────────────────────────────────────────

const truthQuestions = {
  1: [
    "What's your favorite food?",
    "What's your favorite movie?",
    "What's your favorite color?",
    "What's your favorite hobby?",
    "What's your favorite animal?",
    "What's your favorite song?",
    "What's your favorite season?",
    "What's your favorite sport?",
    "What's your favorite book?",
    "What's your favorite holiday?"
  ],
  2: [
    "What's your most embarrassing moment?",
    "Have you ever lied to get out of trouble?",
    "What's your biggest fear?",
    "What's the weirdest dream you've had?",
    "Have you ever cheated on a test?",
    "What's your most embarrassing nickname?",
    "Have you ever stolen anything?",
    "What's your biggest regret?",
    "What's the craziest thing you've ever done?",
    "What's your biggest secret?"
  ],
  3: [
    "What's the most illegal thing you've ever done?",
    "Have you ever betrayed a friend?",
    "What's your deepest, darkest secret?",
    "What's the worst thing you've ever done to someone?",
    "Have you ever had a crush on a friend's partner?",
    "What's the most selfish thing you've ever done?",
    "What's the biggest lie you've ever told?",
    "Have you ever cheated on a partner?",
    "What's the most embarrassing thing your parents caught you doing?",
    "What's the worst rumor you've ever spread?"
  ],
  4: [
    "What's the most taboo fantasy you've ever had?",
    "What's the most illegal thing you'd do if you knew you wouldn't get caught?",
    "What's the most morally questionable thing you've done?",
    "Have you ever had feelings for more than one person at once?",
    "What's the most inappropriate thought you've had about someone you know?",
    "What's the most illegal thing you've purchased?",
    "What's the most unethical thing you've done for money?",
    "What's the most forbidden thing you've ever wanted to do?",
    "What's the most scandalous secret you're keeping?",
    "What's the most controversial opinion you hold?"
  ],
  5: [
    "What's the most extreme thing you'd do for love?",
    "What's the most dangerous situation you've ever been in?",
    "What's the most illegal thing you've gotten away with?",
    "What's the most taboo experience you've ever had?",
    "What's the most dangerous secret you're protecting?",
    "What's the most extreme risk you've ever taken?",
    "What's the most scandalous truth about yourself?",
    "What's something you've done that you'll never tell your family?",
    "Have you ever done something you deeply regret but would do again?",
    "What's the most surprising thing about you that no one would guess?"
  ]
};

const dareChallenges = {
  1: [
    "Do 5 jumping jacks",
    "Sing 'Twinkle Twinkle Little Star'",
    "Do a silly dance for 10 seconds",
    "Tell a knock-knock joke",
    "Make a funny face",
    "Hop on one foot 5 times",
    "Spin around 3 times",
    "Do a robot dance",
    "Make animal sounds",
    "Do a happy dance"
  ],
  2: [
    "Do 10 pushups",
    "Sing a song loudly for 20 seconds",
    "Dance for 30 seconds",
    "Tell a funny joke",
    "Do your best impression of a celebrity",
    "Talk in a funny accent for 2 minutes",
    "Do a handstand or attempt one",
    "Speak only in questions for 2 minutes",
    "Act out a movie scene",
    "Call a friend and say something random"
  ],
  3: [
    "Do 20 pushups",
    "Sing a love song dramatically",
    "Dance like nobody's watching for 1 minute",
    "Tell your most embarrassing story",
    "Let someone draw on your arm with a pen",
    "Give someone a compliment in a different language",
    "Read your last text message out loud",
    "Show the last photo on your phone",
    "Talk like a pirate for 5 minutes",
    "Do your best runway walk"
  ],
  4: [
    "Do 30 pushups",
    "Share your most embarrassing photo",
    "Let someone style your hair however they want",
    "Speak only in song lyrics for 3 minutes",
    "Let someone go through your camera roll for 30 seconds",
    "Do your best stand-up comedy for 2 minutes",
    "Wear your clothes inside out for the rest of the game",
    "Talk in slow motion for 5 minutes",
    "Let someone post a status on your social media",
    "Pretend to be a news anchor for 2 minutes"
  ],
  5: [
    "Do 50 pushups",
    "Write and perform an original rap in 3 minutes",
    "Let the group decide your profile picture for 1 hour",
    "Send a cringe text to your best friend",
    "Eat something weird from the kitchen",
    "Do a full dramatic movie monologue",
    "Wear a silly costume for the next round",
    "Let someone style your appearance for the next 10 minutes",
    "Do the funniest walk you can for 1 minute",
    "Recreate a famous painting using whatever's nearby"
  ]
};

// ── Helpers ───────────────────────────────────────────────────────────────────

function computeLevel(score) {
  if (score >= 200) return 5;
  if (score >= 100) return 4;
  if (score >= 50) return 3;
  if (score >= 20) return 2;
  return 1;
}

function getLevelName(level) {
  return ['', 'Beginner', 'Intermediate', 'Advanced', 'Expert', 'Master'][level] || 'Unknown';
}

function getRandomItem(arr) {
  return arr[Math.floor(Math.random() * arr.length)];
}

function buildPlayerForRoom(socketId, username, age, style, isHost, dbPlayer) {
  return {
    id: socketId,
    name: username,
    age: age,
    level: dbPlayer ? dbPlayer.level : 1,
    dbLevel: dbPlayer ? dbPlayer.level : 1, // persisted level
    style: style || 'default',
    score: 0,
    sessionScore: 0,
    isHost
  };
}

function nextTurn(roomId) {
  const room = rooms[roomId];
  if (!room) return;
  room.currentPlayerIndex = (room.currentPlayerIndex + 1) % room.players.length;
  const currentPlayer = room.players[room.currentPlayerIndex];
  io.to(roomId).emit('nextTurn', {
    currentPlayer: currentPlayer.name,
    playerId: currentPlayer.id,
    playerIndex: room.currentPlayerIndex,
    level: currentPlayer.level
  });
}

// ── Socket.IO Events ──────────────────────────────────────────────────────────

io.on('connection', (socket) => {
  console.log('✅ Connected:', socket.id);

  // ── Create Room ──────────────────────────────────────────────────────────────
  socket.on('createRoom', (data) => {
    const { username, age, roomType, roomStyle } = data;

    // Upsert player in DB
    let dbPlayer = null;
    if (db) {
      dbPlayer = db.upsertPlayer(username, username);
    }

    const roomId = uuidv4().slice(0, 6).toUpperCase();
    const hostPlayer = buildPlayerForRoom(socket.id, username, age, roomStyle, true, dbPlayer);

    const room = {
      id: roomId,
      host: socket.id,
      type: roomType || 'private',
      players: [hostPlayer],
      gameState: 'waiting',
      currentPlayerIndex: 0,
      questions: []
    };

    rooms[roomId] = room;
    socketPlayer[socket.id] = { roomId, username };
    chatHistory[roomId] = [];

    if (roomType === 'public') {
      publicRoomIndex[roomId] = {
        id: roomId,
        name: `${username}'s Room`,
        host: username,
        players: 1,
        style: roomStyle || 'default',
        created: new Date().toISOString()
      };
      io.emit('publicRoomsUpdated', { rooms: Object.values(publicRoomIndex) });
    }

    socket.join(roomId);
    socket.emit('roomCreated', { room, dbPlayer });
    console.log(`🏠 Room ${roomId} created by ${username} (Level ${hostPlayer.level})`);
  });

  // ── Join Room ────────────────────────────────────────────────────────────────
  socket.on('joinRoom', (data) => {
    const { roomId, username, age } = data;
    const room = rooms[roomId];

    if (!room) { socket.emit('error', 'Room not found'); return; }
    if (room.players.length >= 8) { socket.emit('error', 'Room is full'); return; }
    if (room.gameState !== 'waiting') { socket.emit('error', 'Game already started'); return; }

    let dbPlayer = null;
    if (db) dbPlayer = db.upsertPlayer(username, username);

    const newPlayer = buildPlayerForRoom(socket.id, username, age, 'default', false, dbPlayer);
    room.players.push(newPlayer);
    socketPlayer[socket.id] = { roomId, username };

    socket.join(roomId);

    // Chat history
    const systemMsg = {
      roomId,
      message: `${username} (Level ${newPlayer.level}) joined the room`,
      playerName: 'System',
      system: true,
      timestamp: new Date().toISOString()
    };
    chatHistory[roomId].push(systemMsg);

    setTimeout(() => {
      socket.emit('chatHistory', { messages: chatHistory[roomId] });
    }, 100);

    socket.emit('joinedRoom', { room, dbPlayer });
    io.to(roomId).emit('chatMessage', systemMsg);
    io.to(roomId).emit('playerJoined', { room });

    // Update public room count
    if (publicRoomIndex[roomId]) {
      publicRoomIndex[roomId].players = room.players.length;
      io.emit('publicRoomsUpdated', { rooms: Object.values(publicRoomIndex) });
    }

    console.log(`🔗 ${username} (Level ${newPlayer.level}) joined room ${roomId}`);
  });

  // ── Join Public Room ─────────────────────────────────────────────────────────
  socket.on('joinPublicRoom', (data) => {
    // Reuse joinRoom with the same payload shape
    socket.emit('joinRoom', data); // won't work — re-emit internally isn't a thing
    // Directly call join logic
    const { roomId, username, age } = data;
    const room = rooms[roomId];
    if (!room) { socket.emit('error', 'Room not found'); return; }
    if (room.players.length >= 8) { socket.emit('error', 'Room is full'); return; }

    let dbPlayer = null;
    if (db) dbPlayer = db.upsertPlayer(username, username);

    const newPlayer = buildPlayerForRoom(socket.id, username, age, 'default', false, dbPlayer);
    room.players.push(newPlayer);
    socketPlayer[socket.id] = { roomId, username };

    socket.join(roomId);

    if (!chatHistory[roomId]) chatHistory[roomId] = [];
    const systemMsg = {
      roomId,
      message: `${username} (Level ${newPlayer.level}) joined the room`,
      playerName: 'System',
      system: true,
      timestamp: new Date().toISOString()
    };
    chatHistory[roomId].push(systemMsg);
    setTimeout(() => socket.emit('chatHistory', { messages: chatHistory[roomId] }), 100);

    socket.emit('joinedRoom', { room, dbPlayer });
    io.to(roomId).emit('chatMessage', systemMsg);
    io.to(roomId).emit('playerJoined', { room });

    if (publicRoomIndex[roomId]) {
      publicRoomIndex[roomId].players = room.players.length;
      io.emit('publicRoomsUpdated', { rooms: Object.values(publicRoomIndex) });
    }
  });

  // ── Start Game ───────────────────────────────────────────────────────────────
  socket.on('startGame', () => {
    const pd = socketPlayer[socket.id];
    if (!pd) return;
    const room = rooms[pd.roomId];
    if (!room || room.host !== socket.id) {
      socket.emit('error', 'Only the host can start the game');
      return;
    }
    if (room.players.length < 2) {
      socket.emit('error', 'Need at least 2 players to start');
      return;
    }

    room.gameState = 'playing';
    room.currentPlayerIndex = -1; // No one's turn yet
    room.questions = [];

    io.to(pd.roomId).emit('gameStarted', { room });
    // Tell everyone we are waiting for the host to roll
    io.to(pd.roomId).emit('waitingForRoll', { hostId: room.host });
  });

  // ── Roll Dice (Host Only) ───────────────────────────────────────────────────
  socket.on('rollDice', () => {
    const pd = socketPlayer[socket.id];
    if (!pd) return;
    const room = rooms[pd.roomId];
    if (!room) return;

    if (room.host !== socket.id) {
      socket.emit('error', 'Only the host can roll the dice');
      return;
    }

    // Pick a random player
    const randomIndex = Math.floor(Math.random() * room.players.length);
    room.currentPlayerIndex = randomIndex;
    const selectedPlayer = room.players[randomIndex];

    // Emit rolling animation event
    io.to(pd.roomId).emit('diceRolling', { duration: 3000 });

    // After animation, start turn
    setTimeout(() => {
      io.to(pd.roomId).emit('nextTurn', {
        currentPlayer: selectedPlayer.name,
        playerId: selectedPlayer.id,
        playerIndex: randomIndex,
        level: selectedPlayer.level
      });
    }, 3000);
  });

  // ── Select Truth ─────────────────────────────────────────────────────────────
  socket.on('selectTruth', () => {
    const pd = socketPlayer[socket.id];
    if (!pd) return;
    const room = rooms[pd.roomId];
    if (!room) return;

    const cur = room.players[room.currentPlayerIndex];
    if (cur.id !== socket.id) return;

    const level = cur.level;
    const pool = truthQuestions[level] || truthQuestions[1];
    const question = getRandomItem(pool);
    room.questions.push({ type: 'truth', question, player: cur.name, level });

    io.to(pd.roomId).emit('questionSelected', {
      type: 'truth',
      question,
      player: cur.name,
      level,
      levelName: getLevelName(level)
    });
  });

  // ── Select Dare ──────────────────────────────────────────────────────────────
  socket.on('selectDare', () => {
    const pd = socketPlayer[socket.id];
    if (!pd) return;
    const room = rooms[pd.roomId];
    if (!room) return;

    const cur = room.players[room.currentPlayerIndex];
    if (cur.id !== socket.id) return;

    const level = cur.level;
    const pool = dareChallenges[level] || dareChallenges[1];
    const dare = getRandomItem(pool);
    room.questions.push({ type: 'dare', question: dare, player: cur.name, level });

    io.to(pd.roomId).emit('questionSelected', {
      type: 'dare',
      question: dare,
      player: cur.name,
      level,
      levelName: getLevelName(level)
    });
  });

  // ── Update Player Level (manual selection) ───────────────────────────────────
  socket.on('updatePlayerLevel', (data) => {
    const pd = socketPlayer[socket.id];
    if (!pd) return;
    const room = rooms[pd.roomId];
    if (!room) return;

    const player = room.players.find(p => p.id === socket.id);
    if (!player) return;

    const oldLevel = player.level;
    const newLevel = Math.min(5, Math.max(1, data.level));
    player.level = newLevel;

    if (db) {
      db.updatePlayerStats(pd.username, newLevel, 0);
    }

    if (newLevel > oldLevel) {
      player.score += 50;
      io.to(pd.roomId).emit('playerLeveledUp', {
        player: player.name,
        oldLevel,
        newLevel,
        levelName: getLevelName(newLevel)
      });
    }

    io.to(pd.roomId).emit('playerUpdated', { room });
  });

  // ── Change Room Privacy ──────────────────────────────────────────────────────
  socket.on('changeRoomPrivacy', (data) => {
    const pd = socketPlayer[socket.id];
    if (!pd) return;
    const room = rooms[pd.roomId];
    if (!room) return;
    
    if (room.host !== socket.id) {
      socket.emit('error', 'Only the host can change room privacy');
      return;
    }

    room.type = data.type; // 'public' or 'private'

    if (data.type === 'public') {
      publicRoomIndex[pd.roomId] = {
        id: pd.roomId,
        name: `${pd.username}'s Room`,
        host: pd.username,
        players: room.players.length,
        style: 'default',
        created: new Date().toISOString()
      };
    } else {
      delete publicRoomIndex[pd.roomId];
    }
    
    io.emit('publicRoomsUpdated', { rooms: Object.values(publicRoomIndex) });
    io.to(pd.roomId).emit('roomPrivacyChanged', { type: data.type });
  });

  // ── Complete Turn ────────────────────────────────────────────────────────────
  socket.on('completeTurn', () => {
    const pd = socketPlayer[socket.id];
    if (!pd) return;
    const room = rooms[pd.roomId];
    if (!room) return;

    const cur = room.players[room.currentPlayerIndex];
    if (cur.id !== socket.id) return;

    cur.score += 10;
    cur.sessionScore = (cur.sessionScore || 0) + 10;

    // Auto-level based on session score
    const autoLevel = computeLevel(cur.score);
    const oldLevel = cur.level;
    if (autoLevel > cur.level) {
      cur.level = autoLevel;
      // Persist to DB
      if (db) db.updatePlayerStats(pd.username, autoLevel, 10);
      io.to(pd.roomId).emit('playerLeveledUp', {
        player: cur.name,
        oldLevel,
        newLevel: autoLevel,
        levelName: getLevelName(autoLevel)
      });
    } else {
      if (db) db.updatePlayerStats(pd.username, cur.level, 10);
    }

    io.to(pd.roomId).emit('playerUpdated', { room });
    
    // Back to waiting for roll
    io.to(pd.roomId).emit('waitingForRoll', { hostId: room.host });
  });

  // ── Roll for Next Turn ───────────────────────────────────────────────────────
  socket.on('rollForTurn', () => {
    const pd = socketPlayer[socket.id];
    if (!pd) return;
    const room = rooms[pd.roomId];
    if (!room) return;

    const cur = room.players[room.currentPlayerIndex];
    if (cur.id !== socket.id) return;

    io.to(pd.roomId).emit('startRolling', { players: room.players });

    setTimeout(() => {
      const randomIndex = Math.floor(Math.random() * room.players.length);
      room.currentPlayerIndex = randomIndex;
      io.to(pd.roomId).emit('rollComplete', {
        nextPlayer: room.players[randomIndex],
        playerIndex: randomIndex
      });
    }, 2000);
  });

  // ── Chat ─────────────────────────────────────────────────────────────────────
  socket.on('chatMessage', (data) => {
    const pd = socketPlayer[socket.id];
    if (!pd) return;
    const room = rooms[pd.roomId];
    if (!room || data.roomId !== pd.roomId) return;

    if (!chatHistory[data.roomId]) chatHistory[data.roomId] = [];

    const msg = {
      ...data,
      playerId: socket.id,
      timestamp: new Date().toISOString()
    };
    chatHistory[data.roomId].push(msg);
    if (chatHistory[data.roomId].length > 100) chatHistory[data.roomId].shift();

    io.to(data.roomId).emit('chatMessage', msg);
  });

  // ── Update Style ─────────────────────────────────────────────────────────────
  socket.on('updatePlayerStyle', (data) => {
    const pd = socketPlayer[socket.id];
    if (!pd) return;
    const room = rooms[pd.roomId];
    if (!room) return;

    const player = room.players.find(p => p.id === socket.id);
    if (player) {
      player.style = data.style;
      io.to(pd.roomId).emit('playerUpdated', { room });
    }
  });

  // ── Public Rooms ─────────────────────────────────────────────────────────────
  socket.on('getPublicRooms', () => {
    socket.emit('publicRoomsList', { rooms: Object.values(publicRoomIndex) });
  });

  // ── Disconnect ───────────────────────────────────────────────────────────────
  socket.on('disconnect', () => {
    console.log('❌ Disconnected:', socket.id);
    const pd = socketPlayer[socket.id];
    if (!pd) return;

    const room = rooms[pd.roomId];
    if (room) {
      const leaving = room.players.find(p => p.id === socket.id);

      // Save final session to DB
      if (db && leaving) {
        db.recordGameSession(pd.username, pd.roomId, leaving.sessionScore || 0, leaving.level);
      }

      room.players = room.players.filter(p => p.id !== socket.id);

      if (room.players.length === 0) {
        delete rooms[pd.roomId];
        delete chatHistory[pd.roomId];
        delete publicRoomIndex[pd.roomId];
        io.emit('publicRoomsUpdated', { rooms: Object.values(publicRoomIndex) });
      } else {
        if (room.host === socket.id) {
          room.host = room.players[0].id;
          room.players[0].isHost = true;
        }

        const leaveMsg = {
          roomId: pd.roomId,
          message: `${leaving ? leaving.name : 'A player'} left the room`,
          playerName: 'System',
          system: true,
          timestamp: new Date().toISOString()
        };
        if (chatHistory[pd.roomId]) chatHistory[pd.roomId].push(leaveMsg);
        io.to(pd.roomId).emit('chatMessage', leaveMsg);
        io.to(pd.roomId).emit('playerLeft', { room });

        if (publicRoomIndex[pd.roomId]) {
          publicRoomIndex[pd.roomId].players = room.players.length;
          io.emit('publicRoomsUpdated', { rooms: Object.values(publicRoomIndex) });
        }
      }
    }

    delete socketPlayer[socket.id];
  });
});

// ── Start ─────────────────────────────────────────────────────────────────────

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`🚀 Truth or Dare server running on port ${PORT}`);
  console.log(`   Local: http://localhost:${PORT}`);
});
