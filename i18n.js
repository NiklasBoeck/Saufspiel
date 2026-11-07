// Sprachen. Deutsch ist die Grundsprache: Alle Texte stehen im Code auf Deutsch,
// t("deutscher Text") gibt die Übersetzung in der gewählten Sprache zurück (fehlt sie, bleibt es Deutsch).
// Platzhalter in geschweiften Klammern: t("Warte auf {name}…", { name }).
//
// Neue Sprache: in LANGUAGES eintragen und unten in STRINGS und GAME_TEXT die Übersetzungen dazuschreiben.
// Was schon übersetzt ist: Menü, Einstellungen, Spielauswahl, Raum, Spielnamen, Regeln, Trink-Meldung.
// Die Texte innerhalb der einzelnen Spiele kommen nach und nach dazu.
const LANGUAGES = {
  de: { label: "Deutsch", emoji: "🇩🇪", desc: "Die App auf Deutsch." },
  en: { label: "English", emoji: "🇬🇧", desc: "The app in English. Games are being translated step by step." },
};

const LANG_KEY = "saufspiel-settings";
let LANG = (() => {
  try {
    const l = JSON.parse(localStorage.getItem(LANG_KEY))?.lang;
    return LANGUAGES[l] ? l : "de";
  } catch {
    return "de";
  }
})();
document.documentElement.lang = LANG;

const STRINGS = {
  en: {
    // Eigener Charakter (figur.js)
    "Wie soll dein Gesicht aussehen?": "How should your face look?",
    "Echt in 3D": "Real in 3D",
    "Gezeichnet": "Drawn",
    "Gezeichnet: Aus deinem Foto wurden Gesichtsform, Augen, Nase, Mund, Lippen, Haut-, Haar- und Augenfarbe gemessen und im Stil der App gezeichnet. So siehst du auch in Hodenritter aus.": "Drawn: face shape, eyes, nose, mouth, lips, skin, hair and eye colour were measured from your photo and drawn in the app's style. That's how you look in Hodenritter too.",
    "Echt in 3D: Aus deinem Foto ist ein 3D-Gesicht geworden, Nase, Augen, Mund, Wangen und Kinn haben deine Form. In Hodenritter sitzt es auf dem Kopf deiner Figur.": "Real in 3D: your photo became a 3D face; nose, eyes, mouth, cheeks and chin have your shape. In Hodenritter it sits on your character's head.",
    "Mach ein Selfie: Du kannst danach wählen, ob dein echtes Gesicht in 3D auf die Figur kommt oder ob es gezeichnet wird.": "Take a selfie: afterwards you can choose whether your real face goes onto the character in 3D or gets drawn.",
    "Dein Gesicht in 3D": "Your face in 3D",
    "3D · zum Drehen wischen": "3D · swipe to turn",
    "Aus deinem Foto ist ein grobes 3D-Gesicht geworden: Nase, Augen, Mund, Wangen und Kinn haben deine Form. In Hodenritter sitzt es auf dem Kopf deiner Figur, Haare und Kleidung stellst du weiter selbst ein.": "Your photo became a rough 3D face: nose, eyes, mouth, cheeks and chin have your shape. In Hodenritter it sits on your character's head; you still choose hair and clothes yourself.",
    "Dein Gesicht ist drauf, aber nur flach als Foto (es wurde kein Gesicht erkannt). Versuch es nochmal gerade von vorne mit gutem Licht.": "Your face is on, but only as a flat photo (no face was detected). Try again straight from the front in good light.",
    "Mach ein Selfie: Daraus wird ein grobes 3D-Gesicht für deine Figur, in Hodenritter sitzt es auf dem Kopf, und als Bild steht es bei deinem Namen.": "Take a selfie: it becomes a rough 3D face for your character. In Hodenritter it sits on the head, and the picture shows next to your name.",
    "Die Gesichtserkennung läuft auf deinem Handy, beim ersten Mal lädt sie etwa 13 MB. Am besten gerade in die Kamera schauen, mit gutem Licht. Foto und 3D-Gesicht bleiben auf deinem Handy und gehen nur an die Handys in deinem Raum, wenn ihr mit mehreren Handys spielt.": "Face detection runs on your phone; the first time it downloads about 13 MB. Look straight into the camera in good light. Photo and 3D face stay on your phone and are only sent to the phones in your room when you play with several phones.",
    "Dein 3D-Gesicht wird gebaut…": "Building your 3D face…",
    "Beim ersten Mal lädt die Gesichtserkennung, das kann ein paar Sekunden dauern.": "The first time, face detection has to load; this can take a few seconds.",
    "Kein Gesicht erkannt. Schieb das Foto von Hand ins Oval, dann kommt es flach aufs Gesicht.": "No face detected. Drag the photo into the oval by hand; it will go onto the face flat.",
    "Kein Gesicht erkannt,": "No face detected,",
    "es bleibt beim flachen Foto.": "so it stays a flat photo.",
    "Dein Charakter": "Your character",
    "Charakter": "Character",
    "Charakter ändern": "Change character",
    "Charakter erstellen": "Create character",
    "{name} dazu": "Add {name}",
    "Figur": "Body",
    "Mann": "Man",
    "Frau": "Woman",
    "Hautfarbe": "Skin",
    "Frisur": "Hairstyle",
    "Haarfarbe": "Hair colour",
    "Augenfarbe": "Eye colour",
    "Extras": "Extras",
    "Bart": "Beard",
    "Brille": "Glasses",
    "Sonnenbrille": "Sunglasses",
    "Größe": "Height",
    "Statur": "Build",
    "schmal": "slim",
    "breit": "broad",
    "Kurz": "Short",
    "Raspel": "Buzz cut",
    "Locken": "Curls",
    "Glatze": "Bald",
    "Lang": "Long",
    "Zopf": "Ponytail",
    "Dutt": "Bun",
    "Bob": "Bob",
    "Oberteil": "Top",
    "T-Shirt": "T-shirt",
    "Top": "Tank top",
    "Langarm": "Long sleeve",
    "Farbe": "Colour",
    "Streifen": "Stripes",
    "Mit Streifen": "With stripes",
    "Ohne Streifen": "No stripes",
    "Hose": "Trousers",
    "Shorts": "Shorts",
    "Jeans": "Jeans",
    "Stoffhose": "Chinos",
    "Hosenfarbe": "Trouser colour",
    "Schuhe": "Shoes",
    "Kappe": "Cap",
    "Mit Kappe": "With cap",
    "Ohne Kappe": "No cap",
    "Aussehen": "Looks",
    "Kleidung": "Clothes",
    "Gesicht": "Face",
    "Zufällig": "Random",
    "Später": "Later",
    "Fertig": "Done",
    "Willkommen! Erstell dir zuerst deinen Charakter. Er spielt dann überall für dich mit.": "Welcome! First create your character. It will play for you in every game.",
    "Dein Gesicht ist drauf. Es liegt wie eine Maske vorne auf dem Kopf deiner Figur, Haare und Kleidung stellst du weiter selbst ein.": "Your face is on. It sits like a mask on the front of your character's head; you still choose hair and clothes yourself.",
    "Mach ein Selfie: Dein Gesicht kommt dann auf deine Figur, als Bild bei deinem Namen und in Hodenritter auf den Kopf.": "Take a selfie: your face goes onto your character, in the picture next to your name and on the head in Hodenritter.",
    "Neu scannen": "Scan again",
    "Gesicht scannen": "Scan face",
    "Foto aus der Galerie": "Photo from gallery",
    "Foto entfernen": "Remove photo",
    "Das ist kein echter 3D-Scan: Das Foto wird flach auf das Gesicht gelegt. Am besten gerade in die Kamera schauen, mit gutem Licht. Das Foto bleibt auf deinem Handy und geht nur an die Handys in deinem Raum, wenn ihr mit mehreren Handys spielt.": "This is not a real 3D scan: the photo is laid flat onto the face. Look straight into the camera in good light. The photo stays on your phone and is only sent to the phones in your room when you play with several phones.",
    "Gesicht ins Oval, Augen auf die gelben Striche, Mund auf den unteren.": "Face in the oval, eyes on the yellow lines, mouth on the lower one.",
    "Abbrechen": "Cancel",
    "Foto machen": "Take photo",
    "Die Kamera geht hier nicht (keine Erlaubnis?). Nimm stattdessen ein Foto:": "The camera doesn't work here (no permission?). Pick a photo instead:",
    "Foto wählen": "Choose photo",
    "Schieb und zoom das Bild, bis dein Gesicht genau im Oval sitzt.": "Drag and zoom the picture until your face fits the oval exactly.",
    "Nochmal": "Again",
    "Übernehmen": "Use it",

    // Menü
    "Such dir ein Spiel aus": "Pick a game",
    "Trink verantwortungsvoll. Wasser zählt auch als Getränk.": "Drink responsibly. Water counts as a drink too.",
    Einstellungen: "Settings",
    "Wie viel wird getrunken?": "How much do you drink?",
    "Wie gut spielen die Bots?": "How good are the bots?",
    "Wie soll die App aussehen?": "How should the app look?",
    "Sprache": "Language",
    "Gilt für jedes neue Spiel. Bei „Jeder sein Handy“ zählt die Einstellung vom Handy, das den Raum erstellt.":
      "Applies to every new game. With “Everyone on their phone”, the phone that created the room decides.",
    "Verantwortung, Impressum und Datenschutz": "Responsibility, legal notice and privacy",
    Zurück: "Back",
    Spielregeln: "Rules",

    // Profil, Statistik, Freunde
    Profil: "Profile",
    Statistik: "Stats",
    Freunde: "Friends",
    "👥 Freunde einladen": "👥 Invite friends",
    "Freunde einladen": "Invite friends",
    "Schlucke getrunken": "Sips drunk",
    "Schlucke verteilt": "Sips handed out",
    "Spiele gespielt": "Games played",
    "Runden gewonnen": "Rounds won",
    "Runden verloren": "Rounds lost",
    Siegquote: "Win rate",
    "Längste Siegesserie": "Longest win streak",
    Shots: "Shots",
    "Mal getrunken": "Times drunk",
    "Rekord: Schlucke in einem Spiel": "Record: sips in one game",
    Lieblingsspiel: "Favourite game",
    Trinkbuddy: "Drinking buddy",
    "Dabei seit": "Playing since",
    "Pro Spiel": "Per game",
    "Statistik zurücksetzen": "Reset stats",
    "Freund hinzufügen": "Add friend",
    Freundescode: "Friend code",
    "Dein Freundescode": "Your friend code",
    Hinzufügen: "Add",
    Einladen: "Invite",
    "Eingeladen ✓": "Invited ✓",
    Mitspielen: "Join",
    Beitreten: "Join",
    Annehmen: "Accept",
    Ablehnen: "Decline",
    Anfragen: "Requests",
    "Charakter bearbeiten": "Edit character",
    "Charakter erstellen": "Create character",
    "{name} lädt dich ein!": "{name} invites you!",
    "{name} will dein Freund sein": "{name} wants to be your friend",
    "{name} als Freund hinzufügen?": "Add {name} as a friend?",
    "Freund entfernen": "Remove friend",
    Schließen: "Close",
    "● online": "● online",
    "● online · spielt {game}": "● online · playing {game}",

    // Stufen, Bots, Designs
    Alkoholfrei: "Alcohol-free",
    "Limo, Wasser, was ihr wollt. Gleiche Regeln, null Promille.": "Soda, water, whatever you like. Same rules, zero alcohol.",
    Mild: "Mild",
    "Halb so viele Schlucke.": "Half as many sips.",
    Normal: "Normal",
    "So wie die Regeln es sagen.": "Just like the rules say.",
    Hart: "Hard",
    "Anderthalbmal so viele Schlucke. Nur mit genug Wasser daneben.": "One and a half times the sips. Only with enough water nearby.",
    Leicht: "Easy",
    "Die Bots patzen oft. Gut zum Reinkommen.": "The bots mess up a lot. Good for getting started.",
    Mittel: "Medium",
    "Meistens klug, manchmal daneben.": "Mostly smart, sometimes off.",
    Schwer: "Hard",
    "Die Bots treffen fast immer. Viel Glück.": "The bots almost never miss. Good luck.",
    Neu: "New",
    "Warme Kneipenfarben, gezeichnete Icons.": "Warm pub colours, hand-drawn icons.",
    Biergarten: "Beer garden",
    "Flaschengrün, Brezel-Orange, runde Sticker und Kacheln.": "Bottle green, pretzel orange, round stickers and tiles.",
    Wiesn: "Oktoberfest",
    "Weiß-blaue Rauten, Wimpel und ein Lebkuchenherz. O’zapft is!": "Blue and white diamonds, bunting and a gingerbread heart. O’zapft is!",
    Klassisch: "Classic",
    "Das alte Lila mit Emojis.": "The old purple with emojis.",

    // Ein Handy / Jeder sein Handy
    "Wie wollt ihr spielen?": "How do you want to play?",
    "Ein Handy": "One phone",
    "Alle spielen an diesem Handy, es geht reihum.": "Everyone plays on this phone, taking turns.",
    "Jeder sein Handy": "Everyone on their phone",
    "(empfohlen)": "(recommended)",
    "Ein Handy macht einen Raum auf, alle anderen treten mit Code oder QR-Code bei.":
      "One phone opens a room, everyone else joins with the code or QR code.",
    "Kein Internet.": "No internet.",
    "Ohne Netz geht nur „Ein Handy“.": "Without internet only “One phone” works.",

    // Spieler
    "Wer spielt mit?": "Who’s playing?",
    Name: "Name",
    Spielername: "Player name",
    "🤖 Bot dazu": "🤖 Add bot",
    "Bots spielen mit, damit du auch alleine spielen kannst.": "Bots join in so you can play on your own too.",
    "Los geht’s": "Let’s go",
    "{name} entfernen": "Remove {name}",

    // Raum
    "Dein Name": "Your name",
    "Raum erstellen": "Create room",
    "oder einem Raum beitreten": "or join a room",
    Code: "Code",
    Raumcode: "Room code",
    Beitreten: "Join",
    Raum: "Room",
    "Link teilen": "Share link",
    "Link kopiert ✓": "Link copied ✓",
    "Link zum Beitreten:": "Link to join:",
    "Komm in meinen {game}-Raum {code}!": "Join my {game} room {code}!",
    "Raum verlassen": "Leave room",
    "Raum verlassen?": "Leave the room?",
    "Raum schließen? Das Spiel endet dann für alle.": "Close the room? The game ends for everyone.",
    "Der Host hat den Raum geschlossen.": "The host closed the room.",
    "Du bist jetzt Host,": "You are the host now,",
    "{name} ist weg.": "{name} left.",
    "der Host": "the host",
    "Verbindung weg, verbinde neu…": "Connection lost, reconnecting…",
    "● verbunden · Raum {code}": "● connected · room {code}",
    "Host ist offline, warte…": "Host is offline, waiting…",
    "Du wirst gleich hinzugefügt…": "You’ll be added in a moment…",
    "{n} Spieler da. Alle drin? Dann los!": "{n} players here. Everyone in? Let’s go!",
    "Warte auf Mitspieler: Code eingeben, QR-Code scannen oder einen Bot dazunehmen.":
      "Waiting for players: enter the code, scan the QR code or add a bot.",
    "Du bist drin! Warte, bis der Host startet.": "You’re in! Wait for the host to start.",
    "Suche Raum…": "Looking for room…",
    "Zurück in Raum {code}": "Back to room {code}",
    "Gib zuerst deinen Namen ein.": "Enter your name first.",
    "Der Raumcode hat 4 Zeichen.": "The room code has 4 characters.",

    // Spiel
    "Du bist dran!": "Your turn!",
    "Warte auf {name}…": "Waiting for {name}…",
    "Warte…": "Waiting…",
    "So geht {game}": "How to play {game}",
    "Alles klar": "Got it",

    // Trinken
    "1 Schluck": "1 sip",
    "{n} Schlucke": "{n} sips",
    "Du musst trinken!": "You have to drink!",
    "Du darfst verteilen!": "You get to hand out!",
    "Trinken!": "Drink!",
    "Verteilen!": "Hand out!",
    Alle: "Everyone",
    Du: "You",
    trinken: "drinks",
    trinkt: "drinks",
    trinkst: "drink",
    verteilt: "hands out",
    verteilst: "hand out",
    "Limo, Wasser, was ihr wollt": "soda, water, whatever you like",
    "Prost! 🍻": "Cheers! 🍻",
    "Prost! 🥤": "Cheers! 🥤",
    // Promille-Rechner
    "Promille-Rechner": "BAC calculator",
    "Trag ein, was du trinkst, und sieh, wie viel Promille du ungefähr hast.": "Log what you drink and see your rough blood alcohol level.",
    "Deine Angaben": "Your details",
    "Erst ein paar Angaben": "A few details first",
    "Damit die Rechnung ungefähr passt. Bleibt nur auf diesem Handy.": "So the estimate roughly fits you. Stays on this phone only.",
    Gewicht: "Weight",
    Alter: "Age",
    Jahre: "years",
    "Körperbau": "Body type",
    "männlich": "male",
    weiblich: "female",
    "Männer und Frauen haben im Schnitt unterschiedlich viel Körperwasser, deshalb fragt die Formel danach.": "Men and women have different amounts of body water on average, which is why the formula asks.",
    Speichern: "Save",
    Weiter: "Continue",
    OK: "OK",
    "Löschen": "Delete",
    "Ändern": "Edit",
    gestern: "yesterday",
    morgen: "tomorrow",
    "Bitte ein Gewicht zwischen 35 und 250 kg eintragen.": "Please enter a weight between 35 and 250 kg.",
    "Bitte eine Größe zwischen 120 und 230 cm eintragen.": "Please enter a height between 120 and 230 cm.",
    "Bitte dein Alter eintragen.": "Please enter your age.",
    "Bitte männlich oder weiblich wählen.": "Please choose male or female.",
    "Bitte die Menge in ml eintragen.": "Please enter the amount in ml.",
    "Bitte den Alkoholgehalt in % eintragen.": "Please enter the alcohol content in %.",
    "Bitte ein Getränk wählen.": "Please pick a drink.",
    "Nur eine grobe Schätzung.": "Only a rough estimate.",
    "Der echte Wert kann deutlich höher sein (Essen, Medikamente, Müdigkeit). Entscheide danach nie, ob du fährst: Wer getrunken hat, fährt nicht.": "Your real level can be much higher (food, medication, tiredness). Never use it to decide whether you can drive: if you’ve been drinking, don’t drive.",
    "Nur eine Schätzung. Nicht fahren!": "Just an estimate. Don’t drive!",
    "Laut Schätzung nüchtern.": "Sober, going by the estimate.",
    "Leicht angetrunken. Schon jetzt reagierst du langsamer.": "Slightly tipsy. Your reactions are already slower.",
    "Angetrunken. Reaktion und Urteil sind deutlich schlechter.": "Tipsy. Reactions and judgement are clearly worse.",
    "Betrunken. Zeit für Wasser und eine Pause.": "Drunk. Time for water and a break.",
    "Stark betrunken. Hör auf zu trinken und trink Wasser.": "Very drunk. Stop drinking and have some water.",
    "Gefährlich viel. Hör sofort auf und lass jemanden bei dir bleiben. Notfall: 112.": "Dangerously high. Stop now and have someone stay with you. Emergency: 112.",
    "Steigt noch bis ca. {v} ‰ um {time}.": "Still rising, to about {v} ‰ at {time}.",
    "Wieder bei 0 ‰: ca. {time}": "Back to 0 ‰: around {time}",
    "Promille über die Zeit": "Blood alcohol over time",
    "Trag unten ein, was du trinkst. Dann siehst du hier die Kurve.": "Log what you drink below and the curve shows up here.",
    "Was hast du getrunken?": "What did you drink?",
    Eigenes: "Custom",
    "Eigenes Getränk": "Custom drink",
    "Menge und %": "Amount and %",
    Menge: "Amount",
    Alkohol: "alcohol",
    "z. B. Aperol Spritz": "e.g. Aperol Spritz",
    "Wann?": "When?",
    "Gerade eben": "Just now",
    "vor 15 Min": "15 min ago",
    "vor 30 Min": "30 min ago",
    "vor 1 Std": "1 h ago",
    Uhrzeit: "Time",
    "Uhrzeit ändern": "Change time",
    "Wann war das?": "When was that?",
    Eintragen: "Add",
    Getrunken: "Drinks",
    "Dazu ein älterer Eintrag, der nicht mehr zählt.": "Plus one older entry that no longer counts.",
    "Dazu {n} ältere Einträge, die nicht mehr zählen.": "Plus {n} older entries that no longer count.",
    "Neuer Abend: Liste leeren": "New night: clear list",
    "Alle Einträge löschen und neu anfangen?": "Delete all entries and start over?",
    "Bier 0,5 l": "Beer 0.5 l",
    "Bier 0,33 l": "Beer 0.33 l",
    "Maß 1 l": "Stein 1 l",
    "Radler 0,5 l": "Shandy 0.5 l",
    "Wein 0,2 l": "Wine 0.2 l",
    "Sekt 0,1 l": "Sparkling 0.1 l",
    "Schnaps 2 cl": "Shot 2 cl",
    "Longdrink (4 cl)": "Mixed drink (4 cl)",
  },
};

// Spielnamen, Beschreibungen und Regeln
const GAME_TEXT = {
  en: {
    niewieder: {
      label: "Never Have I Ever",
      description: "If you’ve done it, you drink.",
      rules: [
        "The app shows a sentence starting with “Never have I ever …”.",
        "Anyone who has done it takes a sip. Be honest!",
        "Tell the story if you like. Then the next card.",
      ],
    },
    pflicht: {
      label: "Dare",
      description: "Do the dare or drink.",
      rules: [
        "The app draws a dare for a random person.",
        "If you manage it, all good. If not, you drink what’s written under the card.",
        "Nobody has to do anything they don’t want to. Then just drink or skip the card.",
      ],
    },
    busfahrer: {
      label: "Ride the Bus",
      description: "Guess, build the pyramid, and the loser rides the bus.",
      rules: [
        "Question round: everyone gets 4 cards in turn. Before each card you guess: red or black, higher or lower than the first, between your first two or outside, and which suit.",
        "Right: you hand out as many sips as the question is worth (1 to 4). Wrong: you drink them yourself. Equal values count as wrong.",
        "Pyramid: 10 cards are turned over one by one. Whoever holds the same value lays it down and hands out sips, 1 per card at the bottom, 4 at the top.",
        "Bus ride: whoever has the most cards left at the end rides the bus. 5 cards in a row, keep guessing higher or lower. If you’re wrong, you drink as many sips as cards you’ve made it through and start over.",
      ],
    },
    triade: {
      label: "Triade",
      description: "Draw cards in turn, every card has a task.",
      rules: [
        "Played with 32 cards (7 to ace). Everyone draws a card in turn, every card has its task.",
        "Ace: waterfall. Everyone starts drinking, whoever drew starts. You may only stop once the person before you has stopped.",
        "King: hand out 10 sips. 9: hand out 9 sips.",
        "Queen: a new rule that applies to everyone from now on. Jack: bus ride, guess higher or lower to the end of the row.",
        "10: category. Everyone names something in turn, whoever runs out or repeats something drinks.",
        "8: toilet card. Only people with a toilet card may go to the loo. 7: count and say “plop” on every number with a 7, whoever slips up drinks.",
      ],
    },
    dealer: {
      label: "F*ck the Dealer",
      description: "Guess the card or drink. Get it right and the dealer drinks.",
      rules: [
        "One person is the dealer and holds the deck (the app), everyone else takes turns guessing the top card (2 to ace, ace counts 14).",
        "First guess right: the dealer drinks as many sips as the card is worth. Wrong: the dealer says “higher” or “lower”.",
        "Second guess right: the dealer drinks the difference between your two guesses. Wrong again: you drink the difference between your guess and the card.",
        "Once all 4 cards of a value are gone, everyone takes a sip.",
        "If the table is wrong three times in a row, the dealer passes to the next person.",
      ],
    },
    fenster: {
      label: "Window",
      description: "Open the window: higher, lower, in between. Wrong? Drink everything attached.",
      rules: [
        "21 cards (2 to ace, ace counts 14) lie face down as a window: 5 each at the top and bottom, 3 each on the left and right in between, a cross in the middle. The 4 corners are face up.",
        "On your turn, tap a face-down card next to a face-up one and say higher, lower or equal. If there are face-up cards on both sides (straight or across the corner), it’s between, outside or equal. Equal is right if the card has the same value as the face-up card or one of the two. Any other equal value is always wrong.",
        "Wrong: you drink as many sips as face-up cards are connected to the new card (counting itself and the corners). Those cards are turned over and reshuffled. If a corner is attached, a new card goes there face up.",
        "After a mistake you keep playing and start again at 0. You may only pass once you’ve turned over 2 cards correctly yourself. Then you hand out as many sips as cards you got right.",
        "If you’ve uncovered the middle and stop, you also hand out a shot. If the middle is attached to your wrong card, you drink the shot yourself.",
        "Whoever turns over the last card closes the window and hands out their cards.",
      ],
    },
    randvoll: {
      label: "To the Brim",
      description: "Hold the tap. Whoever makes the glass overflow drinks.",
      rules: [
        "A glass stands under the tap: sometimes a stein, sometimes a pilsner glass, sometimes a shot glass. Every glass has an invisible edge where it overflows. Nobody knows where it is, only the “safe” strip at the bottom shows how far nothing can happen.",
        "Everyone pours once in turn: hold the tap and let go whenever you want. The tap sputters a bit, and some foam keeps coming after you let go. A short tap already pours a little.",
        "If the glass overflows, you drink as many sips as were poured into this glass (yours included). With the shot glass, add a shot.",
        "If the foam stops just under the edge, the glass is full to the brim: you hand out as many sips as were poured (plus a shot with the shot glass).",
        "Then a new glass with a new edge comes and the next person starts.",
      ],
    },
    duell: {
      label: "Cheers Duel",
      description: "First to tap on PROST wins. Tapped too early? Drink.",
      rules: [
        "Two people face off. On one phone each gets their half (the top one is upside down for the person opposite), with several phones everyone taps their own.",
        "For a few seconds nothing happens, then 🍺 PROST! appears. First to tap wins, the other drinks 2 sips. Each phone measures the time itself, so it’s fair over the network too.",
        "Before that, traps like “POST!” or “PROBE!” flash up. Tap too early or on a trap and you drink 3 sips right away and lose.",
        "If you don’t tap at all, you’re out after 2.5 seconds. If both doze off, both drink 1 sip.",
        "The winner stays, the next person challenges them. Win 3 times in a row and you’re the gunslinger, hand out 3 sips and make room for two new players.",
      ],
    },
    eher: {
      label: "Who’s Most Likely To…?",
      description: "Everyone votes secretly for who fits best. Most votes drink.",
      rules: [
        "The app asks a question, e.g. “Who’s most likely to go skinny dipping?”.",
        "Everyone votes secretly for who fits best. With several phones everyone on their own, at the same time. On one phone it goes round, the others look away. Voting for yourself is allowed.",
        "Whoever gets the most votes drinks as many sips as votes. On a tie, everyone with the most votes drinks.",
        "If everyone agrees (at least 3 votes), there are 2 extra sips.",
        "Then everyone sees who voted for whom. Justifying yourself is explicitly encouraged.",
        "Bots vote on their own, usually with the majority.",
      ],
    },
    schiffe: {
      label: "Battleships",
      description: "Hide your fleet, take turns firing. Hit = hand out a sip, sunk = a shot.",
      rules: [
        "Everyone secretly places 5 ships on their 8 × 8 sea. Ships may not touch, not even diagonally. If you can’t be bothered, roll the dice.",
        "On one phone everyone places in turn while the others look away. While firing you only see hits and water, press and hold to see your own fleet. With several phones everyone places at the same time and sees their own fleet below.",
        "Take turns firing: tap a square. With more than two players, tap at the top who you want to fire at.",
        "Hit: you hand out 1 sip and fire again.",
        "Ship sunk: you also hand out a shot 🥃. The squares around it turn light, no ship can be there.",
        "Water: next player. Whoever’s fleet is completely sunk is out. Whoever still has a ship at the end wins.",
        "Bots place their fleet themselves and fire smartly: after a hit they search out the ship.",
      ],
    },
    luegen: {
      label: "Lie Detector",
      description: "Lie or truth? Place your bets, then the machine measures your thumb.",
      rules: [
        "Everyone takes a turn as the candidate. The app secretly tells only them whether to lie or tell the truth (on one phone: hand it over, the others look away, press and hold).",
        "The candidate answers the question out loud with yes or no and adds a short story so it sounds believable.",
        "Everyone else bets: lie or truth? With several phones everyone bets on their own.",
        "Then the candidate puts their thumb on the sensor until it’s full. The machine measures and judges. It’s usually right, but not always.",
        "Resolved: whoever bet wrong drinks 1 sip. If the candidate lied and most noticed, they drink 2 sips. If they fooled most people, they hand out 2 sips.",
        "If the machine is wrong, the candidate tricked it and hands out 1 more sip.",
      ],
    },
    kistenturm: {
      label: "Crate Tower",
      description: "Stack beer crates in 3D. Whoever knocks the tower over drinks.",
      rules: [
        "In the beer garden a tower of beer crates is being stacked. The next crate swings back and forth above the tower, sometimes left-right, sometimes front-back, and the higher the tower, the faster.",
        "On your turn, tap the screen. The crate drops exactly where it is.",
        "If too much hangs over, the tower tips: if the centre of the crates above is no longer over the crate below, everything from there falls. If your crate doesn’t land on anything, it falls alone.",
        "Whoever knocks the tower over drinks as many sips as crates fall (at most 10). Then a new tower starts.",
        "Exactly on top of the crate below: perfect, you hand out 1 sip. Every 10 crates, everyone drinks 1 sip to the tower.",
      ],
    },
    deckel: {
      label: "Coaster Flip",
      description: "Flip the stack of coasters up and catch it again. Drop it and you drink.",
      rules: [
        "A stack of beer coasters sticks out over the edge of the table. On your turn, swipe up quickly over the coasters: they fly up, spin and fall back down.",
        "Tap the playing field when the coasters fall through the ring. Then you’ve caught them. Too early, too late or not at all: the coasters hit the floor.",
        "Flick too softly and the stack just tips over the edge, too hard and it flies into your neighbour’s beer. Both count as dropped.",
        "Every catch goes into your pot: as many sips as coasters flew (1 + 2 + 3 …). Then you decide: stop and hand out the pot, or add one more coaster. The more coasters, the smaller the time window.",
        "If you drop the coasters, you drink as many sips as just flew, and your pot is gone.",
        "Catch 4 coasters at once and you’re the Coaster King and hand out the whole pot (10 sips).",
      ],
    },
    flasche: {
      label: "Spin the Bottle",
      description: "Swipe the bottle. Whoever it points at is up.",
      rules: [
        "Everyone sits around the table, a beer bottle lies in the middle. On your turn, swipe across the bottle. The faster the swipe, the longer it spins.",
        "Whoever the neck points at gets a task: drink, hand out sips, truth, dare, make a new rule or a round for everyone.",
        "For some tasks, whoever the bottom of the bottle points at joins in too, for example when clinking glasses or asking the question.",
        "Didn’t do the truth or dare: 3 sips. If the bottle points at yourself, you drink 1 and spin again.",
        "Whoever was hit spins next. With one phone, put it in the middle and sit around it in the order of the names.",
      ],
    },
    hodenritter: {
      label: "Hodenritter",
      description: "Boules in the garden. The farthest drinks and takes a bow.",
      rules: [
        "Everyone sits in a row on garden chairs in front of the lawn, each with a ball. Whoever has the red ball throws it onto the lawn first.",
        "Then the neighbour on the right throws as close as possible to the red ball without touching it, then the next. Whoever threw the red ball throws last.",
        "Throwing: put your finger on the picture and pull down, the further, the harder. Pulling sideways steers like a slingshot: pulling right throws left. Let go to throw.",
        "Whoever is farthest away and whoever touched the red ball stand up, step 2 metres in front of the row and drink half a beer, at most 1 minute.",
        "The farthest then does a task as a mini-game on the phone: tap, swipe or let go at the right moment. Not done in time: another half.",
        "Then everyone who stood up bows to everyone still sitting, starting with the neighbour on the right. Empty chairs are skipped, and people who drank together don’t bow to each other.",
        "If someone refuses, both drink a half standing up and the bowing round starts over, without the chair of whoever refused. Refusing someone who was already refused costs more: 1 beer, the third time one and a half, and so on.",
        "Whoever is closest to the red ball (without touching it) gets it for the next round and may put an obstacle on the lawn.",
      ],
    },
    promille: {
      label: "BAC calculator",
      description: "Log what you drink and see your rough blood alcohol level.",
      rules: [
        "Enter your weight, height, age and body type once. It stays on this phone only.",
        "Tap “Add” right after each drink. Forgot? Pick “30 min ago” or a time. You can also tap the time in the list later to change it.",
        "It uses the Widmark formula with body water after Watson. Each drink takes about 30 minutes to reach your blood, and you break down roughly 0.15 ‰ per hour.",
        "This is only an estimate. Food, medication, tiredness and your body can change the real value a lot. Never use it to decide whether you can drive.",
      ],
    },
    flunky: {
      label: "Flunky Ball",
      description: "Two teams, one bottle. Everyone plays on their own phone.",
    },
  },
};

function t(text, vars) {
  let s = (LANG !== "de" && STRINGS[LANG]?.[text]) || text;
  if (vars) s = s.replace(/\{(\w+)\}/g, (m, k) => (k in vars ? vars[k] : m));
  return s;
}

function gameText(key, field) {
  return GAME_TEXT[LANG]?.[key]?.[field] ?? GAMES[key]?.[field];
}

// Feste Texte im HTML übersetzen. Der deutsche Text wird beim ersten Mal gemerkt.
const I18N_ORIG = new WeakMap();
const I18N_ATTRS = ["placeholder", "aria-label", "title"];
function translateDom(root = document.body) {
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  for (let n = walker.nextNode(); n; n = walker.nextNode()) {
    if (n.parentElement?.closest("#game-root, script, style")) continue;
    if (!I18N_ORIG.has(n)) {
      if (!n.nodeValue.trim()) continue;
      I18N_ORIG.set(n, n.nodeValue);
    }
    const orig = I18N_ORIG.get(n);
    const core = orig.trim();
    n.nodeValue = orig.replace(core, t(core));
  }
  root.querySelectorAll("[placeholder], [aria-label], [title]").forEach((el) => {
    if (el.closest("#game-root")) return;
    for (const a of I18N_ATTRS) {
      if (!el.hasAttribute(a)) continue;
      const key = `data-orig-${a}`;
      if (!el.hasAttribute(key)) el.setAttribute(key, el.getAttribute(a));
      el.setAttribute(a, t(el.getAttribute(key)));
    }
  });
}

function setLang(l) {
  LANG = LANGUAGES[l] ? l : "de";
  document.documentElement.lang = LANG;
}
