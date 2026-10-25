
export const EXTENSION_NAME = 'Słownik jako Wygaszacz Ekranu';
export const AUTHOR = 'Mariusz T. Jaroszek';
export const AUTHOR_URL = 'https://www.linkedin.com/in/jaroszek/';
export const LICENSE = {
    name: 'EUPL 1.2',
    title: 'Licencja Publiczna Unii Europejskiej v. 1.2',
    url: 'https://eupl.eu/1.2/pl/',
};
export const REPO_URL = 'https://github.com/TRVLD/Slownik-jako-Wygaszacz-Ekranu/';
export const DOCS_URL = 'https://github.com/TRVLD/Slownik-jako-Wygaszacz-Ekranu/wiki/';

export const AI_NOTE = 'Wtyczka powstała we współpracy z Claude (model Claude Opus 5.5 ' +
    'firmy Anthropic), asystentem AI, który na podstawie wskazówek autora napisał kod, ' +
    'shadery tła, skrypty instalacyjne i dokumentację oraz je przetestował. Pomysł, ' +
    'wymagania i decyzje projektowe pochodzą od autora.';

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
        ],
    },
    {
        group: 'Czcionki systemowe',
        items: [
            ['C059 (URW base35)', 'AGPL-3.0 z wyjątkiem dla czcionek', 'domyślny krój stylów Aurora i Ocean',
                'https://github.com/ArtifexSoftware/urw-base35-fonts'],
            ['Adwaita Sans', 'OFL-1.1', 'opcjonalny krój definicji w stylu Wroclove Herbowy',
                'https://gitlab.gnome.org/GNOME/adwaita-fonts'],
        ],
    },
    {
        group: 'Platforma GNOME',
        items: [
            ['GNOME Shell', 'GPL-2.0-or-later', 'środowisko, w którym działa wtyczka', 'https://gitlab.gnome.org/GNOME/gnome-shell'],
            ['Mutter (Clutter, Cogl)', 'GPL-2.0-or-later', 'kompozytor Wayland, animacje, shadery', 'https://gitlab.gnome.org/GNOME/mutter'],
            ['GJS', 'MIT OR LGPL-2.0-or-later', 'JavaScript dla GNOME', 'https://gitlab.gnome.org/GNOME/gjs'],
            ['GTK 4', 'LGPL-2.1-or-later', 'okno ustawień', 'https://gitlab.gnome.org/GNOME/gtk'],
            ['libadwaita', 'LGPL-2.1-or-later', 'okno ustawień', 'https://gitlab.gnome.org/GNOME/libadwaita'],
            ['GLib / GIO', 'LGPL-2.1-or-later', 'pliki, ustawienia, D-Bus', 'https://gitlab.gnome.org/GNOME/glib'],
            ['Pango', 'LGPL-2.0-or-later', 'składanie tekstu', 'https://gitlab.gnome.org/GNOME/pango'],
            ['Cairo', 'LGPL-2.1-only OR MPL-1.1', 'rysowanie figur i serca', 'https://www.cairographics.org'],
        ],
    },
    {
        group: 'Narzędzia użyte przy tworzeniu (niedołączone)',
        items: [
            ['Mesa', 'MIT', 'kompilacja i podgląd shaderów', 'https://mesa3d.org'],
            ['Python', 'PSF-2.0', 'budowa bazy haseł', 'https://www.python.org'],
            ['Pillow', 'MIT-CMU', 'podglądy i porównania obrazów', 'https://python-pillow.org'],
            ['fontTools', 'MIT', 'sprawdzanie polskich znaków w czcionkach', 'https://github.com/fonttools/fonttools'],
            ['Node.js', 'MIT', 'testy logiki wtyczki', 'https://nodejs.org'],
            ['Git', 'GPL-2.0-only', 'pobieranie źródeł i czcionek', 'https://git-scm.com'],
        ],
    },
];
