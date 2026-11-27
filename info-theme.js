// Design für info.html (ohne Inline-Skript, wegen der Content-Security-Policy)
try {
  const d = JSON.parse(localStorage.getItem("saufspiel-settings"))?.design;
  if (d === "klassisch") document.documentElement.classList.remove("neu");
  if (d === "garten" || d === "wiesn") document.documentElement.classList.add(d);
} catch {}
