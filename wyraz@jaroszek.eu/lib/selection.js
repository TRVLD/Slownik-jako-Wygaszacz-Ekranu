
export const STATE_VERSION = 1;

const TAB = 9;
const NEWLINE = 10;
const CR = 13;

export function indexDatabase(bytes, decoder) {
    let lines = 0;
    for (let i = 0; i < bytes.length; i++) {
        if (bytes[i] === NEWLINE)
            lines++;
    }
    if (bytes.length > 0 && bytes[bytes.length - 1] !== NEWLINE)
        lines++;
    const starts = new Uint32Array(lines + 1);
    let n = 0;
    if (lines > 0)
        starts[n++] = 0;
    for (let i = 0; i < bytes.length && n < lines; i++) {
        if (bytes[i] === NEWLINE)
            starts[n++] = i + 1;
    }
    starts[lines] = bytes.length;

    const lineEnd = i => {
        let end = starts[i + 1];
        while (end > starts[i] && (bytes[end - 1] === NEWLINE || bytes[end - 1] === CR))
            end--;
        return end;
    };
    const decode = (a, b) => decoder.decode(bytes.subarray(a, b));

    return {
        total: lines,
        headwordAt: i => {
            const a = starts[i];
            const end = lineEnd(i);
            let tab = bytes.indexOf(TAB, a);
            if (tab < 0 || tab > end)
                tab = end;
            return decode(a, tab);
        },
        entryAt: i => {
            const parts = decode(starts[i], lineEnd(i)).split('\t');
            return {w: parts[0], d: parts.slice(1).filter(s => s.length > 0)};
        },
    };
}

export function dayKey(date = new Date()) {
    const y = date.getFullYear();
    const m = String(date.getMonth() + 1).padStart(2, '0');
    const d = String(date.getDate()).padStart(2, '0');
    return `${y}-${m}-${d}`;
}

export function pickUnused(total, headwordAt, used, n, rng = Math.random) {
    const picked = [];
    const taken = new Set();
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
            break;
        taken.add(found);
        picked.push(found);
    }
    return picked;
}

export function planDay(state, today, count, db, rng = Math.random) {
    const next = {
        version: STATE_VERSION,
        date: state.date,
        today: state.today.slice(),
        cursor: state.cursor,
        used: state.used.slice(),
    };

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

export function formatDefinition(meanings, maxMeanings = 3, maxChars = 200) {
    const shown = meanings.slice(0, maxMeanings).map(m => {
        if (m.length <= maxChars)
            return m;
        const cut = m.slice(0, maxChars);
        const sp = cut.lastIndexOf(' ');
        return `${(sp > maxChars * 0.6 ? cut.slice(0, sp) : cut).replace(/[\s,;:–-]+$/, '')}…`;
    });
    if (shown.length === 1)
        return shown[0];
    return shown.map((m, i) => `${i + 1}. ${m}`).join('\n');
}

export const LANGS = ['pl', 'en'];
export const MULTI_VERSION = 2;

export function normalizeMulti(raw) {
    const state = {version: MULTI_VERSION, date: '', today: [], cursor: 0, used: {}, counts: null};
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

export function normalizeCounts(counts) {
    const out = {};
    for (const l of LANGS)
        out[l] = Math.max(0, Math.floor(Number(counts?.[l]) || 0));
    if (LANGS.every(l => out[l] === 0))
        out.pl = 1;
    return out;
}

export function needsPlanningMulti(state, today, counts) {
    if (state.date !== today)
        return true;
    if (state.counts)
        return LANGS.some(l => state.counts[l] !== counts[l]);
    return LANGS.some(l => state.today.filter(e => e.lang === l).length !== counts[l]);
}

export function planDayMulti(state, today, counts, dbs, rng = Math.random) {
    const sameDay = state.date === today;
    const next = {
        version: MULTI_VERSION,
        date: today,
        today: [],
        cursor: sameDay ? state.cursor : 0,
        used: {},
        counts: Object.fromEntries(LANGS.map(l => [l, counts[l] ?? 0])),
    };
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
        else
            planned = {...sub, today: mine.slice(0, count)};
        next.used[l] = planned.used;
        lists[l] = planned.today.map(e => ({w: e.w, d: e.d, lang: l}));
    }
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

export function resetToday(state) {
    return {...state, date: '', today: [], cursor: 0, counts: null};
}
