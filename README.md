# Saufspiel

Ein Partyspiel als Web-App fürs Handy. Spieler eintragen, Kategorien wählen, dann Karte für Karte durchs Deck.

## Starten

Kein Build nötig. Einfach `index.html` im Browser öffnen oder lokal ausliefern:

```sh
python3 -m http.server 8000
# dann http://localhost:8000 öffnen
```

## Aufbau

- `index.html`: Setup-Bildschirm und Spielbildschirm
- `cards.js`: alle Karten, nach Kategorien sortiert. `{p}` und `{p2}` werden durch zufällige Spieler ersetzt.
- `app.js`: Spiellogik (Spieler, Deck mischen, nächste Karte). Spieler und Kategorien werden im Browser gespeichert.
- `style.css`: Mobile-first Styling
- `manifest.webmanifest`: lässt sich auf dem Handy zum Startbildschirm hinzufügen

## Neue Karten

In `cards.js` einfach Text in das `cards`-Array der passenden Kategorie schreiben, oder eine neue Kategorie mit `label`, `color` und `cards` anlegen.
