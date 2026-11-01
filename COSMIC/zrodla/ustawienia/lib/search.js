// search.js: wyszukiwanie haseł w oknie ustawień (bez zależności od GNOME,
// testowane w Node).
//
// Wielkość liter nie ma znaczenia. Kolejność wyników:
//   0 dokładnie to słowo        1 to samo słowo bez polskich znaków
//   2 hasła zaczynające się     3 jw. bez polskich znaków
//   4 hasła zawierające tekst   5 jw. bez polskich znaków (od 3 znaków)

// Litera ł nie rozkłada się w Unicode na l + znak diakrytyczny (NFD jej nie
// zmienia), więc zamieniamy ją ręcznie.
const PL_FOLD = {ł: 'l', Ł: 'l'};

/**
 * Małe litery i bez znaków diakrytycznych („Łódź” → „lodz”).
 *
 * Po rozkładzie NFD usuwamy znaki łączące z zakresu U+0300–U+036F
 * (akcenty, kreski, ogonki).
 *
 * @param {string} s
 * @returns {string}
 */
export function fold(s) {
    return s.toLowerCase()
        .replace(/[łŁ]/g, c => PL_FOLD[c])
        .normalize('NFD')
        .replace(/[̀-ͯ]/g, '');
}

/**
 * Indeks wyszukiwania jednego słownika. Trzyma dwie tablice równoległe do
 * haseł w bazie: hasła małymi literami i hasła „złożone” przez fold(), żeby
 * nie liczyć ich przy każdym zapytaniu.
 */
export class SearchIndex {
    /**
     * @param {object} db wynik indexDatabase()
     * @param {string} lang 'pl' albo 'en'
     */
    constructor(db, lang) {
        this.db = db;
        this.lang = lang;
        this._lower = null;
        this._folded = null;
        this._done = 0;
    }

    /**
     * Przygotowuje kolejną porcję haseł (małe litery, bez znaków
     * diakrytycznych). Okno ustawień woła to porcjami w czasie bezczynności,
     * żeby nie zamrażać interfejsu.
     *
     * @param {number} count ile haseł przygotować
     * @returns {boolean} true, gdy wszystko gotowe
     */
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

    /** @returns {boolean} czy indeks jest w całości przygotowany */
    get ready() {
        return this._lower !== null && this._done >= this.db.total;
    }

    /** Przygotowuje od razu całą resztę indeksu (gdy zapytanie przyszło przed końcem). */
    _prepare() {
        while (!this.prepareChunk(1e9))
            ;
    }

    /**
     * Wszystkie dopasowania jako [ranga, długość, indeks].
     *
     * Dopasowania „zawiera” (rangi 4 i 5) liczymy dopiero od 3 znaków, bo
     * krótsze zapytanie pasowałoby do większości słownika.
     *
     * @param {string} query tekst z pola wyszukiwania
     * @returns {number[][]}
     */
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

// Przy równej randze i długości polskie hasła są przed angielskimi.
const LANG_ORDER = {pl: 0, en: 1};

/**
 * Szuka we wszystkich słownikach naraz.
 *
 * Sortowanie: ranga, potem krótsze hasła, potem język, potem kolejność
 * w bazie (czyli alfabetyczna). `total` podaje liczbę wszystkich trafień,
 * nie tylko zwróconych.
 *
 * @param {SearchIndex[]} indexes indeksy słowników (polskiego i angielskiego)
 * @param {string} query tekst z pola wyszukiwania
 * @param {number} limit ile wyników zwrócić
 * @returns {{total: number, results: {lang: string, entry: {w: string, d: string[]}, rank: number}[]}}
 */
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
