// ============================================================
//  STATE — all mutable global state lives here
// ============================================================

// Auth
let accessToken = null;
let tokenExpiry = 0;
let userId = null;

// Playlists
let playlists = [];
let selectedPlaylistId = null;
let selectedPlaylistName = '';
let recommendedPlaylists = [];
let searchTimeout = null;

// Game state
let gameCards = [];
let gameIndex = 0;
let gameScore = 0;
let gameTimeline = [];
let pendingPlacementIndex = null;
let lastCard = null;
let currentTrackUri = null;
let isPlaying = false;
let deviceId = null;

// Mode & token state
let gameMode = 'standard';
let tokens = 3;
let tokensEarned = 0;
let tokensSpent = 0;
let winTarget = 20;
let pendingArtistGuess = null;
let pendingTitleGuess = null;
let acTimers = {};

// Platform detection (iOS Safari cannot use Web Playback SDK)
const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent) ||
              (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
let spotifyPlayer = null;
