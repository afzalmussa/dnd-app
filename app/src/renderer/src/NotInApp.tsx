// Shown when the page is opened in an ordinary browser tab (for example the
// http://localhost:5173 address that "npm run dev" prints). The sheet needs
// the app window to read and save files, so it explains instead of half-working.

export function NotInApp() {
  return (
    <div className="not-in-app">
      <h1>Open the app window, not a browser tab</h1>
      <p>
        This page is the inside of the DnD Character Manager. On its own in a browser it can't read or save
        character files.
      </p>
      <p>
        Use the window titled <strong>DnD Character Manager</strong> that opens when you run{' '}
        <code>npm run dev</code>. The localhost address in the terminal is for the app's own use.
      </p>
    </div>
  )
}
