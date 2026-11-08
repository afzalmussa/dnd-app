// The players' build is made with VITE_EDITION=player (npm run dist:player). It leaves out everything
// the DM uses (monsters, encounters, DM view, publishing) so nothing breaks the game's immersion.
// The value is fixed at build time, so the DM-only code is dropped from the players' build.
export const PLAYER_EDITION = import.meta.env.VITE_EDITION === 'player'
export const APP_NAME = PLAYER_EDITION ? 'Heroes Toolbox' : "DMs Toolbox"
