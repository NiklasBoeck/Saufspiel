# Saufspiel

Ein Partyspiel als Web-App fürs Handy. Spiel im Menü antippen, Spieler eintragen, dann Karte für Karte durchs Deck.

**Spielen:** https://niklasboeck.github.io/Saufspiel/

## Starten

Kein Build nötig. Einfach `index.html` im Browser öffnen oder lokal ausliefern:

```sh
python3 -m http.server 8000
# dann http://localhost:8000 öffnen
```

## Aufbau

- `index.html`: Menü, Spielereingabe, Bildschirm für Kartenspiele und einer für Spiele mit eigener Oberfläche
- `games.js`: Spiele-Register (`registerGame`) und gemeinsame Helfer wie `shuffle`
- `cards.js`: die einfachen Kartenspiele (Ich hab noch nie, Pflicht, Neue Regel). `{p}` und `{p2}` werden durch zufällige Spieler ersetzt.
- `busfahrer.js`: Busfahrer mit Fragerunde, Pyramide und Busfahrt
- `app.js`: Menü, Spielerverwaltung und Ablauf. Die Spieler werden im Browser gespeichert.
- `style.css`: Mobile-first Styling
- `manifest.webmanifest`: lässt sich auf dem Handy zum Startbildschirm hinzufügen

## Neues Spiel hinzufügen

Eine eigene Datei anlegen, die `registerGame(key, { label, emoji, description, tag, color, ... })` aufruft, und sie in `index.html` vor `app.js` einbinden. Je nach Art des Spiels:

- `cards: [...]`: einfaches Kartenspiel, die App zieht zufällige Karten
- `start(root, { players, exit })`: eigenes Spiel nach der Namenseingabe, zeichnet sich in `root`
- `open()`: eigenes Spiel ohne Namenseingabe, z. B. eine eigene Seite
