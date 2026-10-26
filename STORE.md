# Saufomat in den App Store und zu Google Play

Die Web-App bleibt wie sie ist. Für die Stores wird sie mit [Capacitor](https://capacitorjs.com) in eine iOS- und eine Android-App verpackt. `npm run www` kopiert die Web-App nach `www/`, Capacitor baut daraus die Apps.

## Einmal einrichten

Voraussetzungen: [Node.js](https://nodejs.org) (ab Version 22), für Android [Android Studio](https://developer.android.com/studio), für iOS ein Mac mit Xcode.

```sh
npm install
npm run www
npx cap add android
npx cap add ios        # nur auf dem Mac
npm run icons          # App-Icons und Startbildschirme aus resources/icon.png und resources/splash.png
```

`android/` und `ios/` stehen in `.gitignore`. Wer sie lieber im Repo haben will (z. B. wegen eigener Einstellungen in Xcode), nimmt sie dort einfach raus.

## Nach jeder Änderung an der App

```sh
npm run android   # kopiert die Web-App, synchronisiert und öffnet Android Studio
npm run ios       # dasselbe für Xcode (Mac)
```

In Android Studio: Build > Generate Signed App Bundle (.aab) und in der Play Console hochladen. In Xcode: Product > Archive und über den Organizer an App Store Connect schicken. Vor jedem Update die Versionsnummer erhöhen (Android: `versionCode`/`versionName` in `android/app/build.gradle`, iOS: Version und Build in Xcode).

## Vor dem ersten Einreichen

- [ ] Impressum in `info.html` ausfüllen (alles in [eckigen Klammern])
- [ ] Eigenen Echtzeit-Server für „Jeder sein Handy“ statt der öffentlichen Testserver (`BROKERS` in `net.js`, `room.js`, `flunky-game.js`) und den Abschnitt in der Datenschutzerklärung anpassen
- [ ] Prüfen, ob der Name „Saufomat“ als Marke frei ist ([DPMAregister](https://register.dpma.de))
- [ ] Google Play Console (25 $ einmalig) und Apple Developer Program (99 $ pro Jahr) anlegen
- [ ] Datenschutz-URL für beide Stores: https://niklasboeck.github.io/Saufspiel/info.html#datenschutz
- [ ] Altersfreigabe: Apple 18+, Google per IARC-Fragebogen (Alkohol: ja, Glücksspiel: nein)
- [ ] Screenshots: Menü, Einstellungen mit Alkoholfrei-Modus, je ein Spiel, Raum mit QR-Code

## Hinweis an die Apple-Prüfung (App Review Notes)

> Saufomat is a party card game collection for adults (18+). On first launch users confirm they are 18 or older and see a responsible-drinking notice. Drinking is never required: the settings offer an alcohol-free mode (drinks become any non-alcoholic beverage) and a mild mode. The app contains no alcohol advertising and does not sell or deliver alcohol. All games work offline on a single device; the optional multi-device mode only syncs player names and game moves.
