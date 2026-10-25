import Adw from 'gi://Adw';
import Gio from 'gi://Gio';
import GLib from 'gi://GLib';
import Gtk from 'gi://Gtk';

import {ExtensionPreferences} from 'resource:///org/gnome/Shell/Extensions/js/extensions/prefs.js';

import {AI_NOTE, AUTHOR, AUTHOR_URL, COMPONENTS, DOCS_URL, EXTENSION_NAME, LICENSE, REPO_URL} from './lib/credits.js';
import {SearchIndex, searchAll} from './lib/search.js';
import {formatDefinition, indexDatabase} from './lib/selection.js';
import {hasCode, isValidCode, makeStored} from './lib/unlockCode.js';

const STYLES = [
    ['aurora', 'Aurora Borealis'],
    ['ocean', 'Blue Ocean'],
    ['lublin', 'Lublin Renesans'],
    ['wroclove', 'Wroclove Herbowy'],
];

const FONTS = [
    ['C059', 'C059 (Century Schoolbook)'],
    ['TeX Gyre Schola', 'TeX Gyre Schola'],
    ['Century Schoolbook', 'Century Schoolbook'],
    ['P052', 'P052 (Palatino)'],
    ['serif', 'Systemowa szeryfowa'],
];

const RENAISSANCE_FONTS = [
    ['Quintessential', 'Quintessential (kancelaryjna italika)'],
    ['Fondamento', 'Fondamento (renesansowe pióro)'],
    ['Carattere', 'Carattere (kaligrafia włoska)'],
];

const WROCLOVE_FONTS = [
    ['Belleza', 'Belleza (w duchu Optimy)'],
    ['Hind', 'Hind (w duchu Frutigera)'],
    ['Adwaita Sans', 'Adwaita Sans (systemowy GNOME)'],
];

const esc = s => GLib.markup_escape_text(String(s), -1);

const STATE_PATH = GLib.build_filenamev([GLib.get_user_data_dir(),
    'wyraz-screensaver', 'state.json']);

const LANG_LABEL = {pl: 'PL', en: 'EN'};

function readState() {
    try {
        const [ok, bytes] = GLib.file_get_contents(STATE_PATH);
        return ok ? JSON.parse(new TextDecoder().decode(bytes)) : null;
    } catch {
        return null;
    }
}

function spinRow(settings, key, title, subtitle, min, max) {
    const row = Adw.SpinRow.new_with_range(min, max, 1);
    row.title = title;
    row.subtitle = subtitle;
    settings.bind(key, row, 'value', Gio.SettingsBindFlags.DEFAULT);
    return row;
}

function switchRow(settings, key, title, subtitle) {
    const row = new Adw.SwitchRow({title, subtitle});
    settings.bind(key, row, 'active', Gio.SettingsBindFlags.DEFAULT);
    return row;
}

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

function langBadge(lang) {
    return new Gtk.Label({
        label: LANG_LABEL[lang] ?? '',
        valign: Gtk.Align.CENTER,
        width_chars: 3,
        css_classes: ['caption-heading', 'dim-label'],
        tooltip_text: lang === 'en' ? 'Słownik angielski (Wordset)' : 'Słownik języka polskiego (SJP)',
    });
}

function textRow(title, subtitle) {
    return new Adw.ActionRow({
        title: esc(title),
        subtitle: esc(subtitle),
        subtitle_lines: 0,
        activatable: false,
    });
}

export default class WyrazPreferences extends ExtensionPreferences {
    fillPreferencesWindow(window) {
        const settings = this.getSettings();
        window._settings = settings;
        window.set_default_size(660, 860);
        window.set_title(EXTENSION_NAME);

        const handlers = [];
        const track = (obj, id) => handlers.push([obj, id]);
        window.connect('close-request', () => {
            for (const [obj, id] of handlers)
                obj.disconnect(id);
            handlers.length = 0;
            return false;
        });

        window.add(this._settingsPage(window, settings, track));
        window.add(this._dictionaryPage(window));
        window.add(this._aboutPage(window));
    }

    _settingsPage(window, settings, track) {
        const page = new Adw.PreferencesPage({
            title: 'Ustawienia',
            icon_name: 'preferences-system-symbolic',
        });

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

        const look = new Adw.PreferencesGroup({title: 'Wygląd'});
        const styleRow = comboRow(settings, 'background-style', 'Styl', STYLES, track);
        look.add(styleRow);

        const installed = new Set(window.get_pango_context().list_families()
            .map(f => f.get_name().toLowerCase()));
        const missing = fam => fam !== 'serif' && !installed.has(fam.toLowerCase());
        const notInstalled = 'Czcionki stylu nie są zainstalowane, uruchom ponownie install.sh i zaloguj się';

        const fontRow = comboRow(settings, 'font-family', 'Krój pisma', FONTS, track);
        const renRow = comboRow(settings, 'renaissance-font', 'Pismo haseł', RENAISSANCE_FONTS, track);
        const wroRow = comboRow(settings, 'wroclove-text-font', 'Krój definicji', WROCLOVE_FONTS, track);
        look.add(fontRow);
        look.add(renRow);
        look.add(wroRow);

        const previewRow = new Adw.ButtonRow({
            title: 'Pokaż podgląd',
            start_icon_name: 'media-playback-start-symbolic',
        });
        previewRow.connect('activated', () => {
            settings.set_int('preview-request', settings.get_int('preview-request') + 1);
        });
        look.add(previewRow);

        const STYLE_NOTES = {
            aurora: 'Zorza polarna nad górami',
            ocean: 'Światło i kaustyki w głębi oceanu',
            lublin: 'Kształty, które inspirują',
            wroclove: 'Spotkanie z barwami miasta',
        };
        const syncLook = () => {
            const style = settings.get_string('background-style');
            styleRow.subtitle = STYLE_NOTES[style] ?? '';
            fontRow.visible = style === 'aurora' || style === 'ocean';
            renRow.visible = style === 'lublin';
            wroRow.visible = style === 'wroclove';

            const fam = settings.get_string('font-family');
            fontRow.subtitle = missing(fam)
                ? 'Ta czcionka nie jest zainstalowana, zostanie użyta zastępcza szeryfowa'
                : 'Hasło i definicja';
            const ren = settings.get_string('renaissance-font');
            renRow.subtitle = missing(ren) || missing('Exo 2') ? notInstalled : '';
            const wf = settings.get_string('wroclove-text-font');
            wroRow.subtitle = missing(wf) || missing('Crimson Text') ? notInstalled : '';
        };
        syncLook();
        for (const key of ['background-style', 'font-family', 'renaissance-font', 'wroclove-text-font'])
            track(settings, settings.connect(`changed::${key}`, syncLook));
        look.set_description('Po kliknięciu podglądu puść mysz, podgląd ruszy po ok. 2 sekundach.');
        page.add(look);

        const saver = new Adw.PreferencesGroup({title: 'Wygaszacz'});
        saver.add(spinRow(settings, 'idle-minutes', 'Uruchom po bezczynności (minuty)',
            'Brak ruchu myszy i naciśnięć klawiszy, minimum 1 minuta', 1, 240));
        saver.add(switchRow(settings, 'show-on-lock-screen', 'Pokazuj także na ekranie blokady',
            'Gdy komputer jest zablokowany i nikt go nie używa'));
        saver.add(switchRow(settings, 'respect-inhibitors', 'Nie przeszkadzaj podczas filmów',
            'Nie uruchamiaj, gdy aplikacja blokuje bezczynność (wideo, prezentacja)'));

        const session = new Gio.Settings({schema_id: 'org.gnome.desktop.session'});
        window._session = session;
        const blankRow = new Adw.ActionRow({title: 'Systemowe wygaszanie ekranu'});
        const fixButton = new Gtk.Button({
            label: 'Wydłuż',
            valign: Gtk.Align.CENTER,
            tooltip_text: 'Ustaw systemowe wygaszanie 10 minut po starcie wygaszacza',
        });
        fixButton.connect('clicked', () => {
            session.set_uint('idle-delay', (settings.get_int('idle-minutes') + 10) * 60);
        });
        blankRow.add_suffix(fixButton);
        const syncBlank = () => {
            const delay = session.get_uint('idle-delay');
            const mine = settings.get_int('idle-minutes') * 60;
            fixButton.visible = delay > 0 && delay <= mine;
            if (delay === 0)
                blankRow.subtitle = 'Wyłączone, wygaszacz działa bez limitu czasu';
            else if (delay <= mine)
                blankRow.subtitle = `⚠ Po ${Math.round(delay / 60)} min, czyli zanim wygaszacz zdąży się pojawić`;
            else
                blankRow.subtitle = `Po ${Math.round(delay / 60)} min, wygaszacz pojawi się wcześniej ✓`;
        };
        syncBlank();
        track(session, session.connect('changed::idle-delay', syncBlank));
        track(settings, settings.connect('changed::idle-minutes', syncBlank));
        saver.add(blankRow);
        page.add(saver);

        page.add(this._codeGroup(settings, track));

        page.add(this._todayGroup(window, settings, track));

        return page;
    }

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
                'blokady ekranu GNOME (Super+L) czy innych dotychczasowych zabezpieczeń.',
            subtitle_lines: 0,
            activatable: false,
        });
        disclaimer.add_prefix(new Gtk.Image({
            icon_name: 'dialog-warning-symbolic',
            valign: Gtk.Align.START,
            margin_top: 14,
        }));
        code.add(disclaimer);

        let codeError = '';
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

    _todayGroup(window, settings, track) {
        const group = new Adw.PreferencesGroup({title: 'Dzisiejsze hasła'});
        const expander = new Adw.ExpanderRow();
        group.add(expander);

        const resetRow = new Adw.ButtonRow({
            title: 'Wylosuj dzisiejsze hasła od nowa',
            start_icon_name: 'view-refresh-symbolic',
        });
        group.add(resetRow);

        let rows = [];
        let waitId = 0;
        let refreshId = 0;
        const stopWait = () => {
            if (waitId)
                GLib.source_remove(waitId);
            waitId = 0;
        };

        const refresh = () => {
            for (const r of rows)
                expander.remove(r);
            rows = [];
            const state = readState();
            const todayKey = GLib.DateTime.new_now_local().format('%Y-%m-%d');
            const list = state && state.date === todayKey && Array.isArray(state.today) ? state.today : [];
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
                    expander.subtitle = '⚠ Rozszerzenie nie odpowiada, sprawdź, czy jest włączone';
                    return GLib.SOURCE_REMOVE;
                });
            });
            dialog.present(window);
        });
        return group;
    }

    _dictionaryPage(window) {
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
        const prepareInIdle = idx => new Promise(resolve => {
            GLib.idle_add(GLib.PRIORITY_DEFAULT_IDLE, () => {
                if (closed || idx.prepareChunk(6000)) {
                    resolve();
                    return GLib.SOURCE_REMOVE;
                }
                return GLib.SOURCE_CONTINUE;
            });
        });
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
                return;
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
        return page;
    }

    _aboutPage(window) {
        const page = new Adw.PreferencesPage({
            title: 'O wtyczce',
            icon_name: 'help-about-symbolic',
        });

        const head = new Adw.PreferencesGroup();
        head.add(textRow(EXTENSION_NAME,
            `Wersja ${this.metadata['version-name'] ?? ''}, rozszerzenie GNOME Shell 50. ` +
            'Pokazuje hasła i definicje ze słownika jako wygaszacz ekranu.'));
        const docs = textRow('Dokumentacja', 'Instrukcja, pytania i odpowiedzi (wiki projektu)');
        docs.add_suffix(linkButton(window, DOCS_URL));
        head.add(docs);
        const repo = textRow('Kod źródłowy', 'Repozytorium na GitHubie, tam też można zgłaszać błędy');
        repo.add_suffix(linkButton(window, REPO_URL));
        head.add(repo);
        page.add(head);

        const me = new Adw.PreferencesGroup();
        const about = new Adw.ExpanderRow({
            title: 'O mnie',
            subtitle: `Autor: ${AUTHOR}, licencja ${LICENSE.name}`,
        });
        const authorRow = textRow('Autor', `Wtyczkę publikuje ${AUTHOR}. Profil w serwisie LinkedIn.`);
        authorRow.add_suffix(linkButton(window, AUTHOR_URL));
        about.add_row(authorRow);
        const lic = textRow('Licencja', `${LICENSE.title} (EUPL-1.2)`);
        lic.add_suffix(linkButton(window, LICENSE.url));
        about.add_row(lic);
        about.add_row(textRow('Bez gwarancji',
            'Wtyczka jest udostępniana „tak jak jest” (as-is), bez jakichkolwiek gwarancji. ' +
            'Autor nie odpowiada za błędy ani za szkody wynikłe z jej użycia.'));
        me.add(about);
        page.add(me);

        const ai = new Adw.PreferencesGroup();
        const claude = new Adw.ExpanderRow({
            title: 'Powstało z pomocą Claude',
            subtitle: 'Asystent AI firmy Anthropic',
        });
        const claudeRow = textRow('Claude (Anthropic)', AI_NOTE);
        claudeRow.add_suffix(linkButton(window, 'https://www.anthropic.com/claude'));
        claude.add_row(claudeRow);
        ai.add(claude);
        page.add(ai);

        const oss = new Adw.PreferencesGroup({
            title: 'Oprogramowanie open source',
            description: 'Składniki i narzędzia użyte w projekcie wraz z licencjami.',
        });
        for (const {group, items} of COMPONENTS) {
            const exp = new Adw.ExpanderRow({
                title: esc(group),
                subtitle: esc(items.map(i => i[0]).join(', ')),
                subtitle_lines: 1,
            });
            for (const [name, license, role, url] of items) {
                const row = textRow(name, `${license} · ${role}`);
                row.add_suffix(linkButton(window, url));
                exp.add_row(row);
            }
            oss.add(exp);
        }
        page.add(oss);
        return page;
    }
}
