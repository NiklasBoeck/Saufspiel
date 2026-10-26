// Läuft auf jeder Seite zuerst: Altersabfrage beim ersten Start und Offline-Modus (Service Worker).
(() => {
  const AGE_KEY = "saufspiel-age-ok";

  // --- Offline: Die App speichert sich selbst, damit „Ein Handy“ auch ohne Internet läuft. ---
  // In der App aus dem Store (Capacitor) liegen die Dateien eh auf dem Handy, da braucht es das nicht.
  if ("serviceWorker" in navigator && !window.Capacitor && (location.protocol === "https:" || location.hostname === "localhost")) {
    window.addEventListener("load", () => navigator.serviceWorker.register("sw.js").catch(() => {}));
  }

  // --- Ab 18: einmal fragen, dann merken. ---
  let ok = false;
  try {
    ok = localStorage.getItem(AGE_KEY) === "1";
  } catch {
    // ohne Speicher wird eben jedes Mal gefragt
  }
  if (ok) return;

  const css = `
    .age-gate { position: fixed; inset: 0; z-index: 100; display: grid; place-items: center; overflow-y: auto;
      padding: calc(20px + env(safe-area-inset-top)) 16px calc(20px + env(safe-area-inset-bottom));
      background: radial-gradient(circle at top, #3b1f6e, #1b1033 60%); color: #f5f0ff;
      font-family: system-ui, -apple-system, "Segoe UI", Roboto, sans-serif; }
    .age-box { width: 100%; max-width: 420px; display: flex; flex-direction: column; gap: 14px; text-align: center; }
    .age-box img { align-self: center; width: 84px; height: 84px; border-radius: 24px; }
    .age-box h1 { margin: 0; font-size: 1.8rem; font-weight: 900; }
    .age-box p { margin: 0; color: #b6a8d6; line-height: 1.45; }
    .age-box ul { margin: 0; padding: 14px 16px 14px 34px; border-radius: 18px; background: #2a1b4d; text-align: left; line-height: 1.45; }
    .age-box li + li { margin-top: 6px; }
    .age-box button { padding: 16px; font: inherit; font-size: 1.1rem; font-weight: 700; border: none; border-radius: 18px; cursor: pointer; }
    .age-yes { background: #f59e0b; color: #1b1033; }
    .age-no { background: transparent; color: #f5f0ff; border: 1px solid #2a1b4d !important; }
    .age-box a { color: #b6a8d6; font-size: 0.85rem; }
  `;

  function show() {
    const style = document.createElement("style");
    style.textContent = css;
    document.head.appendChild(style);
    const gate = document.createElement("div");
    gate.className = "age-gate";
    gate.setAttribute("role", "dialog");
    gate.setAttribute("aria-modal", "true");
    gate.innerHTML = `
      <div class="age-box">
        <img src="icons/icon.svg" alt="">
        <h1>Bist du 18 oder älter?</h1>
        <p>Saufomat ist ein Partyspiel für Erwachsene. Bevor es losgeht:</p>
        <ul>
          <li>Niemand muss trinken. Wasser und Limo zählen auch, dafür gibt es den Alkoholfrei-Modus (⚙️ im Menü).</li>
          <li>Kein Alkohol, wenn du noch fahren musst, schwanger bist oder Medikamente nimmst.</li>
          <li>Hört auf, wenn es genug ist, und trinkt Wasser zwischendurch.</li>
        </ul>
        <button class="age-yes">Ja, ich bin 18+</button>
        <button class="age-no">Nein</button>
        <a href="info.html">Verantwortung, Impressum und Datenschutz</a>
      </div>`;
    document.body.appendChild(gate);
    gate.querySelector(".age-yes").onclick = () => {
      try {
        localStorage.setItem(AGE_KEY, "1");
      } catch {
        // egal
      }
      gate.remove();
    };
    gate.querySelector(".age-no").onclick = () => {
      gate.querySelector(".age-box").innerHTML = `
        <img src="icons/icon.svg" alt="">
        <h1>Dann bis später! 👋</h1>
        <p>Saufomat ist erst ab 18. Komm gerne wieder, wenn es so weit ist.</p>`;
    };
    gate.querySelector(".age-yes").focus();
  }

  if (document.body) show();
  else document.addEventListener("DOMContentLoaded", show);
})();
