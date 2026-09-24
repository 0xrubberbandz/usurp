/** Shared by the wallet bundle fallback and the initial game-data load. */
export function LoadingScreen() {
  return <div className="loading-screen" role="status" aria-live="polite" aria-label="loading usurp">
    <div className="loading-content">
      <div className="loading-crown" aria-hidden="true">
        <span className="loading-orbit"/>
        <img src="/brand/crown.svg" alt="" width={80} height={80}/>
      </div>
      <p>finding the throne…</p>
    </div>
  </div>;
}
