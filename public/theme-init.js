const savedTheme = localStorage.getItem("tinkr-theme");
document.documentElement.dataset.theme =
  savedTheme === "dark" || savedTheme === "light"
    ? savedTheme
    : window.matchMedia("(prefers-color-scheme: dark)").matches
      ? "dark"
      : "light";
