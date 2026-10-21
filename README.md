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

- `index.html`: Menü (Spiele), Spielereingabe und Spielbildschirm
- `cards.js`: alle Spiele mit ihren Karten. `{p}` und `{p2}` werden durch zufällige Spieler ersetzt.
- `app.js`: Spiellogik (Spieler, Deck mischen, nächste Karte). Die Spieler werden im Browser gespeichert.
- `style.css`: Mobile-first Styling
- `manifest.webmanifest`: lässt sich auf dem Handy zum Startbildschirm hinzufügen

## Neue Karten und Spiele

In `cards.js` einfach Text in das `cards`-Array des passenden Spiels schreiben, oder ein neues Spiel mit `label`, `color` und `cards` anlegen.
