// Verschlüsselung für alles, was über die öffentlichen MQTT-Server läuft (Räume, Flunky Ball, Freunde).
// Die Server sind für jeden offen: Ohne das hier könnte jeder alle Räume mitlesen ("#" abonnieren)
// und falsche Spielstände oder Aktionen einschleusen. Deshalb:
//  - Das Thema (Topic) verrät weder Raumcode noch Freundescode, es ist ein Hash davon.
//  - Jede Nachricht ist mit AES-GCM verschlüsselt und signiert. Wer den Code nicht kennt,
//    kann nichts lesen, und alles Gefälschte oder Veränderte wird verworfen.
//  - Raumcodes sind kurz, deshalb wird ihr Schlüssel langsam abgeleitet (PBKDF2), damit
//    Durchprobieren aller Codes nicht lohnt. Freundescodes sind lang und zufällig, da reicht SHA-256.
const Secure = (() => {
  const enc = new TextEncoder();
  const dec = new TextDecoder();
  const MAX_BYTES = 400000; // größere Nachrichten werden gar nicht erst angefasst
  const ROOM_ITER = 150000;
  const cache = new Map();

  const hex = (buf) => [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, "0")).join("");
  function b64(bytes) {
    let s = "";
    for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
    return btoa(s);
  }
  function unb64(str) {
    const s = atob(str);
    const out = new Uint8Array(s.length);
    for (let i = 0; i < s.length; i++) out[i] = s.charCodeAt(i);
    return out;
  }

  const available = () => !!(globalThis.crypto && crypto.subtle);

  async function aesKey(raw) {
    return crypto.subtle.importKey("raw", raw, "AES-GCM", false, ["encrypt", "decrypt"]);
  }

  // Raum (kurzer Code): { topic, key }
  function room(root, code) {
    const id = `r|${root}|${code}`;
    if (!cache.has(id)) {
      cache.set(
        id,
        (async () => {
          const base = await crypto.subtle.importKey("raw", enc.encode(String(code).toUpperCase()), "PBKDF2", false, ["deriveBits"]);
          const bits = new Uint8Array(await crypto.subtle.deriveBits({ name: "PBKDF2", hash: "SHA-256", salt: enc.encode(`saufomat|${root}`), iterations: ROOM_ITER }, base, 384));
          return { topic: hex(bits.slice(0, 16)), key: await aesKey(bits.slice(16, 48)) };
        })(),
      );
    }
    return cache.get(id);
  }

  // Langer, zufälliger Code (Freundescode): { topic, key }
  function ident(root, idStr) {
    const id = `i|${root}|${idStr}`;
    if (!cache.has(id)) {
      cache.set(
        id,
        (async () => {
          const t = await crypto.subtle.digest("SHA-256", enc.encode(`saufomat|${root}|topic|${idStr}`));
          const k = await crypto.subtle.digest("SHA-256", enc.encode(`saufomat|${root}|key|${idStr}`));
          return { topic: hex(t).slice(0, 32), key: await aesKey(k) };
        })(),
      );
    }
    return cache.get(id);
  }

  async function seal(key, text) {
    const iv = crypto.getRandomValues(new Uint8Array(12));
    const ct = new Uint8Array(await crypto.subtle.encrypt({ name: "AES-GCM", iv }, key, enc.encode(text)));
    const out = new Uint8Array(12 + ct.length);
    out.set(iv);
    out.set(ct, 12);
    return b64(out);
  }

  // Liefert den Klartext oder null (kaputt, gefälscht, falscher Schlüssel, zu groß)
  async function open(key, payload) {
    try {
      const str = typeof payload === "string" ? payload : payload.toString();
      if (!str || str.length > MAX_BYTES) return null;
      const bytes = unb64(str);
      if (bytes.length < 29) return null;
      const pt = await crypto.subtle.decrypt({ name: "AES-GCM", iv: bytes.subarray(0, 12) }, key, bytes.subarray(12));
      return dec.decode(pt);
    } catch {
      return null;
    }
  }

  return { available, room, ident, seal, open, MAX_BYTES };
})();
