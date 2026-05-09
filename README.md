# Truth or Dare - Online Multiplayer Mobile App

A real-time multiplayer Truth or Dare game with room creation, player levels, and customizable name card styles.

## Features

### Core Gameplay
- **Real-time multiplayer** - Play with friends online using WebSocket connections
- **Room system** - Create or join rooms with 6-digit codes
- **Up to 8 players** per room
- **Turn-based gameplay** with automatic player rotation

### Player Features
- **Level system** - Players gain XP and level up by completing challenges
- **Score tracking** - Earn points for each completed turn
- **Name card styles** - Choose from different visual styles:
  - Default
  - Neon
  - Classic
  - Modern
  - Retro
- **Host privileges** - Room creator gets crown icon and can start the game

### Game Mechanics
- **Truth questions** - Randomly selected from curated question database
- **Dare challenges** - Fun and engaging dares for players
- **Visual feedback** - Animated cards and smooth transitions
- **Mobile responsive** - Works perfectly on all mobile devices

## Technology Stack

### Backend
- **Node.js** - Server runtime
- **Express.js** - Web framework
- **Socket.IO** - Real-time WebSocket communication
- **UUID** - Room code generation

### Frontend
- **HTML5** - Semantic markup
- **CSS3** - Modern styling with animations and gradients
- **Vanilla JavaScript** - No framework dependencies
- **Socket.IO Client** - Real-time communication

## Installation & Setup

### Prerequisites
- Node.js (v14 or higher)
- npm or yarn

### Steps

1. **Install dependencies**
   ```bash
   npm install
   ```

2. **Start the development server**
   ```bash
   npm run dev
   ```

3. **Start production server**
   ```bash
   npm start
   ```

4. **Open in browser**
   - Navigate to `http://localhost:3000`
   - Works on mobile browsers too!

## How to Play

### Creating a Room
1. Click "Create Room"
2. Enter your name
3. Choose your preferred room style
4. Share the 6-digit room code with friends

### Joining a Room
1. Click "Join Room"
2. Enter your name
3. Input the 6-digit room code
4. Wait for the host to start the game

### Playing the Game
1. **Host starts** the game when all players are ready
2. **Current player** chooses between Truth or Dare
3. **Complete the challenge** shown on screen
4. **Next player** gets their turn automatically
5. **Game continues** with all players getting turns

### Features During Gameplay
- **Player cards** show current level, score, and style
- **Turn indicator** shows whose turn it is
- **Question display** shows the selected truth or dare
- **Player list** shows all participants and their levels
- **Real-time updates** when players join/leave

## File Structure

```
truth-or-dare-app/
├── server.js              # Main server file with Socket.IO logic
├── package.json           # Dependencies and scripts
├── public/
│   ├── index.html         # Main HTML structure
│   ├── styles.css         # Complete styling with animations
│   └── script.js          # Frontend JavaScript logic
└── README.md              # This file
```

## Customization

### Adding New Questions
Edit the `truthQuestions` and `dareChallenges` arrays in `server.js`:

```javascript
const truthQuestions = [
  "Your new truth question here...",
  // ... more questions
];

const dareChallenges = [
  "Your new dare challenge here...",
  // ... more dares
];
```

### Adding New Styles
1. Add new style option to the select in `index.html`
2. Create corresponding CSS class in `styles.css`
3. Update the style assignment logic in `server.js`

### Room Settings
Modify room limits and settings in `server.js`:
- `room.players.length >= 8` - Change max players
- Room code length in `uuidv4().slice(0, 6)` - Change code length

## Deployment

### Local Development
```bash
npm run dev
```

### Production
```bash
npm start
```

### Environment Variables
- `PORT` - Server port (default: 3000)

## Mobile Optimization

The app is fully optimized for mobile devices:
- **Touch-friendly** buttons and interactions
- **Responsive design** adapts to all screen sizes
- **Smooth animations** optimized for mobile performance
- **No horizontal scrolling** on any device
- **Large tap targets** for easy interaction

## Browser Support

- Chrome (mobile & desktop)
- Safari (iOS & macOS)
- Firefox (mobile & desktop)
- Edge (mobile & desktop)

## Contributing

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Test thoroughly
5. Submit a pull request

## License

MIT License - Feel free to use, modify, and distribute

## Support

For issues or questions:
1. Check the console for error messages
2. Ensure all dependencies are installed
3. Verify Node.js version compatibility
4. Test on different browsers if needed

---

**Enjoy playing Truth or Dare with your friends!** 🎮👥
