// Set by the players' build (npm run dist:player). In that build the app never loads monsters,
// never acts as the DM, and refuses to publish.
export const PLAYER_EDITION = import.meta.env.MAIN_VITE_EDITION === 'player'
export const APP_NAME = PLAYER_EDITION ? 'Heroes Toolbox' : "DMs Toolbox"
