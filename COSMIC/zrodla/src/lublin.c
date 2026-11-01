#include "backgrounds.h"

#include <string.h>

typedef enum { P_RECT, P_CIRCLE, P_RING, P_LENS } PartType;

typedef struct {
    PartType t;
    char c;
    double a, b, c2, d;
    double e, f;
    bool clip;
    double clip_r[4];
} Part;

typedef struct {
    const char *name;
    double w, h, scale;
    int n;
    Part parts[10];
} Shape;

#define UPPER M_PI, 2 * M_PI
#define LOWER 0, M_PI
#define RECT(x, y, w, h, col) {P_RECT, col, x, y, w, h, 0, 0, false, {0}}
#define CIRC(cx, cy, r, col) {P_CIRCLE, col, cx, cy, r, 0, 0, 0, false, {0}}
#define RING(cx, cy, ro, ri, ang, col) {P_RING, col, cx, cy, ro, ri, ang, false, {0}}
#define RINGC(cx, cy, ro, ri, ang, col, x0, y0, x1, y1) {P_RING, col, cx, cy, ro, ri, ang, true, {x0, y0, x1, y1}}
#define LENS(cx, cy, W, H, iw, ih, col) {P_LENS, col, cx, cy, W, H, iw, ih, false, {0}}

static const Shape SHAPES[] = {
    {"L-red", 2, 3.125, 1, 2, {RECT(0, 0, 1, 3.125, 'R'), RECT(0, 2.125, 2, 1, 'R')}},
    {"L-green", 2, 3.125, 1, 2, {RECT(0, 0, 1, 3.125, 'G'), RECT(0, 2.125, 2, 1, 'G')}},
    {"eye", 7.0, 4.66, 1, 2, {LENS(3.5, 2.33, 7.0, 4.66, 4.75, 2.66, 'G'), CIRC(3.5, 2.33, 0.72, 'G')}},
    {"dot", 1.44, 1.44, 1, 1, {CIRC(0.72, 0.72, 0.72, 'G')}},
    {"arch", 10.0, 7.47, 1, 8, {
        RING(5.05, 3.67, 3.64, 2.61, UPPER, 'R'),
        RECT(1.41, 3.66, 1.03, 0.83, 'R'), RECT(7.66, 3.66, 1.03, 0.83, 'R'),
        RECT(0, 4.47, 2.44, 0.97, 'R'), RECT(7.66, 4.47, 2.34, 0.97, 'R'),
        RECT(0, 5.44, 1.03, 2.03, 'r'), RECT(8.97, 5.44, 1.03, 2.03, 'r'),
        RECT(6.4, 6.47, 3.6, 1.0, 'r')}},
    {"mix", 7.6, 4.66, 1, 8, {
        RING(3.8, 3.8, 3.8, 2.78, UPPER, 'R'),
        RECT(0, 3.79, 1.02, 0.62, 'R'), RECT(6.58, 3.79, 1.02, 0.62, 'R'),
        RING(3.8, 0.86, 3.8, 2.78, LOWER, 'G'),
        RECT(0, 0.31, 1.02, 0.56, 'G'), RECT(6.58, 0.31, 1.02, 0.56, 'G'),
        RINGC(3.8, 3.8, 3.8, 2.78, UPPER, 'R', 3.8, 0, 7.6, 4.66),
        RECT(6.58, 3.79, 1.02, 0.62, 'R')}},
    {"human", 7.59, 6.77, 39.0 / 32.0, 6, {
        RING(3.79, 0.18, 3.79, 2.79, LOWER, 'G'),
        RECT(0, 0, 1.0, 0.19, 'G'), RECT(6.58, 0, 1.0, 0.19, 'G'),
        CIRC(3.81, 1.67, 0.73, 'G'),
        RECT(2.03, 4.77, 3.1, 1.0, 'G'), RECT(2.03, 5.76, 1.0, 1.01, 'G')}},
    {"tower", 10.06, 7.44, 1, 8, {
        RING(5.11, 3.67, 3.77, 2.77, LOWER, 'G'),
        RECT(1.34, 2.96, 1.0, 0.72, 'G'), RECT(7.88, 2.96, 1.0, 0.72, 'G'),
        RECT(0, 2.0, 2.34, 0.97, 'G'), RECT(7.88, 2.0, 2.18, 0.97, 'G'),
        RECT(0, 0, 3.69, 0.97, 'g'), RECT(0, 0.96, 1.03, 1.05, 'g'),
        RECT(9.03, 0, 1.03, 2.01, 'g')}},
    {"kadr", 6.0, 4.66, 1, 4, {
        RECT(0, 1.6, 1.0, 3.06, 'R'), RECT(0, 3.66, 2.0, 1.0, 'R'),
        RECT(4.0, 0, 2.0, 1.0, 'G'), RECT(5.0, 0.99, 1.0, 2.14, 'G')}},
};

static const char *DECK[] = {"L-red", "L-green", "eye", "dot", "arch", "mix", "human", "tower",
                             "kadr", "L-red", "dot", "L-green"};
#define NBODIES (int)G_N_ELEMENTS(DECK)

static const Shape *shape_by_name(const char *n)
{
    for (size_t i = 0; i < G_N_ELEMENTS(SHAPES); i++)
        if (strcmp(SHAPES[i].name, n) == 0)
            return &SHAPES[i];
    return &SHAPES[0];
}

static void color_of(char c, double rgb[3])
{
    switch (c) {
    case 'R': rgb[0] = 230 / 255.0; rgb[1] = 30 / 255.0; rgb[2] = 41 / 255.0; break;
    case 'G': rgb[0] = 117 / 255.0; rgb[1] = 185 / 255.0; rgb[2] = 74 / 255.0; break;
    case 'r': rgb[0] = 121 / 255.0; rgb[1] = 17 / 255.0; rgb[2] = 16 / 255.0; break;
    default:  rgb[0] = 57 / 255.0; rgb[1] = 95 / 255.0; rgb[2] = 34 / 255.0; break;
    }
}

static void lens_path(cairo_t *cr, double cx, double cy, double W, double H)
{
    double R = (W * W / 4 + H * H / 4) / H;
    double d = R - H / 2;
    cairo_move_to(cr, cx - W / 2, cy);
    cairo_arc(cr, cx, cy + d, R, atan2(-d, -W / 2), atan2(-d, W / 2));
    cairo_arc(cr, cx, cy - d, R, atan2(d, W / 2), atan2(d, -W / 2));
    cairo_close_path(cr);
}

static void part_path(cairo_t *cr, const Part *p)
{
    switch (p->t) {
    case P_RECT:
        cairo_rectangle(cr, p->a, p->b, p->c2, p->d);
        break;
    case P_CIRCLE:
        cairo_arc(cr, p->a, p->b, p->c2, 0, 2 * M_PI);
        cairo_close_path(cr);
        break;
    case P_RING:
        cairo_arc(cr, p->a, p->b, p->c2, p->e, p->f);
        cairo_arc_negative(cr, p->a, p->b, p->d, p->f, p->e);
        cairo_close_path(cr);
        break;
    case P_LENS:
        lens_path(cr, p->a, p->b, p->c2, p->d);
        lens_path(cr, p->a, p->b, p->e, p->f);
        break;
    }
}

static void draw_shape(cairo_t *cr, const Shape *s)
{
    for (int i = 0; i < s->n; i++) {
        const Part *p = &s->parts[i];
        double rgb[3];
        color_of(p->c, rgb);
        cairo_save(cr);
        if (p->clip) {
            cairo_rectangle(cr, p->clip_r[0], p->clip_r[1], p->clip_r[2] - p->clip_r[0],
                            p->clip_r[3] - p->clip_r[1]);
            cairo_clip(cr);
        }
        cairo_set_source_rgba(cr, rgb[0], rgb[1], rgb[2], 1);
        cairo_new_path(cr);
        part_path(cr, p);
        cairo_set_fill_rule(cr, p->t == P_LENS ? CAIRO_FILL_RULE_EVEN_ODD : CAIRO_FILL_RULE_WINDING);
        cairo_fill(cr);
        cairo_restore(cr);
    }
}

static const double NEON_LAYERS[][3] = {
    {3.00, 0.06, 0.0}, {1.90, 0.11, 0.0}, {1.20, 0.22, 0.0},
    {0.70, 0.50, 0.05}, {0.36, 0.90, 0.30}, {0.14, 1.00, 0.85},
};
#define NEON_REACH 1.5

static void draw_neon_outline(cairo_t *cr, const Shape *s)
{
    static const double NEON_R[3] = {1.0, 0.16, 0.30};
    static const double NEON_G[3] = {0.42, 1.0, 0.24};
    cairo_set_line_join(cr, CAIRO_LINE_JOIN_ROUND);
    for (size_t li = 0; li < G_N_ELEMENTS(NEON_LAYERS); li++) {
        double width = NEON_LAYERS[li][0], alpha = NEON_LAYERS[li][1], white = NEON_LAYERS[li][2];
        for (int ci = 0; ci < 2; ci++) {
            char tone = ci == 0 ? 'R' : 'G';
            bool any = false;
            for (int i = 0; i < s->n; i++)
                if (!s->parts[i].clip && g_ascii_toupper(s->parts[i].c) == tone)
                    any = true;
            if (!any)
                continue;
            const double *base = tone == 'R' ? NEON_R : NEON_G;
            cairo_push_group(cr);
            cairo_set_source_rgba(cr, base[0] + (1 - base[0]) * white, base[1] + (1 - base[1]) * white,
                                  base[2] + (1 - base[2]) * white, 1);
            cairo_set_line_width(cr, width);
            for (int i = 0; i < s->n; i++) {
                const Part *p = &s->parts[i];
                if (p->clip || g_ascii_toupper(p->c) != tone)
                    continue;
                cairo_new_path(cr);
                part_path(cr, p);
                cairo_stroke(cr);
            }
            cairo_set_operator(cr, CAIRO_OPERATOR_CLEAR);
            for (int i = 0; i < s->n; i++) {
                const Part *p = &s->parts[i];
                if (p->clip)
                    continue;
                cairo_new_path(cr);
                part_path(cr, p);
                cairo_set_fill_rule(cr, p->t == P_LENS ? CAIRO_FILL_RULE_EVEN_ODD : CAIRO_FILL_RULE_WINDING);
                cairo_fill(cr);
                cairo_set_fill_rule(cr, CAIRO_FILL_RULE_WINDING);
            }
            cairo_set_operator(cr, CAIRO_OPERATOR_OVER);
            cairo_pop_group_to_source(cr);
            cairo_paint_with_alpha(cr, alpha);
        }
    }
}

#define P_BOUNCE 0.30
#define P_STICK 0.16
#define P_TURN 0.25
#define MAX_GROUP 4
#define STICK_MIN_S 4.0
#define STICK_MAX_S 10.0
#define STICK_COOLDOWN_S 6.0
#define OFFSET_EASE 4.0

typedef struct Body Body;
struct Body {
    int id;
    const Shape *shape;
    double w, h;
    int quarter;
    double angle;
    double x, y, vx, vy, speed;
    Body *parent;
    double ox, oy, tx, ty;
    double until, cooldown;
};

typedef struct {
    int a, b;
    int kind;
} Event;

typedef struct {
    double width, height, time;
    Body bodies[NBODIES];
    bool contacts[NBODIES][NBODIES];
    Event events[32];
    int nevents;
} Table;

static double hw(const Body *b) { return (b->quarter % 2 == 0 ? b->w : b->h) / 2; }
static double hh(const Body *b) { return (b->quarter % 2 == 0 ? b->h : b->w) / 2; }

static Body *root_of(Body *b)
{
    while (b->parent)
        b = b->parent;
    return b;
}

static int group_size(Table *t, Body *b)
{
    Body *r = root_of(b);
    int n = 0;
    for (int i = 0; i < NBODIES; i++)
        if (root_of(&t->bodies[i]) == r)
            n++;
    return n;
}

static int depth_of(Body *b)
{
    int d = 0;
    while (b->parent) {
        b = b->parent;
        d++;
    }
    return d;
}

static void table_place(Table *t)
{
    for (int k = 0; k < NBODIES; k++) {
        Body *b = &t->bodies[k];
        double bw = hw(b), bh = hh(b);
        double x = 0, y = 0;
        for (int tries = 0; tries < 200; tries++) {
            x = bw + rnd() * MAX(1, t->width - 2 * bw);
            y = bh + rnd() * MAX(1, t->height - 2 * bh);
            bool clash = false;
            for (int j = 0; j < k && !clash; j++) {
                Body *o = &t->bodies[j];
                clash = fabs(o->x - x) < bw + hw(o) + 8 && fabs(o->y - y) < bh + hh(o) + 8;
            }
            if (!clash)
                break;
        }
        b->x = x;
        b->y = y;
    }
}

static void table_init(Table *t, double width, double height, double unit)
{
    memset(t, 0, sizeof *t);
    t->width = width;
    t->height = height;
    for (int i = 0; i < NBODIES; i++) {
        Body *b = &t->bodies[i];
        b->id = i;
        b->shape = shape_by_name(DECK[i]);
        double s = unit * b->shape->scale;
        b->speed = height * (0.045 + 0.05 * rnd());
        double ang = rnd() * 2 * M_PI;
        b->quarter = (int)(rnd() * 4);
        b->angle = b->quarter * 90;
        b->w = b->shape->w * s;
        b->h = b->shape->h * s;
        b->vx = cos(ang) * b->speed;
        b->vy = sin(ang) * b->speed;
    }
    table_place(t);
}

static void renormalize(Body *b)
{
    double m = hypot(b->vx, b->vy);
    if (m < 1e-6) {
        double ang = rnd() * 2 * M_PI;
        b->vx = cos(ang) * b->speed;
        b->vy = sin(ang) * b->speed;
    } else {
        b->vx *= b->speed / m;
        b->vy *= b->speed / m;
    }
}

static void turn(Body *b)
{
    int dir = rnd() < 0.5 ? -1 : 1;
    b->quarter = (b->quarter + dir + 4) % 4;
    b->angle += dir * 90;
}

static void walls(Table *t, Body *root)
{
    double minX = INFINITY, maxX = -INFINITY, minY = INFINITY, maxY = -INFINITY;
    for (int i = 0; i < NBODIES; i++) {
        Body *m = &t->bodies[i];
        if (root_of(m) != root)
            continue;
        minX = MIN(minX, m->x - hw(m));
        maxX = MAX(maxX, m->x + hw(m));
        minY = MIN(minY, m->y - hh(m));
        maxY = MAX(maxY, m->y + hh(m));
    }
    double dx = 0, dy = 0;
    if (minX < 0) {
        dx = -minX;
        root->vx = fabs(root->vx);
    } else if (maxX > t->width) {
        dx = t->width - maxX;
        root->vx = -fabs(root->vx);
    }
    if (minY < 0) {
        dy = -minY;
        root->vy = fabs(root->vy);
    } else if (maxY > t->height) {
        dy = t->height - maxY;
        root->vy = -fabs(root->vy);
    }
    if (dx != 0 || dy != 0) {
        for (int i = 0; i < NBODIES; i++) {
            Body *m = &t->bodies[i];
            if (root_of(m) != root)
                continue;
            m->x += dx;
            m->y += dy;
            if (m->parent) {
                m->vx = root->vx;
                m->vy = root->vy;
            }
        }
    }
}

typedef struct {
    double dx, dy, px, py;
} Overlap;

static bool overlap(Body *a, Body *b, Overlap *o)
{
    o->dx = b->x - a->x;
    o->dy = b->y - a->y;
    o->px = hw(a) + hw(b) - fabs(o->dx);
    o->py = hh(a) + hh(b) - fabs(o->dy);
    return o->px > 0.5 && o->py > 0.5;
}

static void bounce(Table *t, Body *a, Body *b, Overlap *ov)
{
    bool aFree = !a->parent && group_size(t, a) == 1;
    bool bFree = !b->parent && group_size(t, b) == 1;
    if (!aFree && !bFree)
        return;
    bool alongX = ov->px < ov->py;
    double sx = signd(ov->dx), sy = signd(ov->dy);
    if (sx == 0)
        sx = 1;
    if (sy == 0)
        sy = 1;
    if (aFree && bFree) {
        if (alongX) {
            a->x -= sx * ov->px / 2;
            b->x += sx * ov->px / 2;
            if ((a->vx - b->vx) * sx > 0) {
                double tmp = a->vx;
                a->vx = b->vx;
                b->vx = tmp;
            }
        } else {
            a->y -= sy * ov->py / 2;
            b->y += sy * ov->py / 2;
            if ((a->vy - b->vy) * sy > 0) {
                double tmp = a->vy;
                a->vy = b->vy;
                b->vy = tmp;
            }
        }
        renormalize(a);
        renormalize(b);
    } else {
        Body *fr = aFree ? a : b;
        double dir = aFree ? -1 : 1;
        if (alongX) {
            fr->x += dir * sx * ov->px;
            fr->vx = dir * sx * fabs(fr->vx);
        } else {
            fr->y += dir * sy * ov->py;
            fr->vy = dir * sy * fabs(fr->vy);
        }
    }
    if (rnd() < P_TURN) {
        Body *tb = aFree && (!bFree || rnd() < 0.5) ? a : b;
        turn(tb);
    }
}

static bool stick(Table *t, Body *a, Body *b, Overlap *ov)
{
    int ga = group_size(t, a), gb = group_size(t, b);
    Body *host, *guest;
    double sign;
    if (gb == 1 && ga < MAX_GROUP) {
        host = a;
        guest = b;
        sign = 1;
    } else if (ga == 1 && gb < MAX_GROUP) {
        host = b;
        guest = a;
        sign = -1;
    } else {
        return false;
    }
    if (guest->cooldown > t->time || host->cooldown > t->time)
        return false;
    double dx = sign * ov->dx, dy = sign * ov->dy;
    bool alongX = ov->px < ov->py;
    double hwH = hw(host), hhH = hh(host), hwG = hw(guest), hhG = hh(guest);
    double tx, ty;
    int align = (int)(rnd() * 3);
    if (alongX) {
        tx = (signd(dx) != 0 ? signd(dx) : 1) * (hwH + hwG);
        double opts[3] = {0, -hhH + hhG, hhH - hhG};
        ty = opts[align];
    } else {
        ty = (signd(dy) != 0 ? signd(dy) : 1) * (hhH + hhG);
        double opts[3] = {0, -hwH + hwG, hwH - hwG};
        tx = opts[align];
    }
    Body *root = root_of(host);
    int size = group_size(t, host) + 1;
    double vx = (root->vx * (size - 1) + guest->vx) / size;
    double vy = (root->vy * (size - 1) + guest->vy) / size;
    double want = guest->speed;
    Body *hr = root_of(host);
    for (int i = 0; i < NBODIES; i++)
        if (root_of(&t->bodies[i]) == hr)
            want += t->bodies[i].speed;
    want /= size;
    double mag = hypot(vx, vy);
    if (mag < want * 0.3) {
        double ang = rnd() * 2 * M_PI;
        vx = cos(ang) * want;
        vy = sin(ang) * want;
    } else {
        vx *= want / mag;
        vy *= want / mag;
    }
    root->vx = vx;
    root->vy = vy;
    guest->parent = host;
    guest->ox = dx;
    guest->oy = dy;
    guest->tx = tx;
    guest->ty = ty;
    guest->until = t->time + STICK_MIN_S + rnd() * (STICK_MAX_S - STICK_MIN_S);
    return true;
}

static void release_expired(Table *t)
{
    for (int i = 0; i < NBODIES; i++) {
        Body *b = &t->bodies[i];
        if (!b->parent || b->until > t->time)
            continue;
        Body *host = b->parent;
        b->parent = NULL;
        double nx = 0, ny = 0;
        if (fabs(b->tx) > fabs(b->ty))
            nx = signd(b->tx) != 0 ? signd(b->tx) : 1;
        else
            ny = signd(b->ty) != 0 ? signd(b->ty) : 1;
        b->vx = host->vx * 0.3 + nx * b->speed;
        b->vy = host->vy * 0.3 + ny * b->speed;
        renormalize(b);
        b->cooldown = t->time + STICK_COOLDOWN_S;
        host->cooldown = MAX(host->cooldown, t->time + 1);
        int lo = MIN(b->id, host->id), hi = MAX(b->id, host->id);
        t->contacts[lo][hi] = true;
    }
}

static void table_step(Table *t, double dt)
{
    dt = clampd(dt, 0, 0.05);
    t->time += dt;
    release_expired(t);

    int maxd = 0;
    for (int i = 0; i < NBODIES; i++)
        maxd = MAX(maxd, depth_of(&t->bodies[i]));
    for (int d = 0; d <= maxd; d++) {
        for (int i = 0; i < NBODIES; i++) {
            Body *b = &t->bodies[i];
            if (depth_of(b) != d)
                continue;
            if (!b->parent) {
                b->x += b->vx * dt;
                b->y += b->vy * dt;
            } else {
                double k = MIN(1, dt * OFFSET_EASE);
                b->ox += (b->tx - b->ox) * k;
                b->oy += (b->ty - b->oy) * k;
                b->x = b->parent->x + b->ox;
                b->y = b->parent->y + b->oy;
                b->vx = b->parent->vx;
                b->vy = b->parent->vy;
            }
        }
    }
    for (int i = 0; i < NBODIES; i++)
        if (!t->bodies[i].parent)
            walls(t, &t->bodies[i]);
    for (int i = 0; i < NBODIES; i++) {
        for (int j = i + 1; j < NBODIES; j++) {
            Body *a = &t->bodies[i], *b = &t->bodies[j];
            Overlap ov;
            if (!overlap(a, b, &ov)) {
                t->contacts[i][j] = false;
                continue;
            }
            if (t->contacts[i][j])
                continue;
            t->contacts[i][j] = true;
            if (root_of(a) == root_of(b))
                continue;
            double r = rnd();
            int kind = 2;
            if (r < P_BOUNCE) {
                bounce(t, a, b, &ov);
                kind = 0;
            } else if (r < P_BOUNCE + P_STICK) {
                kind = stick(t, a, b, &ov) ? 1 : 2;
            }
            if (t->nevents < 32)
                t->events[t->nevents++] = (Event){i, j, kind};
        }
    }
}

#define PAD 2
#define TURN_MS 700
#define GLOW_LIFE 1.5

static const double STRENGTH[3] = {1.0, 0.9, 0.65};

static double neon_alpha(double age, double life)
{
    if (age < 0 || age > life)
        return 0;
    double flicker = 1;
    if (age < 0.06)
        flicker = 0.9;
    else if (age < 0.10)
        flicker = 0.25;
    else if (age < 0.16)
        flicker = 1;
    else if (age < 0.19)
        flicker = 0.55;
    double x = clampd((age - 0.2) / (life - 0.2), 0, 1);
    return flicker * (1 - x * x * (3 - 2 * x));
}

typedef struct {
    Tex tex, glow;
    int tw, th, gw, gh;
    double angle_target;
    Tween angle;
    double glow_start, glow_strength;
} Sprite;

struct Lublin {
    int W, H;
    Table table;
    Sprite sprites[NBODIES];
    Tex shade;
    double last, now;
};

static Tex draw_to_tex(int w, int h, double pad, double scale, const Shape *s, bool neon)
{
    cairo_surface_t *surf = cairo_image_surface_create(CAIRO_FORMAT_ARGB32, w, h);
    cairo_t *cr = cairo_create(surf);
    cairo_translate(cr, pad, pad);
    cairo_scale(cr, scale, scale);
    if (neon)
        draw_neon_outline(cr, s);
    else
        draw_shape(cr, s);
    cairo_destroy(cr);
    Tex t = tex_from_cairo(surf);
    cairo_surface_destroy(surf);
    return t;
}

Lublin *lublin_new(int width, int height)
{
    Lublin *l = g_new0(Lublin, 1);
    l->W = width;
    l->H = height;
    double unit = height * 0.024;
    table_init(&l->table, width, height, unit);
    for (int i = 0; i < NBODIES; i++) {
        Body *b = &l->table.bodies[i];
        Sprite *s = &l->sprites[i];
        double scale = unit * b->shape->scale;
        s->tw = (int)ceil(b->w) + 2 * PAD;
        s->th = (int)ceil(b->h) + 2 * PAD;
        s->tex = draw_to_tex(s->tw, s->th, PAD, scale, b->shape, false);
        int margin = (int)ceil(NEON_REACH * scale) + PAD;
        s->gw = (int)ceil(b->w) + 2 * margin;
        s->gh = (int)ceil(b->h) + 2 * margin;
        s->glow = draw_to_tex(s->gw, s->gh, margin, scale, b->shape, true);
        s->angle_target = b->angle;
        tween_init(&s->angle, b->angle);
        s->glow_start = -1;
    }
    cairo_surface_t *g = cairo_image_surface_create(CAIRO_FORMAT_ARGB32, 256, 256);
    cairo_t *cr = cairo_create(g);
    cairo_pattern_t *p = cairo_pattern_create_radial(128, 128, 0, 128, 128, 128);
    cairo_pattern_add_color_stop_rgba(p, 0, 0, 0, 0, 0.78);
    cairo_pattern_add_color_stop_rgba(p, 1, 0, 0, 0, 0);
    cairo_set_source(cr, p);
    cairo_paint(cr);
    cairo_pattern_destroy(p);
    cairo_destroy(cr);
    l->shade = tex_from_cairo(g);
    cairo_surface_destroy(g);
    return l;
}

void lublin_free(Lublin *l)
{
    if (!l)
        return;
    for (int i = 0; i < NBODIES; i++) {
        tex_free(&l->sprites[i].tex);
        tex_free(&l->sprites[i].glow);
    }
    tex_free(&l->shade);
    g_free(l);
}

static void flash(Lublin *l, const Event *ev)
{
    double k = STRENGTH[ev->kind];
    int idx[2] = {ev->a, ev->b};
    for (int i = 0; i < 2; i++) {
        Sprite *s = &l->sprites[idx[i]];
        double still = s->glow_start < 0 ? 0 : s->glow_strength * neon_alpha(l->now - s->glow_start, GLOW_LIFE);
        s->glow_start = l->now;
        s->glow_strength = MIN(1, MAX(k, still));
    }
}

void lublin_tick(Lublin *l)
{
    double now = now_s();
    double dt = l->last > 0 ? now - l->last : 0;
    l->last = now;
    l->now += dt;
    table_step(&l->table, dt);
    for (int i = 0; i < l->table.nevents; i++)
        flash(l, &l->table.events[i]);
    l->table.nevents = 0;
    for (int i = 0; i < NBODIES; i++) {
        Sprite *s = &l->sprites[i];
        Body *b = &l->table.bodies[i];
        tween_tick(&s->angle);
        if (s->angle_target != b->angle) {
            s->angle_target = b->angle;
            tween_to(&s->angle, b->angle, 0, TURN_MS, EASE_IN_OUT_SINE, NULL, NULL);
        }
    }
}

void lublin_draw(Lublin *l)
{
    for (int i = 0; i < NBODIES; i++) {
        Sprite *s = &l->sprites[i];
        Body *b = &l->table.bodies[i];
        Xform f = xform_at(b->x - s->tw / 2.0, b->y - s->th / 2.0, s->tw, s->th, 1);
        f.angle = tween_value(&s->angle);
        gl_draw_tex(&s->tex, &f);
    }
    Xform sh = xform_at(0, 0, l->W, l->H, 1);
    gl_draw_tex(&l->shade, &sh);
    for (int i = 0; i < NBODIES; i++) {
        Sprite *s = &l->sprites[i];
        if (s->glow_start < 0)
            continue;
        double a = s->glow_strength * neon_alpha(l->now - s->glow_start, GLOW_LIFE);
        if (a <= 0.003) {
            s->glow_start = -1;
            continue;
        }
        Body *b = &l->table.bodies[i];
        Xform f = xform_at(b->x - s->gw / 2.0, b->y - s->gh / 2.0, s->gw, s->gh, a);
        f.angle = tween_value(&s->angle);
        gl_draw_tex(&s->glow, &f);
    }
}
