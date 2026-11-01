#!/usr/bin/env bash
set -euo pipefail

UUID="wyraz@jaroszek.eu"
DEST="$HOME/.local/share/gnome-shell/extensions/$UUID"

gnome-extensions disable "$UUID" >/dev/null 2>&1 || true

current="$(gsettings get org.gnome.shell enabled-extensions)"
if [[ "$current" == *"'$UUID'"* ]]; then
    updated="$(python3 -c '
import ast, sys
raw = sys.argv[1].strip()
if raw.startswith("@as"):
    raw = raw[3:].strip()
items = [i for i in ast.literal_eval(raw) if i != sys.argv[2]]
print("[" + ", ".join("\x27%s\x27" % i for i in items) + "]")
' "$current" "$UUID")"
    gsettings set org.gnome.shell enabled-extensions "$updated"
fi

rm -rf "$DEST"
echo "Usunięto $DEST"

FONT_DIR="${XDG_DATA_HOME:-$HOME/.local/share}/fonts/wyraz-screensaver"
if [ -d "$FONT_DIR" ]; then
    rm -rf "$FONT_DIR"
    command -v fc-cache >/dev/null 2>&1 && fc-cache -f >/dev/null 2>&1 || true
    echo "Usunięto czcionki z $FONT_DIR"
fi

if [ "${1:-}" = "--purge" ]; then
    rm -rf "${XDG_DATA_HOME:-$HOME/.local/share}/wyraz-screensaver"
    dconf reset -f /org/gnome/shell/extensions/wyraz/ 2>/dev/null || true
    echo "Usunięto historię haseł i ustawienia."
else
    echo "Historia haseł została w ~/.local/share/wyraz-screensaver (usuń ją opcją --purge)."
fi
echo "Wyloguj się i zaloguj ponownie, aby całkowicie wyładować rozszerzenie."
