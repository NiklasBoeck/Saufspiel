// Profil-Bildschirm: oben der eigene Charakter (figur.js), darunter eigene Statistik und Freundesliste.
// Den Knopf im Menü macht figur.js (#figur-btn), der ruft Profil.open() auf.
const Profil = (() => {
  const $ = (id) => document.getElementById(id);
  const esc = escapeHtml;
  let tab = "stats";

  const screen = document.createElement("section");
  screen.id = "screen-profil";
  screen.className = "screen";
  screen.innerHTML = `
    <header class="game-bar">
      <button id="pf-back" class="btn ghost small" aria-label="${esc(t("Zurück"))}">←</button>
      <span class="game-name pf-title"></span>
      <span class="bar-spacer"></span>
    </header>
    <div id="pf-head" class="pf-head"></div>
    <div class="pf-tabs" role="tablist">
      <button data-tab="stats" role="tab"></button>
      <button data-tab="freunde" role="tab"></button>
    </div>
    <div id="pf-body" class="pf-body"></div>`;
  $("app").appendChild(screen);

  screen.querySelector("#pf-back").onclick = () => showScreen("menu");
  screen.querySelectorAll(".pf-tabs button").forEach((b) => (b.onclick = () => ((tab = b.dataset.tab), render())));

  const open = (which) => {
    if (which) tab = which;
    render();
    showScreen("profil");
  };
  const isOpen = () => screen.classList.contains("active");

  function editFigur() {
    if (typeof Figur !== "undefined" && Figur.edit) Figur.edit({ done: () => open() });
  }

  function render() {
    screen.querySelector(".pf-title").textContent = t("Profil");
    const hasFig = typeof Figur !== "undefined";
    const mine = hasFig ? Figur.mine : null;
    const name = Stats.myName();
    let av;
    try {
      av = mine ? Figur.avatarFor(Figur.wire(), "big") : Freunde.avatar({ name }, "big");
    } catch {
      av = Freunde.avatar({ name }, "big");
    }
    $("pf-head").innerHTML = `
      <div class="pf-me-av">${av}</div>
      <div class="pf-me">
        <b>${esc(name || t("Noch ohne Namen"))}</b>
        ${hasFig ? `<button id="pf-edit" class="btn ghost small">${esc(t(mine ? "Charakter bearbeiten" : "Charakter erstellen"))}</button>` : ""}
      </div>`;
    if (hasFig) $("pf-edit").onclick = editFigur;
    const n = Freunde.incoming.length;
    screen.querySelectorAll(".pf-tabs button").forEach((b) => {
      const on = b.dataset.tab === tab;
      b.classList.toggle("picked", on);
      b.setAttribute("aria-selected", on);
      b.innerHTML =
        b.dataset.tab === "stats"
          ? esc(t("Statistik"))
          : `${esc(t("Freunde"))} ${Freunde.list.filter((f) => f.ok).length ? `<small>${Freunde.list.filter((f) => f.ok).length}</small>` : ""}${n ? `<i class="pf-badge">${n}</i>` : ""}`;
    });
    if (tab === "stats") renderStats();
    else renderFriends();
  }

  // --- Statistik (eigene oder die eines Freundes) ---

  function statsHtml(st, own) {
    if (!st) return `<p class="pf-muted">${esc(t("Noch keine Statistik da. Sie kommt, sobald dein Freund die App einmal offen hat."))}</p>`;
    const rate = st.won + st.lost ? Math.round((st.won / (st.won + st.lost)) * 100) : null;
    const tile = (emoji, value, label, cls = "") => `<div class="pf-tile ${cls}"><span class="pf-e">${emoji}</span><b>${value}</b><small>${esc(label)}</small></div>`;
    const glass = Settings.level === "alkoholfrei" ? "🥤" : "🍺";
    const games = Object.entries(st.games || {})
      .filter(([k, g]) => g.p && GAMES[k])
      .sort((a, b) => b[1].p - a[1].p);
    return `
      <div class="pf-grid">
        ${tile(glass, st.sips, t("Schlucke getrunken"), "big")}
        ${tile("🫵", st.given, t("Schlucke verteilt"))}
        ${tile("🎲", st.played, t("Spiele gespielt"))}
        ${tile("🏆", st.won, t("Runden gewonnen"))}
        ${tile("💀", st.lost, t("Runden verloren"))}
        ${tile("📈", rate == null ? "–" : `${rate} %`, t("Siegquote"))}
        ${tile("🔥", st.bestStreak, t("Längste Siegesserie"))}
        ${tile("🥃", st.shots, t("Shots"))}
        ${tile("🍻", st.drinks, t("Mal getrunken"))}
        ${tile("🏅", st.best, t("Rekord: Schlucke in einem Spiel"))}
      </div>
      <div class="pf-facts">
        ${st.fav && GAMES[st.fav] ? `<p><span>${esc(t("Lieblingsspiel"))}</span><b>${esc(gameText(st.fav, "label"))}</b></p>` : ""}
        ${st.buddy ? `<p><span>${esc(t("Trinkbuddy"))}</span><b>${esc(st.buddy)}</b></p>` : ""}
        ${st.since ? `<p><span>${esc(t("Dabei seit"))}</span><b>${new Date(st.since).toLocaleDateString(LANG === "en" ? "en-GB" : "de-DE")}</b></p>` : ""}
      </div>
      ${
        games.length
          ? `<h3 class="pf-h">${esc(t("Pro Spiel"))}</h3>
        <ul class="pf-games">${games
          .map(
            ([k, g]) => `<li><span class="pf-gi">${drawnIcon(k, GAMES[k].spot)}</span><span class="pf-gn">${esc(gameText(k, "label"))}</span>
            <span class="pf-gs">${g.p}× · 🏆 ${g.w} · ${glass} ${g.s}</span></li>`
          )
          .join("")}</ul>`
          : own
            ? `<p class="pf-muted">${esc(t("Spiel eine Runde, dann füllt sich das hier."))}</p>`
            : ""
      }`;
  }

  function renderStats() {
    const st = Stats.summary();
    const name = Stats.myName();
    $("pf-body").innerHTML = `
      ${statsHtml(st, true)}
      <p class="pf-muted small">${esc(
        name
          ? t("Gezählt wird für „{name}“: bei „Jeder sein Handy“ immer, auf einem Handy, wenn ein Spieler so heißt. Bots zählen nicht.", { name })
          : t("Leg einen Charakter an oder gib in einem Raum deinen Namen ein, dann zählt die App für dich mit.")
      )}</p>
      <button id="pf-reset" class="btn ghost small pf-reset">${esc(t("Statistik zurücksetzen"))}</button>`;
    $("pf-reset").onclick = () => {
      if (confirm(t("Deine ganze Statistik löschen?"))) {
        Stats.reset();
        render();
      }
    };
  }

  // --- Freunde ---

  let qrDone = null;
  function renderFriends() {
    const list = [...Freunde.list].sort((a, b) => b.ok - a.ok || Freunde.isOnline(b) - Freunde.isOnline(a) || a.name.localeCompare(b.name));
    const inc = Freunde.incoming;
    const typed = $("pf-code")?.value ?? "";
    const focused = document.activeElement?.id === "pf-code";
    $("pf-body").innerHTML = `
      ${
        inc.length
          ? `<h3 class="pf-h">${esc(t("Anfragen"))}</h3>
        <ul class="pf-friends">${inc
          .map(
            (f) => `<li>${Freunde.avatar(f)}<span class="pf-fname"><b>${esc(f.name)}</b><small>${esc(t("will dein Freund sein"))}</small></span>
            <button class="btn small" data-ok="${esc(f.id)}">${esc(t("Annehmen"))}</button><button class="remove" data-no="${esc(f.id)}" aria-label="${esc(t("Ablehnen"))}">✕</button></li>`
          )
          .join("")}</ul>`
          : ""
      }
      ${
        list.length
          ? `<ul class="pf-friends">${list
              .map(
                (f) => `<li class="${Freunde.isOnline(f) ? "on" : "off"} ${f.ok ? "" : "wait"}" data-id="${esc(f.id)}">${Freunde.avatar(f)}
                <span class="pf-fname"><b>${esc(f.name)}</b><small>${esc(Freunde.statusText(f))}</small></span>
                ${canJoin(f) ? `<button class="btn small" data-join="${esc(f.id)}">${esc(t("Mitspielen"))}</button>` : ""}
                <span class="pf-arrow">›</span></li>`
              )
              .join("")}</ul>`
          : `<p class="pf-muted">${esc(t("Noch keine Freunde. Lass deinen Code scannen oder gib den Code von jemand anderem ein. Im Raum geht es auch mit dem ➕ neben einem Namen."))}</p>`
      }
      <h3 class="pf-h">${esc(t("Freund hinzufügen"))}</h3>
      <form id="pf-add" class="join-row" autocomplete="off">
        <input id="pf-code" type="text" maxlength="14" placeholder="${esc(t("Freundescode"))}" autocapitalize="characters" aria-label="${esc(t("Freundescode"))}">
        <button class="btn">${esc(t("Hinzufügen"))}</button>
      </form>
      <p id="pf-err" class="error" hidden></p>
      <div class="pf-mycode">
        <div id="pf-qr" class="qr"></div>
        <p>${esc(t("Dein Freundescode"))}<b>${Freunde.pretty(Freunde.id)}</b></p>
        <button id="pf-share" class="btn ghost small">${esc(t("Link teilen"))}</button>
      </div>
      <p class="pf-muted small">${esc(t("Es gibt noch keinen eigenen Server: Freunde laufen wie die Räume über öffentliche Server. Online-Status und Einladungen gehen nur, solange die App offen ist, die Statistik eines Freundes ist der Stand von seinem letzten Öffnen."))}</p>`;

    $("pf-code").value = typed;
    if (focused) $("pf-code").focus();
    const link = Freunde.link();
    if (qrDone !== link || !$("pf-qr").innerHTML) {
      try {
        const qr = qrcode(0, "M");
        qr.addData(link);
        qr.make();
        $("pf-qr").innerHTML = qr.createSvgTag({ cellSize: 4, margin: 0 });
        qrDone = link;
      } catch {
        $("pf-qr").textContent = "";
      }
    }
    const body = $("pf-body");
    body.querySelectorAll("[data-ok]").forEach((b) => (b.onclick = () => (Freunde.accept(b.dataset.ok), render())));
    body.querySelectorAll("[data-no]").forEach((b) => (b.onclick = () => (Freunde.decline(b.dataset.no), render())));
    body.querySelectorAll("[data-join]").forEach(
      (b) =>
        (b.onclick = (e) => {
          e.stopPropagation();
          const f = Freunde.friend(b.dataset.join);
          if (f?.room) Freunde.joinRoom(f.room);
        })
    );
    body.querySelectorAll("li[data-id]").forEach((li) => (li.onclick = () => showFriend(li.dataset.id)));
    $("pf-add").onsubmit = (e) => {
      e.preventDefault();
      const err = Freunde.add($("pf-code").value);
      $("pf-err").hidden = !err;
      $("pf-err").textContent = err || "";
      if (!err) {
        showToast({ notice: { emoji: "📨", title: t("Anfrage geschickt."), text: t("Sobald dein Freund die App öffnet, kann er annehmen.") } });
        render();
      }
    };
    $("pf-share").onclick = async () => {
      const text = t("Füg mich im Saufomat als Freund hinzu!");
      try {
        if (navigator.share) return await navigator.share({ title: "Saufomat", text, url: link });
      } catch {
        return;
      }
      try {
        await navigator.clipboard.writeText(link);
        $("pf-share").textContent = t("Link kopiert ✓");
      } catch {
        prompt(t("Dein Freundes-Link:"), link);
      }
    };
  }

  // Mitspielen: Freund ist online in einem Raum, in dem man nicht selbst schon ist
  const canJoin = (f) => f.ok && Freunde.isOnline(f) && f.room && f.room.code !== Freunde.room?.code;

  function showFriend(id) {
    const f = Freunde.friend(id);
    if (!f) return;
    const draw = () => `
      <div class="pf-pop-head">${Freunde.avatar(f, "big")}<div><h2>${esc(f.name)}</h2><p class="pf-muted">${esc(Freunde.statusText(f))}</p></div></div>
      ${f.ok ? statsHtml(f.stats, false) : `<p class="pf-muted">${esc(t("Die Statistik siehst du, sobald {name} deine Anfrage angenommen hat.", { name: f.name }))}</p>`}
      ${f.ok && f.stats && f.at ? `<p class="pf-muted small">${esc(t("Stand: {when}", { when: Freunde.ago(f.at) }))}</p>` : ""}
      ${canJoin(f) ? `<button class="btn" data-k="join">${esc(t("Mitspielen"))}</button>` : ""}
      <button class="btn ghost" data-k="close">${esc(t("Schließen"))}</button>
      <button class="btn ghost small pf-danger" data-k="del">${esc(t(f.ok ? "Freund entfernen" : "Anfrage zurückziehen"))}</button>`;
    const el = Freunde.sheet(draw(), {
      join: () => Freunde.joinRoom(f.room),
      del: () => {
        if (!confirm(t("{name} aus deiner Freundesliste entfernen?", { name: f.name }))) return true;
        Freunde.remove(f.id);
        render();
      },
    });
    el.classList.add("pf-wide");
  }

  // Neu zeichnen, wenn sich was tut (Freund kommt online, Anfrage kommt rein)
  let redraw = null;
  const later = () => {
    clearTimeout(redraw);
    redraw = setTimeout(() => isOpen() && render(), 150);
  };
  Freunde.onChange(later);
  window.addEventListener("stats-change", later);
  window.addEventListener("figur-change", later);

  return { open, render };
})();
window.Profil = Profil; // figur.js fragt window.Profil
Freunde.boot();
