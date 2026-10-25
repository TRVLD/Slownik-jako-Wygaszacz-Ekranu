
import {SHAPES} from './lublinShapes.js';

const P_BOUNCE = 0.30;
const P_STICK = 0.16;
const P_TURN = 0.25;
const MAX_GROUP = 4;
const STICK_MIN_S = 4;
const STICK_MAX_S = 10;
const STICK_COOLDOWN_S = 6;
const OFFSET_EASE = 4;

export class Table {
    constructor({width, height, unit, deck, rng = Math.random}) {
        this.width = width;
        this.height = height;
        this.rng = rng;
        this.time = 0;
        this.contacts = new Set();
        this.bodies = [];
        this.events = [];

        deck.forEach((name, id) => {
            const shape = SHAPES[name];
            const s = unit * shape.scale;
            const speed = height * (0.045 + 0.05 * rng());
            const ang = rng() * 2 * Math.PI;
            const quarter = Math.floor(rng() * 4);
            this.bodies.push({
                id, name, shape,
                w: shape.w * s, h: shape.h * s,
                quarter,
                angle: quarter * 90,
                x: 0, y: 0,
                vx: Math.cos(ang) * speed,
                vy: Math.sin(ang) * speed,
                speed,
                parent: null,
                ox: 0, oy: 0, tx: 0, ty: 0,
                until: 0,
                cooldown: 0,
            });
        });
        this._place();
    }

    hw(b) {
        return (b.quarter % 2 === 0 ? b.w : b.h) / 2;
    }

    hh(b) {
        return (b.quarter % 2 === 0 ? b.h : b.w) / 2;
    }

    _place() {
        const placed = [];
        for (const b of this.bodies) {
            const hw = this.hw(b), hh = this.hh(b);
            let best = null;
            for (let tries = 0; tries < 200; tries++) {
                const x = hw + this.rng() * Math.max(1, this.width - 2 * hw);
                const y = hh + this.rng() * Math.max(1, this.height - 2 * hh);
                best = {x, y};
                const clash = placed.some(o =>
                    Math.abs(o.x - x) < hw + this.hw(o) + 8 &&
                    Math.abs(o.y - y) < hh + this.hh(o) + 8);
                if (!clash)
                    break;
            }
            b.x = best.x;
            b.y = best.y;
            placed.push(b);
        }
    }

    root(b) {
        while (b.parent)
            b = b.parent;
        return b;
    }

    group(b) {
        const r = this.root(b);
        return this.bodies.filter(o => this.root(o) === r);
    }

    _depth(b) {
        let d = 0;
        while (b.parent) {
            b = b.parent;
            d++;
        }
        return d;
    }

    step(dt) {
        dt = Math.min(Math.max(dt, 0), 0.05);
        this.time += dt;

        this._releaseExpired();

        const order = this.bodies.slice().sort((a, b) => this._depth(a) - this._depth(b));
        for (const b of order) {
            if (!b.parent) {
                b.x += b.vx * dt;
                b.y += b.vy * dt;
            } else {
                const k = Math.min(1, dt * OFFSET_EASE);
                b.ox += (b.tx - b.ox) * k;
                b.oy += (b.ty - b.oy) * k;
                b.x = b.parent.x + b.ox;
                b.y = b.parent.y + b.oy;
                b.vx = b.parent.vx;
                b.vy = b.parent.vy;
            }
        }

        for (const r of this.bodies.filter(b => !b.parent))
            this._walls(r);

        this._contacts();
    }

    _walls(root) {
        const members = this.group(root);
        let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
        for (const m of members) {
            minX = Math.min(minX, m.x - this.hw(m));
            maxX = Math.max(maxX, m.x + this.hw(m));
            minY = Math.min(minY, m.y - this.hh(m));
            maxY = Math.max(maxY, m.y + this.hh(m));
        }
        let dx = 0, dy = 0;
        if (minX < 0) {
            dx = -minX;
            root.vx = Math.abs(root.vx);
        } else if (maxX > this.width) {
            dx = this.width - maxX;
            root.vx = -Math.abs(root.vx);
        }
        if (minY < 0) {
            dy = -minY;
            root.vy = Math.abs(root.vy);
        } else if (maxY > this.height) {
            dy = this.height - maxY;
            root.vy = -Math.abs(root.vy);
        }
        if (dx || dy) {
            for (const m of members) {
                m.x += dx;
                m.y += dy;
                if (m.parent) {
                    m.vx = root.vx;
                    m.vy = root.vy;
                }
            }
        }
    }

    _overlap(a, b) {
        const dx = b.x - a.x, dy = b.y - a.y;
        const px = this.hw(a) + this.hw(b) - Math.abs(dx);
        const py = this.hh(a) + this.hh(b) - Math.abs(dy);
        return px > 0.5 && py > 0.5 ? {dx, dy, px, py} : null;
    }

    _contacts() {
        const n = this.bodies.length;
        for (let i = 0; i < n; i++) {
            for (let j = i + 1; j < n; j++) {
                const a = this.bodies[i], b = this.bodies[j];
                const key = `${i}:${j}`;
                const ov = this._overlap(a, b);
                if (!ov) {
                    this.contacts.delete(key);
                    continue;
                }
                if (this.contacts.has(key))
                    continue;
                this.contacts.add(key);
                if (this.root(a) === this.root(b))
                    continue;

                const r = this.rng();
                let kind = 'pass';
                if (r < P_BOUNCE) {
                    this._bounce(a, b, ov);
                    kind = 'bounce';
                } else if (r < P_BOUNCE + P_STICK) {
                    kind = this._stick(a, b, ov) ? 'stick' : 'pass';
                }
                if (this.events.length < 32)
                    this.events.push({a: i, b: j, kind, time: this.time});
            }
        }
    }

    _bounce(a, b, ov) {
        const aFree = !a.parent && this.group(a).length === 1;
        const bFree = !b.parent && this.group(b).length === 1;
        if (!aFree && !bFree)
            return;
        const alongX = ov.px < ov.py;
        const sx = Math.sign(ov.dx) || 1, sy = Math.sign(ov.dy) || 1;

        if (aFree && bFree) {
            if (alongX) {
                a.x -= sx * ov.px / 2;
                b.x += sx * ov.px / 2;
                if ((a.vx - b.vx) * sx > 0)
                    [a.vx, b.vx] = [b.vx, a.vx];
            } else {
                a.y -= sy * ov.py / 2;
                b.y += sy * ov.py / 2;
                if ((a.vy - b.vy) * sy > 0)
                    [a.vy, b.vy] = [b.vy, a.vy];
            }
            this._renormalize(a);
            this._renormalize(b);
        } else {
            const free = aFree ? a : b;
            const dir = aFree ? -1 : 1;
            if (alongX) {
                free.x += dir * sx * ov.px;
                free.vx = dir * sx * Math.abs(free.vx);
            } else {
                free.y += dir * sy * ov.py;
                free.vy = dir * sy * Math.abs(free.vy);
            }
        }

        if (this.rng() < P_TURN) {
            const t = aFree && (!bFree || this.rng() < 0.5) ? a : b;
            this._turn(t);
        }
    }

    _turn(b) {
        const dir = this.rng() < 0.5 ? -1 : 1;
        b.quarter = (b.quarter + dir + 4) % 4;
        b.angle += dir * 90;
    }

    _stick(a, b, ov) {
        const aSingle = this.group(a).length === 1;
        const bSingle = this.group(b).length === 1;
        let host, guest, sign;
        if (bSingle && this.group(a).length < MAX_GROUP) {
            host = a; guest = b; sign = 1;
        } else if (aSingle && this.group(b).length < MAX_GROUP) {
            host = b; guest = a; sign = -1;
        } else {
            return false;
        }
        if (guest.cooldown > this.time || host.cooldown > this.time)
            return false;

        const dx = sign * ov.dx, dy = sign * ov.dy;
        const alongX = ov.px < ov.py;
        const hwH = this.hw(host), hhH = this.hh(host);
        const hwG = this.hw(guest), hhG = this.hh(guest);
        let tx, ty;
        const align = Math.floor(this.rng() * 3);
        if (alongX) {
            tx = (Math.sign(dx) || 1) * (hwH + hwG);
            ty = [0, -hhH + hhG, hhH - hhG][align];
        } else {
            ty = (Math.sign(dy) || 1) * (hhH + hhG);
            tx = [0, -hwH + hwG, hwH - hwG][align];
        }

        const root = this.root(host);
        const size = this.group(host).length + 1;
        let vx = (root.vx * (size - 1) + guest.vx) / size;
        let vy = (root.vy * (size - 1) + guest.vy) / size;
        const want = this.group(host).concat([guest]).reduce((s, m) => s + m.speed, 0) / size;
        const mag = Math.hypot(vx, vy);
        if (mag < want * 0.3) {
            const ang = this.rng() * 2 * Math.PI;
            vx = Math.cos(ang) * want;
            vy = Math.sin(ang) * want;
        } else {
            vx *= want / mag;
            vy *= want / mag;
        }
        root.vx = vx;
        root.vy = vy;

        guest.parent = host;
        guest.ox = dx;
        guest.oy = dy;
        guest.tx = tx;
        guest.ty = ty;
        guest.until = this.time + STICK_MIN_S + this.rng() * (STICK_MAX_S - STICK_MIN_S);
        return true;
    }

    takeEvents() {
        const out = this.events;
        this.events = [];
        return out;
    }

    _releaseExpired() {
        for (const b of this.bodies) {
            if (!b.parent || b.until > this.time)
                continue;
            const host = b.parent;
            b.parent = null;
            const n = Math.abs(b.tx) > Math.abs(b.ty)
                ? [Math.sign(b.tx) || 1, 0]
                : [0, Math.sign(b.ty) || 1];
            b.vx = host.vx * 0.3 + n[0] * b.speed;
            b.vy = host.vy * 0.3 + n[1] * b.speed;
            this._renormalize(b);
            b.cooldown = this.time + STICK_COOLDOWN_S;
            host.cooldown = Math.max(host.cooldown, this.time + 1);
            const i = Math.min(b.id, host.id), j = Math.max(b.id, host.id);
            this.contacts.add(`${i}:${j}`);
        }
    }

    _renormalize(b) {
        const m = Math.hypot(b.vx, b.vy);
        if (m < 1e-6) {
            const ang = this.rng() * 2 * Math.PI;
            b.vx = Math.cos(ang) * b.speed;
            b.vy = Math.sin(ang) * b.speed;
        } else {
            b.vx *= b.speed / m;
            b.vy *= b.speed / m;
        }
    }
}
