// Eigene Statistiken: wie viel getrunken, verteilt, gespielt, gewonnen. Liegen nur auf diesem Handy
// (localStorage) und gehen als Kurzfassung an Freunde (freunde.js).
//
// Gezählt wird immer für „mich“: bei „Jeder sein Handy“ der eigene Name im Raum, auf einem Handy der
// Spieler, der so heißt wie der eigene Charakter (bzw. der zuletzt eingegebene Name).
// Jede Trink-Meldung, jedes Ergebnis und jedes Spiel hat eine Id; die gesehenen Ids werden gemerkt,
// damit nach Neuladen oder Wiederbeitreten nichts doppelt zählt.
const Stats = (() => {
  const KEY = "saufspiel-stats";
  const SEEN_MAX = 300;

  let data = load();
  let seen = new Set(data.seen);

  function fresh() {
    return { v: 1, since: Date.now(), played: 0, won: 0, lost: 0, sips: 0, given: 0, drinks: 0, shots: 0, streak: 0, bestStreak: 0, best: 0, cur: null, games: {}, mates: {}, seen: [] };
  }

  function load() {
    try {
      const d = JSON.parse(localStorage.getItem(KEY));
      if (d && d.v === 1) return { ...fresh(), ...d };
    } catch {
      // kaputt oder kein Speicher: neu anfangen
    }
    return fresh();
  }

  let saveTimer = null;
  function save() {
    data.seen = [...seen].slice(-SEEN_MAX);
    seen = new Set(data.seen);
    try {
      localStorage.setItem(KEY, JSON.stringify(data));
    } catch {
      // nur Komfort
    }
    clearTimeout(saveTimer);
    saveTimer = setTimeout(() => window.dispatchEvent(new Event("stats-change")), 50);
  }

  // Eigener Name: Charakter, sonst der zuletzt im Raum eingegebene Name
  function myName() {
    try {
      return (typeof Figur !== "undefined" && Figur.mine?.name) || localStorage.getItem("saufspiel-name") || "";
    } catch {
      return "";
    }
  }

  const same = (a, b) => typeof a === "string" && typeof b === "string" && a.trim().toLowerCase() === b.trim().toLowerCase();

  function game(key) {
    return (data.games[key] ??= { p: 0, w: 0, l: 0, s: 0 });
  }

  function first(id) {
    if (!id || seen.has(id)) return false;
    seen.add(id);
    return true;
  }

  // Wer bin ich in diesem Spielstand? me = Name im Raum (null auf einem Handy)
  function whoAmI(s, me) {
    if (me) return me;
    const name = myName();
    return name && (s.players ?? []).find((p) => same(p, name)) || null;
  }

  // Bei jedem Zeichnen eines Spiels (app.js playGame)
  function see(key, s, me) {
    if (!s || !GAMES[key]) return;
    const I = whoAmI(s, me);
    if (!I) return;
    let changed = false;
    if (s.gid && first(`g:${s.gid}`)) {
      data.played++;
      game(key).p++;
      for (const p of s.players ?? []) if (p !== I && !isBot(p)) data.mates[p] = (data.mates[p] ?? 0) + 1;
      // Nicht zu viele Namen merken: die seltensten fliegen raus
      const names = Object.keys(data.mates);
      if (names.length > 60) names.sort((a, b) => data.mates[a] - data.mates[b]).slice(0, names.length - 60).forEach((n) => delete data.mates[n]);
      data.cur = { gid: s.gid, sips: 0 };
      data.last = Date.now();
      changed = true;
    }
    if (s.score && first(`r:${s.score.id}`)) {
      if (s.score.win?.includes(I)) {
        data.won++;
        game(key).w++;
        data.streak++;
        data.bestStreak = Math.max(data.bestStreak, data.streak);
        changed = true;
      } else if (s.score.lose?.includes(I)) {
        data.lost++;
        game(key).l++;
        data.streak = 0;
        changed = true;
      }
    }
    if (s.alert?.items && first(`a:${s.alert.id}`)) {
      for (const it of s.alert.items) {
        if (it.who !== I && it.who !== ALL) continue;
        if (it.give) {
          data.given += it.n || 0;
        } else {
          data.drinks++;
          if (it.n) {
            data.sips += it.n;
            game(key).s += it.n;
            if (data.cur && data.cur.gid === s.gid) {
              data.cur.sips += it.n;
              data.best = Math.max(data.best, data.cur.sips);
            }
          }
          if (/shot/i.test(it.text ?? "")) data.shots++;
        }
        changed = true;
      }
    }
    if (changed) save();
  }

  // Für Spiele auf eigener Seite (Flunky Ball): gespielt / gewonnen / verloren
  function record(key, id, what) {
    if (!first(`${what}:${id}`)) return;
    if (what === "g") {
      data.played++;
      game(key).p++;
      data.last = Date.now();
    } else if (what === "w") {
      data.won++;
      game(key).w++;
      data.streak++;
      data.bestStreak = Math.max(data.bestStreak, data.streak);
    } else if (what === "l") {
      data.lost++;
      game(key).l++;
      data.streak = 0;
    }
    save();
  }

  // Kurzfassung (für die Anzeige und für Freunde)
  function summary() {
    const mates = Object.entries(data.mates).sort((a, b) => b[1] - a[1]);
    const fav = Object.entries(data.games).sort((a, b) => b[1].p - a[1].p)[0];
    return {
      since: data.since,
      played: data.played,
      won: data.won,
      lost: data.lost,
      sips: data.sips,
      given: data.given,
      drinks: data.drinks,
      shots: data.shots,
      best: data.best,
      bestStreak: data.bestStreak,
      buddy: mates[0] ? mates[0][0] : null,
      fav: fav && fav[1].p ? fav[0] : null,
      games: data.games,
    };
  }

  function reset() {
    const keep = data.seen;
    data = fresh();
    data.seen = keep; // laufende Meldungen nicht nochmal zählen
    save();
  }

  return { see, record, summary, reset, myName, same };
})();
