const socket = io();

let currentRoom = null;
let myUsername = 'Player';
let myLevel = 1;
let isMyTurn = false;
let publicRoomsData = [];

// DOM Elements
const screens = {
    home: document.getElementById('homeScreen'),
    publicRooms: document.getElementById('publicRoomsScreen'),
    room: document.getElementById('roomScreen')
};

// Listeners
document.addEventListener('DOMContentLoaded', () => {
    // Load saved username if any
    const savedName = localStorage.getItem('tod_username');
    if (savedName) {
        document.getElementById('usernameInput').value = savedName;
        checkProfile(savedName);
    }

    document.getElementById('usernameInput').addEventListener('change', (e) => {
        const val = e.target.value.trim();
        if (val) {
            localStorage.setItem('tod_username', val);
            checkProfile(val);
        }
    });
});

async function checkProfile(username) {
    myUsername = username;
    try {
        const res = await fetch(`/api/player/${username}`);
        const data = await res.json();
        if (data.exists && data.player) {
            myLevel = data.player.level;
            document.getElementById('userLevelDisplay').textContent = myLevel;
        } else {
            myLevel = 1;
            document.getElementById('userLevelDisplay').textContent = 1;
        }
    } catch (e) {
        console.error('Failed to load profile', e);
    }
}

function showScreen(screenName) {
    Object.values(screens).forEach(s => s.classList.remove('active'));
    screens[screenName].classList.add('active');
    
    // Update bottom bar context buttons
    document.getElementById('createJoinBtn').classList.add('hidden');
    document.getElementById('readyBtn').classList.add('hidden');

    if (screenName === 'publicRooms') {
        document.getElementById('createJoinBtn').classList.remove('hidden');
    } else if (screenName === 'room' && currentRoom && currentRoom.host === socket.id && currentRoom.gameState === 'waiting') {
        document.getElementById('readyBtn').classList.remove('hidden');
    }
}

function goBack() {
    if (screens.publicRooms.classList.contains('active')) {
        showScreen('home');
    } else if (screens.room.classList.contains('active')) {
        socket.emit('leaveRoom');
        currentRoom = null;
        showScreen('home');
    }
}

// --- Join / Host ---
function hostGame() {
    myUsername = document.getElementById('usernameInput').value.trim() || 'Host';
    socket.emit('createRoom', {
        username: myUsername,
        age: 18,
        roomType: 'public',
        roomStyle: 'default'
    });
}

function joinByCode() {
    const code = document.getElementById('roomCodeInput').value.trim().toUpperCase();
    if (!code) return alert("Enter a room code!");
    myUsername = document.getElementById('usernameInput').value.trim() || 'Player';
    
    socket.emit('joinRoom', {
        roomId: code,
        username: myUsername,
        age: 18
    });
}

function joinPublicRoom(roomId) {
    myUsername = document.getElementById('usernameInput').value.trim() || 'Player';
    socket.emit('joinPublicRoom', {
        roomId: roomId,
        username: myUsername,
        age: 18
    });
}

function showPublicRooms() {
    showScreen('publicRooms');
    socket.emit('getPublicRooms');
}

// --- Game Actions ---
function startGame() {
    if (currentRoom) socket.emit('startGame');
}

function selectTruth() {
    socket.emit('selectTruth');
    document.getElementById('choiceButtons').classList.add('hidden');
}

function selectDare() {
    socket.emit('selectDare');
    document.getElementById('choiceButtons').classList.add('hidden');
}

function completeTurn() {
    socket.emit('completeTurn');
    document.getElementById('questionDisplay').classList.add('hidden');
}

// --- Socket Handlers ---
socket.on('roomCreated', (data) => {
    currentRoom = data.room;
    renderRoom();
    showScreen('room');
});

socket.on('joinedRoom', (data) => {
    currentRoom = data.room;
    renderRoom();
    showScreen('room');
});

socket.on('playerJoined', (data) => {
    currentRoom = data.room;
    renderRoom();
});

socket.on('playerLeft', (data) => {
    currentRoom = data.room;
    renderRoom();
});

socket.on('publicRoomsList', (data) => {
    renderPublicRooms(data.rooms);
});

socket.on('publicRoomsUpdated', (data) => {
    if (screens.publicRooms.classList.contains('active')) {
        renderPublicRooms(data.rooms);
    }
});

socket.on('error', (msg) => {
    alert(msg);
});

socket.on('gameStarted', (data) => {
    currentRoom = data.room;
    document.getElementById('waitingText').classList.add('hidden');
    document.getElementById('readyBtn').classList.add('hidden');
    document.getElementById('gamePlaySection').classList.remove('hidden');
});

socket.on('nextTurn', (data) => {
    document.getElementById('turnIndicator').textContent = data.currentPlayer + "'s Turn!";
    isMyTurn = (data.playerId === socket.id);
    
    document.getElementById('questionDisplay').classList.add('hidden');

    if (isMyTurn) {
        document.getElementById('choiceButtons').classList.remove('hidden');
    } else {
        document.getElementById('choiceButtons').classList.add('hidden');
    }
});

socket.on('questionSelected', (data) => {
    document.getElementById('choiceButtons').classList.add('hidden');
    document.getElementById('questionDisplay').classList.remove('hidden');
    document.getElementById('qType').textContent = data.type.toUpperCase();
    document.getElementById('qText').textContent = data.question;
});

// --- Render Helpers ---
function renderPublicRooms(rooms) {
    const list = document.getElementById('publicRoomsList');
    list.innerHTML = '';
    if (rooms.length === 0) {
        list.innerHTML = '<div class="loading-text">No public rooms found. Host one!</div>';
        return;
    }

    rooms.forEach(room => {
        const div = document.createElement('div');
        div.className = 'room-card';
        div.onclick = () => joinPublicRoom(room.id);
        div.innerHTML = `
            <div class="room-info">
                <h4>Room Name:</h4>
                <p>${room.name}</p>
            </div>
            <div class="room-players">
                <h4>Players:</h4>
                <p>${room.players}/8</p>
            </div>
        `;
        list.appendChild(div);
    });
}

function renderRoom() {
    if (!currentRoom) return;
    document.getElementById('roomNameDisplay').textContent = currentRoom.id;
    
    const list = document.getElementById('roomPlayersList');
    list.innerHTML = '';

    currentRoom.players.forEach(p => {
        const isMe = p.id === socket.id;
        const row = document.createElement('div');
        row.className = 'player-row';
        row.innerHTML = `
            <div class="player-name-box ${isMe ? 'me' : ''}">
                ${p.name}
                <div class="player-badge">${p.level}</div>
            </div>
            <div class="gender-box">🧔</div>
            <div class="interest-box">👄</div>
        `;
        list.appendChild(row);
    });

    if (currentRoom.host === socket.id && currentRoom.gameState === 'waiting') {
        document.getElementById('readyBtn').classList.remove('hidden');
    } else {
        document.getElementById('readyBtn').classList.add('hidden');
    }
}
