// ============================================================
//  CONFIG
//  HARDCODED_CLIENT_ID is replaced at deploy time by GitHub Actions.
//  The placeholder string is safe to commit — it contains no real secret.
// ============================================================
const HARDCODED_CLIENT_ID = '__SPOTIFY_CLIENT_ID__';
const REDIRECT_URI = window.location.origin + window.location.pathname;

// PartyKit server host — update after `npx partykit deploy`
// For local dev, run `npx partykit dev` and leave as 'localhost:1999'
const PARTYKIT_HOST = '__PARTYKIT_HOST__';

const SCOPES = [
  'user-read-private',
  'user-library-read',
  'playlist-read-private',
  'playlist-read-collaborative',
  'user-read-playback-state',
  'user-modify-playback-state',
  'streaming',
  'user-top-read',
  'user-read-recently-played'
].join(' ');

// ============================================================
//  CONCERTS — API keys & defaults 
//  Replace placeholders at deploy time (same pattern as SPOTIFY_CLIENT_ID).
// ============================================================
const TICKETMASTER_API_KEY = '__TICKETMASTER_API_KEY__';
const TICKETMASTER_BASE   = 'https://app.ticketmaster.com/discovery/v2';

const BANDSINTOWN_APP_ID  = '__BANDSINTOWN_APP_ID__';
const BANDSINTOWN_BASE    = 'https://rest.bandsintown.com';

// Default EU country codes for concert search
const DEFAULT_CONCERT_COUNTRIES = [
  'DE','AT','CH','NL','BE','FR','ES','IT','PT','PL',
  'CZ','DK','SE','NO','FI','IE','GB','HU','RO','BG',
  'HR','SI','SK','EE','LV','LT','LU','GR','CY','MT'
];
