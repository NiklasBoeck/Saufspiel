// Kartenspiele. {p} = zufälliger Spieler, {p2} = ein anderer zufälliger Spieler.
// Neue Karten einfach ins passende Spiel eintragen. Eine Karte ist entweder nur Text oder
// { text, drink, alert }:
//   drink = Trinkregel, die groß unter der Karte steht (wenn die App nicht weiß, wen es trifft)
//   alert = { who, n, give }: sicheres Trinken, dafür kommt die Trink-Meldung
//   fail = Schlucke, wenn ein Bot als {p} die Aufgabe nicht schafft (passiert in der Hälfte der Fälle)
// note (beim Spiel) = Trinkregel, die für jede Karte gilt.
// botChance (beim Spiel) = so oft „trifft“ die Regel einen Bot, dann trinkt er botSips Schlucke (botText),
//   botNone = was dasteht, wenn es keinen Bot trifft.
//
// Mit categories statt cards wählt man vor dem Start eine Kategorie (oder alles gemischt):
//   categories: { key: { label, emoji, description, cards } }
// prefix (beim Spiel) steht vor jedem Kartentext.
function registerCardGame(key, def) {
  const fill = (text, p, p2) => text.replaceAll("{p}", p).replaceAll("{p2}", p2);
  const cats = def.categories ?? { all: { label: def.label, cards: def.cards } };
  const catKeys = Object.keys(cats);
  const MIX = "mix";

  function newDeck(cat) {
    const keys = cat === MIX ? catKeys : [cat];
    return shuffle(keys.flatMap((k) => cats[k].cards.map((_, i) => [k, i])));
  }

  function nextCard(s) {
    if (s.deck.length === 0) s.deck = newDeck(s.cat);
    const [k, i] = s.deck.pop();
    const raw = cats[k].cards[i];
    const card = typeof raw === "string" ? { text: raw } : raw;
    const [p, p2] = shuffle([...s.players]);
    s.round++;
    s.card = { cat: k, text: (def.prefix ?? "") + fill(card.text, p, p2) };
    if (card.drink) s.card.drink = fill(card.drink, p, p2);
    const items = card.alert ? [{ ...card.alert, who: fill(card.alert.who, p, p2) }] : [];
    // Bots spielen mit: Sie haben’s auch mal gemacht oder schaffen ihre Aufgabe nicht.
    if (card.fail && isBot(p)) {
      if (Math.random() < 0.5) items.push({ who: p, n: card.fail, text: "hat’s nicht geschafft" });
      else s.card.bot = `${p} hat’s geschafft!`;
    }
    if (def.botChance) {
      const hit = s.players.filter((x) => isBot(x) && Math.random() < def.botChance);
      items.push(...hit.map((who) => ({ who, n: def.botSips, text: def.botText })));
      if (s.players.some(isBot) && !hit.length) s.card.bot = def.botNone;
    }
    if (items.length) drink(s, items);
  }

  function start(s, cat) {
    s.cat = cat;
    s.deck = [];
    s.round = 0;
    nextCard(s);
  }

  registerGame(key, {
    ...def,
    setup(players) {
      const s = { players, cat: null, deck: [], round: 0, card: null };
      if (catKeys.length === 1) start(s, catKeys[0]);
      return s;
    },
    view(s) {
      if (!s.card) {
        return {
          phase: "Kategorie",
          title: "Welche Kategorie?",
          body: "",
          actionsClass: "cat-pick",
          actions: [
            ...catKeys.map((k) => ({
              label: `${cats[k].emoji ?? ""} ${cats[k].label}`.trim(),
              sub: cats[k].description,
              act: { type: "cat", cat: k },
            })),
            { label: "🎲 Alles gemischt", sub: "Karten aus allen Kategorien", act: { type: "cat", cat: MIX }, ghost: true },
          ],
        };
      }
      const note = s.card.drink ?? def.note;
      const label = catKeys.length > 1 ? `${def.label} · ${cats[s.card.cat].label}` : def.label;
      const actions = [{ label: "Nächste Karte", act: { type: "next" } }];
      if (catKeys.length > 1) actions.push({ label: "Kategorie wechseln", act: { type: "pick" }, ghost: true });
      return {
        phase: `Karte ${s.round}`,
        title: "",
        body: `
          <article class="card" style="--accent: ${def.color}">
            <span class="card-category">${escapeHtml(label)}</span>
            <p class="card-text">${escapeHtml(s.card.text)}</p>
            ${note ? drinkNoteHtml(escapeHtml(note)) : ""}
            ${s.card.bot ? `<p class="bot-line">${escapeHtml(s.card.bot)}</p>` : ""}
          </article>`,
        actions,
      };
    },
    act(s, a) {
      if (a.type === "next" && s.card) nextCard(s);
      if (a.type === "pick") s.card = null;
      if (a.type === "cat" && !s.card && (a.cat === MIX || cats[a.cat])) start(s, a.cat);
    },
  });
}

registerCardGame("niewieder", {
  label: "Ich hab noch nie",
  emoji: "🙊",
  description: "Wer’s schon mal gemacht hat, trinkt.",
  rules: [
    "Die App zeigt einen Satz, der mit „Ich hab noch nie …“ anfängt.",
    "Wer das schon mal gemacht hat, trinkt einen Schluck. Ehrlich sein!",
    "Wer will, erzählt die Geschichte dazu. Dann die nächste Karte.",
  ],
  color: "#7c3aed",
  note: "Wer’s schon mal gemacht hat, trinkt!",
  botChance: 0.4,
  botSips: 1,
  botText: "hat’s schon mal gemacht",
  botNone: "Die Bots haben das noch nie gemacht.",
  prefix: "Ich hab noch nie … ",
  categories: {
    normal: {
      label: "Normal",
      emoji: "🙂",
      description: "Alltag, Peinliches, zum Warmwerden",
      cards: [
        "verschlafen und es auf die Bahn geschoben.",
        "jemandem aus Versehen eine Nachricht geschickt, die nicht für ihn war.",
        "auf einer Party eingeschlafen.",
        "meinen Namen gegoogelt.",
        "ein Geschenk weiterverschenkt.",
        "so getan, als würde ich jemanden nicht sehen, um nicht reden zu müssen.",
        "beim Essen im Restaurant etwas zurückgehen lassen.",
        "ein Buch nur wegen des Films „gelesen“.",
        "im Urlaub meinen Pass oder Ausweis vergessen.",
        "mich im eigenen Wohnort verlaufen.",
        "ein Hemd oder Shirt zwei Tage hintereinander getragen.",
        "beim Karaoke gesungen.",
        "einen Film im Kino verschlafen.",
        "mir den Geburtstag von jemand Wichtigem nicht gemerkt.",
        "Essen vom Boden gegessen (Fünf-Sekunden-Regel).",
        "eine Pflanze sterben lassen.",
        "heimlich das Handy von jemand anderem angeschaut.",
        "bei einem Spiel geschummelt.",
        "eine Prüfung komplett verpeilt.",
        "von einem Haustier erzählt, das ich gar nicht habe.",
        "am Telefon so getan, als wäre die Verbindung schlecht.",
        "bis mittags im Schlafanzug gearbeitet.",
        "Nudeln mit Ketchup gegessen und es genossen.",
        "mit dem Fahrrad einen richtig peinlichen Sturz hingelegt.",
        "mich in einen Serienstar verknallt.",
        "die Klingel gehört und so getan, als wäre ich nicht zu Hause.",
        "ein Paket für den Nachbarn angenommen und vergessen, es abzugeben.",
        "in der Bahn die Station verpasst, weil ich am Handy war.",
        "eine Sprachnachricht über fünf Minuten verschickt.",
        "etwas online bestellt, das ich nie ausgepackt habe.",
        "beim Wichteln mein Geschenk heimlich getauscht.",
        "mir selbst die Haare geschnitten.",
        "ein Lied falsch mitgesungen, jahrelang.",
        "meinen Schlüssel von innen in der Wohnung stecken lassen und mich ausgesperrt.",
        "einen Kater mit Fast Food weggegessen.",
      ],
    },
    spicy: {
      label: "Spicy",
      emoji: "🌶️",
      description: "Flirten, Dates und Anzügliches",
      cards: [
        "jemanden auf einer Party geküsst, dessen Namen ich nicht kannte.",
        "ein Date nach zehn Minuten innerlich abgeschrieben.",
        "mit jemandem hier am Tisch geflirtet.",
        "ein heißes Foto verschickt und es danach bereut.",
        "jemandem einen Knutschfleck verpasst, der gut sichtbar war.",
        "Dating-Apps nur aus Langeweile durchgewischt.",
        "eine Nacht bei jemandem verbracht und mich morgens rausgeschlichen.",
        "geknutscht, wo man uns hätte erwischen können.",
        "bei einem Date gelogen, wie alt ich bin.",
        "mit meinem Ex wieder etwas angefangen.",
        "an einen Promi gedacht, während ich jemanden geküsst habe.",
        "jemanden absichtlich eifersüchtig gemacht.",
        "Flaschendrehen gespielt und es richtig ernst genommen.",
        "mit jemandem rumgemacht, nur um mich abzulenken.",
        "heimlich das Profil von meinem Schwarm durchgestalkt.",
        "in Unterwäsche die Tür aufgemacht.",
        "eine Nachricht spät in der Nacht geschickt, die mit „Bist du noch wach?“ anfing.",
        "mich in den Partner oder die Partnerin von jemandem verguckt.",
        "im Urlaub eine Sommerliebe gehabt.",
        "jemanden geküsst, nur weil die Musik gerade so gut passte.",
        "mich bei einem Date direkt beim ersten Treffen geküsst.",
        "mit zwei Leuten gleichzeitig geschrieben, die nichts voneinander wussten.",
        "eine Sache im Bett vorgetäuscht.",
        "im Kopf durchgespielt, wie es wäre fremdzugehen.",
        "jemanden aus diesem Raum attraktiver gefunden, als ich zugeben würde.",
        "mit jemandem aus der Arbeit oder Uni etwas gehabt.",
        "heimlich einen Liebesbrief geschrieben, der nie abgeschickt wurde.",
        "mich nach einem One-Night-Stand nicht mehr gemeldet.",
        "bei einem Kuss eine Brille, ein Glas oder etwas anderes runtergeworfen.",
        "jemanden in der Bar angesprochen, nur weil ich gewettet hatte.",
        "sexy getanzt, um jemanden zu beeindrucken.",
        "eine Dusche zu zweit genommen.",
        "nackt gebadet.",
        "mich nach einem Date von meinen Freunden „live“ beraten lassen.",
        "mit jemandem geschlafen, den ich am selben Abend kennengelernt habe.",
        "jemanden im Schlaf beim falschen Namen genannt.",
      ],
    },
    crazy: {
      label: "Crazy",
      emoji: "🤪",
      description: "Völlig verrückte Geschichten",
      cards: [
        "an einem Ort aufgewacht, ohne zu wissen, wie ich hingekommen bin.",
        "mit einem Fremden einen spontanen Roadtrip gemacht.",
        "mich bei einer fremden Hochzeit eingeschlichen und mitgefeiert.",
        "einen Umzug, eine Parade oder einen Festzug einfach mitgelaufen, obwohl ich nicht dazugehörte.",
        "die Polizei auf mich aufmerksam gemacht, wegen etwas völlig Absurdem.",
        "mich als jemand ganz anderes ausgegeben, einen ganzen Abend lang.",
        "ein Tier gerettet, das irgendwo festhing.",
        "einen Abend mit einem Promi verbracht, und keiner glaubt es mir.",
        "spontan einen Flug gebucht, am selben Tag.",
        "im Supermarkt etwas völlig Bescheuertes gemacht, nur für eine Wette.",
        "in einem Brunnen gebadet.",
        "mitten in der Nacht bei McDonald’s eine neue Freundschaft fürs Leben geschlossen.",
        "eine Wette verloren und dafür etwas richtig Peinliches in der Öffentlichkeit gemacht.",
        "irgendwo übernachtet, wo man eigentlich nicht übernachten darf.",
        "mich verkleidet, obwohl gar keine Verkleidungsparty war.",
        "eine Party gefeiert, die so eskaliert ist, dass jemand die Feuerwehr gerufen hat.",
        "einen Fremden überredet, bei etwas Verrücktem mitzumachen.",
        "eine Stunde lang mit einem Tier geredet, als wäre es ein Mensch.",
        "mir nachts spontan ein Tattoo, ein Piercing oder eine neue Frisur verpasst.",
        "mit einem komplett unpassenden Fahrzeug nach Hause gefahren, zum Beispiel Bobbycar oder Einkaufswagen.",
        "ein Schild, eine Fahne oder ein Verkehrshütchen mit nach Hause genommen.",
        "im Ausland eine Geschichte erlebt, die keiner glauben würde.",
        "etwas so Verrücktes gemacht, dass es in der Zeitung oder im Internet gelandet ist.",
        "mich auf einem Dach, Turm oder Baum versteckt.",
        "auf einem Festival Leute kennengelernt und danach mit ihnen weitergereist.",
        "eine Person mit einem erfundenen Lebenslauf beeindruckt.",
        "mich nachts aus einem Fenster geschlichen.",
        "in einem Club auf der Bühne getanzt, obwohl ich da nicht hingehörte.",
        "von einem Security rausgetragen worden.",
        "einen Heiratsantrag aus Spaß gemacht, der ernst genommen wurde.",
        "in einem fremden Land beim falschen Bus eingestiegen und irgendwo im Nirgendwo gelandet.",
        "eine Nacht in einem Krankenhaus wegen einer völlig absurden Verletzung verbracht.",
        "etwas gegessen, was eigentlich nicht zum Essen gedacht war.",
        "eine Geschichte erlebt, bei der alle sagen: „Das hast du dir ausgedacht.“",
        "mit einem Fremden die Kleidung getauscht.",
      ],
    },
  },
});

registerCardGame("pflicht", {
  label: "Pflicht",
  emoji: "🎯",
  description: "Aufgabe erfüllen oder trinken.",
  rules: [
    "Die App zieht eine Aufgabe für eine zufällige Person.",
    "Schaffst du sie, ist alles gut. Wenn nicht, trinkst du, was unter der Karte steht.",
    "Niemand muss etwas machen, was er nicht will. Dann eben trinken oder die Karte überspringen.",
  ],
  color: "#db2777",
  cards: [
    { text: "{p}, erzähl einen Witz.", drink: "Wenn keiner lacht, trinkt {p} 2 Schlucke.", fail: 2 },
    { text: "{p}, mach 10 Sekunden lang einen Tierlaut deiner Wahl.", drink: "Wenn nicht, trinkt {p} 3 Schlucke.", fail: 3 },
    "{p} und {p2} tauschen für eine Runde die Plätze.",
    { text: "{p}, verteil 3 Schlucke, wie du willst.", alert: { who: "{p}", n: 3, give: true } },
    { text: "{p}, sprich bis zur nächsten Karte nur in Reimen.", drink: "Jeder Fehler: {p} trinkt 1 Schluck.", fail: 1 },
  ],
});
