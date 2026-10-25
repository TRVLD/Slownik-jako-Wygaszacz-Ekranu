
export const GRID_COLS = 5;
export const GRID_ROWS = 4;
export const GRID_MAX = GRID_COLS * GRID_ROWS;
const SWITCH = 0.25;

export function gridLayout(elapsed, interval) {
    const e = Math.max(0, elapsed);
    const idx = Math.floor(e);
    const cycle = Math.floor(idx / GRID_MAX);
    const shown = idx % GRID_MAX + 1;
    const perWord = Math.max(1, Math.ceil(interval - 1e-6));
    const total = Math.max(shown, Math.min(GRID_MAX, perWord - cycle * GRID_MAX));
    const rows = Math.ceil(total / GRID_COLS);
    const letters = [];
    for (let i = 0; i < shown; i++) {
        const row = Math.floor(i / GRID_COLS);
        const col = i % GRID_COLS;
        const inRow = row < rows - 1 ? GRID_COLS : total - GRID_COLS * (rows - 1);
        letters.push({
            x: col - (inRow - 1) / 2,
            y: row - (rows - 1) / 2,
            age: e - (cycle * GRID_MAX + i),
        });
    }
    return {cycle, shown, total, rows, letters};
}

export class WroclawSymbols {
    constructor({rng = Math.random} = {}) {
        this.rng = rng;
        this.textRow = rng() < 0.5 ? 0 : 1;
        this.bigRow = rng() < 0.5 ? 0 : 1;
        this.redCol = [0, 1];
        this._init = false;
        this.wordStart = 0;
        this.interval = 30;
        this.word = 0;
    }

    update(red) {
        for (const row of [0, 1]) {
            const a = red[row * 2], b = red[row * 2 + 1];
            if (!this._init) {
                if (Math.abs(a - b) > 0.01)
                    this.redCol[row] = a > b ? 0 : 1;
                continue;
            }
            const cur = this.redCol[row];
            const mine = cur === 0 ? a : b, other = cur === 0 ? b : a;
            if (other > mine + SWITCH)
                this.redCol[row] = 1 - cur;
        }
        this._init = true;
    }

    nextWord(t, interval, heartRow = null) {
        this.wordStart = t;
        this.interval = interval;
        this.word++;
        this.textRow = heartRow === null || heartRow === undefined
            ? (this.rng() < 0.5 ? 0 : 1)
            : 1 - heartRow;
        this.bigRow = this.rng() < 0.5 ? 0 : 1;
    }

    _red(row) {
        return row * 2 + this.redCol[row];
    }

    _yellow(row) {
        return row * 2 + 1 - this.redCol[row];
    }

    get textQuadrant() {
        return this._red(this.textRow);
    }

    get heartQuadrant() {
        return this._red(1 - this.textRow);
    }

    get bigQuadrant() {
        return this._yellow(this.bigRow);
    }

    get gridQuadrant() {
        return this._yellow(1 - this.bigRow);
    }

    grid(t) {
        return gridLayout(t - this.wordStart, this.interval);
    }
}
