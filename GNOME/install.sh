#!/usr/bin/env bash
set -euo pipefail

UUID="wyraz@jaroszek.eu"
HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
SRC="$HERE/$UUID"
DEST="$HOME/.local/share/gnome-shell/extensions/$UUID"

bold() { printf '\033[1m%s\033[0m\n' "$*"; }
warn() { printf '\033[33m⚠ %s\033[0m\n' "$*"; }
ok()   { printf '\033[32m✓ %s\033[0m\n' "$*"; }

[ -f "$SRC/metadata.json" ] || { echo "Nie znaleziono $SRC/metadata.json"; exit 1; }

bold "Słownik jako Wygaszacz Ekranu: instalacja"

if command -v gnome-shell >/dev/null 2>&1; then
    ver="$(gnome-shell --version | grep -oE '[0-9]+' | head -1 || true)"
    if [ -n "$ver" ]; then
        if grep -q "\"$ver\"" "$SRC/metadata.json"; then
            ok "GNOME Shell $ver jest obsługiwany"
        else
            warn "Masz GNOME Shell $ver, a metadata.json wymienia tylko: $(grep -o '"shell-version"[^]]*]' "$SRC/metadata.json")"
            warn "Dopisz \"$ver\" do shell-version w metadata.json, jeśli chcesz spróbować."
        fi
    fi
fi

mkdir -p "$(dirname "$DEST")"
rm -rf "$DEST"
cp -r "$SRC" "$DEST"
if command -v glib-compile-schemas >/dev/null 2>&1; then
    glib-compile-schemas "$DEST/schemas"
fi
ok "Skopiowano do $DEST"

current="$(gsettings get org.gnome.shell enabled-extensions)"
if [[ "$current" != *"'$UUID'"* ]]; then
    updated="$(python3 -c '
import ast, sys
raw = sys.argv[1].strip()
if raw.startswith("@as"):
    raw = raw[3:].strip()
items = ast.literal_eval(raw) if raw else []
items.append(sys.argv[2])
print("[" + ", ".join("\x27%s\x27" % i for i in items) + "]")
' "$current" "$UUID")"
    gsettings set org.gnome.shell enabled-extensions "$updated"
fi
gnome-extensions enable "$UUID" >/dev/null 2>&1 || true
ok "Rozszerzenie oznaczone jako włączone"

if [ "$(gsettings get org.gnome.shell disable-user-extensions)" = "true" ]; then
    warn "Rozszerzenia użytkownika są globalnie wyłączone (aplikacja Rozszerzenia)."
    warn "Włącz je tam albo: gsettings set org.gnome.shell disable-user-extensions false"
fi

FONT_DIR="${XDG_DATA_HOME:-$HOME/.local/share}/fonts/wyraz-screensaver"
mkdir -p "$FONT_DIR"
cp "$DEST"/fonts/*.ttf "$FONT_DIR"/
cp -r "$DEST"/fonts/licencje "$FONT_DIR"/
if command -v fc-cache >/dev/null 2>&1; then
    fc-cache -f "$FONT_DIR" >/dev/null 2>&1 || true
fi
ok "Czcionki stylów Lublin Renesans i Wroclove Herbowy w $FONT_DIR"

if command -v fc-match >/dev/null 2>&1; then
    match="$(fc-match -f '%{family}' 'C059' 2>/dev/null || true)"
    if [[ "${match,,}" != *c059* ]]; then
        warn "Brak czcionki C059 (Century Schoolbook). Zainstaluj ją poleceniem:"
        echo  "    sudo dnf install urw-base35-c059-fonts"
    else
        ok "Czcionka C059 jest dostępna"
    fi
fi

delay="$(gsettings get org.gnome.desktop.session idle-delay | grep -oE '[0-9]+$' || echo 0)"
mine=$(( $(gsettings --schemadir "$DEST/schemas" get org.gnome.shell.extensions.wyraz idle-minutes 2>/dev/null || echo 3) * 60 ))
if [ "$delay" -gt 0 ] && [ "$delay" -le "$mine" ]; then
    warn "System wygasza ekran (i blokuje sesję) po $((delay / 60)) min, a wygaszacz startuje po $((mine / 60)) min —"
    warn "ekran zgaśnie, zanim pojawią się słowa."
    answer="n"
    if [ -t 0 ]; then
        read -r -p "Ustawić systemowe wygaszanie ekranu na 15 min? [T/n] " answer || true
        answer="${answer:-t}"
    fi
    case "$answer" in
        [tTyY]*)
            gsettings set org.gnome.desktop.session idle-delay "uint32 900"
            ok "Wygaszanie ekranu (i automatyczna blokada) po 15 min"
            ;;
        *)
            warn "Zmień to w Ustawienia → Zasilanie → Wygaszanie ekranu albo przyciskiem „Wydłuż” w ustawieniach rozszerzenia."
            ;;
    esac
fi

echo
bold "Gotowe. Ostatni krok:"
echo "  Wyloguj się i zaloguj ponownie (na Waylandzie GNOME Shell wczytuje"
echo "  nowe rozszerzenia dopiero przy logowaniu)."
echo
echo "Potem ustawienia otworzysz poleceniem:"
echo "  gnome-extensions prefs $UUID"
