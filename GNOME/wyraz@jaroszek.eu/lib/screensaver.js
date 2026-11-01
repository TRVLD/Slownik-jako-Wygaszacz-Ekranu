import Clutter from 'gi://Clutter';
import GLib from 'gi://GLib';
import Graphene from 'gi://Graphene';
import Pango from 'gi://Pango';
import Shell from 'gi://Shell';
import St from 'gi://St';

import * as Main from 'resource:///org/gnome/shell/ui/main.js';

import {createBackground, getStyle} from './backgrounds.js';
import {CodePrompt} from './codePrompt.js';
import {formatDefinition} from './selection.js';
import {PRANK_CREDIT, isAprilFirst, pickProverbs} from './prank.js';
import {hasCode} from './unlockCode.js';

const FADE_IN_MS = 1400;
const FADE_OUT_MS = 350;
const WORD_OUT_MS = 900;
const WORD_IN_MS = 1500;
const FRAME_MS = 33;
const MOTION_THRESHOLD = 3;
const MOTION_GRACE_MS = 400;

const DAYS = ['niedziela', 'poniedziałek', 'wtorek', 'środa', 'czwartek', 'piątek', 'sobota'];
const MONTHS = ['stycznia', 'lutego', 'marca', 'kwietnia', 'maja', 'czerwca',
    'lipca', 'sierpnia', 'września', 'października', 'listopada', 'grudnia'];

function polishDate(now, withTime = true) {
    const dt = now ?? GLib.DateTime.new_now_local();
    const day = DAYS[dt.get_day_of_week() % 7];
    const month = MONTHS[dt.get_month() - 1];
    const date = `${day}, ${dt.get_day_of_month()} ${month}`;
    return withTime ? `${date} · ${dt.format('%H:%M')}` : date;
}

const CLOCK_SIZES = {small: 0.075, medium: 0.11, large: 0.16, huge: 0.22};
const CLOCK_MARGIN = 0.06;
const CLOCK_TOP = 0.08;
const HEART_GAP = 0.02;
const DEF_MIN = 0.02;
const DEF_STEP = 0.92;
const CLOCK_FADE_MS = 700;
const CLOCK_MOVE_MS = 320;
const CLOCK_SAMPLES = [...'0123456789'].map(d => `${d}${d}:${d}${d}`);
const CLOCK_SCALES = [1, 0.85, 0.72, 0.6, 0.5, 0.42, 0.35];
const NEON_GLOW = {
    aurora: 'rgba(110, 255, 190, 0.95)',
    ocean: 'rgba(90, 200, 255, 0.95)',
    lublin: 'rgba(230, 30, 41, 0.95)',
    wroclove: 'rgba(200, 16, 46, 0.85)',
};

function clockTime(now) {
    return (now ?? GLib.DateTime.new_now_local()).format('%H:%M');
}

function isFree(r, rects, m) {
    return rects.every(o => r.x + r.w + m <= o.x || o.x + o.w + m <= r.x ||
        r.y + r.h + m <= o.y || o.y + o.h + m <= r.y);
}

function cssFamily(family, generic = 'serif') {
    const clean = String(family || generic).replace(/["';{}]/g, '').trim() || generic;
    return ['serif', 'sans-serif', 'cursive'].includes(clean) ? clean : `"${clean}", ${generic}`;
}

class MonitorView {
    constructor(monitor, styleName, fonts, clock = null) {
        this.monitor = monitor;
        this._styleName = styleName;
        const scale = St.ThemeContext.get_for_stage(global.stage).scale_factor;
        this._cssW = monitor.width / scale;
        this._cssH = monitor.height / scale;
        const style = getStyle(styleName);
        this._style = style;
        this._wordFamily = cssFamily(fonts.word, style.wordGeneric ?? 'serif');
        this._family = cssFamily(fonts.text, style.textGeneric ?? 'serif');

        this.actor = new St.Widget({
            layout_manager: new Clutter.BinLayout(),
            x: monitor.x,
            y: monitor.y,
            width: monitor.width,
            height: monitor.height,
            clip_to_allocation: true,
            style_class: `wyraz-monitor ${style.cssClass}`,
        });

        this._bg = createBackground(styleName, monitor);
        this.actor.add_child(this._bg.actor);

        this._clockCfg = clock;
        this._clock = null;
        this._pendingQ = -1;
        if (clock) {
            const region = new St.Widget({x_expand: true, y_expand: true});
            const cls = `wyraz-clock wyraz-clock-${clock.style}`;
            this._clock = new St.Label({style_class: cls, opacity: 0, text: clockTime()});
            this._clockProbe = new St.Label({style_class: cls, opacity: 0, text: clockTime()});
            for (const l of [this._clock, this._clockProbe]) {
                l.clutter_text.ellipsize = Pango.EllipsizeMode.NONE;
                region.add_child(l);
            }
            this.actor.add_child(region);
            this._clockOpacity = Math.round(255 * (1 - clock.transparency / 100));
            this._clockBox = null;
            this._runScale = 0;
            this._clockShown = false;
            this._clockWaiting = false;
            this._clockMoveId = 0;
            this._heartQ = -1;
            this._reserve = new Map();
        }

        this._blur = null;
        try {
            this._blur = new Shell.BlurEffect({
                name: 'wyraz-blur',
                mode: Shell.BlurMode.ACTOR,
                radius: 0,
                brightness: 1.0,
            });
            this.actor.add_effect(this._blur);
        } catch (e) {
            console.warn(`[Wyraz] Rozmycie niedostępne: ${e.message}`);
        }

        this._anchor = new St.Bin({
            x_expand: true,
            y_expand: true,
            x_align: Clutter.ActorAlign.CENTER,
            y_align: Clutter.ActorAlign.CENTER,
        });

        this._quadMode = typeof this._bg.textQuadrant === 'function';
        if (this._quadMode) {
            this._qw = Math.floor(monitor.width / 2);
            this._qh = Math.floor(monitor.height / 2);
            const region = new St.Widget({x_expand: true, y_expand: true});
            this._quadBox = new St.Widget({
                layout_manager: new Clutter.BinLayout(),
                width: this._qw,
                height: this._qh,
                opacity: 0,
            });
            region.add_child(this._quadBox);
            this.actor.add_child(region);
            this._anchor.style = `margin-bottom: ${Math.round(this._cssH * 0.04)}px;`;
            this._quadBox.add_child(this._anchor);
            this._textQ = -1;
        } else {
            this.actor.add_child(this._anchor);
        }

        this._content = new St.BoxLayout({
            orientation: Clutter.Orientation.VERTICAL,
            x_align: Clutter.ActorAlign.CENTER,
            y_align: Clutter.ActorAlign.CENTER,
            style_class: 'wyraz-content',
            pivot_point: new Graphene.Point({x: 0.5, y: 0.5}),
        });
        this._anchor.set_child(this._content);

        const H = this._cssH;
        this._word = new St.Label({
            style_class: 'wyraz-word',
            x_align: Clutter.ActorAlign.CENTER,
        });
        this._word.clutter_text.ellipsize = Pango.EllipsizeMode.NONE;
        this._rule = new St.Widget({
            style_class: 'wyraz-rule',
            x_align: Clutter.ActorAlign.CENTER,
            style: `width: ${Math.round(H * 0.12)}px;` +
                `margin-top: ${Math.round(H * 0.02)}px; margin-bottom: ${Math.round(H * 0.032)}px;`,
            pivot_point: new Graphene.Point({x: 0.5, y: 0.5}),
        });
        this._definition = new St.Label({
            style_class: 'wyraz-definition',
            x_align: Clutter.ActorAlign.CENTER,
            width: this._quadMode
                ? Math.round(this._qw * 0.84)
                : Math.round(monitor.width * (style.defWidth ?? 0.64)),
        });
        const ct = this._definition.clutter_text;
        ct.line_wrap = true;
        ct.line_wrap_mode = Pango.WrapMode.WORD_CHAR;
        ct.ellipsize = Pango.EllipsizeMode.NONE;
        ct.line_alignment = Pango.Alignment.CENTER;

        this._credit = new St.Label({
            style_class: 'wyraz-credit',
            x_align: Clutter.ActorAlign.CENTER,
            style: `font-family: ${this._family}; font-size: ${Math.round(H * 0.013)}px;` +
                `margin-top: ${Math.round(H * 0.03)}px;`,
            visible: false,
        });

        for (const a of [this._word, this._rule, this._definition, this._credit]) {
            a.opacity = 0;
            this._content.add_child(a);
        }

        this._footer = new St.Label({
            style_class: 'wyraz-footer',
            x_expand: true,
            y_expand: true,
            x_align: Clutter.ActorAlign.CENTER,
            y_align: Clutter.ActorAlign.END,
            style: `font-family: ${this._family}; font-size: ${Math.round(H * 0.016)}px;` +
                `margin-bottom: ${Math.round(H * (this._quadMode ? 0.025 : 0.045))}px;`,
            text: polishDate(null, !clock),
        });
        this._footer.clutter_text.ellipsize = Pango.EllipsizeMode.NONE;
        this._credit.clutter_text.ellipsize = Pango.EllipsizeMode.NONE;
        if (this._quadMode) {
            this._quadBox.add_child(this._footer);
        } else {
            this.actor.add_child(this._footer);
        }
    }

    setTime(seconds) {
        this._time = seconds;
        this._bg?.setTime(seconds);
        if (this._quadMode && this._bg) {
            this._followRed(this._bg.textQuadrant(seconds));
            const hq = this._bg.clockQuadrant?.() ?? this._bg.heartQuadrant ?? -1;
            if (hq !== this._heartQ) {
                this._heartQ = hq;
                if (this._clockCfg?.position === 'special')
                    this._safeLayoutClock(false);
            }
        }
    }

    _placeQuad(q) {
        this._quadBox.set_position((q % 2) * this._qw, Math.floor(q / 2) * this._qh);
        this._pendingQ = -1;
        this._safeLayoutClock(false);
    }

    _expectQuad(q) {
        this._pendingQ = q;
        this._safeLayoutClock(false);
    }

    _clockPx(scale) {
        return Math.max(12, Math.round(this._cssH * CLOCK_SIZES[this._clockCfg.size] * scale));
    }

    _styleClock(label, scale) {
        const px = this._clockPx(scale);
        let style = `font-size: ${px}px;`;
        if (this._clockCfg.style === 'neon') {
            const glow = NEON_GLOW[this._styleName] ?? NEON_GLOW.aurora;
            style += ` text-shadow: 0 0 ${Math.max(4, Math.round(px * 0.12))}px ${glow};`;
        }
        if (label.style !== style)
            label.style = style;
        label.ensure_style();
        const [ink] = label.clutter_text.get_layout().get_pixel_extents();
        return {x: ink.x, y: ink.y, w: ink.width, h: ink.height};
    }

    _clockReserve(scale) {
        let r = this._reserve.get(scale);
        if (!r) {
            let w = 0, top = Infinity, bottom = -Infinity;
            for (const t of CLOCK_SAMPLES) {
                this._clockProbe.text = t;
                const ink = this._styleClock(this._clockProbe, scale);
                w = Math.max(w, ink.w);
                top = Math.min(top, ink.y);
                bottom = Math.max(bottom, ink.y + ink.h);
            }
            r = {w, h: bottom - top};
            this._reserve.set(scale, r);
        }
        return r;
    }

    _footerRect() {
        const [, fw] = this._footer.get_preferred_width(-1);
        const [, fh] = this._footer.get_preferred_height(fw);
        return {x: (this.monitor.width - fw) / 2, y: this.monitor.height - fh, w: fw, h: fh};
    }

    _occupied() {
        const qs = new Set();
        const cur = this._textQ >= 0 ? this._textQ : this._bg?.textQuadrant?.(this._time ?? 0);
        if (cur >= 0)
            qs.add(cur);
        if (this._pendingQ >= 0)
            qs.add(this._pendingQ);
        return [...qs].map(q => this._quadRect(q));
    }

    _quadRect(q) {
        return {x: (q % 2) * this._qw, y: Math.floor(q / 2) * this._qh, w: this._qw, h: this._qh};
    }

    _textAllocated() {
        return [this._content, this._word, this._definition].every(a => a.has_allocation()) &&
            this._word.clutter_text.has_allocation() && this._definition.clutter_text.has_allocation();
    }

    _textInk() {
        const allocated = this._textAllocated();
        let cw, ch;
        if (allocated) {
            const box = this._content.get_allocation_box();
            cw = box.x2 - box.x1;
            ch = box.y2 - box.y1;
        } else {
            [, cw] = this._content.get_preferred_width(-1);
            [, ch] = this._content.get_preferred_height(cw);
        }
        let x1 = Infinity, y1 = Infinity, x2 = -Infinity, y2 = -Infinity;
        const add = (x, y, w, h) => {
            if (!(w > 0 && h > 0))
                return;
            x1 = Math.min(x1, x);
            y1 = Math.min(y1, y);
            x2 = Math.max(x2, x + w);
            y2 = Math.max(y2, y + h);
        };
        if (allocated) {
            for (const child of [this._word, this._rule, this._definition, this._credit]) {
                if (!child.visible || !child.has_allocation())
                    continue;
                const b = child.get_allocation_box();
                if (child === this._rule) {
                    add(b.x1, b.y1, b.x2 - b.x1, b.y2 - b.y1);
                    continue;
                }
                const ct = child.clutter_text;
                const cb = ct.get_allocation_box();
                const [ink] = ct.get_layout().get_pixel_extents();
                add(b.x1 + cb.x1 + ink.x, b.y1 + cb.y1 + ink.y, ink.width, ink.height);
            }
        } else {
            let y = 0;
            for (const child of [this._word, this._rule, this._definition, this._credit]) {
                if (!child.visible)
                    continue;
                const [, nw] = child.get_preferred_width(-1);
                const w = Math.min(nw, cw);
                const [, nh] = child.get_preferred_height(w);
                add((cw - w) / 2, y, w, nh);
                y += nh;
            }
        }
        if (x1 === Infinity)
            return {x: 0, y: 0, w: cw, h: ch, cw, ch};
        return {x: x1, y: y1, w: x2 - x1, h: y2 - y1, cw, ch};
    }

    _textRect(ink, s, tx, ty) {
        const cx = this.monitor.width / 2 + tx, cy = this.monitor.height / 2 + ty;
        return {
            x: cx + (ink.x - ink.cw / 2) * s,
            y: cy + (ink.y - ink.ch / 2) * s,
            w: ink.w * s,
            h: ink.h * s,
        };
    }

    _fitText(ink, C, m) {
        const W = this.monitor.width;
        const f = this._footerRect();
        const tx = this._anchor.translation_x, ty = this._anchor.translation_y;
        const eps = 0.5;
        const inside = r => r.x >= m - eps && r.x + r.w <= W - m + eps &&
            r.y >= m - eps && r.y + r.h <= f.y - m + eps;
        const t = this._textRect(ink, 1, tx, ty);
        if (isFree(t, [C], m - eps))
            return {dx: 0, dy: 0};
        const moves = [
            {dx: 0, dy: C.y + C.h + m - t.y},
            {dx: 0, dy: C.y - m - (t.y + t.h)},
            {dx: C.x + C.w + m - t.x, dy: 0},
            {dx: C.x - m - (t.x + t.w), dy: 0},
        ].filter(mv => {
            const r = {x: t.x + mv.dx, y: t.y + mv.dy, w: t.w, h: t.h};
            return inside(r) && isFree(r, [C], m - eps);
        }).sort((a, b) => Math.abs(a.dx) + Math.abs(a.dy) - Math.abs(b.dx) - Math.abs(b.dy));
        return moves[0] ?? null;
    }

    _applyTextFit({dx, dy}) {
        this._anchor.translation_x += Math.sign(dx) * Math.ceil(Math.abs(dx));
        this._anchor.translation_y += Math.sign(dy) * Math.ceil(Math.abs(dy));
    }

    _specialRect(res, m) {
        const W = this.monitor.width, H = this.monitor.height;
        if (this._quadMode) {
            const cq = this._bg?.clockQuadrant?.() ?? this._bg?.heartQuadrant ?? -1;
            const q = cq >= 0 ? cq : 3 - Math.max(0, this._textQ);
            const col = q % 2, row = Math.floor(q / 2);
            return {x: col * this._qw + (this._qw - res.w) / 2, y: row * this._qh + (this._qh - res.h) / 2,
                w: res.w, h: res.h, ax: 0.5, ay: 0.5};
        }
        if (this._styleName === 'ocean') {
            return {x: (W - res.w) / 2, y: Math.round(H * CLOCK_TOP), w: res.w, h: res.h, ax: 0.5, ay: 0};
        }
        return {x: (W - res.w) / 2, y: H - res.h, w: res.w, h: res.h, ax: 0.5, ay: 1};
    }

    _fallbackRect(res, m) {
        const W = this.monitor.width, H = this.monitor.height;
        if (this._styleName === 'ocean')
            return {x: (W - res.w) / 2, y: Math.round(H * CLOCK_TOP), w: res.w, h: res.h, ax: 0.5, ay: 0};
        const f = this._footerRect();
        return {x: (W - res.w) / 2, y: f.y - m - res.h, w: res.w, h: res.h, ax: 0.5, ay: 1};
    }

    _randomRect(res, m, obstacles) {
        const W = this.monitor.width, H = this.monitor.height;
        const step = Math.max(8, Math.round(m / 2));
        const free = [];
        for (let y = m; y <= H - m - res.h + 0.5; y += step) {
            for (let x = m; x <= W - m - res.w + 0.5; x += step) {
                const r = {x, y, w: res.w, h: res.h, ax: 0, ay: 0};
                if (isFree(r, obstacles, m))
                    free.push(r);
            }
        }
        if (!free.length)
            return null;
        const prev = this._clockBox?.rect;
        let pool = free;
        if (prev) {
            const far = free.filter(r => Math.hypot(r.x - prev.x, r.y - prev.y) > W * 0.2);
            if (far.length)
                pool = far;
        }
        return pool[Math.floor(Math.random() * pool.length)];
    }

    _safeLayoutClock(fresh) {
        try {
            this._layoutClock(fresh);
        } catch (e) {
            if (!this._clockError)
                console.error(`[Wyraz] Zegar: ${e.message}\n${e.stack}`);
            this._clockError = true;
        }
    }

    _layoutClock(fresh) {
        if (!this._clock || !this._content)
            return;
        if (this._clockWaiting && !fresh)
            return;
        this._clockWaiting = false;
        const m = Math.round(this.monitor.height * CLOCK_MARGIN);
        const random = this._clockCfg.position === 'random';
        let box = null;

        if (this._clockCfg.position === 'custom') {
            const res = this._clockReserve(1);
            const W = this.monitor.width, H = this.monitor.height;
            const ax = Math.min(100, Math.max(0, this._clockCfg.x ?? 50)) / 100;
            const ay = Math.min(100, Math.max(0, this._clockCfg.y ?? 50)) / 100;
            this._moveClock({
                rect: {x: ax * (W - res.w), y: ay * (H - res.h), w: res.w, h: res.h, ax, ay},
                scale: 1,
                how: 'custom',
            });
            return;
        }

        if (!random) {
            const res = this._clockReserve(1);
            this._moveClock({rect: this._specialRect(res, m), scale: 1, how: 'special'});
            return;
        }

        const scales = this._runScale ? [this._runScale] : CLOCK_SCALES;

        if (this._quadMode) {
            const taken = this._occupied();
            if (random && !fresh && this._clockBox && isFree(this._clockBox.rect, taken, m))
                box = this._clockBox;
            for (const scale of scales) {
                if (box)
                    break;
                const res = this._clockReserve(scale);
                const rect = random ? this._randomRect(res, m, taken) : this._specialRect(res, m);
                if (rect)
                    box = {rect, scale, how: random ? 'random' : 'special'};
            }
        } else {
            const ink = this._textInk();
            const text = this._textRect(ink, 1, this._anchor.translation_x, this._anchor.translation_y);
            const footer = this._footerRect();
            const attempts = random
                ? scales.flatMap(sc => [['random', sc], ['special', sc]])
                : scales.map(sc => ['special', sc]);
            for (const [how, scale] of attempts) {
                const res = this._clockReserve(scale);
                if (how === 'random') {
                    const rect = this._randomRect(res, m, [text, footer]);
                    if (rect) {
                        box = {rect, scale, how};
                        break;
                    }
                } else {
                    let rect = this._fallbackRect(res, m);
                    let fit = rect ? this._fitText(ink, rect, m) : null;
                    if (!fit && rect && this._styleName === 'ocean') {
                        rect = {...rect, y: m};
                        fit = this._fitText(ink, rect, m);
                    }
                    if (fit) {
                        this._applyTextFit(fit);
                        box = {rect, scale, how};
                        break;
                    }
                }
            }
        }
        if (box && !this._runScale)
            this._runScale = box.scale;
        this._moveClock(box);
    }

    _alignClock() {
        const box = this._clockBox;
        if (!box || !this._clock)
            return;
        const ink = this._styleClock(this._clock, box.scale);
        const {rect} = box;
        const y = rect.y + rect.ay * (rect.h - ink.h);
        let lx;
        if (rect.ax === 0.5) {
            const [, natW] = this._clock.get_preferred_width(-1);
            lx = rect.x + rect.w / 2 - natW / 2;
        } else {
            lx = rect.x + rect.ax * (rect.w - ink.w) - ink.x;
        }
        this._clock.set_position(Math.round(lx), Math.round(y - ink.y));
    }

    _fadeClock(opacity, delay = 0, duration = CLOCK_FADE_MS) {
        this._clockShown = opacity > 0;
        this._clock.remove_transition('opacity');
        this._clock.ease({
            opacity,
            delay,
            duration,
            mode: Clutter.AnimationMode.EASE_OUT_QUAD,
        });
    }

    _cancelClockMove() {
        if (this._clockMoveId) {
            GLib.source_remove(this._clockMoveId);
            this._clockMoveId = 0;
        }
    }

    _avoidHeart(rect) {
        if (!this._bg?.setHeartAvoid)
            return;
        const m = Math.round(this.monitor.height * HEART_GAP);
        this._bg.setHeartAvoid(rect
            ? {x: rect.x - m, y: rect.y - m, w: rect.w + 2 * m, h: rect.h + 2 * m}
            : null);
    }

    _moveClock(box) {
        this._cancelClockMove();
        if (!box) {
            this._clockBox = null;
            this._avoidHeart(null);
            this._fadeClock(0, 0, 300);
            return;
        }
        this._avoidHeart(box.rect);
        const old = this._clockBox;
        const same = old && old.scale === box.scale &&
            Math.abs(old.rect.x - box.rect.x) < 2 && Math.abs(old.rect.y - box.rect.y) < 2;
        const place = () => {
            this._clockBox = box;
            this._alignClock();
            this._fadeClock(this._clockOpacity, 250);
        };
        if (same && this._clockShown) {
            this._clockBox = box;
            this._alignClock();
            return;
        }
        if (!this._clockShown) {
            place();
            return;
        }
        this._fadeClock(0, 0, 300);
        this._clockMoveId = GLib.timeout_add(GLib.PRIORITY_DEFAULT, CLOCK_MOVE_MS, () => {
            this._clockMoveId = 0;
            if (this._clock)
                place();
            return GLib.SOURCE_REMOVE;
        });
    }

    _hideClock() {
        if (!this._clock)
            return;
        this._clockWaiting = true;
        this._cancelClockMove();
        if (this._clockShown)
            this._fadeClock(0, 0, 500);
    }

    _followRed(q) {
        if (q === this._textQ || this._moving)
            return;
        if (this._textQ < 0) {
            this._textQ = q;
            this._placeQuad(q);
            this._quadBox.ease({opacity: 255, duration: 600, mode: Clutter.AnimationMode.EASE_OUT_QUAD});
            return;
        }
        this._moving = true;
        this._expectQuad(q);
        this._quadBox.ease({
            opacity: 0,
            duration: 700,
            mode: Clutter.AnimationMode.EASE_IN_QUAD,
            onStopped: () => {
                if (!this._quadBox)
                    return;
                this._textQ = q;
                this._placeQuad(q);
                this._quadBox.ease({
                    opacity: 255,
                    duration: 1100,
                    mode: Clutter.AnimationMode.EASE_OUT_QUAD,
                    onStopped: () => {
                        this._moving = false;
                    },
                });
            },
        });
    }

    setBlur(on) {
        if (!this._blur)
            return;
        const scale = St.ThemeContext.get_for_stage(global.stage).scale_factor;
        this.actor.remove_transition('@effects.wyraz-blur.radius');
        this.actor.remove_transition('@effects.wyraz-blur.brightness');
        this.actor.ease_property('@effects.wyraz-blur.radius', on ? Math.round(64 * scale) : 0, {
            duration: on ? 350 : 450,
            mode: Clutter.AnimationMode.EASE_OUT_QUAD,
        });
        this.actor.ease_property('@effects.wyraz-blur.brightness', on ? 0.72 : 1.0, {
            duration: on ? 350 : 450,
            mode: Clutter.AnimationMode.EASE_OUT_QUAD,
        });
    }

    updateClock(footer, time) {
        if (this._footer.text !== footer)
            this._footer.text = footer;
        if (this._clock && this._clock.text !== time) {
            this._clock.text = time;
            try {
                this._alignClock();
            } catch (e) {
                console.error(`[Wyraz] Zegar: ${e.message}`);
            }
        }
    }

    _applyEntry(entry, index, total) {
        const H = this._cssH;
        const W = this._cssW;
        const word = entry.w;
        const {wordScale, charWidth} = this._style;
        const boxW = this._quadMode ? W / 2 : W;
        const maxPx = this._quadMode ? H * wordScale * 0.72 : H * wordScale;
        const wordPx = Math.max(24, Math.min(maxPx,
            (boxW * 0.86) / (Math.max(word.length, 4) * charWidth)));
        this._word.style = `font-family: ${this._wordFamily}; font-size: ${Math.round(wordPx)}px;`;
        this._word.text = word;

        const text = formatDefinition(entry.d, 3, 220);
        let defScale = 0.034;
        if (text.length > 450)
            defScale = 0.022;
        else if (text.length > 300)
            defScale = 0.025;
        else if (text.length > 160)
            defScale = 0.029;
        if (this._quadMode)
            defScale *= 0.82;
        this._setDefinitionPx(Math.round(H * defScale));
        this._definition.text = text;

        this._credit.text = PRANK_CREDIT;
        this._credit.visible = Boolean(entry.prank);

        const m = this.monitor;
        const drift = this._quadMode ? 0.4 : 1;
        this._anchor.translation_x = Math.round((Math.random() - 0.5) * 0.05 * drift * m.width);
        this._anchor.translation_y = Math.round((Math.random() - 0.5) * 0.04 * drift * m.height);

        if (this._quadMode) {
            this._content.set_scale(1, 1);
            this._shrinkDefinition(this._qh * 0.8);
            const [, natH] = this._content.get_preferred_height(-1);
            const [, natW] = this._content.get_preferred_width(-1);
            const fit = Math.min(1, this._qh * 0.8 / Math.max(natH, 1),
                this._qw * 0.9 / Math.max(natW, 1));
            this._content.set_scale(fit, fit);
        } else {
            this._content.set_scale(1, 1);
        }

        if (this._quadMode)
            this._safeLayoutClock(true);
        else
            this._scheduleLayout();
    }

    _setDefinitionPx(px) {
        this._defPx = px;
        this._definition.style = `font-family: ${this._family}; font-size: ${px}px;`;
    }

    _shrinkDefinition(maxH) {
        const min = Math.round(this._cssH * DEF_MIN);
        const start = this._defPx;
        let [, cw] = this._content.get_preferred_width(-1);
        let [, ch] = this._content.get_preferred_height(cw);
        while (ch > maxH && this._defPx > min) {
            this._setDefinitionPx(Math.max(min, Math.floor(this._defPx * DEF_STEP)));
            [, cw] = this._content.get_preferred_width(-1);
            [, ch] = this._content.get_preferred_height(cw);
        }
        return this._defPx !== start;
    }

    _scheduleLayout() {
        if (!this._clock)
            return;
        if (this._layoutId)
            GLib.source_remove(this._layoutId);
        let tries = 0;
        this._layoutId = GLib.timeout_add(GLib.PRIORITY_DEFAULT, 40, () => {
            if (!this._content) {
                this._layoutId = 0;
                return GLib.SOURCE_REMOVE;
            }
            if (!this._textAllocated() && ++tries < 8)
                return GLib.SOURCE_CONTINUE;
            this._layoutId = 0;
            this._safeLayoutClock(true);
            return GLib.SOURCE_REMOVE;
        });
        GLib.Source.set_name_by_id(this._layoutId, '[wyraz] clock layout');
    }

    present(entry, index, total, first, interval = 30) {
        const lift = Math.round(this.monitor.height * 0.022);
        let moveTo = -1;
        if (this._quadMode && this._bg?.nextWord) {
            this._bg.nextWord(interval);
            const q = this._bg.textQuadrant(this._time ?? 0);
            if (!first && !this._moving && this._textQ >= 0 && q !== this._textQ)
                moveTo = q;
        }
        const showNew = () => {
            if (!this._content)
                return;
            this._applyEntry(entry, index, total);
            this._content.opacity = 255;
            this._content.translation_y = 0;

            this._credit.opacity = 0;
            if (entry.prank) {
                this._credit.ease({
                    opacity: 200,
                    delay: first ? 1700 : 1200,
                    duration: WORD_IN_MS,
                    mode: Clutter.AnimationMode.EASE_OUT_QUAD,
                });
            }

            this._word.opacity = 0;
            this._word.translation_y = lift;
            this._word.ease({
                opacity: 255,
                translation_y: 0,
                delay: first ? 700 : 200,
                duration: WORD_IN_MS,
                mode: Clutter.AnimationMode.EASE_OUT_CUBIC,
            });

            this._rule.opacity = 0;
            this._rule.scale_x = 0;
            this._rule.ease({
                opacity: 255,
                scale_x: 1,
                delay: first ? 1000 : 500,
                duration: 1200,
                mode: Clutter.AnimationMode.EASE_IN_OUT_SINE,
            });

            this._definition.opacity = 0;
            this._definition.translation_y = Math.round(lift * 0.6);
            this._definition.ease({
                opacity: 235,
                translation_y: 0,
                delay: first ? 1250 : 750,
                duration: WORD_IN_MS,
                mode: Clutter.AnimationMode.EASE_OUT_CUBIC,
            });
        };

        if (first) {
            showNew();
            return;
        }
        if (this._clockCfg?.position === 'random')
            this._hideClock();
        if (moveTo >= 0) {
            this._moving = true;
            this._expectQuad(moveTo);
            this._quadBox.ease({
                opacity: 0,
                duration: WORD_OUT_MS,
                mode: Clutter.AnimationMode.EASE_IN_QUAD,
                onStopped: () => {
                    if (!this._quadBox)
                        return;
                    this._textQ = moveTo;
                    this._placeQuad(moveTo);
                    showNew();
                    this._quadBox.ease({
                        opacity: 255,
                        duration: 400,
                        mode: Clutter.AnimationMode.EASE_OUT_QUAD,
                        onStopped: () => {
                            this._moving = false;
                        },
                    });
                },
            });
            return;
        }
        this._content.ease({
            opacity: 0,
            translation_y: -lift,
            duration: WORD_OUT_MS,
            mode: Clutter.AnimationMode.EASE_IN_QUAD,
            onStopped: () => showNew(),
        });
    }

    destroy() {
        if (this._layoutId) {
            GLib.source_remove(this._layoutId);
            this._layoutId = 0;
        }
        if (this._clock)
            this._cancelClockMove();
        this._content = null;
        this._quadBox = null;
        this._clock = null;
        this._bg?.destroy();
        this._bg = null;
        this.actor.destroy();
    }
}

export class Screensaver {
    constructor({settings, store}) {
        this._settings = settings;
        this._store = store;
        this._root = null;
        this._views = [];
        this._grab = null;
        this._cursorHidden = false;
        this._frameId = 0;
        this._advanceId = 0;
        this._clockId = 0;
        this._activeWatchId = 0;
        this._showToken = 0;
        this._idleMonitor = global.backend.get_core_idle_monitor();
        this._cursorTracker = global.backend.get_cursor_tracker();
        this._prompt = null;
        this._current = null;
        this._fading = new Set();
        this.codeRequired = false;
        this._codeGuard = {fails: 0, lockedUntil: 0};

        this._settings.connectObject(
            'changed::unlock-code-enabled', () => this._syncCode(),
            'changed::unlock-code', () => this._syncCode(),
            this);
    }

    get visible() {
        return this._root !== null;
    }

    _counts() {
        return {
            pl: this._settings.get_int('words-per-day'),
            en: this._settings.get_int('words-per-day-en'),
        };
    }

    _wantsCode() {
        return this._settings.get_boolean('unlock-code-enabled') &&
            hasCode(this._settings.get_string('unlock-code')) &&
            !Main.sessionMode.isLocked;
    }

    _syncCode() {
        if (!this._root || !this.codeRequired)
            return;
        if (!this._wantsCode()) {
            this.codeRequired = false;
            this._prompt?.hide();
        }
    }

    async show() {
        if (this._root)
            return;
        const token = ++this._showToken;
        const count = this._counts();

        let item = null;
        try {
            item = await this._store.next(count);
        } catch (e) {
            console.error(`[Wyraz] Nie udało się przygotować haseł: ${e.message}`);
        }
        if (token !== this._showToken || this._root)
            return;
        if (!item)
            return;

        this.codeRequired = this._wantsCode();
        this._current = item;
        this._prank = isAprilFirst(GLib.DateTime.new_now_local()) ? pickProverbs(3) : [];
        this._advances = 0;
        try {
            this._build();
            if (!this._startInput()) {
                console.warn('[Wyraz] Nie udało się przechwycić wejścia, pomijam wygaszacz');
                this.hide(true);
                return;
            }
        } catch (e) {
            console.error(`[Wyraz] Błąd przy uruchamianiu wygaszacza: ${e.message}`);
            this.hide(true);
            return;
        }

        this._startUs = GLib.get_monotonic_time();
        this._frameId = GLib.timeout_add(GLib.PRIORITY_DEFAULT, FRAME_MS, () => {
            const t = (GLib.get_monotonic_time() - this._startUs) / 1e6;
            try {
                for (const v of this._views)
                    v.setTime(t);
            } catch (e) {
                if (!this._frameError)
                    console.error(`[Wyraz] Animacja: ${e.message}`);
                this._frameError = true;
            }
            return GLib.SOURCE_CONTINUE;
        });
        GLib.Source.set_name_by_id(this._frameId, '[wyraz] frame');

        this._clockId = GLib.timeout_add_seconds(GLib.PRIORITY_DEFAULT, 1, () => {
            const now = GLib.DateTime.new_now_local();
            const footer = polishDate(now, !this._clockOn);
            const time = clockTime(now);
            try {
                for (const v of this._views)
                    v.updateClock(footer, time);
            } catch (e) {
                console.error(`[Wyraz] Zegar: ${e.message}`);
            }
            return GLib.SOURCE_CONTINUE;
        });
        GLib.Source.set_name_by_id(this._clockId, '[wyraz] clock');

        this._root.ease({
            opacity: 255,
            duration: FADE_IN_MS,
            mode: Clutter.AnimationMode.EASE_OUT_QUAD,
        });
        try {
            this._present(item, true);
        } catch (e) {
            console.error(`[Wyraz] Pierwsze hasło: ${e.message}\n${e.stack}`);
        }

        const interval = Math.max(5, this._settings.get_int('change-interval'));
        this._advanceId = GLib.timeout_add_seconds(GLib.PRIORITY_DEFAULT, interval, () => {
            this._advance();
            return GLib.SOURCE_CONTINUE;
        });
        GLib.Source.set_name_by_id(this._advanceId, '[wyraz] advance');
    }

    _build() {
        this._root = new St.Widget({
            name: 'wyrazScreensaver',
            reactive: true,
            can_focus: true,
            x: 0,
            y: 0,
            width: global.stage.width,
            height: global.stage.height,
            opacity: 0,
            style: 'background-color: #000;',
        });
        Main.layoutManager.addTopChrome(this._root);
        Main.uiGroup.set_child_above_sibling(this._root, null);
        this._buildViews();
    }

    _buildViews() {
        const styleName = this._settings.get_string('background-style');
        const style = getStyle(styleName);
        const userFont = this._settings.get_string('font-family');
        const fonts = {
            word: style.wordFont === 'renaissance'
                ? this._settings.get_string('renaissance-font')
                : style.wordFont ?? userFont,
            text: style.textFont === 'wroclove'
                ? this._settings.get_string('wroclove-text-font')
                : style.textFont ?? userFont,
        };

        const clock = this._settings.get_boolean('clock-enabled') ? {
            transparency: this._settings.get_int('clock-transparency'),
            size: this._settings.get_string('clock-size'),
            position: this._settings.get_string('clock-position'),
            x: this._settings.get_int('clock-x'),
            y: this._settings.get_int('clock-y'),
            style: this._settings.get_string('clock-style'),
        } : null;
        this._clockOn = clock !== null;

        for (const monitor of Main.layoutManager.monitors) {
            const view = new MonitorView(monitor, styleName, fonts, clock);
            this._root.add_child(view.actor);
            this._views.push(view);
        }

        const primary = Main.layoutManager.primaryMonitor ?? Main.layoutManager.monitors[0];
        const generic = style.textGeneric ?? 'serif';
        this._prompt = new CodePrompt({
            parent: this._root,
            monitor: primary,
            family: cssFamily(fonts.text, generic),
            styleClass: `wyraz-code ${style.cssClass}`,
            guard: this._codeGuard,
            getStored: () => this._settings.get_string('unlock-code'),
            onSuccess: () => this.hide(),
            onShown: () => this._views.forEach(v => v.setBlur(true)),
            onHidden: () => {
                this._views.forEach(v => v.setBlur(false));
                this._armActiveWatch();
            },
        });
    }

    _destroyViews() {
        this._prompt?.destroy();
        this._prompt = null;
        for (const v of this._views)
            v.destroy();
        this._views = [];
    }

    rebuild() {
        if (!this._root)
            return;
        this._destroyViews();
        this._root.set_size(global.stage.width, global.stage.height);
        this._buildViews();
        if (this._current)
            this._present(this._current, true);
        this._armActiveWatch();
    }

    _startInput() {
        const [px, py] = global.get_pointer();
        this._pointerStart = [px, py];
        this._shownAt = GLib.get_monotonic_time();

        this._grab = Main.pushModal(this._root, {actionMode: Shell.ActionMode.NONE});
        this._root.connect('captured-event', (_actor, event) => {
            try {
                return this._onEvent(event);
            } catch (e) {
                console.error(`[Wyraz] ${e.message}`);
                this.hide(true);
                return Clutter.EVENT_STOP;
            }
        });
        const grab = this._grab;
        if (!grab || grab.is_revoked?.())
            return false;
        if (typeof grab.get_seat_state === 'function' && Clutter.GrabState &&
            (grab.get_seat_state() & Clutter.GrabState.KEYBOARD) === 0)
            return false;
        this._root.grab_key_focus();

        this._cursorTracker.inhibit_cursor_visibility();
        this._cursorHidden = true;

        this._armActiveWatch();
        return true;
    }

    _armActiveWatch() {
        if (!this._root || this._activeWatchId)
            return;
        this._activeWatchId = this._idleMonitor.add_user_active_watch(() => {
            this._activeWatchId = 0;
            if (this.codeRequired)
                this._prompt?.show();
            else
                this.hide();
        });
    }

    _onEvent(event) {
        if (this.codeRequired)
            return this._onCodeEvent(event);

        switch (event.type()) {
        case Clutter.EventType.KEY_PRESS:
        case Clutter.EventType.BUTTON_PRESS:
        case Clutter.EventType.SCROLL:
        case Clutter.EventType.TOUCH_BEGIN:
        case Clutter.EventType.TOUCHPAD_SWIPE:
        case Clutter.EventType.TOUCHPAD_PINCH:
        case Clutter.EventType.PAD_BUTTON_PRESS:
            this.hide();
            break;
        case Clutter.EventType.MOTION:
            if (this._movedEnough(event))
                this.hide();
            break;
        default:
            break;
        }
        return Clutter.EVENT_STOP;
    }

    _onCodeEvent(event) {
        switch (event.type()) {
        case Clutter.EventType.KEY_PRESS:
            this._prompt?.handleKey(event);
            break;
        case Clutter.EventType.BUTTON_PRESS:
        case Clutter.EventType.SCROLL:
        case Clutter.EventType.TOUCH_BEGIN:
        case Clutter.EventType.TOUCHPAD_SWIPE:
        case Clutter.EventType.TOUCHPAD_PINCH:
        case Clutter.EventType.PAD_BUTTON_PRESS:
            this._prompt?.show();
            break;
        case Clutter.EventType.MOTION:
            if (this._movedEnough(event))
                this._prompt?.show();
            break;
        default:
            break;
        }
        return Clutter.EVENT_STOP;
    }

    _movedEnough(event) {
        if (GLib.get_monotonic_time() - this._shownAt < MOTION_GRACE_MS * 1000)
            return false;
        const [x, y] = event.get_coords();
        const [sx, sy] = this._pointerStart;
        return Math.abs(x - sx) > MOTION_THRESHOLD || Math.abs(y - sy) > MOTION_THRESHOLD;
    }

    async _advance() {
        if (!this._root)
            return;
        const token = this._showToken;
        this._advances = (this._advances ?? 0) + 1;
        if (this._prank?.length && this._advances % 2 === 0) {
            const p = this._prank.shift();
            this._current = {entry: {w: p.text, d: [p.meaning], prank: true}, index: 0, total: 1};
            this._present(this._current, false);
            return;
        }
        let item = null;
        try {
            item = await this._store.next(this._counts());
        } catch (e) {
            console.error(`[Wyraz] ${e.message}`);
        }
        if (item && this._root && token === this._showToken) {
            this._current = item;
            this._present(item, false);
        }
    }

    _present(item, first) {
        const interval = Math.max(5, this._settings.get_int('change-interval'));
        for (const v of this._views)
            v.present(item.entry, item.index, item.total, first, interval);
    }

    hide(immediate = false) {
        this._showToken++;
        if (!this._root)
            return;

        for (const id of [this._frameId, this._advanceId, this._clockId]) {
            if (id)
                GLib.source_remove(id);
        }
        this._frameId = this._advanceId = this._clockId = 0;

        if (this._activeWatchId) {
            this._idleMonitor.remove_watch(this._activeWatchId);
            this._activeWatchId = 0;
        }

        if (this._grab) {
            try {
                Main.popModal(this._grab);
            } catch (e) {
                console.warn(`[Wyraz] popModal: ${e.message}`);
            }
            this._grab = null;
        }

        if (this._cursorHidden) {
            this._cursorTracker.uninhibit_cursor_visibility();
            this._cursorHidden = false;
        }

        const root = this._root;
        const views = this._views;
        const prompt = this._prompt;
        this._root = null;
        this._views = [];
        this._prompt = null;
        this._current = null;
        this.codeRequired = false;
        root.reactive = false;

        const finish = () => {
            if (!this._fading.delete(finish))
                return;
            prompt?.destroy();
            for (const v of views)
                v.destroy();
            root.destroy();
        };
        this._fading.add(finish);
        root.remove_all_transitions();
        if (immediate) {
            finish();
        } else {
            root.ease({
                opacity: 0,
                duration: FADE_OUT_MS,
                mode: Clutter.AnimationMode.EASE_OUT_QUAD,
                onStopped: finish,
            });
        }

        this._store.save().catch(() => {});
    }

    destroy() {
        this.hide(true);
        for (const finish of [...this._fading])
            finish();
        this._settings?.disconnectObject(this);
        this._store = null;
        this._settings = null;
    }
}
