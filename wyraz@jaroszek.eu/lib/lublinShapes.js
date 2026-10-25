
export const COLORS = {
    R: [230 / 255, 30 / 255, 41 / 255],
    G: [117 / 255, 185 / 255, 74 / 255],
    r: [121 / 255, 17 / 255, 16 / 255],
    g: [57 / 255, 95 / 255, 34 / 255],
};

const PI = Math.PI;
const UPPER = [PI, 2 * PI];
const LOWER = [0, PI];

export const SHAPES = {
    'L-red': {
        w: 2, h: 3.125, scale: 1,
        parts: [
            {t: 'rect', x: 0, y: 0, w: 1, h: 3.125, c: 'R'},
            {t: 'rect', x: 0, y: 2.125, w: 2, h: 1, c: 'R'},
        ],
    },
    'L-green': {
        w: 2, h: 3.125, scale: 1,
        parts: [
            {t: 'rect', x: 0, y: 0, w: 1, h: 3.125, c: 'G'},
            {t: 'rect', x: 0, y: 2.125, w: 2, h: 1, c: 'G'},
        ],
    },
    'eye': {
        w: 7.0, h: 4.66, scale: 1,
        parts: [
            {t: 'lens', cx: 3.5, cy: 2.33, W: 7.0, H: 4.66, iw: 4.75, ih: 2.66, c: 'G'},
            {t: 'circle', cx: 3.5, cy: 2.33, r: 0.72, c: 'G'},
        ],
    },
    'dot': {
        w: 1.44, h: 1.44, scale: 1,
        parts: [{t: 'circle', cx: 0.72, cy: 0.72, r: 0.72, c: 'G'}],
    },
    'arch': {
        w: 10.0, h: 7.47, scale: 1,
        parts: [
            {t: 'ring', cx: 5.05, cy: 3.67, ro: 3.64, ri: 2.61, a: UPPER, c: 'R'},
            {t: 'rect', x: 1.41, y: 3.66, w: 1.03, h: 0.83, c: 'R'},
            {t: 'rect', x: 7.66, y: 3.66, w: 1.03, h: 0.83, c: 'R'},
            {t: 'rect', x: 0, y: 4.47, w: 2.44, h: 0.97, c: 'R'},
            {t: 'rect', x: 7.66, y: 4.47, w: 2.34, h: 0.97, c: 'R'},
            {t: 'rect', x: 0, y: 5.44, w: 1.03, h: 2.03, c: 'r'},
            {t: 'rect', x: 8.97, y: 5.44, w: 1.03, h: 2.03, c: 'r'},
            {t: 'rect', x: 6.4, y: 6.47, w: 3.6, h: 1.0, c: 'r'},
        ],
    },
    'mix': {
        w: 7.6, h: 4.66, scale: 1,
        parts: [
            {t: 'ring', cx: 3.8, cy: 3.8, ro: 3.8, ri: 2.78, a: UPPER, c: 'R'},
            {t: 'rect', x: 0, y: 3.79, w: 1.02, h: 0.62, c: 'R'},
            {t: 'rect', x: 6.58, y: 3.79, w: 1.02, h: 0.62, c: 'R'},
            {t: 'ring', cx: 3.8, cy: 0.86, ro: 3.8, ri: 2.78, a: LOWER, c: 'G'},
            {t: 'rect', x: 0, y: 0.31, w: 1.02, h: 0.56, c: 'G'},
            {t: 'rect', x: 6.58, y: 0.31, w: 1.02, h: 0.56, c: 'G'},
            {t: 'ring', cx: 3.8, cy: 3.8, ro: 3.8, ri: 2.78, a: UPPER, c: 'R', clip: [3.8, 0, 7.6, 4.66]},
            {t: 'rect', x: 6.58, y: 3.79, w: 1.02, h: 0.62, c: 'R'},
        ],
    },
    'human': {
        w: 7.59, h: 6.77, scale: 39 / 32,
        parts: [
            {t: 'ring', cx: 3.79, cy: 0.18, ro: 3.79, ri: 2.79, a: LOWER, c: 'G'},
            {t: 'rect', x: 0, y: 0, w: 1.0, h: 0.19, c: 'G'},
            {t: 'rect', x: 6.58, y: 0, w: 1.0, h: 0.19, c: 'G'},
            {t: 'circle', cx: 3.81, cy: 1.67, r: 0.73, c: 'G'},
            {t: 'rect', x: 2.03, y: 4.77, w: 3.1, h: 1.0, c: 'G'},
            {t: 'rect', x: 2.03, y: 5.76, w: 1.0, h: 1.01, c: 'G'},
        ],
    },
    'tower': {
        w: 10.06, h: 7.44, scale: 1,
        parts: [
            {t: 'ring', cx: 5.11, cy: 3.67, ro: 3.77, ri: 2.77, a: LOWER, c: 'G'},
            {t: 'rect', x: 1.34, y: 2.96, w: 1.0, h: 0.72, c: 'G'},
            {t: 'rect', x: 7.88, y: 2.96, w: 1.0, h: 0.72, c: 'G'},
            {t: 'rect', x: 0, y: 2.0, w: 2.34, h: 0.97, c: 'G'},
            {t: 'rect', x: 7.88, y: 2.0, w: 2.18, h: 0.97, c: 'G'},
            {t: 'rect', x: 0, y: 0, w: 3.69, h: 0.97, c: 'g'},
            {t: 'rect', x: 0, y: 0.96, w: 1.03, h: 1.05, c: 'g'},
            {t: 'rect', x: 9.03, y: 0, w: 1.03, h: 2.01, c: 'g'},
        ],
    },
    'kadr': {
        w: 6.0, h: 4.66, scale: 1,
        parts: [
            {t: 'rect', x: 0, y: 1.6, w: 1.0, h: 3.06, c: 'R'},
            {t: 'rect', x: 0, y: 3.66, w: 2.0, h: 1.0, c: 'R'},
            {t: 'rect', x: 4.0, y: 0, w: 2.0, h: 1.0, c: 'G'},
            {t: 'rect', x: 5.0, y: 0.99, w: 1.0, h: 2.14, c: 'G'},
        ],
    },
};

export const DECK = ['L-red', 'L-green', 'eye', 'dot', 'arch', 'mix', 'human', 'tower', 'kadr',
    'L-red', 'dot', 'L-green'];

export function drawShape(cr, shape) {
    for (const p of shape.parts) {
        const [r, g, b] = COLORS[p.c];
        cr.save();
        if (p.clip) {
            const [x0, y0, x1, y1] = p.clip;
            cr.rectangle(x0, y0, x1 - x0, y1 - y0);
            cr.clip();
        }
        cr.setSourceRGBA(r, g, b, 1);
        cr.newPath();
        switch (p.t) {
        case 'rect':
            cr.rectangle(p.x, p.y, p.w, p.h);
            cr.fill();
            break;
        case 'circle':
            cr.arc(p.cx, p.cy, p.r, 0, 2 * PI);
            cr.closePath();
            cr.fill();
            break;
        case 'ring':
            cr.arc(p.cx, p.cy, p.ro, p.a[0], p.a[1]);
            cr.arcNegative(p.cx, p.cy, p.ri, p.a[1], p.a[0]);
            cr.closePath();
            cr.fill();
            break;
        case 'lens':
            lensPath(cr, p.cx, p.cy, p.W, p.H);
            lensPath(cr, p.cx, p.cy, p.iw, p.ih);
            cr.setFillRule(1);
            cr.fill();
            break;
        }
        cr.restore();
    }
}

function lensPath(cr, cx, cy, W, H) {
    const R = (W * W / 4 + H * H / 4) / H;
    const d = R - H / 2;
    cr.moveTo(cx - W / 2, cy);
    cr.arc(cx, cy + d, R, Math.atan2(-d, -W / 2), Math.atan2(-d, W / 2));
    cr.arc(cx, cy - d, R, Math.atan2(d, W / 2), Math.atan2(d, -W / 2));
    cr.closePath();
}

export const NEON = {
    R: [1.0, 0.16, 0.30],
    G: [0.42, 1.0, 0.24],
};

export const NEON_LAYERS = [
    [3.00, 0.06, 0.0],
    [1.90, 0.11, 0.0],
    [1.20, 0.22, 0.0],
    [0.70, 0.50, 0.05],
    [0.36, 0.90, 0.30],
    [0.14, 1.00, 0.85],
];

export const NEON_REACH = NEON_LAYERS[0][0] / 2;

export function mixWhite([r, g, b], k) {
    return [r + (1 - r) * k, g + (1 - g) * k, b + (1 - b) * k];
}

function partPath(cr, p) {
    switch (p.t) {
    case 'rect':
        cr.rectangle(p.x, p.y, p.w, p.h);
        break;
    case 'circle':
        cr.arc(p.cx, p.cy, p.r, 0, 2 * PI);
        cr.closePath();
        break;
    case 'ring':
        cr.arc(p.cx, p.cy, p.ro, p.a[0], p.a[1]);
        cr.arcNegative(p.cx, p.cy, p.ri, p.a[1], p.a[0]);
        cr.closePath();
        break;
    case 'lens':
        lensPath(cr, p.cx, p.cy, p.W, p.H);
        lensPath(cr, p.cx, p.cy, p.iw, p.ih);
        break;
    }
}

export function drawNeonOutline(cr, shape) {
    const parts = shape.parts.filter(p => !p.clip);
    const tone = p => p.c.toUpperCase();
    const colors = [...new Set(parts.map(tone))];
    cr.setLineJoin(1);
    for (const [width, alpha, white] of NEON_LAYERS) {
        for (const c of colors) {
            cr.pushGroup();
            const [r, g, b] = mixWhite(NEON[c], white);
            cr.setSourceRGBA(r, g, b, 1);
            cr.setLineWidth(width);
            for (const p of parts) {
                if (tone(p) !== c)
                    continue;
                cr.newPath();
                partPath(cr, p);
                cr.stroke();
            }
            cr.setOperator(0);
            for (const p of parts) {
                cr.newPath();
                partPath(cr, p);
                if (p.t === 'lens')
                    cr.setFillRule(1);
                cr.fill();
                cr.setFillRule(0);
            }
            cr.setOperator(2);
            cr.popGroupToSource();
            cr.paintWithAlpha(alpha);
        }
    }
}
