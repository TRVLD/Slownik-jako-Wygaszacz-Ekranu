/**
 * credits.js: dane wyświetlane na karcie „O programie” w oknie ustawień.
 *
 * Moduł zawiera wyłącznie stałe (bez importów GNOME), więc prefs.js buduje
 * z nich wiersze Adw, a testy mogą go wczytać w zwykłym Node.js. Zmiana
 * autora, adresów albo listy komponentów nie wymaga zmian w kodzie okna.
 */

// Pełna nazwa wtyczki (tytuł pierwszego wiersza karty).
export const EXTENSION_NAME = 'Słownik jako Wygaszacz Ekranu';
// Wersja programu dla COSMIC (na podstawie wtyczki GNOME 1.9.5).
export const VERSION = '1.9.5-cosmic1';
// Autor w formie wyświetlanej użytkownikowi i adres jego profilu.
export const AUTHOR = 'M.T. Jaroszek';
export const AUTHOR_URL = 'https://www.linkedin.com/in/jaroszek/';
// Licencja wtyczki: krótka nazwa, pełny tytuł i adres polskiego tekstu.
export const LICENSE = {
    name: 'EUPL 1.2',
    title: 'Licencja Publiczna Unii Europejskiej v. 1.2',
    url: 'https://eupl.eu/1.2/pl/',
};
// Repozytorium z kodem i wiki z dokumentacją użytkownika.
export const REPO_URL = 'https://github.com/TRVLD/Slownik-jako-Wygaszacz-Ekranu/';
export const DOCS_URL = 'https://github.com/TRVLD/Slownik-jako-Wygaszacz-Ekranu/wiki/';

// Opis udziału asystenta AI, pokazywany na podstronie „Oprogramowanie”.
export const AI_NOTE = 'Program (wtyczka GNOME i jej wersja dla COSMIC) powstał we współpracy ' +
    'z Claude (model Claude Opus 5.5 firmy Anthropic), asystentem AI, który na podstawie ' +
    'wskazówek autora napisał kod, shadery tła, aplet COSMIC, skrypty budowania i dokumentację ' +
    'oraz je przetestował. Pomysł, wymagania i decyzje projektowe pochodzą od autora.';

// Komponenty pogrupowane jak na podstronie „Oprogramowanie”. Każdy element
// grupy to krotka:
// [nazwa, licencja (SPDX), do czego służy, adres]
export const COMPONENTS = [
    {
        group: 'Dane',
        items: [
            ['Słownik SJP (sjp.pl), wydanie StarDict robert00s/sjp 1.0',
                'warunki sjp.pl; repozytorium bez pliku licencji',
                'hasła i definicje, pisownia dostosowana do zasad z 2026 r.',
                'https://github.com/robert00s/sjp'],
            ['Wordset Dictionary', 'CC-BY-SA-4.0',
                'angielskie hasła i definicje (bez zmian treści, wybrane znaczenia)',
                'https://github.com/wordset/wordset-dictionary'],
            ['WordNet 3.0 (Princeton University)', 'licencja WordNet 3.0',
                'źródło, na którym oparto Wordset',
                'https://wordnet.princeton.edu/license-and-commercial-use'],
        ],
    },
    {
        group: 'Czcionki dołączone do wtyczki',
        items: [
            ['Crimson Text', 'OFL-1.1', 'hasła i litera W w stylu Wroclove Herbowy; © 2010 The Crimson Text Project Authors',
                'https://fonts.google.com/specimen/Crimson+Text'],
            ['Belleza', 'OFL-1.1', 'definicje w stylu Wroclove Herbowy; © 2012 The Belleza Project Authors',
                'https://fonts.google.com/specimen/Belleza'],
            ['Hind', 'OFL-1.1', 'definicje w stylu Wroclove Herbowy; © 2014 Indian Type Foundry',
                'https://fonts.google.com/specimen/Hind'],
            ['Quintessential', 'OFL-1.1', 'hasła w stylu Lublin Renesans; © 2012 Brian J. Bonislawsky (Astigmatic)',
                'https://fonts.google.com/specimen/Quintessential'],
            ['Fondamento', 'OFL-1.1', 'hasła w stylu Lublin Renesans; © 2011 Brian J. Bonislawsky (Astigmatic)',
                'https://fonts.google.com/specimen/Fondamento'],
            ['Carattere', 'OFL-1.1', 'hasła w stylu Lublin Renesans; © 2020 The Carattere Project Authors',
                'https://fonts.google.com/specimen/Carattere'],
            ['Exo 2', 'OFL-1.1', 'definicje w stylu Lublin Renesans; © 2013 The Exo 2 Project Authors',
                'https://fonts.google.com/specimen/Exo+2'],
            ['Tilt Neon', 'OFL-1.1', 'zegar w stylu Neon; © 2019 The Tilt Project Authors',
                'https://fonts.google.com/specimen/Tilt+Neon'],
            ['Wyraz Futhark', 'OFL-1.1', 'zegar w stylu Futhark Runes, cyfry narysowane dla wtyczki; © 2026 M.T. Jaroszek',
                'https://github.com/TRVLD/Slownik-jako-Wygaszacz-Ekranu/'],
            ['Inter', 'OFL-1.1', 'zegar w stylu San Francisco (otwarty zamiennik kroju Apple); © 2020 The Inter Project Authors',
                'https://fonts.google.com/specimen/Inter'],
            ['Source Sans 3', 'OFL-1.1', 'zegar w stylu Source Sans Pro Black; © 2010-2020 Adobe',
                'https://fonts.google.com/specimen/Source+Sans+3'],
            ['EB Garamond', 'OFL-1.1', 'zegar w stylu Garamond; © 2017 The EB Garamond Project Authors',
                'https://fonts.google.com/specimen/EB+Garamond'],
        ],
    },
    {
        group: 'Czcionki dołączone do pakietu Flatpak',
        items: [
            ['P052 (URW base35)', 'AGPL-3.0 z wyjątkiem dla czcionek', 'domyślny wariant stylów Aurora Borealis i Blue Ocean',
                'https://github.com/ArtifexSoftware/urw-base35-fonts'],
            ['C059 (URW base35)', 'AGPL-3.0 z wyjątkiem dla czcionek', 'wariant stylów Aurora Borealis i Blue Ocean',
                'https://github.com/ArtifexSoftware/urw-base35-fonts'],
            ['Adwaita Sans', 'OFL-1.1', 'opcjonalny krój definicji w stylu Wroclove Herbowy (z GNOME Platform)',
                'https://gitlab.gnome.org/GNOME/adwaita-fonts'],
        ],
    },
    {
        group: 'Platforma COSMIC i Flatpak',
        items: [
            ['COSMIC (cosmic-comp, cosmic-panel)', 'GPL-3.0-only', 'kompozytor i panel, w którym działa aplet', 'https://github.com/pop-os/cosmic-epoch'],
            ['Wayland, wayland-protocols, wlr-protocols', 'MIT', 'protokoły ext-idle-notify-v1, wlr-layer-shell, xdg-shell', 'https://wayland.freedesktop.org'],
            ['Mesa (EGL, OpenGL ES)', 'MIT', 'rysowanie teł shaderami GLSL', 'https://mesa3d.org'],
            ['libxkbcommon', 'MIT', 'klawiatura w polu kodu', 'https://xkbcommon.org'],
            ['Flatpak, GNOME Platform (Flathub)', 'LGPL-2.1-or-later', 'pakiet i biblioteki uruchomieniowe', 'https://flathub.org'],
            ['GJS', 'MIT OR LGPL-2.0-or-later', 'JavaScript okna ustawień', 'https://gitlab.gnome.org/GNOME/gjs'],
            ['GTK 4', 'LGPL-2.1-or-later', 'okno ustawień', 'https://gitlab.gnome.org/GNOME/gtk'],
            ['libadwaita', 'LGPL-2.1-or-later', 'okno ustawień', 'https://gitlab.gnome.org/GNOME/libadwaita'],
            ['GLib / GIO', 'LGPL-2.1-or-later', 'pętla zdarzeń, ustawienia, D-Bus', 'https://gitlab.gnome.org/GNOME/glib'],
            ['JSON-GLib', 'LGPL-2.1-or-later', 'plik stanu haseł', 'https://gitlab.gnome.org/GNOME/json-glib'],
            ['Pango', 'LGPL-2.0-or-later', 'składanie tekstu', 'https://gitlab.gnome.org/GNOME/pango'],
            ['Cairo', 'LGPL-2.1-only OR MPL-1.1', 'rysowanie figur, serc i apletu', 'https://www.cairographics.org'],
        ],
    },
];
