import Clutter from 'gi://Clutter';
import GLib from 'gi://GLib';
import Graphene from 'gi://Graphene';
import St from 'gi://St';

import {DECK, NEON_REACH, drawNeonOutline, drawShape} from './lublinShapes.js';
import {Table} from './lublinPhysics.js';

const PAD = 2;
const TURN_MS = 700;

const GLOW_LIFE = 1.5;
const STRENGTH = {bounce: 1.0, stick: 0.9, pass: 0.65};

function neonAlpha(age, life) {
    if (age < 0 || age > life)
        return 0;
    let flicker = 1;
    if (age < 0.06)
        flicker = 0.9;
    else if (age < 0.10)
        flicker = 0.25;
    else if (age < 0.16)
        flicker = 1;
    else if (age < 0.19)
        flicker = 0.55;
    const x = Math.min(1, Math.max(0, (age - 0.2) / (life - 0.2)));
    return flicker * (1 - x * x * (3 - 2 * x));
}

export class LublinBackground {
    constructor(monitor) {
        this._lastUs = 0;
        this.actor = new St.Widget({
            x_expand: true,
            y_expand: true,
            clip_to_allocation: true,
            style: 'background-color: #000;',
        });

        const unit = monitor.height * 0.024;
        this._table = new Table({
            width: monitor.width,
            height: monitor.height,
            unit,
            deck: DECK,
        });

        this._sprites = this._table.bodies.map(body => {
            const scale = unit * body.shape.scale;
            const area = new St.DrawingArea({
                width: Math.ceil(body.w) + 2 * PAD,
                height: Math.ceil(body.h) + 2 * PAD,
                pivot_point: new Graphene.Point({x: 0.5, y: 0.5}),
                rotation_angle_z: body.angle,
            });
            area.connect('repaint', a => {
                const cr = a.get_context();
                try {
                    cr.translate(PAD, PAD);
                    cr.scale(scale, scale);
                    drawShape(cr, body.shape);
                } finally {
                    cr.$dispose();
                }
            });
            this.actor.add_child(area);
            return {body, area, angle: body.angle};
        });

        this._shade = new St.Widget({
            x_expand: true,
            y_expand: true,
            style: 'background-gradient-direction: radial;' +
                'background-gradient-start: rgba(0,0,0,0.78);' +
                'background-gradient-end: rgba(0,0,0,0);',
        });
        this._shade.set_size(monitor.width, monitor.height);
        this.actor.add_child(this._shade);

        for (const s of this._sprites) {
            const {body} = s;
            const scale = unit * body.shape.scale;
            const margin = Math.ceil(NEON_REACH * scale) + PAD;
            const glow = new St.DrawingArea({
                width: Math.ceil(body.w) + 2 * margin,
                height: Math.ceil(body.h) + 2 * margin,
                pivot_point: new Graphene.Point({x: 0.5, y: 0.5}),
                opacity: 0,
                visible: false,
            });
            glow.connect('repaint', a => {
                const cr = a.get_context();
                try {
                    cr.translate(margin, margin);
                    cr.scale(scale, scale);
                    drawNeonOutline(cr, body.shape);
                } finally {
                    cr.$dispose();
                }
            });
            this.actor.add_child(glow);
            s.glow = glow;
            s.glowStart = -1;
            s.glowStrength = 0;
        }

        this._now = 0;

        this._sync();

        this._timeline = null;
        this._timerId = 0;
        try {
            this._timeline = new Clutter.Timeline({
                actor: this.actor,
                duration: 1000,
                repeat_count: -1,
            });
            this._timeline.connect('new-frame', () => this._tick());
            this._timeline.start();
        } catch (e) {
            console.warn(`[Wyraz] Timeline niedostępny, używam zegara: ${e.message}`);
            this._timeline = null;
            this._timerId = GLib.timeout_add(GLib.PRIORITY_DEFAULT, 16, () => {
                this._tick();
                return GLib.SOURCE_CONTINUE;
            });
        }
    }

    _tick() {
        const now = GLib.get_monotonic_time();
        const dt = this._lastUs ? (now - this._lastUs) / 1e6 : 0;
        this._lastUs = now;
        this._now += dt;
        this._table.step(dt);
        for (const ev of this._table.takeEvents())
            this._flash(ev);
        this._sync();
        this._syncNeon();
    }

    _flash(ev) {
        const k = STRENGTH[ev.kind] ?? 0.7;
        for (const idx of [ev.a, ev.b]) {
            const s = this._sprites[idx];
            if (!s)
                continue;
            const still = s.glowStart < 0 ? 0 : s.glowStrength * neonAlpha(this._now - s.glowStart, GLOW_LIFE);
            s.glowStart = this._now;
            s.glowStrength = Math.min(1, Math.max(k, still));
        }
    }

    _syncNeon() {
        for (const s of this._sprites) {
            if (s.glowStart < 0)
                continue;
            const a = s.glowStrength * neonAlpha(this._now - s.glowStart, GLOW_LIFE);
            if (a <= 0.003) {
                s.glow.visible = false;
                s.glowStart = -1;
                continue;
            }
            const {body, area, glow} = s;
            glow.visible = true;
            glow.opacity = Math.round(255 * a);
            glow.set_position(body.x - glow.width / 2, body.y - glow.height / 2);
            glow.rotation_angle_z = area.rotation_angle_z;
        }
    }

    _sync() {
        for (const s of this._sprites) {
            const {body, area} = s;
            area.set_position(
                body.x - area.width / 2,
                body.y - area.height / 2);
            if (s.angle !== body.angle) {
                s.angle = body.angle;
                area.ease({
                    rotation_angle_z: body.angle,
                    duration: TURN_MS,
                    mode: Clutter.AnimationMode.EASE_IN_OUT_SINE,
                });
            }
        }
    }

    setTime() {}

    destroy() {
        this._timeline?.stop();
        this._timeline = null;
        if (this._timerId) {
            GLib.source_remove(this._timerId);
            this._timerId = 0;
        }
        this._sprites = [];
        this.actor.destroy();
    }
}
