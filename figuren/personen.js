// Echte Personen für Hodenritter: Spielername (klein geschrieben) → Aussehen.
// Alles ist freiwillig. Was fehlt, wird wie bisher aus dem Namen gewürfelt.
//
//   kopf:   3D-Kopf aus einem Foto (.glb, z. B. von Tripo3D oder Meshy), liegt in figuren/koepfe/
//   hoehe:  wie hoch der Kopf ist (Meter, Standard 0.25; größer, wenn Hals/Schultern mit drin sind)
//   hoch, vor, drehen: Kopf verschieben (Meter) und drehen (Grad), falls er schief sitzt
//   haut, haare, augen: Farben ("#rrggbb")
//   frisur: "short", "buzz", "curly", "bald", "long", "ponytail", "bun", "bob"
//   frau, bart, brille, sonnenbrille, kappe: true/false
//   groesse: Körpergröße in Metern, statur: 0.9 (schmal) bis 1.1 (breit)
//   oben: "tee", "tank", "long" · shirt, shirt2 (Streifen), streifen: true/false
//   unten: "shorts", "jeans", "chinos" · hose, schuhe, kappenfarbe: Farben
//
// Beispiel:
//   "lena": { kopf: "lena.glb", groesse: 1.68, frau: true, shirt: "#db2777", unten: "jeans" },
window.HR_PERSONEN = {
};
