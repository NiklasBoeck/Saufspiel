// Eigenes Trink-GIF: Wer mag, wählt in den Einstellungen ein GIF (oder Bild) vom Handy aus.
// Es erscheint dann in jeder Trink-Meldung, in allen Spielen (auch Flunky Ball).
// Das Bild bleibt NUR auf diesem Handy (IndexedDB). Es wird nie hochgeladen, liegt nicht im Repo
// und wird auch nicht an die anderen Handys in einem Raum geschickt.
const TrinkGif = (() => {
  const DB = "saufspiel-trinkgif";
  const STORE = "bild";
  const KEY = "gif";
  let url = null; // Objekt-URL des gespeicherten Bildes (oder null)
  let ready = null;

  function db() {
    return new Promise((resolve, reject) => {
      const req = indexedDB.open(DB, 1);
      req.onupgradeneeded = () => req.result.createObjectStore(STORE);
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
  }

  async function run(mode, fn) {
    const d = await db();
    return new Promise((resolve, reject) => {
      const tx = d.transaction(STORE, mode);
      const req = fn(tx.objectStore(STORE));
      tx.oncomplete = () => (d.close(), resolve(req?.result));
      tx.onerror = () => (d.close(), reject(tx.error));
    });
  }

  function setUrl(blob) {
    if (url) URL.revokeObjectURL(url);
    url = blob ? URL.createObjectURL(blob) : null;
    document.dispatchEvent(new CustomEvent("trinkgif"));
  }

  function load() {
    ready ??= run("readonly", (s) => s.get(KEY))
      .then((blob) => setUrl(blob instanceof Blob ? blob : null))
      .catch(() => setUrl(null));
    return ready;
  }

  return {
    load,
    // Aktuelles Bild (null = keins gewählt)
    url: () => url,
    async set(file) {
      if (!file || !file.type.startsWith("image/")) throw new Error("kein Bild");
      const blob = new Blob([await file.arrayBuffer()], { type: file.type });
      await run("readwrite", (s) => s.put(blob, KEY));
      setUrl(blob);
    },
    async clear() {
      await run("readwrite", (s) => s.delete(KEY)).catch(() => {});
      setUrl(null);
    },
    // Füllt ein <img> mit dem GIF (und blendet es aus, wenn keins gewählt ist).
    // Das GIF startet jedes Mal neu von vorn.
    show(img) {
      if (!img) return;
      img.hidden = !url;
      if (!url) return img.removeAttribute("src");
      img.src = "";
      img.src = url;
    },
  };
})();
TrinkGif.load();
