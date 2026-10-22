// Flunky Ball: Multiplayer, jeder mit eigenem Handy. Das Spiel selbst liegt in flunky.html.
registerGame("flunky", {
  label: "Flunky Ball",
  emoji: "🍺",
  description: "Zwei Teams, eine Flasche. Jeder spielt am eigenen Handy.",
  color: "#2563eb",
  open() {
    location.href = "flunky.html";
  },
});
