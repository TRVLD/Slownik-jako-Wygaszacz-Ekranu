
const PL_FOLD = {ł: 'l', Ł: 'l'};

export function fold(s) {
    return s.toLowerCase()
        .replace(/[łŁ]/g, c => PL_FOLD[c])
        .normalize('NFD')
        .replace(/[̀-ͯ]/g, '');
}

export class SearchIndex {
    constructor(db, lang) {
        this.db = db;
        this.lang = lang;
        this._lower = null;
        this._folded = null;
        this._done = 0;
    }

    prepareChunk(count = 5000) {
        const n = this.db.total;
        if (!this._lower) {
            this._lower = new Array(n);
            this._folded = new Array(n);
            this._done = 0;
        }
        const end = Math.min(n, this._done + count);
        for (let i = this._done; i < end; i++) {
            const lower = this.db.headwordAt(i).toLowerCase();
            this._lower[i] = lower;
            this._folded[i] = fold(lower);
        }
        this._done = end;
        return end >= n;
    }

    get ready() {
        return this._lower !== null && this._done >= this.db.total;
    }

    _prepare() {
        while (!this.prepareChunk(1e9))
            ;
    }

    matches(query) {
        const q = query.trim().toLowerCase();
        if (!q)
            return [];
        if (!this.ready)
            this._prepare();
        const fq = fold(q);
        const contains = q.length >= 3;
        const out = [];
        const lower = this._lower, folded = this._folded;
        for (let i = 0; i < lower.length; i++) {
            const w = lower[i];
            let rank = -1;
            if (w === q)
                rank = 0;
            else if (folded[i] === fq)
                rank = 1;
            else if (w.startsWith(q))
                rank = 2;
            else if (folded[i].startsWith(fq))
                rank = 3;
            else if (contains && w.includes(q))
                rank = 4;
            else if (contains && folded[i].includes(fq))
                rank = 5;
            if (rank >= 0)
                out.push([rank, w.length, i]);
        }
        return out;
    }
}

const LANG_ORDER = {pl: 0, en: 1};

export function searchAll(indexes, query, limit = 30) {
    const all = [];
    for (const idx of indexes) {
        for (const [rank, len, i] of idx.matches(query))
            all.push({rank, len, i, idx});
    }
    all.sort((a, b) => a.rank - b.rank || a.len - b.len ||
        LANG_ORDER[a.idx.lang] - LANG_ORDER[b.idx.lang] || a.i - b.i);
    return {
        total: all.length,
        results: all.slice(0, limit).map(m => ({
            lang: m.idx.lang,
            rank: m.rank,
            entry: m.idx.db.entryAt(m.i),
        })),
    };
}
