// selection.js: czysta logika losowania haseł (bez importów GNOME), żeby
// dało się ją testować poza GNOME Shell.
//
// Zasady losowania:
//   * każdego dnia wygaszacz pokazuje stałą listę haseł („Dzisiejsze hasła”),
//     losowaną przy pierwszym pokazie w danym dniu,
//   * hasło raz pokazane nie wraca w żadnym innym dniu, dopóki baza się nie
//     wyczerpie (lista `used` w state.json),
//   * kolejne pokazy w ciągu dnia przechodzą po liście kursorem `cursor`,
//   * poprzednie dni trafiają do archiwum (`history`, ostatni rok).

// Wersja stanu jednego języka (format z czasów, gdy był tylko słownik polski).
export const STATE_VERSION = 1;

// Kody bajtów używane przy przeglądaniu pliku TSV bez dekodowania całości.
const TAB = 9;
const NEWLINE = 10;
const CR = 13;

/**
 * Indeksuje plik TSV (hasło<TAB>znaczenie<TAB>...) wczytany jako bajty.
 * Zapamiętuje tylko początki linii, więc losowanie jest jednostajne,
 * a dekodowane są wyłącznie wylosowane linie.
 *
 * @param {Uint8Array} bytes
 * @param {TextDecoder} decoder
 * @returns {{total: number, headwordAt: Function, entryAt: Function}}
 */
export function indexDatabase(bytes, decoder) {
    // Pierwsze przejście: liczba linii (ostatnia może nie mieć znaku końca).
    let lines = 0;
    for (let i = 0; i < bytes.length; i++) {
        if (bytes[i] === NEWLINE)
            lines++;
    }
    if (bytes.length > 0 && bytes[bytes.length - 1] !== NEWLINE)
        lines++;
    // Drugie przejście: początki linii. Ostatni element to koniec pliku,
    // więc koniec linii i to zawsze starts[i + 1].
    const starts = new Uint32Array(lines + 1);
    let n = 0;
    if (lines > 0)
        starts[n++] = 0;
    for (let i = 0; i < bytes.length && n < lines; i++) {
        if (bytes[i] === NEWLINE)
            starts[n++] = i + 1;
    }
    starts[lines] = bytes.length;

    // Koniec linii bez znaków \n i \r (pliki z Windows).
    const lineEnd = i => {
        let end = starts[i + 1];
        while (end > starts[i] && (bytes[end - 1] === NEWLINE || bytes[end - 1] === CR))
            end--;
        return end;
    };
    const decode = (a, b) => decoder.decode(bytes.subarray(a, b));

    return {
        total: lines,
        // Samo hasło (do pierwszego tabulatora), bez dekodowania definicji.
        headwordAt: i => {
            const a = starts[i];
            const end = lineEnd(i);
            let tab = bytes.indexOf(TAB, a);
            if (tab < 0 || tab > end)
                tab = end;
            return decode(a, tab);
        },
        // Pełny wpis: hasło i niepuste znaczenia.
        entryAt: i => {
            const parts = decode(starts[i], lineEnd(i)).split('\t');
            return {w: parts[0], d: parts.slice(1).filter(s => s.length > 0)};
        },
    };
}

/**
 * Klucz dnia w czasie lokalnym, np. "2026-10-24".
 *
 * @param {Date} date
 * @returns {string}
 */
export function dayKey(date = new Date()) {
    const y = date.getFullYear();
    const m = String(date.getMonth() + 1).padStart(2, '0');
    const d = String(date.getDate()).padStart(2, '0');
    return `${y}-${m}-${d}`;
}

/**
 * Losuje `n` różnych indeksów linii, których hasła nie ma w `used`.
 * Losowanie jednostajne; gdy pula jest prawie wyczerpana, przechodzi na
 * przeszukiwanie liniowe od losowego punktu.
 *
 * @param {number} total liczba haseł w bazie
 * @param {(i: number) => string} headwordAt zwraca hasło z linii i
 * @param {Set<string>} used hasła już wykorzystane (nie jest modyfikowany)
 * @param {number} n ile wylosować
 * @param {() => number} rng generator [0, 1)
 * @returns {number[]} indeksy (może być ich mniej niż n, gdy pula się skończy)
 */
export function pickUnused(total, headwordAt, used, n, rng = Math.random) {
    const picked = [];
    const taken = new Set();
    // Tyle prób losowych przed przejściem na przeszukiwanie liniowe.
    const maxTries = 64;

    while (picked.length < n) {
        let found = -1;
        for (let t = 0; t < maxTries && found < 0; t++) {
            const i = Math.floor(rng() * total);
            if (taken.has(i))
                continue;
            if (!used.has(headwordAt(i)))
                found = i;
        }
        if (found < 0) {
            const start = Math.floor(rng() * total);
            for (let k = 0; k < total && found < 0; k++) {
                const i = (start + k) % total;
                if (!taken.has(i) && !used.has(headwordAt(i)))
                    found = i;
            }
        }
        if (found < 0)
            break; // pula wyczerpana
        taken.add(found);
        picked.push(found);
    }
    return picked;
}

/**
 * Przygotowuje listę haseł na dzień. Zwraca NOWY stan.
 * - nowy dzień: losuje `count` nowych haseł, nigdy wcześniej użytych,
 * - ten sam dzień, większe `count`: dolosowuje brakujące,
 * - ten sam dzień, mniejsze `count`: przycina listę (hasła zostają
 *   oznaczone jako użyte, więc nie wrócą w innych dniach).
 *
 * @param {object} state
 * @param {string} today
 * @param {number} count
 * @param {{total: number, headwordAt: (i:number)=>string,
 *          entryAt: (i:number)=>{w:string, d:string[]}}} db
 * @param {() => number} rng
 * @returns {object}
 */
export function planDay(state, today, count, db, rng = Math.random) {
    // Kopia stanu: funkcja nie zmienia przekazanego obiektu.
    const next = {
        version: STATE_VERSION,
        date: state.date,
        today: state.today.slice(),
        cursor: state.cursor,
        used: state.used.slice(),
    };

    // Nowy dzień: pusta lista i kursor od początku.
    if (next.date !== today) {
        next.date = today;
        next.today = [];
        next.cursor = 0;
    }

    if (next.today.length > count) {
        next.today = next.today.slice(0, count);
        next.cursor = next.today.length ? next.cursor % next.today.length : 0;
        return next;
    }

    const missing = count - next.today.length;
    if (missing <= 0)
        return next;

    let used = new Set(next.used);
    let idx = pickUnused(db.total, db.headwordAt, used, missing, rng);

    if (idx.length < missing) {
        // Wszystkie hasła z bazy zostały już pokazane (przy 5 dziennie
        // zajęłoby to ok. 47 lat). Zaczynamy nowy cykl, nadal bez
        // powtarzania haseł z dzisiejszej listy.
        next.used = next.today.map(e => e.w);
        used = new Set(next.used);
        idx = idx.concat(pickUnused(db.total, db.headwordAt,
            new Set([...used, ...idx.map(i => db.headwordAt(i))]),
            missing - idx.length, rng));
    }

    for (const i of idx) {
        const entry = db.entryAt(i);
        next.today.push(entry);
        next.used.push(entry.w);
    }
    return next;
}

/**
 * Tekst definicji do wyświetlenia: maksymalnie `maxMeanings` znaczeń,
 * każde przycięte do `maxChars` znaków.
 *
 * @param {string[]} meanings
 * @param {number} maxMeanings
 * @param {number} maxChars
 * @returns {string}
 */
export function formatDefinition(meanings, maxMeanings = 3, maxChars = 200) {
    const shown = meanings.slice(0, maxMeanings).map(m => {
        if (m.length <= maxChars)
            return m;
        // Cięcie na ostatniej spacji (jeśli nie za wcześnie), bez końcowych
        // przecinków i myślników, z wielokropkiem na końcu.
        const cut = m.slice(0, maxChars);
        const sp = cut.lastIndexOf(' ');
        return `${(sp > maxChars * 0.6 ? cut.slice(0, sp) : cut).replace(/[\s,;:–-]+$/, '')}…`;
    });
    // Jedno znaczenie bez numeru, kilka znaczeń numerowanych od 1.
    if (shown.length === 1)
        return shown[0];
    return shown.map((m, i) => `${i + 1}. ${m}`).join('\n');
}

// --- Wiele języków (PL + EN) ------------------------------------------------

// Obsługiwane języki w kolejności przeplatania haseł.
export const LANGS = ['pl', 'en'];
// Wersja stanu wielojęzycznego zapisywana w state.json.
export const MULTI_VERSION = 2;
export const HISTORY_DAYS = 366;   // archiwum: hasła z ostatniego roku

/**
 * Numer dnia od 1970-01-01 dla klucza „RRRR-MM-DD” (liczony w UTC, więc
 * zmiana czasu letniego nie przesuwa wyniku).
 *
 * @param {string} key klucz dnia z dayKey()
 * @returns {number} numer dnia albo NaN dla błędnego klucza
 */
function dayNumber(key) {
    const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(key ?? '');
    return m ? Date.UTC(+m[1], +m[2] - 1, +m[3]) / 86400000 : NaN;
}

/**
 * Dopisuje hasła dnia do archiwum (bez powtórzeń w obrębie dnia) i usuwa
 * dni starsze niż rok względem `now`.
 *
 * @param {object[]} history [{date, words: [{w, d, lang}]}]
 * @param {string} date dzień, z którego pochodzą hasła
 * @param {object[]} words hasła tego dnia
 * @param {string} now dzisiejszy dzień (do przycinania)
 * @returns {object[]} nowa lista, od najstarszego dnia
 */
export function addToHistory(history, date, words, now = date) {
    let out = (history ?? []).map(h => ({date: h.date, words: h.words.slice()}));
    if (date && words?.length) {
        let day = out.find(h => h.date === date);
        if (!day) {
            day = {date, words: []};
            out.push(day);
        }
        // W archiwum zostają najwyżej 3 znaczenia, żeby state.json nie puchł.
        for (const e of words) {
            if (!day.words.some(x => x.w === e.w && x.lang === e.lang))
                day.words.push({w: e.w, d: (e.d ?? []).slice(0, 3), lang: e.lang ?? 'pl'});
        }
    }
    const limit = dayNumber(now) - HISTORY_DAYS;
    if (!Number.isNaN(limit))
        out = out.filter(h => dayNumber(h.date) >= limit);
    out.sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));
    return out;
}

/**
 * Stan z hasłami w kilku językach. Zgodny wstecz: stary stan (wersja 1)
 * staje się stanem z polskimi hasłami.
 *
 * Każde pole jest sprawdzane osobno: uszkodzony albo ręcznie zmieniony
 * plik stanu nie psuje wygaszacza, najwyżej traci niepoprawne fragmenty.
 * Hasła z listy dzisiejszej zawsze trafiają też do `used`.
 *
 * @param {any} raw zawartość state.json po JSON.parse()
 * @returns {{version:number, date:string, today:object[], cursor:number, used:object}}
 */
export function normalizeMulti(raw) {
    const state = {version: MULTI_VERSION, date: '', today: [], cursor: 0, used: {}, counts: null, history: []};
    for (const l of LANGS)
        state.used[l] = [];
    if (!raw || typeof raw !== 'object')
        return state;
    if (typeof raw.date === 'string')
        state.date = raw.date;
    if (raw.counts && typeof raw.counts === 'object' &&
        LANGS.every(l => Number.isInteger(raw.counts[l]) && raw.counts[l] >= 0))
        state.counts = Object.fromEntries(LANGS.map(l => [l, raw.counts[l]]));
    if (Number.isInteger(raw.cursor) && raw.cursor >= 0)
        state.cursor = raw.cursor;
    if (Array.isArray(raw.used)) {
        state.used.pl = raw.used.filter(w => typeof w === 'string');
    } else if (raw.used && typeof raw.used === 'object') {
        for (const l of LANGS) {
            if (Array.isArray(raw.used[l]))
                state.used[l] = raw.used[l].filter(w => typeof w === 'string');
        }
    }
    if (Array.isArray(raw.history)) {
        state.history = raw.history
            .filter(h => h && typeof h.date === 'string' && Array.isArray(h.words))
            .map(h => ({
                date: h.date,
                words: h.words
                    .filter(e => e && typeof e.w === 'string')
                    .map(e => ({w: e.w, d: Array.isArray(e.d) ? e.d : [],
                        lang: LANGS.includes(e.lang) ? e.lang : 'pl'})),
            }));
    }
    if (Array.isArray(raw.today)) {
        state.today = raw.today
            .filter(e => e && typeof e.w === 'string' && Array.isArray(e.d))
            .map(e => ({w: e.w, d: e.d, lang: LANGS.includes(e.lang) ? e.lang : 'pl'}));
    }
    for (const l of LANGS) {
        const set = new Set(state.used[l]);
        for (const e of state.today) {
            if (e.lang === l && !set.has(e.w)) {
                set.add(e.w);
                state.used[l].push(e.w);
            }
        }
        state.used[l] = [...set];
    }
    return state;
}

/**
 * Liczby haseł dziennie z ustawień, oczyszczone.
 *
 * @param {object} counts np. {pl: 5, en: 2}
 * @returns {object} liczby całkowite ≥ 0; gdy wszystkie 0, jedno polskie hasło
 */
export function normalizeCounts(counts) {
    const out = {};
    for (const l of LANGS)
        out[l] = Math.max(0, Math.floor(Number(counts?.[l]) || 0));
    if (LANGS.every(l => out[l] === 0))
        out.pl = 1;
    return out;
}

/**
 * Czy trzeba losować: nowy dzień albo zmieniona liczba haseł. Porównujemy
 * z liczbami zamówionymi przy ostatnim losowaniu (a nie z długością listy),
 * żeby brak bazy jednego języka albo wyczerpana pula nie powodowały
 * ponownego wczytywania baz przy każdym haśle.
 *
 * @param {object} state stan z normalizeMulti
 * @param {string} today klucz dnia
 * @param {object} counts liczby z normalizeCounts
 * @returns {boolean}
 */
export function needsPlanningMulti(state, today, counts) {
    if (state.date !== today)
        return true;
    if (state.counts)
        return LANGS.some(l => state.counts[l] !== counts[l]);
    return LANGS.some(l => state.today.filter(e => e.lang === l).length !== counts[l]);
}

/**
 * Plan dnia dla kilku języków: każdy język losowany osobno (z własną
 * historią użytych haseł), potem hasła przeplatane: PL, EN, PL, EN…
 *
 * @param {object} state stan z normalizeMulti
 * @param {string} today
 * @param {object} counts
 * @param {object} dbs {pl: db, en: db} (brak bazy = bez dolosowania)
 * @param {() => number} rng
 * @returns {object}
 */
export function planDayMulti(state, today, counts, dbs, rng = Math.random) {
    const sameDay = state.date === today;
    const next = {
        version: MULTI_VERSION,
        date: today,
        today: [],
        cursor: sameDay ? state.cursor : 0,
        used: {},
        counts: Object.fromEntries(LANGS.map(l => [l, counts[l] ?? 0])),
        // poprzedni dzień trafia do archiwum
        history: sameDay
            ? addToHistory(state.history, '', [], today)
            : addToHistory(state.history, state.date, state.today, today),
    };
    // Każdy język planujemy osobno funkcją planDay() na pod-stanie
    // w starym formacie, z dzisiejszymi hasłami tylko tego języka.
    const lists = {};
    for (const l of LANGS) {
        const mine = sameDay ? state.today.filter(e => e.lang === l).map(({w, d}) => ({w, d})) : [];
        const sub = {
            version: STATE_VERSION,
            date: sameDay ? today : '',
            today: mine,
            cursor: 0,
            used: state.used[l].slice(),
        };
        const count = counts[l] ?? 0;
        let planned;
        if (count === 0)
            planned = {...sub, today: []};
        else if (dbs[l])
            planned = planDay(sub, today, count, dbs[l], rng);
        else // brak bazy: zostają tylko już wylosowane hasła
            planned = {...sub, today: mine.slice(0, count)};
        next.used[l] = planned.used;
        lists[l] = planned.today.map(e => ({w: e.w, d: e.d, lang: l}));
    }
    // Przeplatanie: PL, EN, PL, EN…, a gdy jeden język się skończy, reszta
    // drugiego po kolei.
    const longest = Math.max(0, ...LANGS.map(l => lists[l].length));
    for (let i = 0; i < longest; i++) {
        for (const l of LANGS) {
            if (i < lists[l].length)
                next.today.push(lists[l][i]);
        }
    }
    next.cursor = next.today.length ? next.cursor % next.today.length : 0;
    return next;
}

/**
 * Nowe losowanie na dziś: dzisiejsze hasła zostają oznaczone jako użyte
 * (nie wrócą w innych dniach), ale następne wyświetlenie wylosuje nowe.
 *
 * Używane przez przycisk „Wylosuj nowe” w oknie ustawień. Bieżąca lista
 * trafia do archiwum pod dzisiejszą datą.
 *
 * @param {object} state stan z normalizeMulti
 * @returns {object}
 */
export function resetToday(state) {
    return {
        ...state,
        history: addToHistory(state.history, state.date, state.today),
        date: '', today: [], cursor: 0, counts: null,
    };
}
