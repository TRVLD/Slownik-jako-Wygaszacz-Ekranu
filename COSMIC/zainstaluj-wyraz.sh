#!/usr/bin/env bash
# =============================================================================
#  zainstaluj-wyraz.sh: instaluje „Słownik jako Wygaszacz Ekranu” w pulpicie
#  COSMIC (Wayland). Sam rozpoznaje system:
#
#    * Pop!_OS / Ubuntu / Debian (apt)  → gotowy pakiet .deb przez apt
#                                         (albo kompilacja, gdy .deb nie pasuje),
#    * Fedora (dnf)                     → kompilacja ze źródeł (kilka sekund),
#    * Arch, Manjaro, EndeavourOS (pacman) → kompilacja ze źródeł,
#    * openSUSE (zypper)                → kompilacja ze źródeł.
#
#  Uruchom w rozpakowanym katalogu paczki:
#      ./zainstaluj-wyraz.sh              instalacja + dodanie apletu do panelu
#      ./zainstaluj-wyraz.sh --bez-panelu instalacja bez zmian w panelu
#      ./zainstaluj-wyraz.sh --ze-zrodel  kompilacja ze źródeł także w Pop!_OS
#      ./zainstaluj-wyraz.sh --odinstaluj usunięcie programu i apletu z panelu
#
#  Instalator poprosi o hasło (sudo): instaluje potrzebne pakiety menedżerem
#  pakietów systemu i kopiuje program do /usr. Nie pobiera środowiska GNOME
#  ani Flatpaka.
# =============================================================================
set -euo pipefail

APP_ID=eu.jaroszek.Wyraz
APPLET_ID=eu.jaroszek.Wyraz.Applet
HERE=$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)
SRC=$HERE/zrodla
DEB=$(ls -1 "$HERE"/wyraz-cosmic_*_amd64.deb 2>/dev/null | sort -V | tail -n 1 || true)
FLATPAK_BUNDLE=$HERE/wyraz-cosmic.flatpak
FLATHUB=https://dl.flathub.org/repo/flathub.flatpakrepo
PANEL_DIR=$HOME/.config/cosmic/com.system76.CosmicPanel.Panel/v1
PANEL_FILE=$PANEL_DIR/plugins_wings
PANEL_DEFAULT=/usr/share/cosmic/com.system76.CosmicPanel.Panel/v1/plugins_wings
MIN_GLIBC_DEB=2.38   # .deb jest zbudowany na Ubuntu 24.04 (baza Pop!_OS 24.04)

g() { printf '\e[32m✔\e[0m %s\n' "$*"; }
i() { printf '\e[36m➜\e[0m %s\n' "$*"; }
w() { printf '\e[33m⚠\e[0m %s\n' "$*"; }
die() { printf '\e[31m✘ %s\e[0m\n' "$*" >&2; exit 1; }
have() { command -v "$1" >/dev/null 2>&1; }

PANEL=1
MODE=install
FORCE_SRC=0
for a in "$@"; do
    case $a in
        --bez-panelu) PANEL=0 ;;
        --odinstaluj) MODE=uninstall ;;
        --ze-zrodel) FORCE_SRC=1 ;;
        -h|--help|--pomoc) sed -n '2,22p' "$0" | sed 's/^# \{0,1\}//'; exit 0 ;;
        *) die "Nieznana opcja: $a (zobacz --pomoc)" ;;
    esac
done

[[ $EUID -ne 0 ]] || die "Uruchom jako zwykły użytkownik (bez sudo); skrypt sam poprosi o hasło"

# --- rozpoznanie systemu -------------------------------------------------------
OS_ID=unknown; OS_LIKE=""; OS_NAME="Linux"
OS_RELEASE=${WYRAZ_OS_RELEASE:-/etc/os-release}   # zmienna tylko do testów
if [[ -r $OS_RELEASE ]]; then
    # shellcheck disable=SC1090
    . "$OS_RELEASE"
    OS_ID=${ID:-unknown}; OS_LIKE=${ID_LIKE:-}; OS_NAME=${PRETTY_NAME:-$OS_ID}
fi
is_like() { [[ " $OS_ID $OS_LIKE " == *" $1 "* ]]; }

PM=""
if [[ -e /run/ostree-booted ]]; then
    PM=ostree            # Fedora Atomic / Silverblue: /usr tylko do odczytu
elif is_like debian || is_like ubuntu; then
    PM=apt               # Pop!_OS, Ubuntu, Debian, Mint…
elif is_like fedora || is_like rhel; then
    PM=dnf               # Fedora, Nobara…
elif is_like arch; then
    PM=pacman            # Arch, Manjaro, EndeavourOS, CachyOS…
elif is_like suse; then
    PM=zypper
elif have apt-get; then PM=apt
elif have dnf; then PM=dnf
elif have pacman; then PM=pacman
elif have zypper; then PM=zypper
fi

has_cosmic() {
    [[ ${XDG_CURRENT_DESKTOP:-} == *COSMIC* ]] || have cosmic-panel || [[ -d /usr/share/cosmic ]]
}

glibc_version() { ldd --version 2>/dev/null | head -n1 | grep -oE '[0-9]+\.[0-9]+$' || echo 0; }
version_ge() { [[ "$(printf '%s\n%s\n' "$2" "$1" | sort -V | head -n1)" == "$2" ]]; }

# --- aplet w panelu COSMIC --------------------------------------------------
# Dopisuje albo usuwa aplet w pliku plugins_wings (format RON:
# Some(([lewa strona…], [prawa strona…]))). Kopia zapasowa: plugins_wings.bak.
edit_panel() {
    local action=$1
    have python3 || return 1
    mkdir -p "$PANEL_DIR"
    if [[ ! -f $PANEL_FILE ]]; then
        if [[ -f $PANEL_DEFAULT ]]; then
            cp "$PANEL_DEFAULT" "$PANEL_FILE"
        else
            return 1
        fi
    fi
    cp "$PANEL_FILE" "$PANEL_FILE.bak"
    python3 - "$PANEL_FILE" "$APPLET_ID" "$action" <<'PY'
import re, sys
path, applet, action = sys.argv[1], sys.argv[2], sys.argv[3]
text = open(path, encoding='utf-8').read()
quoted = '"%s"' % applet
if action == 'add':
    if quoted in text:
        sys.exit(0)
    if text.strip() == 'None':
        text = 'Some(([], [%s]))' % quoted
    else:
        m = re.search(r'Some\(\(\s*\[(.*?)\]\s*,\s*\[', text, flags=re.S)
        if not m:
            sys.exit(2)
        pos = m.end()
        rest = text[pos:].lstrip()
        sep = '' if rest.startswith(']') else ', '
        text = text[:pos] + quoted + sep + text[pos:]
else:
    text = re.sub(r'\s*' + re.escape(quoted) + r'\s*,?', '', text)
    text = text.replace(', ]', ']').replace(',]', ']')
open(path, 'w', encoding='utf-8').write(text)
PY
}

# --- pakiety do kompilacji i uruchomienia (wg menedżera pakietów) ------------
deps_apt=(build-essential pkg-config libwayland-dev libwayland-bin libegl-dev libgles-dev
          libxkbcommon-dev libpango1.0-dev libcairo2-dev libfontconfig-dev libglib2.0-dev
          libglib2.0-bin libjson-glib-dev gjs gir1.2-adw-1 gir1.2-gtk-4.0 fonts-urw-base35)
deps_dnf=(gcc make pkgconf-pkg-config /usr/bin/wayland-scanner
          'pkgconfig(wayland-client)' 'pkgconfig(wayland-egl)' 'pkgconfig(wayland-cursor)'
          'pkgconfig(egl)' 'pkgconfig(glesv2)' 'pkgconfig(xkbcommon)' 'pkgconfig(pangocairo)'
          'pkgconfig(cairo)' 'pkgconfig(fontconfig)' 'pkgconfig(gio-2.0)' 'pkgconfig(json-glib-1.0)'
          gjs libadwaita gtk4 urw-base35-p052-fonts urw-base35-c059-fonts)
deps_pacman=(base-devel pkgconf wayland mesa libglvnd libxkbcommon pango cairo fontconfig
             glib2 json-glib gjs libadwaita gtk4 gsfonts)
deps_zypper=(gcc make pkgconf-pkg-config wayland-devel Mesa-libEGL-devel Mesa-libGLESv2-devel
             libxkbcommon-devel pango-devel cairo-devel fontconfig-devel glib2-devel
             json-glib-devel gjs typelib-1_0-Adw-1 typelib-1_0-Gtk-4_0 urw-base35-fonts)

install_deps() {
    case $PM in
        apt)    sudo apt-get update && sudo apt-get install -y "${deps_apt[@]}" ;;
        dnf)    sudo dnf install -y "${deps_dnf[@]}" ;;
        pacman) sudo pacman -S --needed --noconfirm "${deps_pacman[@]}" ;;
        zypper) sudo zypper --non-interactive install "${deps_zypper[@]}" ;;
        *)      die "Nie znam menedżera pakietów tego systemu ($OS_NAME)" ;;
    esac
}

build_from_source() {
    [[ -f $SRC/Makefile ]] || die "Brak katalogu zrodla/ (rozpakuj całą paczkę)"
    i "Instaluję narzędzia i biblioteki ($PM, poprosi o hasło)"
    install_deps
    i "Kompiluję wygaszacz (C, kilka sekund)"
    local build
    build=$(mktemp -d "${TMPDIR:-/tmp}/wyraz-build.XXXXXX")
    make -C "$SRC" -j"$(nproc 2>/dev/null || echo 2)" BUILD="$build" PREFIX=/usr >"$build.log" 2>&1 ||
        { tail -n 30 "$build.log" >&2; die "Kompilacja się nie udała (pełny dziennik: $build.log)"; }
    i "Instaluję do /usr (sudo)"
    sudo make -C "$SRC" BUILD="$build" PREFIX=/usr install >>"$build.log" 2>&1 ||
        { tail -n 30 "$build.log" >&2; die "Instalacja się nie udała (dziennik: $build.log)"; }
    sudo fc-cache -f /usr/share/fonts/wyraz >/dev/null 2>&1 || true
    sudo gtk-update-icon-cache -q -t /usr/share/icons/hicolor >/dev/null 2>&1 || true
    sudo update-desktop-database -q /usr/share/applications >/dev/null 2>&1 || true
    rm -rf "$build" "$build.log"
    g "Zainstalowano ze źródeł (/usr/bin/wyraz-cosmic)"
}

install_deb() {
    i "Instaluję pakiet $(basename "$DEB") (sudo apt, poprosi o hasło)"
    sudo apt-get install -y --reinstall "$DEB"
    g "Zainstalowano pakiet wyraz-cosmic"
}

install_flatpak() {
    have flatpak || die "Brak programu flatpak (zainstaluj go menedżerem pakietów systemu)"
    i "Instaluję wersję Flatpak (na Twoje konto, bez sudo)"
    flatpak remote-add --user --if-not-exists flathub "$FLATHUB"
    flatpak install --user -y --noninteractive --reinstall "$FLATPAK_BUNDLE"
    g "Zainstalowano $APP_ID (Flatpak)"
}

deb_fits() {
    [[ -n $DEB && $FORCE_SRC == 0 && $PM == apt ]] || return 1
    [[ $(dpkg --print-architecture 2>/dev/null) == amd64 ]] || return 1
    version_ge "$(glibc_version)" "$MIN_GLIBC_DEB" || return 1
    # Ubuntu 24.04+ / Pop!_OS 24.04+ / Debian 13+: nazwy bibliotek z sufiksem t64
    apt-cache show libglib2.0-0t64 >/dev/null 2>&1
}

# --- odinstalowanie ---------------------------------------------------------
if [[ $MODE == uninstall ]]; then
    i "Usuwam aplet z panelu"
    edit_panel remove || w "Nie udało się zmienić panelu: usuń aplet ręcznie w Ustawieniach COSMIC"
    i "Odinstalowuję program"
    if have dpkg && dpkg -s wyraz-cosmic >/dev/null 2>&1; then
        sudo apt-get remove -y wyraz-cosmic || true
    elif [[ -x /usr/bin/wyraz-cosmic ]]; then
        if [[ -f $SRC/Makefile ]]; then
            sudo make -C "$SRC" PREFIX=/usr uninstall >/dev/null 2>&1 ||
                die "Nie udało się usunąć plików z /usr"
            sudo fc-cache -f >/dev/null 2>&1 || true
        else
            die "Brak katalogu zrodla/ potrzebnego do odinstalowania"
        fi
    fi
    if have flatpak && flatpak info --user "$APP_ID" >/dev/null 2>&1; then
        flatpak uninstall --user -y "$APP_ID" || true
    fi
    g "Usunięto. Historia haseł została w ~/.local/share/wyraz-screensaver (możesz usunąć ten katalog)."
    exit 0
fi

# --- instalacja -------------------------------------------------------------
i "System: $OS_NAME (menedżer pakietów: ${PM:-nieznany})"
if has_cosmic; then
    g "Wykryto pulpit COSMIC"
else
    w "Nie widzę pulpitu COSMIC (XDG_CURRENT_DESKTOP=${XDG_CURRENT_DESKTOP:-?})."
    w "Wygaszacz działa jako aplet panelu COSMIC; instaluję mimo to."
fi

if [[ -z $DEB && ! -f $SRC/Makefile && -f $FLATPAK_BUNDLE ]]; then
    PM=flatpak-only   # paczka zawiera tylko wersję Flatpak
fi

case $PM in
    flatpak-only)
        install_flatpak
        ;;
    apt)
        if deb_fits; then
            install_deb
        else
            [[ $FORCE_SRC == 1 ]] || w "Gotowy pakiet .deb nie pasuje do tego systemu, kompiluję ze źródeł"
            build_from_source
        fi
        ;;
    dnf|pacman|zypper)
        build_from_source
        ;;
    ostree)
        if [[ -f $FLATPAK_BUNDLE ]]; then
            w "System tylko do odczytu (Fedora Atomic): instaluję wersję Flatpak"
            install_flatpak
        else
            die "Fedora Atomic (rpm-ostree): /usr jest tylko do odczytu. Potrzebna wersja Flatpak (zbuduj ją skryptem zbuduj-flatpak.zsh i dołącz wyraz-cosmic.flatpak do paczki)."
        fi
        ;;
    *)
        die "Nie rozpoznano systemu ($OS_NAME). Obsługiwane: Pop!_OS/Ubuntu/Debian (apt), Fedora (dnf), Arch (pacman), openSUSE (zypper)."
        ;;
esac

if [[ $PANEL == 1 ]]; then
    i "Dodaję aplet do panelu COSMIC"
    if edit_panel add; then
        g "Aplet dodany: litera „W” pojawi się po prawej stronie górnego panelu"
        i "Kopia poprzedniego układu panelu: $PANEL_FILE.bak"
    else
        w "Nie udało się dodać apletu automatycznie. Zrób to ręcznie:"
        w "Ustawienia COSMIC → Pulpit → Panel → Aplety → Dodaj aplet → „Słownik jako Wygaszacz Ekranu”"
    fi
fi

cat <<EOF

Gotowe! Co dalej:
  • W panelu pojawi się litera W. Kliknij ją: „Pokaż wygaszacz”, „Wstrzymaj na godzinę”,
    „Ustawienia…”. (Jeśli jej nie widać: wyloguj się i zaloguj ponownie.)
  • Wygaszacz startuje po 1 minucie bezczynności (zmienisz to w ustawieniach).
  • Ustawienia otworzysz też z menu aplikacji („Słownik jako Wygaszacz Ekranu”)
    albo poleceniem:  wyraz-ustawienia
  • Odinstalowanie:  ./zainstaluj-wyraz.sh --odinstaluj
EOF
