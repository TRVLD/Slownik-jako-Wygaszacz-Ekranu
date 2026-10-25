
export const Y = 0;
export const R = 1;
export const LAYOUT_A = [R, Y, Y, R];
export const LAYOUT_B = [Y, R, R, Y];

const START_HOLD = [4, 8];
const HOLD = [20, 34];
const PAINT = [12, 22];
const COLOR_DELAY = [1.2, 5];
const SAME_COLOR_JITTER = 2.5;

const HEART_LIFE = [2, 3];
const HEART_GAP = [1.5, 8];
const HEART_FADE_IN = 0.25;
const HEART_FADE_OUT = 0.4;
export const HEART_MAX_TILT = 15;

function uniform(rng, [a, b]) {
    return a + (b - a) * rng();
}

function ease(x) {
    const t = Math.min(1, Math.max(0, x));
    return t * t * (3 - 2 * t);
}

export function heartbeat(t) {
    const ph = (t % 0.85) / 0.85;
    const g = (x, c, w) => Math.exp(-(((x - c) / w) ** 2));
    return g(ph, 0.12, 0.06) + 0.6 * g(ph, 0.34, 0.06);
}

function ramp(t, start, end, fadeIn, fadeOut) {
    if (t < start || t > end)
        return 0;
    const a = Math.min(1, (t - start) / fadeIn, (end - t) / fadeOut);
    return ease(Math.max(0, a));
}

export class PaintSchedule {
    constructor({rng = Math.random} = {}) {
        this.rng = rng;
        this.paints = [[], [], [], []];
        this.holds = [];
        this.hearts = [];
        this.startColor = rng() < 0.5 ? Y : R;
        this._colors = [0, 1, 2, 3].map(() => this.startColor);
        this._seedCounter = Math.floor(rng() * 50);
        this._horizon = 0;

        const h0 = uniform(rng, START_HOLD);
        this.holds.push({start: 0, end: h0, colors: this._colors.slice()});
        this._horizon = h0;
        const firstEnd = this._planPaint(LAYOUT_A, h0);
        this._planHearts(0, firstEnd);
        this._ensure(1);
    }

    _planPaint(target, from) {
        const firstColor = this.rng() < 0.5 ? Y : R;
        const delay = uniform(this.rng, COLOR_DELAY);
        let end = from;
        for (let q = 0; q < 4; q++) {
            if (this._colors[q] === target[q])
                continue;
            const paintColor = target[q];
            const start = from + (paintColor === firstColor
                ? this.rng() * 0.8
                : delay + this.rng() * SAME_COLOR_JITTER);
            const stop = start + uniform(this.rng, PAINT);
            this.paints[q].push({
                start, end: stop, from: this._colors[q], to: target[q],
                seed: (this._seedCounter++ * 7.31 + q * 3.17) % 97,
            });
            end = Math.max(end, stop);
        }
        this._colors = target.slice();
        this._horizon = end;
        return end;
    }

    _ensure(t) {
        while (this._horizon < t + 200) {
            const start = this._horizon;
            const end = start + uniform(this.rng, HOLD);
            const hold = {start, end, colors: this._colors.slice()};
            this.holds.push(hold);
            const next = this._colors[0] === LAYOUT_A[0] ? LAYOUT_B : LAYOUT_A;
            const paintEnd = this._planPaint(next, end);
            this._planHearts(start, paintEnd);
        }
    }

    _paintAt(q, t) {
        const list = this.paints[q];
        for (let i = list.length - 1; i >= 0; i--) {
            const p = list[i];
            if (p.start <= t)
                return t < p.end ? {p, progress: ease((t - p.start) / (p.end - p.start))} : {p, progress: 1};
        }
        return null;
    }

    state(q, t) {
        this._ensure(t);
        return this._state(q, t);
    }

    _state(q, t) {
        const cur = this._paintAt(q, t);
        if (!cur)
            return {base: this.startColor, target: this.startColor, progress: 0, seed: 0};
        if (cur.progress >= 1)
            return {base: cur.p.to, target: cur.p.to, progress: 0, seed: cur.p.seed};
        return {base: cur.p.from, target: cur.p.to, progress: cur.progress, seed: cur.p.seed};
    }

    fullColor(q, t) {
        const s = this._state(q, t);
        return s.progress > 0 ? null : s.base;
    }

    allFull(t) {
        this._ensure(t);
        return [0, 1, 2, 3].every(q => this.fullColor(q, t) !== null);
    }

    _planHearts(from, to) {
        let t = from + uniform(this.rng, [1, 4]);
        while (t < to) {
            const life = uniform(this.rng, HEART_LIFE);
            const end = t + life;
            if (end <= to && this._allFullOver(t, end) && this._redInBothRows(t)) {
                const base = uniform(this.rng, [-7, 7]);
                const amp = uniform(this.rng, [3, HEART_MAX_TILT - Math.abs(base)]);
                this.hearts.push({
                    u: uniform(this.rng, [0.18, 0.82]),
                    v: uniform(this.rng, [0.2, 0.8]),
                    size: uniform(this.rng, [0.8, 1.15]),
                    tilt: {base, amp, freq: uniform(this.rng, [0.35, 0.8]), phase: this.rng() * 6.2832},
                    start: t,
                    end,
                });
                t = end + uniform(this.rng, HEART_GAP);
            } else {
                t += uniform(this.rng, [0.8, 2.5]);
            }
        }
        this.hearts.sort((a, b) => a.start - b.start);
    }

    _allFullOver(start, end) {
        for (let k = 0; k <= 6; k++) {
            const t = start + (end - start) * k / 6;
            if ([0, 1, 2, 3].some(q => this.fullColor(q, t) === null))
                return false;
        }
        return true;
    }

    _redInBothRows(t) {
        return [0, 1].every(row => this.fullColor(row * 2, t) === R || this.fullColor(row * 2 + 1, t) === R);
    }

    visible(t) {
        this._ensure(t);
        if (t - (this._pruned ?? -Infinity) > 30) {
            this.hearts = this.hearts.filter(h => h.end > t - 60);
            for (let q = 0; q < 4; q++) {
                const list = this.paints[q];
                while (list.length > 2 && list[1].end < t - 60)
                    list.shift();
            }
            this.holds = this.holds.filter(h => h.end > t - 600);
            this._pruned = t;
        }
        const out = [];
        for (const h of this.hearts) {
            if (h.start > t)
                break;
            if (t > h.end)
                continue;
            const age = t - h.start;
            out.push({
                kind: 'heart',
                key: h.start,
                u: h.u,
                v: h.v,
                size: h.size,
                alpha: ramp(t, h.start, h.end, HEART_FADE_IN, HEART_FADE_OUT),
                beat: heartbeat(age),
                tilt: h.tilt.base + h.tilt.amp * Math.sin(6.2832 * h.tilt.freq * age + h.tilt.phase),
            });
        }
        return out;
    }
}
