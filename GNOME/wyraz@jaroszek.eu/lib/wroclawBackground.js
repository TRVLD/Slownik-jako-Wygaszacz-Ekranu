import Graphene from 'gi://Graphene';
import St from 'gi://St';

import {ShaderEffect} from './shaderEffect.js';
import {COMMON_DECLARATIONS, WROCLAW_CODE, WROCLAW_DECLARATIONS} from './shaders.js';
import {PaintSchedule, R, Y, heartbeat} from './wroclawSchedule.js';
import {GRID_COLS, GRID_MAX, GRID_ROWS, WroclawSymbols, freeHeartSpot} from './wroclawSymbols.js';

const W_COLOR = '#231f20';
const HEART_YELLOW = [0.992, 0.812, 0.0];
const HEART_RED = [0.965, 0.239, 0.216];
const RED_HEART_GAP = [6, 14];
const RED_HEART_LIFE = [2, 3];
const RED_HEART_MARGIN = 0.03;
const W_INK_HEIGHT = 0.58;
const W_MAX_WIDTH = 0.64;
const SHOW_YELLOW = 0.88;
const GRID_W = 0.8;
const GRID_H = 0.8;
const SMALL_INK = 0.6;
const FADE_IN = 1.0;
const FADE_OUT = 0.5;
const LETTER_IN = 0.35;
const GRID_RESET = 0.35;

class WroclawEffect {
    constructor(width, height) {
        this._shader = new ShaderEffect('Wroclaw',
            COMMON_DECLARATIONS + WROCLAW_DECLARATIONS, WROCLAW_CODE);
        this.effect = this._shader.effect;
        this._key = null;
        this._shader.setFloat('resolution', [Math.max(width, 1), Math.max(height, 1)]);
        const zero = [0, 0, 0, 0];
        this.update(zero, zero, zero, zero);
    }

    update(base, target, prog, seed) {
        const key = base.concat(target, prog, seed).map(v => v.toFixed(4)).join(',');
        if (key === this._key)
            return;
        this._key = key;
        this._shader.setFloat('u_base', base);
        this._shader.setFloat('u_target', target);
        this._shader.setFloat('u_prog', prog);
        this._shader.setFloat('u_seed', seed);
        this._shader.queueRepaint();
    }
}

function drawHeart(cr, w, h, color = HEART_YELLOW) {
    cr.scale(w, h);
    cr.moveTo(0.5, 0.92);
    cr.curveTo(0.18, 0.70, 0.0, 0.48, 0.0, 0.30);
    cr.curveTo(0.0, 0.12, 0.14, 0.02, 0.28, 0.02);
    cr.curveTo(0.39, 0.02, 0.47, 0.08, 0.5, 0.18);
    cr.curveTo(0.53, 0.08, 0.61, 0.02, 0.72, 0.02);
    cr.curveTo(0.86, 0.02, 1.0, 0.12, 1.0, 0.30);
    cr.curveTo(1.0, 0.48, 0.82, 0.70, 0.5, 0.92);
    cr.closePath();
    cr.setSourceRGBA(...color, 1);
    cr.fill();
}

function approach(value, target, dt) {
    if (target > value)
        return Math.min(target, value + dt / FADE_IN);
    return Math.max(target, value - dt / FADE_OUT);
}

export class WroclawBackground {
    constructor(monitor, {wordFont = 'Crimson Text'} = {}) {
        this._schedule = new PaintSchedule();
        this._symbols = new WroclawSymbols();
        this._t = 0;
        this._lastT = null;

        this.actor = new St.Widget({
            x_expand: true,
            y_expand: true,
            clip_to_allocation: true,
        });
        this._paint = new St.Widget({
            width: monitor.width,
            height: monitor.height,
            style: `background-color: ${this._schedule.startColor === Y ? '#fdcf00' : '#f63d37'};`,
        });
        this.actor.add_child(this._paint);
        this._effect = null;
        try {
            this._effect = new WroclawEffect(monitor.width, monitor.height);
            this._paint.add_effect(this._effect.effect);
        } catch (e) {
            console.warn(`[Wyraz] Shader Wroclove Herbowy niedostępny: ${e.message}`);
        }

        const qw = Math.floor(monitor.width / 2), qh = Math.floor(monitor.height / 2);
        this._qw = qw;
        this._qh = qh;

        this._quads = [0, 1, 2, 3].map(q => {
            const box = new St.Widget({
                x: (q % 2) * qw,
                y: Math.floor(q / 2) * qh,
                width: qw,
                height: qh,
            });
            const big = new St.Label({text: 'W', opacity: 0, visible: false});
            box.add_child(big);
            const grid = new St.Widget({width: qw, height: qh, opacity: 0, visible: false});
            const small = [];
            for (let i = 0; i < GRID_MAX; i++) {
                const l = new St.Label({text: 'W', opacity: 0, visible: false});
                grid.add_child(l);
                small.push(l);
            }
            box.add_child(grid);
            this.actor.add_child(box);
            return {box, big, grid, small, bigAlpha: 0, gridAlpha: 0, gridWord: -1, gridCycle: -1};
        });
        this._wordFont = wordFont;
        this._fitted = false;

        this._heartSize = Math.round(qh * 0.2);
        this._heart = new St.DrawingArea({
            width: this._heartSize,
            height: Math.round(this._heartSize * 0.92),
            opacity: 0,
            visible: false,
            pivot_point: new Graphene.Point({x: 0.5, y: 0.5}),
        });
        this._heart.connect('repaint', area => {
            const cr = area.get_context();
            try {
                const [w, h] = area.get_surface_size();
                drawHeart(cr, w, h);
            } finally {
                cr.$dispose();
            }
        });
        this.actor.add_child(this._heart);
        this._heartKey = null;
        this._heartQ = null;

        this._redHeart = new St.DrawingArea({
            width: this._heartSize,
            height: Math.round(this._heartSize * 0.92),
            opacity: 0,
            visible: false,
            pivot_point: new Graphene.Point({x: 0.5, y: 0.5}),
        });
        this._redHeart.connect('repaint', area => {
            const cr = area.get_context();
            try {
                const [w, h] = area.get_surface_size();
                drawHeart(cr, w, h, HEART_RED);
            } finally {
                cr.$dispose();
            }
        });
        this.actor.add_child(this._redHeart);
        this._rh = null;
        this._rhNext = 4 + Math.random() * 6;
        this._avoid = null;
    }

    _styleLabels(labels, px) {
        const scale = St.ThemeContext.get_for_stage(global.stage).scale_factor;
        const style = `font-family: "${this._wordFont}", serif; font-weight: bold;` +
            `font-size: ${Math.max(6, Math.round(px / scale))}px; color: ${W_COLOR};`;
        for (const l of labels) {
            l.style = style;
            l.ensure_style();
        }
        const [ink] = labels[0].clutter_text.get_layout().get_pixel_extents();
        return ink;
    }

    _fit(labels, h, w) {
        let px = h * 1.3;
        let ink = this._styleLabels(labels, px);
        for (let i = 0; i < 2 && ink.height > 0; i++) {
            px *= Math.min(h / ink.height, w / ink.width);
            ink = this._styleLabels(labels, px);
        }
        return ink;
    }

    _fitGlyphs() {
        const qw = this._qw, qh = this._qh;
        const bigInk = this._fit(this._quads.map(x => x.big), qh * W_INK_HEIGHT, qw * W_MAX_WIDTH);
        this._bigInk = bigInk;
        this._cellW = qw * GRID_W / GRID_COLS;
        this._cellH = qh * GRID_H / GRID_ROWS;
        const smallInk = this._fit(this._quads.flatMap(x => x.small),
            Math.min(this._cellH, this._cellW / 1.62) * SMALL_INK, this._cellW * SMALL_INK);
        this._smallInk = smallInk;
        for (const x of this._quads) {
            if (bigInk.height > 0) {
                x.big.set_position(
                    Math.round(qw / 2 - bigInk.x - bigInk.width / 2),
                    Math.round(qh / 2 - bigInk.y - bigInk.height / 2));
            } else {
                x.big.set_position(Math.round(qw * 0.3), Math.round(qh * 0.1));
            }
        }
    }

    _placeSmall(label, gx, gy) {
        const ink = this._smallInk;
        const cx = this._qw / 2 + gx * this._cellW;
        const cy = this._qh / 2 + gy * this._cellH;
        label.set_position(
            Math.round(cx - ink.x - ink.width / 2),
            Math.round(cy - ink.y - ink.height / 2));
    }

    static _redness(states) {
        return states.map(s => {
            const a = s.base === R ? 1 : 0, b = s.target === R ? 1 : 0;
            return a + (b - a) * s.progress;
        });
    }

    textQuadrant(t) {
        if (t !== this._t) {
            this._symbols.update(WroclawBackground._redness(
                [0, 1, 2, 3].map(q => this._schedule.state(q, t))));
        }
        return this._symbols.textQuadrant;
    }

    get heartQuadrant() {
        return this._symbols.heartQuadrant;
    }

    clockQuadrant() {
        const red = this._red;
        let best = this._symbols.heartQuadrant;
        if (!red)
            return best;
        for (let q = 0; q < 4; q++) {
            if (red[q] > red[best] + 0.05)
                best = q;
        }
        return best;
    }

    _heartRadius(size) {
        return 0.5 * Math.hypot(this._heart.width, this._heart.height) * size * 1.12;
    }

    setHeartAvoid(rect) {
        this._avoid = rect;
        if (!rect || this._heartQ === null || !this._heart.visible)
            return;
        const [x, y] = this._heart.get_position();
        const spot = freeHeartSpot({
            u: 0.5, v: 0.5,
            x0: x + this._heart.width / 2 - this._qw / 2,
            y0: y + this._heart.height / 2 - this._qh / 2,
            qw: this._qw, qh: this._qh,
            radius: this._heartRadius(this._heartBase ?? 1.15),
            avoid: rect,
        });
        if (!spot || spot.u !== 0.5 || spot.v !== 0.5 || spot.scale !== 1) {
            this._heartQ = null;
            this._heart.visible = false;
        }
    }

    nextWord(interval) {
        const heartRow = this._heartQ === null ? null : Math.floor(this._heartQ / 2);
        this._symbols.nextWord(this._t, interval, heartRow);
    }

    setTime(t) {
        if (!this._fitted && this.actor.get_stage()) {
            this._fitGlyphs();
            this._fitted = true;
        }
        const dt = this._lastT === null ? 0 : Math.min(0.25, Math.max(0, t - this._lastT));
        this._lastT = t;
        this._t = t;

        const st = [0, 1, 2, 3].map(q => this._schedule.state(q, t));
        this._effect?.update(
            st.map(x => x.base), st.map(x => x.target),
            st.map(x => x.progress), st.map(x => x.seed));

        const sym = this._symbols;
        const red = WroclawBackground._redness(st);
        this._red = red;
        sym.update(red);
        const full = q => this._schedule.fullColor(q, t);
        const yellow = q => 1 - red[q] >= SHOW_YELLOW;

        const bigQ = sym.bigQuadrant, gridQ = sym.gridQuadrant;
        const grid = sym.grid(t);
        for (let q = 0; q < 4; q++) {
            const x = this._quads[q];
            const wantBig = q === bigQ && yellow(q);
            const wantGrid = q === gridQ && yellow(q);
            x.bigAlpha = approach(x.bigAlpha, wantBig && x.gridAlpha < 0.02 ? 1 : 0, dt);
            x.gridAlpha = approach(x.gridAlpha, wantGrid && x.bigAlpha < 0.02 ? 1 : 0, dt);
            x.big.visible = x.bigAlpha > 0.001;
            if (x.big.visible)
                x.big.opacity = Math.round(255 * x.bigAlpha);

            x.grid.visible = x.gridAlpha > 0.001;
            if (x.grid.visible)
                x.grid.opacity = Math.round(255 * x.gridAlpha);
            if (q === gridQ && this._fitted)
                this._updateGrid(x, grid, sym.word);
        }

        this._updateRedHeart(t);

        const heart = this._schedule.visible(t)[0];
        if (!heart) {
            this._heart.visible = false;
            this._heartKey = null;
            this._heartQ = null;
            return;
        }
        if (heart.key !== this._heartKey) {
            this._heartKey = heart.key;
            const q = this._yellowHeartQuadrant(sym, full);
            this._heartQ = full(q) === R ? q : null;
            const col = q % 2, row = Math.floor(q / 2);
            const spot = this._heartQ === null ? null : freeHeartSpot({
                u: heart.u, v: heart.v,
                x0: col * this._qw, y0: row * this._qh,
                qw: this._qw, qh: this._qh,
                radius: this._heartRadius(heart.size),
                avoid: this._avoid,
            });
            if (!spot)
                this._heartQ = null;
            if (this._heartQ !== null) {
                const cx = col * this._qw + spot.u * this._qw;
                const cy = row * this._qh + spot.v * this._qh;
                this._heart.set_position(
                    Math.round(cx - this._heart.width / 2),
                    Math.round(cy - this._heart.height / 2));
                this._heartBase = heart.size * spot.scale;
            }
        }
        if (this._heartQ === null) {
            this._heart.visible = false;
            return;
        }
        this._heart.visible = true;
        this._heart.opacity = Math.round(255 * heart.alpha);
        const sc = this._heartBase * (0.9 + 0.22 * heart.beat);
        this._heart.set_scale(sc, sc);
        this._heart.rotation_angle_z = heart.tilt;
    }

    _yellowHeartQuadrant(sym, full) {
        if (this._avoid) {
            const cx = this._avoid.x + this._avoid.w / 2;
            const cy = this._avoid.y + this._avoid.h / 2;
            const q = (cx >= this._qw ? 1 : 0) + (cy >= this._qh ? 2 : 0);
            if (q !== sym.textQuadrant && full(q) === R)
                return q;
        }
        return sym.heartQuadrant;
    }

    _bigRect(q) {
        const ink = this._bigInk;
        if (!ink || !(ink.width > 0))
            return null;
        const gap = this._qh * RED_HEART_MARGIN;
        const x0 = (q % 2) * this._qw, y0 = Math.floor(q / 2) * this._qh;
        return {
            x: x0 + this._qw / 2 - ink.width / 2 - gap,
            y: y0 + this._qh / 2 - ink.height / 2 - gap,
            w: ink.width + 2 * gap,
            h: ink.height + 2 * gap,
        };
    }

    _updateRedHeart(t) {
        const heart = this._redHeart;
        const bigQ = this._symbols.bigQuadrant;
        const quad = this._quads[bigQ];
        const ready = this._fitted && quad && quad.bigAlpha > 0.95;
        if (this._rh && (t > this._rh.end || this._rh.q !== bigQ || !ready)) {
            this._rh = null;
            heart.visible = false;
            this._rhNext = t + RED_HEART_GAP[0] + Math.random() * (RED_HEART_GAP[1] - RED_HEART_GAP[0]);
        }
        if (!this._rh && t >= this._rhNext) {
            this._rhNext = t + 1.5;
            const big = ready ? this._bigRect(bigQ) : null;
            if (big) {
                const size = 0.8 + Math.random() * 0.3;
                const col = bigQ % 2, row = Math.floor(bigQ / 2);
                const spot = freeHeartSpot({
                    u: 0.18 + Math.random() * 0.64, v: 0.2 + Math.random() * 0.6,
                    x0: col * this._qw, y0: row * this._qh,
                    qw: this._qw, qh: this._qh,
                    radius: this._heartRadius(size),
                    avoid: [big, this._avoid],
                });
                if (spot) {
                    const life = RED_HEART_LIFE[0] + Math.random() * (RED_HEART_LIFE[1] - RED_HEART_LIFE[0]);
                    const base = (Math.random() - 0.5) * 14;
                    this._rh = {
                        q: bigQ, start: t, end: t + life, size: size * spot.scale,
                        base, amp: 3 + Math.random() * (15 - 3 - Math.abs(base)),
                        freq: 0.35 + Math.random() * 0.45, phase: Math.random() * 6.2832,
                    };
                    heart.set_position(
                        Math.round(col * this._qw + spot.u * this._qw - heart.width / 2),
                        Math.round(row * this._qh + spot.v * this._qh - heart.height / 2));
                }
            }
        }
        if (!this._rh) {
            heart.visible = false;
            return;
        }
        const h = this._rh, age = t - h.start;
        const alpha = Math.max(0, Math.min(1, age / 0.25, (h.end - t) / 0.4));
        heart.visible = true;
        heart.opacity = Math.round(255 * alpha);
        const sc = h.size * (0.9 + 0.22 * heartbeat(age));
        heart.set_scale(sc, sc);
        heart.rotation_angle_z = h.base + h.amp * Math.sin(6.2832 * h.freq * age + h.phase);
    }

    _updateGrid(x, grid, word) {
        if (x.gridWord !== word || x.gridCycle !== grid.cycle) {
            x.gridWord = word;
            x.gridCycle = grid.cycle;
            x.small.forEach(l => {
                l.visible = false;
            });
            x.placed = 0;
        }
        const n = grid.letters.length;
        for (let i = 0; i < n; i++) {
            const l = x.small[i];
            const g = grid.letters[i];
            if (i >= x.placed) {
                this._placeSmall(l, g.x, g.y);
                x.placed = i + 1;
            }
            const a = Math.min(1, g.age / LETTER_IN);
            l.visible = a > 0.001;
            if (l.visible)
                l.opacity = Math.round(255 * a * a * (3 - 2 * a));
        }
        const toNext = 1 - (grid.letters[n - 1]?.age ?? 0);
        if (n === GRID_MAX && toNext < GRID_RESET) {
            const a = Math.max(0, toNext / GRID_RESET);
            for (const l of x.small)
                l.opacity = Math.round(255 * a);
        }
    }

    destroy() {
        this._effect = null;
        this.actor.destroy();
    }
}
