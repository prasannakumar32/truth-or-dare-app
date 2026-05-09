const Database = require('better-sqlite3');
const path = require('path');

const db = new Database(path.join(__dirname, 'gamedata.db'));

// Enable WAL mode for better performance
db.pragma('journal_mode = WAL');

// Create tables
db.exec(`
  CREATE TABLE IF NOT EXISTS players (
    username TEXT PRIMARY KEY COLLATE NOCASE,
    display_name TEXT NOT NULL,
    level INTEGER NOT NULL DEFAULT 1,
    total_score INTEGER NOT NULL DEFAULT 0,
    games_played INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    last_seen TEXT NOT NULL DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS game_history (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    username TEXT NOT NULL,
    room_id TEXT NOT NULL,
    score INTEGER NOT NULL DEFAULT 0,
    level_reached INTEGER NOT NULL DEFAULT 1,
    played_at TEXT NOT NULL DEFAULT (datetime('now')),
    FOREIGN KEY(username) REFERENCES players(username)
  );
`);

// ── Player CRUD ────────────────────────────────────────────────────────────────

/**
 * Register a new player or return existing one.
 * Returns the player row.
 */
function upsertPlayer(username, displayName) {
  const existing = db.prepare(
    `SELECT * FROM players WHERE username = ?`
  ).get(username);

  if (existing) {
    // Update last_seen
    db.prepare(`UPDATE players SET last_seen = datetime('now') WHERE username = ?`).run(username);
    return existing;
  }

  db.prepare(`
    INSERT INTO players (username, display_name, level, total_score, games_played)
    VALUES (?, ?, 1, 0, 0)
  `).run(username, displayName || username);

  return db.prepare(`SELECT * FROM players WHERE username = ?`).get(username);
}

/**
 * Get a player by username.
 */
function getPlayer(username) {
  return db.prepare(`SELECT * FROM players WHERE username = ?`).get(username);
}

/**
 * Update player's level and score after they earn points.
 */
function updatePlayerStats(username, newLevel, additionalScore) {
  const player = getPlayer(username);
  if (!player) return null;

  const updatedScore = player.total_score + additionalScore;
  const finalLevel = newLevel > player.level ? newLevel : player.level; // never downgrade

  db.prepare(`
    UPDATE players
    SET level = ?, total_score = ?, last_seen = datetime('now')
    WHERE username = ?
  `).run(finalLevel, updatedScore, username);

  return db.prepare(`SELECT * FROM players WHERE username = ?`).get(username);
}

/**
 * Increment games played and save session score.
 */
function recordGameSession(username, roomId, score, levelReached) {
  const player = getPlayer(username);
  if (!player) return;

  db.prepare(`
    INSERT INTO game_history (username, room_id, score, level_reached)
    VALUES (?, ?, ?, ?)
  `).run(username, roomId, score, levelReached);

  db.prepare(`
    UPDATE players SET games_played = games_played + 1, last_seen = datetime('now')
    WHERE username = ?
  `).run(username);
}

/**
 * Get top players for leaderboard.
 */
function getLeaderboard(limit = 10) {
  return db.prepare(`
    SELECT display_name, username, level, total_score, games_played
    FROM players
    ORDER BY total_score DESC, level DESC
    LIMIT ?
  `).all(limit);
}

module.exports = { upsertPlayer, getPlayer, updatePlayerStats, recordGameSession, getLeaderboard };
