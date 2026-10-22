# Saufspiel

Ein Partyspiel als Web-App fürs Handy. Spiel im Menü antippen, dann aussuchen: **Ein Handy** (Spieler eintragen, das Handy geht reihum) oder **Jeder sein Handy** (ein Handy macht einen Raum auf, die anderen treten mit Code oder QR-Code bei). Muss jemand trinken, kommt eine große Trink-Meldung.

**Spielen:** https://niklasboeck.github.io/Saufspiel/

## Starten

Kein Build nötig. Einfach `index.html` im Browser öffnen oder lokal ausliefern:

```sh
python3 -m http.server 8000
# dann http://localhost:8000 öffnen
```

## Aufbau

- `index.html`: Menü, Auswahl Ein Handy / Jeder sein Handy, Spielereingabe, Raum, Spielbildschirm und Trink-Meldung
- `games.js`: Spiele-Register (`registerGame`), `drink()` für Trink-Meldungen und gemeinsame Helfer wie `shuffle`
- `cards.js`: die einfachen Kartenspiele (Ich hab noch nie, Pflicht, Neue Regel). `{p}` und `{p2}` werden durch zufällige Spieler ersetzt.
- `busfahrer.js`: Busfahrer mit Fragerunde, Pyramide und Busfahrt (die Busfahrt gibt es auch als `Busfahrt` für Triade)
- `triade.js`: Triade, reihum Karten ziehen (7 bis Ass), der Bube startet die Busfahrt
- `dealer.js`: F*ck den Dealer, die App ist der Stapel: oberste Karte raten (2 bis Ass), beim Fehlversuch sagt sie höher oder niedriger, nach 3 Fehlschlägen in Folge wechselt der Dealer. Gespielte Karten liegen gestapelt auf einem Tisch. Mit einem Handy hält der Dealer beim Raten das Handy, mit mehreren sieht nur der Dealer die oberste Karte
- `room.js`: Jeder sein Handy, Raum mit Code und QR-Code, Sync über MQTT wie bei Flunky Ball
- `flunky.js`, `flunky.html`, `flunky-game.js`, `flunky.css`: Flunky Ball (siehe unten)
- `vendor/`: mitgelieferte Bibliotheken (MQTT.js 5.16.1, qrcode-generator 2.0.4, three.js r159)
- `app.js`: Menü, Spielerverwaltung, zeichnet das laufende Spiel und die Trink-Meldung. Die Spieler werden im Browser gespeichert.
- `style.css`: Mobile-first Styling
- `manifest.webmanifest`: lässt sich auf dem Handy zum Startbildschirm hinzufügen

## Neues Spiel hinzufügen

Eine eigene Datei anlegen, die `registerGame(key, { label, emoji, description, color, ... })` aufruft, und sie in `index.html` vor `app.js` einbinden. Je nach Art des Spiels:

- `registerCardGame(key, { ..., cards: [...] })` in `cards.js`: einfaches Kartenspiel, die App zieht zufällige Karten
- `setup(players)`, `view(s, me)`, `act(s, action, by)`: eigenes Spiel. Der ganze Spielstand ist ein JSON-Objekt, `view` sagt, was zu sehen ist und wer welchen Knopf drücken darf, `act` ändert den Stand. Damit läuft das Spiel automatisch auf einem Handy und mit jedem am eigenen Handy. Muss jemand trinken, `drink(s, [{ who, n }])` aufrufen.
- `open()`: eigenes Spiel ohne Namenseingabe, z. B. eine eigene Seite

## Jeder sein Handy

Funktioniert wie bei Flunky Ball: Das Handy, das den Raum erstellt, ist Host und hält den Spielstand, die anderen schicken nur ihre Knopfdrücke. Jeder sieht dasselbe, drücken darf nur, wer dran ist (bei „Weiter“ jeder). Ist jemand ohne Verbindung, darf der Host für ihn drücken. Nach dem Neuladen kommt man automatisch zurück in den Raum. Lokal testen: `index.html?broker=ws://localhost:8888`.

## Flunky Ball

Jeder spielt am eigenen Handy. Ein Handy erstellt den Raum und ist damit Host: Es hält den Spielstand und verteilt ihn über einen kostenlosen, öffentlichen MQTT-Broker (HiveMQ, falls nicht erreichbar EMQX) an die anderen. Dafür braucht es kein Konto und keinen eigenen Server. Die Nachrichten sind nicht verschlüsselt, jeder mit dem Raumcode könnte mitlesen, für ein Partyspiel reicht das.

Das Spielfeld ist echtes 3D mit three.js (WebGL, Licht und Schatten): Jeder schaut von hinter der eigenen Linie auf die Flasche. Jeder Wurf hat zufälligen Wind und etwas Streuung.

Lokal testen geht mit einem eigenen Broker über `flunky.html?broker=ws://localhost:8888`.
