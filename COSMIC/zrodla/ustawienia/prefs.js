/**
 * prefs.js: okno ustawień (GTK 4 i libadwaita), wersja dla COSMIC.
 *
 * To ten sam kod co okno ustawień wtyczki GNOME, uruchamiany jako osobna
 * aplikacja Flatpak (main.js). Wygaszacz działa w aplecie panelu COSMIC,
 * w innym procesie, więc okno komunikuje się z nim wyłącznie przez:
 *   * GSettings: zwykłe opcje oraz „przyciski” w postaci liczników
 *     (preview-request: pokaż podgląd, reset-today-request: wylosuj
 *     hasła od nowa); wygaszacz reaguje na każdą zmianę licznika,
 *   * plik state.json: okno go tylko czyta (Dzisiejsze hasła, Archiwum)
 *     i obserwuje jego zmiany.
 *
 * Trzy karty:
 *   1. Ustawienia: bezczynność, liczba haseł, wygląd i zegar, zachowanie
 *      wygaszacza, kod zamykający,
 *   2. Słownik: wyszukiwarka haseł, dzisiejsze hasła, archiwum,
 *   3. O wtyczce: wersja, dokumentacja, licencja, autor, oprogramowanie.
 */
import Adw from 'gi://Adw';
import Gio from 'gi://Gio';
import GLib from 'gi://GLib';
import Gtk from 'gi://Gtk';

import {COSMIC} from './lib/cosmic.js';

import {AI_NOTE, AUTHOR, AUTHOR_URL, COMPONENTS, DOCS_URL, EXTENSION_NAME, LICENSE} from './lib/credits.js';
import {SearchIndex, searchAll} from './lib/search.js';
import {formatDefinition, indexDatabase} from './lib/selection.js';
import {hasCode, isValidCode, makeStored} from './lib/unlockCode.js';

// Pozycje list rozwijanych: [wartość w GSettings, etykieta w oknie].

// Style wygaszacza (klucz background-style).
const STYLES = [
    ['aurora', 'Aurora Borealis'],
    ['ocean', 'Blue Ocean'],
    ['lublin', 'Lublin Renesans'],
    ['wroclove', 'Wroclove Herbowy'],
];

// Warianty stylów Aurora Borealis i Blue Ocean (klucz font-family).
const FONTS = [
    ['C059', 'C059 (Century Schoolbook)'],
    ['TeX Gyre Schola', 'TeX Gyre Schola'],
    ['P052', 'P052 (Palatino)'],
    ['serif', 'Systemowa szeryfowa'],
];

// Warianty stylu Lublin Renesans: krój haseł (klucz renaissance-font).
const RENAISSANCE_FONTS = [
    ['Quintessential', 'Quintessential (kancelaryjna italika)'],
    ['Fondamento', 'Fondamento (renesansowe pióro)'],
    ['Carattere', 'Carattere (kaligrafia włoska)'],
];

// Warianty stylu Wroclove Herbowy: krój definicji (klucz wroclove-text-font).
const WROCLOVE_FONTS = [
    ['Belleza', 'Belleza (w duchu Optimy)'],
    ['Hind', 'Hind (w duchu Frutigera)'],
    ['Adwaita Sans', 'Adwaita Sans (krój GNOME)'],
];

// Rozmiar, położenie i styl zegara (klucze clock-size, clock-position,
// clock-style). Rozmiary w pikselach liczy screensaver.js.
const CLOCK_SIZES = [
    ['small', 'Mały'],
    ['medium', 'Średni'],
    ['large', 'Duży'],
    ['huge', 'Bardzo duży'],
];

const CLOCK_POSITIONS = [
    ['random', 'Losowo'],
    ['special', 'Specjalnie'],
    ['custom', 'Własne'],
];

const CLOCK_STYLES = [
    ['neon', 'Neon'],
    ['futhark', 'Futhark Runes'],
    ['sanfrancisco', 'San Francisco'],
    ['sourcesans', 'Source Sans Pro Black'],
    ['garamond', 'Garamond'],
];

// Styl zegara podpowiadany po wybraniu stylu wygaszacza (można go zmienić).
const CLOCK_FOR_STYLE = {
    aurora: 'futhark',
    ocean: 'sourcesans',
    lublin: 'sanfrancisco',
    wroclove: 'garamond',
};

// Warianty stylu: klucz ustawień i lista krojów (jak dotychczas osobne opcje
// „Krój pisma”, „Pismo haseł” i „Krój definicji”).
const VARIANTS = {
    aurora: ['font-family', FONTS],
    ocean: ['font-family', FONTS],
    lublin: ['renaissance-font', RENAISSANCE_FONTS],
    wroclove: ['wroclove-text-font', WROCLOVE_FONTS],
};

// Wiersze Adw interpretują tytuły jako znaczniki Pango, więc tekst ze
// słownika (np. „<” albo „&” w definicji) trzeba zabezpieczyć.
const esc = s => GLib.markup_escape_text(String(s), -1);

// Plik stanu zapisywany przez wygaszacz (words.c, ten sam format co wordStore.js).
const STATE_PATH = GLib.build_filenamev([GLib.get_user_data_dir(),
    'wyraz-screensaver', 'state.json']);

// Znaczek języka przy haśle na liście.
const LANG_LABEL = {pl: 'PL', en: 'EN'};

// Nazwy dni i miesięcy do nagłówków archiwum.
const PL_DAYS = ['Niedziela', 'Poniedziałek', 'Wtorek', 'Środa', 'Czwartek', 'Piątek', 'Sobota'];
const PL_MONTHS = ['stycznia', 'lutego', 'marca', 'kwietnia', 'maja', 'czerwca',
    'lipca', 'sierpnia', 'września', 'października', 'listopada', 'grudnia'];

/**
 * Nagłówek dnia w archiwum: „2026-10-26” → „Poniedziałek, 26 października 2026”.
 * Godzina 12:00 chroni przed przesunięciem dnia przy zmianie czasu.
 *
 * @param {string} key klucz dnia RRRR-MM-DD
 * @returns {string} niepoprawny klucz wraca bez zmian
 */
function polishDay(key) {
    const [y, m, d] = String(key).split('-').map(Number);
    if (!y || !m || !d)
        return String(key);
    const dt = GLib.DateTime.new_local(y, m, d, 12, 0, 0);
    return `${PL_DAYS[dt.get_day_of_week() % 7]}, ${d} ${PL_MONTHS[m - 1]} ${y}`;
}

/**
 * Czyta state.json synchronicznie (plik jest mały, a okno ustawień to nie
 * wygaszacz, więc chwilowe zablokowanie nie szkodzi).
 *
 * @returns {?object} stan albo null, gdy pliku brak lub jest uszkodzony
 */
function readState() {
    try {
        const [ok, bytes] = GLib.file_get_contents(STATE_PATH);
        return ok ? JSON.parse(new TextDecoder().decode(bytes)) : null;
    } catch {
        return null;
    }
}

/**
 * Wiersz liczby całkowitej powiązany z kluczem GSettings.
 *
 * @param {Gio.Settings} settings
 * @param {string} key klucz typu i
 * @param {string} title
 * @param {string} subtitle
 * @param {number} min
 * @param {number} max
 * @returns {Adw.SpinRow}
 */
function spinRow(settings, key, title, subtitle, min, max) {
    const row = Adw.SpinRow.new_with_range(min, max, 1);
    row.title = title;
    row.subtitle = subtitle;
    settings.bind(key, row, 'value', Gio.SettingsBindFlags.DEFAULT);
    return row;
}

/**
 * Wiersz przełącznika powiązany z kluczem logicznym GSettings.
 *
 * @param {Gio.Settings} settings
 * @param {string} key klucz typu b
 * @param {string} title
 * @param {string} subtitle
 * @returns {Adw.SwitchRow}
 */
function switchRow(settings, key, title, subtitle) {
    const row = new Adw.SwitchRow({title, subtitle});
    settings.bind(key, row, 'active', Gio.SettingsBindFlags.DEFAULT);
    return row;
}

/**
 * Lista rozwijana dla klucza tekstowego (wyliczenia). Settings.bind nie
 * łączy wprost indeksu z tekstem, więc synchronizujemy ręcznie w obie
 * strony: wybór w liście zapisuje wartość, a zmiana ustawienia (np. z innego
 * miejsca okna albo z konsoli) zaznacza właściwą pozycję.
 *
 * @param {Gio.Settings} settings
 * @param {string} key klucz typu s albo enum
 * @param {string} title
 * @param {string[][]} items pary [wartość, etykieta]
 * @param {Function} track rejestruje sygnał do odłączenia przy zamknięciu
 * @returns {Adw.ComboRow}
 */
function comboRow(settings, key, title, items, track) {
    const model = new Gtk.StringList();
    for (const [, label] of items)
        model.append(label);
    const row = new Adw.ComboRow({title, model});
    const sync = () => {
        const i = items.findIndex(([id]) => id === settings.get_string(key));
        row.selected = i >= 0 ? i : 0;
    };
    sync();
    row.connect('notify::selected', () => {
        const id = items[row.selected]?.[0];
        if (id && id !== settings.get_string(key))
            settings.set_string(key, id);
    });
    track(settings, settings.connect(`changed::${key}`, sync));
    return row;
}

/**
 * Płaski przycisk ze strzałką otwierający adres w przeglądarce.
 *
 * @param {Gtk.Window} window okno nadrzędne dla Gtk.UriLauncher
 * @param {string} url
 * @returns {Gtk.Button}
 */
function linkButton(window, url) {
    const button = new Gtk.Button({
        icon_name: 'adw-external-link-symbolic',
        valign: Gtk.Align.CENTER,
        tooltip_text: url,
        css_classes: ['flat'],
    });
    button.connect('clicked', () => {
        new Gtk.UriLauncher({uri: url}).launch(window, null, null);
    });
    return button;
}

/**
 * Znaczek „PL” albo „EN” na początku wiersza hasła, z podpowiedzią,
 * z którego słownika pochodzi.
 *
 * @param {string} lang 'pl' albo 'en'
 * @returns {Gtk.Label}
 */
function langBadge(lang) {
    return new Gtk.Label({
        label: LANG_LABEL[lang] ?? '',
        valign: Gtk.Align.CENTER,
        width_chars: 3,
        css_classes: ['caption-heading', 'dim-label'],
        tooltip_text: lang === 'en' ? 'Słownik angielski (Wordset)' : 'Słownik języka polskiego (SJP)',
    });
}

/**
 * Wiersz tylko do czytania z wielowierszowym podtytułem (subtitle_lines 0:
 * bez ucinania).
 *
 * @param {string} title
 * @param {string} subtitle
 * @returns {Adw.ActionRow}
 */
function textRow(title, subtitle) {
    return new Adw.ActionRow({
        title: esc(title),
        subtitle: esc(subtitle),
        subtitle_lines: 0,
        activatable: false,
    });
}

/**
 * Wiersz-przycisk. Adw.ButtonRow jest dopiero w libadwaita 1.6, a Pop!_OS
 * 24.04 ma 1.5, więc tam zastępuje go aktywny Adw.ActionRow z ikoną
 * (oba wysyłają sygnał „activated”).
 *
 * @param {{title: string, start_icon_name: string}} props
 * @returns {Adw.PreferencesRow}
 */
function buttonRow({title, start_icon_name}) {
    if (Adw.ButtonRow)
        return new Adw.ButtonRow({title, start_icon_name});
    const row = new Adw.ActionRow({title, activatable: true});
    row.add_prefix(new Gtk.Image({icon_name: start_icon_name}));
    return row;
}

/**
 * Okno ustawień. main.js tworzy obiekt tej klasy i wywołuje
 * fillPreferencesWindow() z gotowym Adw.PreferencesWindow (tak jak GNOME
 * robi to z oknem ustawień rozszerzenia).
 */
export default class WyrazPreferences {
    /**
     * @param {object} opts
     * @param {string} opts.path katalog danych programu (data/words.tsv…)
     * @param {object} opts.metadata {'version-name': …}
     * @param {Gio.Settings} opts.settings ustawienia eu.jaroszek.Wyraz
     */
    constructor({path, metadata, settings}) {
        this.path = path;
        this.metadata = metadata;
        this._settings = settings;
    }

    /** @returns {Gio.Settings} */
    getSettings() {
        return this._settings;
    }

    /**
     * Dodaje trzy karty do okna. Obiekty Gio.Settings i monitory plików
     * zapisujemy jako pola okna, żeby nie zostały zebrane przez odśmiecacz,
     * dopóki okno jest otwarte.
     *
     * @param {Adw.PreferencesWindow} window
     */
    fillPreferencesWindow(window) {
        const settings = this.getSettings();
        window._settings = settings;
        window.set_default_size(660, 860);
        window.set_title(EXTENSION_NAME);

        // Sygnały odłączamy przy zamknięciu okna (bez odwołań do zniszczonych widżetów).
        // track(obj, id) zapamiętuje podłączony sygnał; wszystkie są odłączane
        // przy zamknięciu okna.
        const handlers = [];
        const track = (obj, id) => handlers.push([obj, id]);
        window.connect('close-request', () => {
            for (const [obj, id] of handlers)
                obj.disconnect(id);
            handlers.length = 0;
            return false;
        });

        window.add(this._settingsPage(window, settings, track));
        window.add(this._dictionaryPage(window, settings, track));
        window.add(this._aboutPage(window));
    }

    // ===================================================================
    // Karta 1: Ustawienia: Uruchom po bezczynności, Słowa, Wygląd,
    //          Wygaszacz, Kod zamykający
    // ===================================================================

    /**
     * @param {Adw.PreferencesWindow} window
     * @param {Gio.Settings} settings
     * @param {Function} track rejestracja sygnałów do odłączenia
     * @returns {Adw.PreferencesPage}
     */
    _settingsPage(window, settings, track) {
        const page = new Adw.PreferencesPage({
            title: 'Ustawienia',
            icon_name: 'preferences-system-symbolic',
        });

        // --- Start (pierwsza opcja na stronie) -----------------------------
        const start = new Adw.PreferencesGroup();
        start.add(spinRow(settings, 'idle-minutes', 'Uruchom po bezczynności (minuty)',
            'Brak ruchu myszy i naciśnięć klawiszy, minimum 1 minuta', 1, 240));
        page.add(start);

        // --- Słowa ---------------------------------------------------------
        const words = new Adw.PreferencesGroup({
            title: 'Słowa',
            description: 'Hasła losowane są codziennie i pokazywane po kolei, polskie ' +
                'na przemian z angielskimi. Hasło pokazane jednego dnia nie wróci w żadnym innym dniu.',
        });
        const plRow = spinRow(settings, 'words-per-day', 'Polskie hasła dziennie',
            'Słownik Języka Polskiego (sjp.pl), 0 wyłącza', 0, 100);
        const enRow = spinRow(settings, 'words-per-day-en', 'Angielskie hasła dziennie',
            'Angielski słownik Wordset, 0 wyłącza', 0, 100);
        words.add(plRow);
        words.add(enRow);
        // Informacja widoczna tylko przy 0 polskich i 0 angielskich haseł.
        const zeroRow = textRow('Oba słowniki wyłączone',
            'Wygaszacz pokaże wtedy 1 polskie hasło dziennie.');
        zeroRow.add_prefix(new Gtk.Image({icon_name: 'dialog-information-symbolic'}));
        words.add(zeroRow);
        const syncZero = () => {
            zeroRow.visible = settings.get_int('words-per-day') === 0 &&
                settings.get_int('words-per-day-en') === 0;
        };
        syncZero();
        track(settings, settings.connect('changed::words-per-day', syncZero));
        track(settings, settings.connect('changed::words-per-day-en', syncZero));
        words.add(spinRow(settings, 'change-interval', 'Zmiana hasła co (sekundy)',
            'Jak długo jedno hasło jest na ekranie', 5, 3600));
        page.add(words);

        // --- Wygląd --------------------------------------------------------
        const look = new Adw.PreferencesGroup({title: 'Wygląd'});
        const styleRow = comboRow(settings, 'background-style', 'Styl', STYLES, track);
        look.add(styleRow);

        // Lista krojów zainstalowanych w systemie, żeby ostrzec przed brakiem
        // czcionek stylu (pakiet Flatpak zawiera je wszystkie, poza TeX Gyre Schola).
        const installed = new Set(window.get_pango_context().list_families()
            .map(f => f.get_name().toLowerCase()));
        // Czy kroju brakuje (rodzina ogólna 'serif' jest zawsze dostępna).
        const missing = fam => fam !== 'serif' && !installed.has(fam.toLowerCase());
        const notInstalled = 'Czcionki stylu nie są dostępne, zainstaluj pakiet ponownie';

        // Wariant: jedna lista, której zawartość zależy od stylu. Każdy styl
        // zapisuje wybór w swoim dotychczasowym kluczu.
        const variantRow = new Adw.ComboRow({title: 'Wariant'});
        // variant: {key, items} dla bieżącego stylu. syncingVariant blokuje
        // zapis do ustawień, gdy to program (a nie użytkownik) zmienia wybór.
        let variant = null;
        let syncingVariant = false;
        // Zaznacza pozycję odpowiadającą bieżącej wartości klucza wariantu.
        const selectVariant = () => {
            const i = variant.items.findIndex(([id]) => id === settings.get_string(variant.key));
            syncingVariant = true;
            variantRow.selected = i >= 0 ? i : 0;
            syncingVariant = false;
        };
        // Po zmianie stylu wymienia zawartość listy (inny klucz, inne kroje).
        const rebuildVariants = () => {
            const [key, items] = VARIANTS[settings.get_string('background-style')] ?? VARIANTS.aurora;
            if (variant?.key === key) {
                selectVariant();
                return;
            }
            variant = {key, items};
            const model = new Gtk.StringList();
            for (const [, label] of items)
                model.append(label);
            syncingVariant = true;
            variantRow.model = model;
            syncingVariant = false;
            selectVariant();
        };
        variantRow.connect('notify::selected', () => {
            if (syncingVariant || !variant)
                return;
            const id = variant.items[variantRow.selected]?.[0];
            if (id && id !== settings.get_string(variant.key))
                settings.set_string(variant.key, id);
        });
        rebuildVariants();
        track(settings, settings.connect('changed::background-style', rebuildVariants));
        for (const key of ['font-family', 'renaissance-font', 'wroclove-text-font']) {
            track(settings, settings.connect(`changed::${key}`, () => {
                if (variant?.key === key)
                    selectVariant();
            }));
        }
        look.add(variantRow);

        // Zegar: godzina jako znak wodny. Przełącznik „Pokaż zegar” rozwija
        // jego opcje; wyłączony zegar je zwija.
        const clockRow = new Adw.ExpanderRow({
            title: 'Pokaż zegar',
            show_enable_switch: true,
        });
        settings.bind('clock-enabled', clockRow, 'enable-expansion', Gio.SettingsBindFlags.DEFAULT);
        clockRow.expanded = settings.get_boolean('clock-enabled');
        track(settings, settings.connect('changed::clock-enabled', () => {
            clockRow.expanded = settings.get_boolean('clock-enabled');
        }));
        // „Własne”: pola X i Y (procent szerokości i wysokości ekranu).
        const xRow = spinRow(settings, 'clock-x', 'X (%)',
            '0: przy lewej krawędzi, 50: pośrodku, 100: przy prawej.', 0, 100);
        const yRow = spinRow(settings, 'clock-y', 'Y (%)',
            '0: przy górnej krawędzi, 50: pośrodku, 100: przy dolnej.', 0, 100);
        // Pola X i Y widać tylko przy położeniu „Własne”.
        const syncCustom = () => {
            const custom = settings.get_string('clock-position') === 'custom';
            xRow.visible = custom;
            yRow.visible = custom;
        };
        syncCustom();
        track(settings, settings.connect('changed::clock-position', syncCustom));
        for (const row of [
            spinRow(settings, 'clock-transparency', 'Transparentność zegara (%)', '', 5, 95),
            comboRow(settings, 'clock-size', 'Rozmiar zegara', CLOCK_SIZES, track),
            comboRow(settings, 'clock-position', 'Położenie zegara', CLOCK_POSITIONS, track),
            xRow,
            yRow,
            comboRow(settings, 'clock-style', 'Styl zegara', CLOCK_STYLES, track),
        ])
            clockRow.add_row(row);
        look.add(clockRow);
        // Domyślny rozmiar zegara: Wroclove Herbowy Bardzo duży, pozostałe
        // style Średni. Ustawiany po zmianie stylu (przy włączonym zegarze)
        // i po wybraniu położenia „Specjalnie”; potem można go zmienić.
        const defaultClockSize = () => {
            const size = settings.get_string('background-style') === 'wroclove' ? 'huge' : 'medium';
            if (settings.get_boolean('clock-enabled') && settings.get_string('clock-size') !== size)
                settings.set_string('clock-size', size);
        };
        // Nowy styl wygaszacza podpowiada też pasujący styl zegara.
        track(settings, settings.connect('changed::background-style', () => {
            const suggested = CLOCK_FOR_STYLE[settings.get_string('background-style')];
            if (suggested && settings.get_string('clock-style') !== suggested)
                settings.set_string('clock-style', suggested);
            defaultClockSize();
        }));
        track(settings, settings.connect('changed::clock-position', () => {
            if (settings.get_string('clock-position') === 'special')
                defaultClockSize();
        }));

        // Podgląd: zwiększenie licznika preview-request; aplet w panelu COSMIC
        // widzi zmianę i pokazuje wygaszacz po chwili (żeby puścić mysz).
        const previewRow = buttonRow({
            title: 'Pokaż podgląd',
            start_icon_name: 'media-playback-start-symbolic',
        });
        previewRow.connect('activated', () => {
            settings.set_int('preview-request', settings.get_int('preview-request') + 1);
        });
        look.add(previewRow);

        // Krótki podpis pod nazwą stylu.
        const STYLE_NOTES = {
            aurora: 'Zorza polarna nad górami',
            ocean: 'Światło i kaustyki w głębi oceanu',
            lublin: 'Kształty, które inspirują',
            wroclove: 'Spotkanie z barwami miasta',
        };
        // Podpis stylu i ostrzeżenie o brakujących czcionkach wariantu.
        const syncLook = () => {
            const style = settings.get_string('background-style');
            styleRow.subtitle = STYLE_NOTES[style] ?? '';

            // Wariant bez opisu; podpowiedź tylko wtedy, gdy brakuje czcionek.
            if (style === 'lublin') {
                const ren = settings.get_string('renaissance-font');
                variantRow.subtitle = missing(ren) || missing('Exo 2') ? notInstalled : '';
            } else if (style === 'wroclove') {
                const wf = settings.get_string('wroclove-text-font');
                variantRow.subtitle = missing(wf) || missing('Crimson Text') ? notInstalled : '';
            } else {
                variantRow.subtitle = missing(settings.get_string('font-family'))
                    ? 'Ta czcionka nie jest zainstalowana, zostanie użyta zastępcza szeryfowa'
                    : '';
            }
        };
        syncLook();
        for (const key of ['background-style', 'font-family', 'renaissance-font', 'wroclove-text-font'])
            track(settings, settings.connect(`changed::${key}`, syncLook));
        look.set_description('Po kliknięciu podglądu puść mysz, podgląd ruszy po ok. 2 sekundach.');
        page.add(look);

        // --- Wygaszacz -----------------------------------------------------
        const saver = new Adw.PreferencesGroup({
            title: 'Wygaszacz',
            description: 'Wygaszacz działa w aplecie panelu COSMIC. Jeśli podgląd się nie pojawia, ' +
                'dodaj aplet: Ustawienia COSMIC → Pulpit → Panel → Aplety → Dodaj aplet → ' +
                '„Słownik jako Wygaszacz Ekranu”.',
        });
        saver.add(switchRow(settings, 'respect-inhibitors', 'Nie przeszkadzaj podczas filmów',
            'Nie uruchamiaj, gdy aplikacja blokuje bezczynność albo przeglądarka czy odtwarzacz wideo właśnie gra (muzyka nie przeszkadza)'));

        // Systemowe wyłączanie ekranu COSMIC (cosmic-idle, screen_off_time
        // w milisekundach). Jeśli jest krótsze niż czas startu wygaszacza,
        // ekran zgaśnie wcześniej, więc pokazujemy ostrzeżenie i „Wydłuż”.
        const blankRow = new Adw.ActionRow({title: 'Systemowe wyłączanie ekranu'});
        const fixButton = new Gtk.Button({
            label: 'Wydłuż',
            valign: Gtk.Align.CENTER,
            tooltip_text: 'Ustaw wyłączanie ekranu COSMIC 10 minut po starcie wygaszacza',
        });
        // Stan wyłączania ekranu względem czasu startu wygaszacza.
        const syncBlank = () => {
            const ms = COSMIC.screenOffMs();
            const mine = settings.get_int('idle-minutes') * 60 * 1000;
            fixButton.visible = ms !== null && ms <= mine;
            if (ms === null)
                blankRow.subtitle = 'Wyłączone, wygaszacz działa bez limitu czasu';
            else if (ms <= mine)
                blankRow.subtitle = `⚠ Po ${Math.round(ms / 60000)} min, czyli zanim wygaszacz zdąży się pojawić`;
            else
                blankRow.subtitle = `Po ${Math.round(ms / 60000)} min, wygaszacz pojawi się wcześniej ✓`;
        };
        fixButton.connect('clicked', () => {
            if (!COSMIC.setScreenOffMs((settings.get_int('idle-minutes') + 10) * 60 * 1000))
                blankRow.subtitle = '⚠ Nie udało się zapisać ustawienia COSMIC (Ustawienia → Zasilanie)';
            else
                syncBlank();
        });
        blankRow.add_suffix(fixButton);
        syncBlank();
        const idleMonitor = COSMIC.monitorIdle(syncBlank);
        if (idleMonitor) {
            window._idleMonitor = idleMonitor;
            window.connect('close-request', () => {
                idleMonitor.cancel();
                return false;
            });
        }
        track(settings, settings.connect('changed::idle-minutes', syncBlank));
        saver.add(blankRow);
        page.add(saver);

        // --- Kod zamykający -----------------------------------------------
        page.add(this._codeGroup(settings, track));

        return page;
    }

    /**
     * Grupa „Kod zamykający”: przełącznik, pole nowego kodu, stan i ostrzeżenie.
     * Kod nigdy nie jest zapisywany wprost: makeStored() zapisuje sól i skrót.
     *
     * @param {Gio.Settings} settings
     * @param {Function} track
     * @returns {Adw.PreferencesGroup}
     */
    _codeGroup(settings, track) {
        const code = new Adw.PreferencesGroup({
            title: 'Kod zamykający',
            description: 'Opcjonalnie: ruch myszy lub klawisz pokaże pole kodu, a wygaszacz ' +
                'zniknie dopiero po wpisaniu tego samego ciągu 1–6 liter lub cyfr.',
        });

        const codeSwitch = new Adw.SwitchRow({title: 'Wymagaj kodu do zamknięcia wygaszacza'});
        settings.bind('unlock-code-enabled', codeSwitch, 'active', Gio.SettingsBindFlags.DEFAULT);
        code.add(codeSwitch);

        const codeEntry = new Adw.PasswordEntryRow({
            title: 'Nowy kod (1–6 liter lub cyfr)',
            show_apply_button: true,
        });
        // Ograniczenie długości w samym polu tekstowym (jeśli wersja
        // libadwaita udostępnia jego delegata).
        codeEntry.get_delegate?.()?.set_max_length?.(6);
        code.add(codeEntry);

        const codeStatus = new Adw.ActionRow({title: 'Stan'});
        const clearButton = new Gtk.Button({
            label: 'Usuń kod',
            valign: Gtk.Align.CENTER,
            css_classes: ['destructive-action'],
        });
        codeStatus.add_suffix(clearButton);
        code.add(codeStatus);

        const disclaimer = new Adw.ActionRow({
            title: 'Kod nie zastępuje hasła systemu',
            subtitle: 'Działa tylko w bieżącej sesji graficznej i chroni przed przypadkowym ' +
                'zamknięciem wygaszacza, a nie przed dostępem do komputera. Nie traktuj go jako ' +
                'zabezpieczenia i nie wyłączaj ani nie osłabiaj z jego powodu hasła konta, ' +
                'blokady ekranu COSMIC (Super+Escape) czy innych dotychczasowych zabezpieczeń.',
            subtitle_lines: 0,
            activatable: false,
        });
        disclaimer.add_prefix(new Gtk.Image({
            icon_name: 'dialog-warning-symbolic',
            valign: Gtk.Align.START,
            margin_top: 14,
        }));
        code.add(disclaimer);

        // Ostatni błąd do pokazania w wierszu „Stan” (pusty: brak błędu).
        let codeError = '';
        // Odświeża wiersz „Stan” i widoczność przycisku „Usuń kod”.
        const syncCode = () => {
            const set = hasCode(settings.get_string('unlock-code'));
            const on = settings.get_boolean('unlock-code-enabled');
            clearButton.visible = set;
            if (codeError)
                codeStatus.subtitle = `⚠ ${codeError}`;
            else if (!set)
                codeStatus.subtitle = 'Brak kodu, wygaszacz zamyka ruch myszy lub dowolny klawisz';
            else if (!on)
                codeStatus.subtitle = 'Kod ustawiony, ale wyłączony';
            else
                codeStatus.subtitle = 'Kod aktywny ✓ (podgląd też go wymaga)';
        };
        // Sprawdzanie na bieżąco przy wpisywaniu (czerwone pole przy błędzie).
        codeEntry.connect('changed', () => {
            const text = codeEntry.text;
            const ok = text === '' || isValidCode(text);
            if (ok)
                codeEntry.remove_css_class('error');
            else
                codeEntry.add_css_class('error');
            codeError = ok ? '' : 'Dozwolone są tylko litery A–Z, a–z i cyfry, najwyżej 6 znaków';
            syncCode();
        });
        // Zatwierdzenie przyciskiem ✓: zapis skrótu i włączenie wymagania kodu.
        codeEntry.connect('apply', () => {
            const text = codeEntry.text;
            if (!isValidCode(text)) {
                codeError = 'Kod musi mieć od 1 do 6 liter lub cyfr';
                codeEntry.add_css_class('error');
                syncCode();
                return;
            }
            settings.set_string('unlock-code', makeStored(text));
            settings.set_boolean('unlock-code-enabled', true);
            codeEntry.text = '';
            codeError = '';
            syncCode();
        });
        clearButton.connect('clicked', () => {
            settings.set_boolean('unlock-code-enabled', false);
            settings.set_string('unlock-code', '');
            syncCode();
        });
        // Bez zapisanego kodu nie da się włączyć wymagania kodu.
        track(settings, settings.connect('changed::unlock-code-enabled', () => {
            if (settings.get_boolean('unlock-code-enabled') &&
                !hasCode(settings.get_string('unlock-code'))) {
                settings.set_boolean('unlock-code-enabled', false);
                codeError = 'Najpierw wpisz kod i zatwierdź go przyciskiem ✓';
            }
            syncCode();
        }));
        track(settings, settings.connect('changed::unlock-code', syncCode));
        syncCode();
        return code;
    }

    /**
     * Grupa „Archiwum”: dni z ostatniego roku (od najnowszego), każdy jako
     * zwijany wiersz z listą haseł. Odświeża się po zmianie state.json
     * (z opóźnieniem 400 ms, bo zapis może dać kilka zdarzeń naraz).
     *
     * @param {Adw.PreferencesWindow} window
     * @param {Function} track
     * @returns {Adw.PreferencesGroup}
     */
    _archiveGroup(window, track) {
        const group = new Adw.PreferencesGroup({
            title: 'Archiwum',
            description: 'Hasła wyświetlone w ciągu ostatniego roku, od najnowszych.',
        });
        let dayRows = [];
        let refreshId = 0;

        // Buduje listę dni od nowa z bieżącego pliku stanu.
        const refresh = () => {
            for (const r of dayRows)
                group.remove(r);
            dayRows = [];
            const state = readState();
            const history = Array.isArray(state?.history) ? state.history.slice().reverse() : [];
            if (!history.length) {
                const empty = textRow('Archiwum jest puste',
                    'Hasła trafiają tutaj następnego dnia po wyświetleniu.');
                group.add(empty);
                dayRows.push(empty);
                return;
            }
            for (const h of history) {
                const words = Array.isArray(h.words) ? h.words : [];
                const day = new Adw.ExpanderRow({
                    title: esc(polishDay(h.date)),
                    subtitle: esc(words.map(e => e.w).join(', ')),
                    subtitle_lines: 1,
                });
                // wiersze haseł tworzone dopiero przy rozwinięciu dnia
                let filled = false;
                day.connect('notify::expanded', () => {
                    if (filled || !day.expanded)
                        return;
                    filled = true;
                    for (const e of words) {
                        const row = new Adw.ActionRow({
                            title: esc(e.w),
                            subtitle: esc((e.d ?? []).join(' · ')),
                            subtitle_lines: 3,
                            activatable: false,
                        });
                        row.add_prefix(langBadge(e.lang ?? 'pl'));
                        day.add_row(row);
                    }
                });
                group.add(day);
                dayRows.push(day);
            }
        };
        refresh();

        let monitor = null;
        try {
            monitor = Gio.File.new_for_path(STATE_PATH)
                .monitor_file(Gio.FileMonitorFlags.NONE, null);
        } catch (e) {
            console.warn(`[Wyraz] Nie można obserwować stanu: ${e.message}`);
        }
        if (monitor) {
            window._archiveMonitor = monitor;
            track(monitor, monitor.connect('changed', () => {
                if (refreshId)
                    GLib.source_remove(refreshId);
                refreshId = GLib.timeout_add(GLib.PRIORITY_DEFAULT, 400, () => {
                    refreshId = 0;
                    refresh();
                    return GLib.SOURCE_REMOVE;
                });
            }));
        }
        window.connect('close-request', () => {
            if (refreshId)
                GLib.source_remove(refreshId);
            refreshId = 0;
            monitor?.cancel();
            return false;
        });
        return group;
    }

    /**
     * Grupa „Dzisiejsze hasła”: zwijana lista haseł na dziś i przycisk
     * ponownego losowania. Losuje wygaszacz (licznik reset-today-request);
     * okno czeka na zmianę state.json, a po 4 s bez odpowiedzi pokazuje
     * ostrzeżenie, że aplet chyba nie działa.
     *
     * @param {Adw.PreferencesWindow} window
     * @param {Gio.Settings} settings
     * @param {Function} track
     * @returns {Adw.PreferencesGroup}
     */
    _todayGroup(window, settings, track) {
        const group = new Adw.PreferencesGroup({title: 'Dzisiejsze hasła'});
        const expander = new Adw.ExpanderRow();
        group.add(expander);

        const resetRow = buttonRow({
            title: 'Wylosuj dzisiejsze hasła od nowa',
            start_icon_name: 'view-refresh-symbolic',
        });
        group.add(resetRow);

        let rows = [];
        // waitId: licznik czekania na wynik losowania; refreshId: opóźnione
        // odświeżenie po zmianie pliku.
        let waitId = 0;
        let refreshId = 0;
        const stopWait = () => {
            if (waitId)
                GLib.source_remove(waitId);
            waitId = 0;
        };

        // Lista dzisiejszych haseł z pliku stanu (pusta, gdy stan jest z innego dnia).
        const refresh = () => {
            for (const r of rows)
                expander.remove(r);
            rows = [];
            const state = readState();
            const todayKey = GLib.DateTime.new_now_local().format('%Y-%m-%d');
            const list = state && state.date === todayKey && Array.isArray(state.today) ? state.today : [];
            // used: tablica (stary format, tylko polskie) albo {pl, en}.
            const used = state?.used ?? {};
            const usedPl = Array.isArray(used) ? used.length : used.pl?.length ?? 0;
            const usedEn = Array.isArray(used) ? 0 : used.en?.length ?? 0;

            if (!list.length) {
                expander.title = 'Jeszcze nie wylosowano';
                expander.subtitle = 'Hasła na dziś zostaną wylosowane przy pierwszym uruchomieniu wygaszacza';
                expander.enable_expansion = false;
                return;
            }
            expander.enable_expansion = true;
            expander.title = `Pokaż hasła (${list.length})`;
            expander.subtitle = `Wykorzystane do tej pory: polskie ${usedPl}, angielskie ${usedEn}`;
            for (const e of list) {
                const row = new Adw.ActionRow({
                    title: esc(e.w),
                    subtitle: esc((e.d ?? []).join(' · ')),
                    subtitle_lines: 3,
                    activatable: false,
                });
                row.add_prefix(langBadge(e.lang ?? 'pl'));
                expander.add_row(row);
                rows.push(row);
            }
        };
        refresh();

        // Wygaszacz zapisuje nowe losowanie do state.json, a my to obserwujemy.
        let monitor = null;
        try {
            monitor = Gio.File.new_for_path(STATE_PATH)
                .monitor_file(Gio.FileMonitorFlags.NONE, null);
        } catch (e) {
            console.warn(`[Wyraz] Nie można obserwować stanu: ${e.message}`);
        }
        if (monitor) {
            window._stateMonitor = monitor;
            track(monitor, monitor.connect('changed', () => {
                if (refreshId)
                    GLib.source_remove(refreshId);
                refreshId = GLib.timeout_add(GLib.PRIORITY_DEFAULT, 250, () => {
                    refreshId = 0;
                    stopWait();
                    resetRow.title = 'Wylosuj dzisiejsze hasła od nowa';
                    refresh();
                    return GLib.SOURCE_REMOVE;
                });
            }));
        }
        window.connect('close-request', () => {
            stopWait();
            if (refreshId)
                GLib.source_remove(refreshId);
            refreshId = 0;
            monitor?.cancel();
            return false;
        });

        resetRow.connect('activated', () => {
            const dialog = new Adw.AlertDialog({
                heading: 'Wylosować hasła od nowa?',
                body: 'Dzisiejsze hasła zostaną zastąpione nowymi. Obecne pozostaną ' +
                    'oznaczone jako wykorzystane i nie wrócą w kolejnych dniach.',
            });
            dialog.add_response('cancel', 'Anuluj');
            dialog.add_response('reset', 'Wylosuj');
            dialog.set_response_appearance('reset', Adw.ResponseAppearance.SUGGESTED);
            dialog.default_response = 'reset';
            dialog.close_response = 'cancel';
            dialog.connect('response', (_d, response) => {
                if (response !== 'reset')
                    return;
                resetRow.title = 'Losowanie…';
                settings.set_int('reset-today-request', settings.get_int('reset-today-request') + 1);
                stopWait();
                waitId = GLib.timeout_add_seconds(GLib.PRIORITY_DEFAULT, 4, () => {
                    waitId = 0;
                    resetRow.title = 'Wylosuj dzisiejsze hasła od nowa';
                    expander.subtitle = '⚠ Wygaszacz nie odpowiada, sprawdź, czy aplet jest dodany do panelu COSMIC';
                    return GLib.SOURCE_REMOVE;
                });
            });
            dialog.present(window);
        });
        return group;
    }

    // ===================================================================
    // Karta 2: Słownik: wyszukiwanie dowolnego hasła
    // ===================================================================

    /**
     * Karta „Słownik”: wyszukiwarka (z wyborem słownika), wyniki, dzisiejsze
     * hasła i archiwum.
     *
     * @param {Adw.PreferencesWindow} window
     * @param {Gio.Settings} settings
     * @param {Function} track
     * @returns {Adw.PreferencesPage}
     */
    _dictionaryPage(window, settings, track) {
        const page = new Adw.PreferencesPage({
            title: 'Słownik',
            icon_name: 'system-search-symbolic',
        });


        const searchGroup = new Adw.PreferencesGroup({
            title: 'Szukaj hasła',
            description: 'Wielkość liter nie ma znaczenia, można też pisać bez polskich znaków.',
        });
        const entry = new Adw.EntryRow({title: 'Wpisz hasło, np. Wrocławianka'});
        entry.add_prefix(new Gtk.Image({icon_name: 'system-search-symbolic'}));
        searchGroup.add(entry);
        const langs = [['all', 'Oba słowniki'], ['pl', 'Polski'], ['en', 'Angielski']];
        const langModel = new Gtk.StringList();
        for (const [, label] of langs)
            langModel.append(label);
        const langRow = new Adw.ComboRow({title: 'Słownik', model: langModel});
        searchGroup.add(langRow);
        page.add(searchGroup);

        const results = new Adw.PreferencesGroup();
        page.add(results);

        // --- Dzisiejsze hasła (zwijane), pod wyszukiwarką i jej wynikami -----
        page.add(this._todayGroup(window, settings, track));
        // Wiersze wyników usuwamy ręcznie, bo PreferencesGroup nie ma clear().
        let resultRows = [];
        const clearResults = () => {
            for (const r of resultRows)
                results.remove(r);
            resultRows = [];
        };
        const addResult = row => {
            results.add(row);
            resultRows.push(row);
        };

        // Bazy wczytujemy dopiero przy pierwszym wyszukiwaniu, asynchronicznie
        // i porcjami, żeby okno nie zamarzało.
        // indexes: gotowe indeksy; loading: obietnica trwającego wczytywania;
        // closed: okno zamknięte (przerywa przygotowanie indeksu).
        let indexes = null;
        let loading = null;
        let closed = false;
        const loadBytes = file => new Promise((resolve, reject) => {
            file.load_contents_async(null, (f, res) => {
                try {
                    resolve(f.load_contents_finish(res)[1]);
                } catch (e) {
                    reject(e);
                }
            });
        });
        // Przygotowanie indeksu porcjami po 6000 haseł w czasie bezczynności
        // pętli GTK, więc okno reaguje na kliknięcia podczas wczytywania.
        const prepareInIdle = idx => new Promise(resolve => {
            GLib.idle_add(GLib.PRIORITY_DEFAULT_IDLE, () => {
                if (closed || idx.prepareChunk(6000)) {
                    resolve();
                    return GLib.SOURCE_REMOVE;
                }
                return GLib.SOURCE_CONTINUE;
            });
        });
        // Wczytuje oba słowniki raz; kolejne wywołania dostają tę samą obietnicę.
        // Brak jednego pliku nie blokuje wyszukiwania w drugim.
        const ensureIndexes = () => {
            if (indexes)
                return Promise.resolve(indexes);
            if (!loading) {
                loading = (async () => {
                    const list = [];
                    const decoder = new TextDecoder('utf-8');
                    for (const [lang, name] of [['pl', 'words.tsv'], ['en', 'words-en.tsv']]) {
                        try {
                            const file = Gio.File.new_for_path(
                                GLib.build_filenamev([this.path, 'data', name]));
                            const idx = new SearchIndex(indexDatabase(await loadBytes(file), decoder), lang);
                            await prepareInIdle(idx);
                            list.push(idx);
                        } catch (e) {
                            console.warn(`[Wyraz] Brak bazy ${name}: ${e.message}`);
                        }
                    }
                    indexes = list;
                    return list;
                })();
            }
            return loading;
        };

        // Najwięcej wyników na liście. runToken odrzuca wyniki zapytania,
        // jeśli w trakcie wczytywania wpisano już inne.
        const LIMIT = 30;
        let runToken = 0;
        const run = async () => {
            const token = ++runToken;
            const query = entry.text.trim();
            if (!query) {
                clearResults();
                results.title = '';
                results.description = '';
                return;
            }
            if (!indexes) {
                clearResults();
                results.title = 'Wczytywanie słownika…';
                results.description = '';
            }
            const all = await ensureIndexes();
            if (closed || token !== runToken)
                return;   // w międzyczasie wpisano coś innego
            clearResults();
            const lang = langs[langRow.selected]?.[0] ?? 'all';
            const idx = all.filter(i => lang === 'all' || i.lang === lang);
            const {total, results: found} = searchAll(idx, query, LIMIT);
            if (!total) {
                results.title = 'Brak wyników';
                results.description = `Nie znaleziono hasła „${query}”.`;
                return;
            }
            results.title = total > LIMIT
                ? `Wyniki (${LIMIT} z ${total})`
                : `Wyniki (${total})`;
            results.description = found[0].rank <= 1
                ? ''
                : 'Nie ma dokładnie takiego hasła, oto podobne.';
            for (const {lang: l, entry: e} of found) {
                const row = new Adw.ActionRow({
                    title: esc(e.w),
                    subtitle: esc(formatDefinition(e.d, 6, 400)),
                    subtitle_lines: 0,
                    activatable: false,
                    use_markup: true,
                });
                row.add_prefix(langBadge(l));
                addResult(row);
            }
        };

        const search = () => run().catch(e => console.warn(`[Wyraz] Wyszukiwanie: ${e.message}`));
        // Wyszukiwanie 250 ms po ostatnim naciśnięciu klawisza (od razu po Enter).
        let debounceId = 0;
        const schedule = () => {
            if (debounceId)
                GLib.source_remove(debounceId);
            debounceId = GLib.timeout_add(GLib.PRIORITY_DEFAULT, 250, () => {
                debounceId = 0;
                search();
                return GLib.SOURCE_REMOVE;
            });
        };
        entry.connect('changed', schedule);
        entry.connect('entry-activated', () => {
            if (debounceId)
                GLib.source_remove(debounceId);
            debounceId = 0;
            search();
        });
        langRow.connect('notify::selected', schedule);
        window.connect('close-request', () => {
            if (debounceId)
                GLib.source_remove(debounceId);
            debounceId = 0;
            closed = true;
            indexes = null;
            return false;
        });
        // --- Archiwum: hasła z ostatniego roku (na końcu) -------------------
        page.add(this._archiveGroup(window, track));

        return page;
    }

    // ===================================================================
    // Karta 3: O programie: nazwa, Dokumentacja, Licencja, Autor,
    //          Oprogramowanie, Bez gwarancji
    // ===================================================================

    /**
     * Karta „O programie”. Wersję podaje main.js (version-name).
     *
     * @param {Adw.PreferencesWindow} window
     * @returns {Adw.PreferencesPage}
     */
    _aboutPage(window) {
        const page = new Adw.PreferencesPage({
            title: 'O programie',
            icon_name: 'help-about-symbolic',
        });

        // Kolejność: nazwa, Dokumentacja, Licencja, Autor, Oprogramowanie,
        // Bez gwarancji.
        const group = new Adw.PreferencesGroup();
        group.add(textRow(EXTENSION_NAME,
            `Wersja ${this.metadata['version-name'] ?? ''}, aplet panelu COSMIC (Wayland, Flatpak). ` +
            'Pokazuje hasła i definicje ze słownika jako wygaszacz ekranu.'));

        const docs = textRow('Dokumentacja', 'Instrukcja, pytania i odpowiedzi (wiki projektu).');
        docs.add_suffix(linkButton(window, DOCS_URL));
        group.add(docs);

        const lic = textRow('Licencja', `${LICENSE.title} (EUPL-1.2).`);
        lic.add_suffix(linkButton(window, LICENSE.url));
        group.add(lic);

        const authorRow = textRow('Autor', `Program publikuje ${AUTHOR}.`);
        authorRow.add_suffix(linkButton(window, AUTHOR_URL));
        group.add(authorRow);

        // „Oprogramowanie” otwiera podstronę (push_subpage), jeśli libadwaita
        // to umożliwia.
        const subpages = typeof window.push_subpage === 'function';
        if (subpages) {
            const softRow = new Adw.ActionRow({
                title: 'Oprogramowanie',
                subtitle: 'Powstało z pomocą Claude, oprogramowanie open source.',
                activatable: true,
            });
            softRow.add_suffix(new Gtk.Image({icon_name: 'go-next-symbolic'}));
            softRow.connect('activated', () => {
                const sub = new Adw.PreferencesPage();
                for (const g of this._softwareGroups(window))
                    sub.add(g);
                const view = new Adw.ToolbarView({content: sub});
                view.add_top_bar(new Adw.HeaderBar());
                window.push_subpage(new Adw.NavigationPage({title: 'Oprogramowanie', child: view}));
            });
            group.add(softRow);
        }

        group.add(textRow('Bez gwarancji',
            'Program jest udostępniany „tak jak jest” (as-is), bez jakichkolwiek gwarancji. ' +
            'Autor nie odpowiada za błędy ani za szkody wynikłe z jej użycia. ' +
            'Program jest publikowany pod nazwą kodową „Wyraz”. Wersja dla COSMIC (Pop!_OS) ' +
            'powstała na podstawie wtyczki dla GNOME Shell.'));
        page.add(group);

        // starsze libadwaita bez podstron: Oprogramowanie na tej samej karcie
        if (!subpages) {
            for (const g of this._softwareGroups(window))
                page.add(g);
        }
        return page;
    }

    /**
     * Podstrona „Oprogramowanie”: Claude i składniki open source (z credits.js).
     * Opis każdego składnika kończy się kropką, jak pozostałe opisy w oknie.
     *
     * @param {Gtk.Window} window
     * @returns {Adw.PreferencesGroup[]}
     */
    _softwareGroups(window) {
        const ai = new Adw.PreferencesGroup({title: 'Powstało z pomocą Claude'});
        const claudeRow = textRow('Claude (Anthropic)', AI_NOTE);
        claudeRow.add_suffix(linkButton(window, 'https://www.anthropic.com/claude'));
        ai.add(claudeRow);

        const oss = new Adw.PreferencesGroup({
            title: 'Open source',
            description: 'Składniki i narzędzia użyte w projekcie wraz z licencjami.',
        });
        for (const {group, items} of COMPONENTS) {
            const exp = new Adw.ExpanderRow({
                title: esc(group),
                subtitle: esc(items.map(i => i[0]).join(', ')),
                subtitle_lines: 1,
            });
            for (const [name, license, role, url] of items) {
                const desc = `${license} · ${role}`;
                const row = textRow(name, /[.!?]$/.test(desc) ? desc : `${desc}.`);
                row.add_suffix(linkButton(window, url));
                exp.add_row(row);
            }
            oss.add(exp);
        }
        return [ai, oss];
    }
}
