#include "backgrounds.h"
#include "shaders.h"
#include "text.h"

#include <string.h>

#define Y 0
#define R 1
static const int LAYOUT_A[4] = {R, Y, Y, R};
static const int LAYOUT_B[4] = {Y, R, R, Y};

#define START_HOLD_A 4.0
#define START_HOLD_B 8.0
#define HOLD_A 20.0
#define HOLD_B 34.0
#define PAINT_A 12.0
#define PAINT_B 22.0
#define COLOR_DELAY_A 1.2
#define COLOR_DELAY_B 5.0
#define SAME_COLOR_JITTER 2.5
#define HEART_LIFE_A 2.0
#define HEART_LIFE_B 3.0
#define HEART_GAP_A 1.5
#define HEART_GAP_B 8.0
#define HEART_FADE_IN 0.25
#define HEART_FADE_OUT 0.4
#define HEART_MAX_TILT 15.0

typedef struct {
    double start, end;
    int from, to;
    double seed;
} Paint;

typedef struct {
    double u, v, size;
    double tbase, tamp, tfreq, tphase;
    double start, end;
} Heart;

typedef struct {
    GArray *paints[4];
    GArray *hearts;
    int start_color;
    int colors[4];
    int seed_counter;
    double horizon;
    double pruned;
} Schedule;

typedef struct {
    int base, target;
    double progress, seed;
} QState;

static double ease01(double x)
{
    double t = clampd(x, 0, 1);
    return t * t * (3 - 2 * t);
}

static double heartbeat(double t)
{
    double ph = fmod(t, 0.85) / 0.85;
#define G(x, c, w) exp(-(((x) - (c)) / (w)) * (((x) - (c)) / (w)))
    return G(ph, 0.12, 0.06) + 0.6 * G(ph, 0.34, 0.06);
#undef G
}

static double ramp(double t, double start, double end, double fin, double fout)
{
    if (t < start || t > end)
        return 0;
    double a = MIN(1, MIN((t - start) / fin, (end - t) / fout));
    return ease01(MAX(0, a));
}

static double plan_paint(Schedule *s, const int target[4], double from)
{
    int first = rnd() < 0.5 ? Y : R;
    double delay = rnd_range(COLOR_DELAY_A, COLOR_DELAY_B);
    double end = from;
    for (int q = 0; q < 4; q++) {
        if (s->colors[q] == target[q])
            continue;
        int pc = target[q];
        double start = from + (pc == first ? rnd() * 0.8 : delay + rnd() * SAME_COLOR_JITTER);
        double stop = start + rnd_range(PAINT_A, PAINT_B);
        Paint p = {start, stop, s->colors[q], target[q],
                   fmod(s->seed_counter++ * 7.31 + q * 3.17, 97)};
        g_array_append_val(s->paints[q], p);
        end = MAX(end, stop);
    }
    memcpy(s->colors, target, sizeof s->colors);
    s->horizon = end;
    return end;
}

static bool paint_at(Schedule *s, int q, double t, Paint *out, double *progress)
{
    GArray *list = s->paints[q];
    for (int i = (int)list->len - 1; i >= 0; i--) {
        Paint *p = &g_array_index(list, Paint, i);
        if (p->start <= t) {
            *out = *p;
            *progress = t < p->end ? ease01((t - p->start) / (p->end - p->start)) : 1;
            return true;
        }
    }
    return false;
}

static QState state_raw(Schedule *s, int q, double t)
{
    Paint p;
    double prog;
    if (!paint_at(s, q, t, &p, &prog))
        return (QState){s->start_color, s->start_color, 0, 0};
    if (prog >= 1)
        return (QState){p.to, p.to, 0, p.seed};
    return (QState){p.from, p.to, prog, p.seed};
}

static int full_color(Schedule *s, int q, double t)
{
    QState st = state_raw(s, q, t);
    return st.progress > 0 ? -1 : st.base;
}

static bool all_full_over(Schedule *s, double start, double end)
{
    for (int k = 0; k <= 6; k++) {
        double t = start + (end - start) * k / 6;
        for (int q = 0; q < 4; q++)
            if (full_color(s, q, t) < 0)
                return false;
    }
    return true;
}

static bool red_in_both_rows(Schedule *s, double t)
{
    for (int row = 0; row < 2; row++)
        if (full_color(s, row * 2, t) != R && full_color(s, row * 2 + 1, t) != R)
            return false;
    return true;
}

static int heart_cmp(gconstpointer a, gconstpointer b)
{
    const Heart *x = a, *y = b;
    return x->start < y->start ? -1 : x->start > y->start;
}

static void plan_hearts(Schedule *s, double from, double to)
{
    double t = from + rnd_range(1, 4);
    while (t < to) {
        double life = rnd_range(HEART_LIFE_A, HEART_LIFE_B);
        double end = t + life;
        if (end <= to && all_full_over(s, t, end) && red_in_both_rows(s, t)) {
            double base = rnd_range(-7, 7);
            Heart h = {
                .u = rnd_range(0.18, 0.82), .v = rnd_range(0.2, 0.8), .size = rnd_range(0.8, 1.15),
                .tbase = base, .tamp = rnd_range(3, HEART_MAX_TILT - fabs(base)),
                .tfreq = rnd_range(0.35, 0.8), .tphase = rnd() * 6.2832,
                .start = t, .end = end,
            };
            g_array_append_val(s->hearts, h);
            t = end + rnd_range(HEART_GAP_A, HEART_GAP_B);
        } else {
            t += rnd_range(0.8, 2.5);
        }
    }
    g_array_sort(s->hearts, heart_cmp);
}

static void ensure(Schedule *s, double t)
{
    while (s->horizon < t + 200) {
        double start = s->horizon;
        double end = start + rnd_range(HOLD_A, HOLD_B);
        const int *next = s->colors[0] == LAYOUT_A[0] ? LAYOUT_B : LAYOUT_A;
        double paint_end = plan_paint(s, next, end);
        plan_hearts(s, start, paint_end);
    }
}

static void schedule_init(Schedule *s)
{
    memset(s, 0, sizeof *s);
    for (int q = 0; q < 4; q++)
        s->paints[q] = g_array_new(FALSE, FALSE, sizeof(Paint));
    s->hearts = g_array_new(FALSE, FALSE, sizeof(Heart));
    s->start_color = rnd() < 0.5 ? Y : R;
    for (int q = 0; q < 4; q++)
        s->colors[q] = s->start_color;
    s->seed_counter = (int)(rnd() * 50);
    s->pruned = -1e9;
    double h0 = rnd_range(START_HOLD_A, START_HOLD_B);
    s->horizon = h0;
    double first_end = plan_paint(s, LAYOUT_A, h0);
    plan_hearts(s, 0, first_end);
    ensure(s, 1);
}

static void schedule_free(Schedule *s)
{
    for (int q = 0; q < 4; q++)
        g_array_unref(s->paints[q]);
    g_array_unref(s->hearts);
}

static QState schedule_state(Schedule *s, int q, double t)
{
    ensure(s, t);
    return state_raw(s, q, t);
}

typedef struct {
    bool on;
    double key, u, v, size, alpha, beat, tilt;
} VisibleHeart;

static VisibleHeart schedule_visible(Schedule *s, double t)
{
    ensure(s, t);
    if (t - s->pruned > 30) {
        for (int i = (int)s->hearts->len - 1; i >= 0; i--)
            if (g_array_index(s->hearts, Heart, i).end <= t - 60)
                g_array_remove_index(s->hearts, i);
        for (int q = 0; q < 4; q++) {
            GArray *l = s->paints[q];
            while (l->len > 2 && g_array_index(l, Paint, 1).end < t - 60)
                g_array_remove_index(l, 0);
        }
        s->pruned = t;
    }
    VisibleHeart out = {0};
    for (guint i = 0; i < s->hearts->len; i++) {
        Heart *h = &g_array_index(s->hearts, Heart, i);
        if (h->start > t)
            break;
        if (t > h->end)
            continue;
        double age = t - h->start;
        out = (VisibleHeart){
            true, h->start, h->u, h->v, h->size,
            ramp(t, h->start, h->end, HEART_FADE_IN, HEART_FADE_OUT),
            heartbeat(age),
            h->tbase + h->tamp * sin(6.2832 * h->tfreq * age + h->tphase),
        };
        break;
    }
    return out;
}

#define GRID_COLS 5
#define GRID_ROWS 4
#define GRID_MAX (GRID_COLS * GRID_ROWS)
#define SWITCH 0.25

typedef struct {
    int text_row, big_row;
    int red_col[2];
    bool init;
    double word_start, interval;
    int word;
} Symbols;

typedef struct {
    double x, y, age;
} Letter;

typedef struct {
    int cycle, shown, total, rows;
    Letter letters[GRID_MAX];
} Grid;

static void grid_layout(double elapsed, double interval, Grid *g)
{
    double e = MAX(0, elapsed);
    int idx = (int)floor(e);
    g->cycle = idx / GRID_MAX;
    g->shown = idx % GRID_MAX + 1;
    int per_word = MAX(1, (int)ceil(interval - 1e-6));
    g->total = MAX(g->shown, MIN(GRID_MAX, per_word - g->cycle * GRID_MAX));
    g->rows = (g->total + GRID_COLS - 1) / GRID_COLS;
    for (int i = 0; i < g->shown; i++) {
        int row = i / GRID_COLS, col = i % GRID_COLS;
        int in_row = row < g->rows - 1 ? GRID_COLS : g->total - GRID_COLS * (g->rows - 1);
        g->letters[i].x = col - (in_row - 1) / 2.0;
        g->letters[i].y = row - (g->rows - 1) / 2.0;
        g->letters[i].age = e - (g->cycle * GRID_MAX + i);
    }
}

static void symbols_init(Symbols *s)
{
    memset(s, 0, sizeof *s);
    s->text_row = rnd() < 0.5 ? 0 : 1;
    s->big_row = rnd() < 0.5 ? 0 : 1;
    s->red_col[0] = 0;
    s->red_col[1] = 1;
    s->interval = 30;
}

static void symbols_update(Symbols *s, const double red[4])
{
    for (int row = 0; row < 2; row++) {
        double a = red[row * 2], b = red[row * 2 + 1];
        if (!s->init) {
            if (fabs(a - b) > 0.01)
                s->red_col[row] = a > b ? 0 : 1;
            continue;
        }
        int cur = s->red_col[row];
        double mine = cur == 0 ? a : b, other = cur == 0 ? b : a;
        if (other > mine + SWITCH)
            s->red_col[row] = 1 - cur;
    }
    s->init = true;
}

static void symbols_next_word(Symbols *s, double t, double interval, int heart_row)
{
    s->word_start = t;
    s->interval = interval;
    s->word++;
    s->text_row = heart_row < 0 ? (rnd() < 0.5 ? 0 : 1) : 1 - heart_row;
    s->big_row = rnd() < 0.5 ? 0 : 1;
}

static int sym_red(Symbols *s, int row) { return row * 2 + s->red_col[row]; }
static int sym_yellow(Symbols *s, int row) { return row * 2 + 1 - s->red_col[row]; }
static int sym_text_q(Symbols *s) { return sym_red(s, s->text_row); }
static int sym_heart_q(Symbols *s) { return sym_red(s, 1 - s->text_row); }
static int sym_big_q(Symbols *s) { return sym_yellow(s, s->big_row); }
static int sym_grid_q(Symbols *s) { return sym_yellow(s, 1 - s->big_row); }

typedef struct {
    double u, v, scale;
} Spot;

static bool free_heart_spot(double u, double v, double x0, double y0, double qw, double qh,
                            double radius, const Rect *avoid, int navoid, Spot *out)
{
    int n = 0;
    Rect rects[4];
    for (int i = 0; i < navoid; i++)
        if (avoid[i].w > 0 || avoid[i].h > 0)
            rects[n++] = avoid[i];
    if (!n) {
        *out = (Spot){u, v, 1};
        return true;
    }
#define CLEAR(uu, vv, rr) ({ \
        double cx_ = x0 + (uu) * qw, cy_ = y0 + (vv) * qh; bool ok_ = true; \
        for (int k_ = 0; k_ < n && ok_; k_++) { \
            double dx_ = MAX(MAX(rects[k_].x - cx_, 0), cx_ - (rects[k_].x + rects[k_].w)); \
            double dy_ = MAX(MAX(rects[k_].y - cy_, 0), cy_ - (rects[k_].y + rects[k_].h)); \
            ok_ = hypot(dx_, dy_) >= (rr); \
        } ok_; })
    if (CLEAR(u, v, radius)) {
        *out = (Spot){u, v, 1};
        return true;
    }
    static const double scales[] = {1, 0.85, 0.7, 0.55};
    for (int si = 0; si < 4; si++) {
        double r = radius * scales[si];
        double u0 = MIN(0.5, r / qw), v0 = MIN(0.5, r / qh);
        bool found = false;
        double best_d = INFINITY;
        Spot best = {0};
        for (double vv = v0; vv <= 1 - v0 + 1e-9; vv += 0.02) {
            for (double uu = u0; uu <= 1 - u0 + 1e-9; uu += 0.02) {
                double d = hypot((uu - u) * qw, (vv - v) * qh);
                if (d < best_d && CLEAR(uu, vv, r)) {
                    best = (Spot){uu, vv, scales[si]};
                    best_d = d;
                    found = true;
                }
            }
        }
        if (found) {
            *out = best;
            return true;
        }
    }
#undef CLEAR
    return false;
}

#define RED_HEART_GAP_A 6.0
#define RED_HEART_GAP_B 14.0
#define RED_HEART_LIFE_A 2.0
#define RED_HEART_LIFE_B 3.0
#define RED_HEART_MARGIN 0.03
#define W_INK_HEIGHT 0.58
#define W_MAX_WIDTH 0.64
#define SHOW_YELLOW 0.88
#define GRID_W 0.8
#define GRID_H 0.8
#define SMALL_INK 0.6
#define FADE_IN 1.0
#define FADE_OUT 0.5
#define LETTER_IN 0.35
#define GRID_RESET 0.35

static const double W_COLOR[4] = {0x23 / 255.0, 0x1f / 255.0, 0x20 / 255.0, 1};

typedef struct {
    double big_alpha, grid_alpha;
    int grid_word, grid_cycle, placed;
    double lx[GRID_MAX], ly[GRID_MAX];
    double la[GRID_MAX];
    bool lv[GRID_MAX];
} Quad;

typedef struct {
    bool on;
    int q;
    double start, end, size, base, amp, freq, phase;
    double cx, cy;
} RedHeart;

struct Wroclaw {
    int W, H, qw, qh;
    Schedule sched;
    Symbols sym;
    double t, last_t;
    bool have_last;
    double red[4];
    bool have_red;

    GLuint prog;
    GLint u_res, u_base, u_target, u_prog, u_seed, u_time, u_origin, u_darken;
    Fbo paint;
    char key[256];
    QState paint_state[4];
    bool paint_dirty;
    double start_rgb[3];

    char *font;
    TextTex *big, *small;
    Quad quads[4];

    Tex heart_y, heart_r;
    int heart_w, heart_h;
    double heart_key;
    bool heart_has_key;
    int heart_q;
    double heart_cx, heart_cy, heart_base;
    bool heart_visible;
    double heart_alpha, heart_scale, heart_tilt;
    RedHeart rh;
    double rh_next;
    bool rh_visible;
    double rh_alpha, rh_scale, rh_tilt;

    Rect avoid;
    bool has_avoid;
};

static void draw_heart(cairo_t *cr, double w, double h, const double rgb[3])
{
    cairo_scale(cr, w, h);
    cairo_move_to(cr, 0.5, 0.92);
    cairo_curve_to(cr, 0.18, 0.70, 0.0, 0.48, 0.0, 0.30);
    cairo_curve_to(cr, 0.0, 0.12, 0.14, 0.02, 0.28, 0.02);
    cairo_curve_to(cr, 0.39, 0.02, 0.47, 0.08, 0.5, 0.18);
    cairo_curve_to(cr, 0.53, 0.08, 0.61, 0.02, 0.72, 0.02);
    cairo_curve_to(cr, 0.86, 0.02, 1.0, 0.12, 1.0, 0.30);
    cairo_curve_to(cr, 1.0, 0.48, 0.82, 0.70, 0.5, 0.92);
    cairo_close_path(cr);
    cairo_set_source_rgba(cr, rgb[0], rgb[1], rgb[2], 1);
    cairo_fill(cr);
}

static Tex heart_tex(int w, int h, const double rgb[3])
{
    cairo_surface_t *s = cairo_image_surface_create(CAIRO_FORMAT_ARGB32, w, h);
    cairo_t *cr = cairo_create(s);
    draw_heart(cr, w, h, rgb);
    cairo_destroy(cr);
    Tex t = tex_from_cairo(s);
    cairo_surface_destroy(s);
    return t;
}

static TextTex *fit_w(const char *font, double h, double w)
{
    TextStyle st;
    text_style_init(&st, font, "serif", h * 1.3);
    st.weight = PANGO_WEIGHT_BOLD;
    memcpy(st.rgba, W_COLOR, sizeof st.rgba);
    TextTex m;
    text_measure("W", &st, &m);
    for (int i = 0; i < 2 && m.ink_h > 0; i++) {
        st.size_px *= MIN(h / m.ink_h, w / MAX(1, m.ink_w));
        text_measure("W", &st, &m);
    }
    return text_render("W", &st);
}

Wroclaw *wroclaw_new(int width, int height, const char *word_font)
{
    Wroclaw *w = g_new0(Wroclaw, 1);
    w->W = width;
    w->H = height;
    w->qw = width / 2;
    w->qh = height / 2;
    schedule_init(&w->sched);
    symbols_init(&w->sym);
    w->font = g_strdup(word_font ? word_font : "Crimson Text");

    w->prog = gl_compile(NULL, SHADER_WROCLAW, "wroclaw");
    if (w->prog) {
        w->u_res = glGetUniformLocation(w->prog, "resolution");
        w->u_base = glGetUniformLocation(w->prog, "u_base");
        w->u_target = glGetUniformLocation(w->prog, "u_target");
        w->u_prog = glGetUniformLocation(w->prog, "u_prog");
        w->u_seed = glGetUniformLocation(w->prog, "u_seed");
        w->u_time = glGetUniformLocation(w->prog, "time");
        w->u_origin = glGetUniformLocation(w->prog, "origin");
        w->u_darken = glGetUniformLocation(w->prog, "darken");
    }
    if (w->sched.start_color == Y) {
        w->start_rgb[0] = 0.992; w->start_rgb[1] = 0.812; w->start_rgb[2] = 0.0;
    } else {
        w->start_rgb[0] = 0.965; w->start_rgb[1] = 0.239; w->start_rgb[2] = 0.216;
    }

    w->big = fit_w(w->font, w->qh * W_INK_HEIGHT, w->qw * W_MAX_WIDTH);
    double cell_w = w->qw * GRID_W / GRID_COLS, cell_h = w->qh * GRID_H / GRID_ROWS;
    w->small = fit_w(w->font, MIN(cell_h, cell_w / 1.62) * SMALL_INK, cell_w * SMALL_INK);
    for (int q = 0; q < 4; q++) {
        w->quads[q].grid_word = -1;
        w->quads[q].grid_cycle = -1;
    }

    static const double YEL[3] = {0.992, 0.812, 0.0};
    static const double RED[3] = {0.965, 0.239, 0.216};
    w->heart_w = (int)lround(w->qh * 0.2);
    w->heart_h = (int)lround(w->heart_w * 0.92);
    w->heart_y = heart_tex(w->heart_w, w->heart_h, YEL);
    w->heart_r = heart_tex(w->heart_w, w->heart_h, RED);
    w->heart_q = -1;
    w->rh_next = 4 + rnd() * 6;
    return w;
}

void wroclaw_free(Wroclaw *w)
{
    if (!w)
        return;
    schedule_free(&w->sched);
    if (w->prog)
        glDeleteProgram(w->prog);
    fbo_free(&w->paint);
    text_free(w->big);
    text_free(w->small);
    tex_free(&w->heart_y);
    tex_free(&w->heart_r);
    g_free(w->font);
    g_free(w);
}

static void redness(const QState st[4], double out[4])
{
    for (int q = 0; q < 4; q++) {
        double a = st[q].base == R ? 1 : 0, b = st[q].target == R ? 1 : 0;
        out[q] = a + (b - a) * st[q].progress;
    }
}

int wroclaw_text_quadrant(Wroclaw *w, double t)
{
    if (t != w->t) {
        QState st[4];
        double red[4];
        for (int q = 0; q < 4; q++)
            st[q] = schedule_state(&w->sched, q, t);
        redness(st, red);
        symbols_update(&w->sym, red);
    }
    return sym_text_q(&w->sym);
}

int wroclaw_heart_quadrant(Wroclaw *w)
{
    return sym_heart_q(&w->sym);
}

int wroclaw_clock_quadrant(Wroclaw *w)
{
    int best = sym_heart_q(&w->sym);
    if (!w->have_red)
        return best;
    for (int q = 0; q < 4; q++)
        if (w->red[q] > w->red[best] + 0.05)
            best = q;
    return best;
}

static double heart_radius(Wroclaw *w, double size)
{
    return 0.5 * hypot(w->heart_w, w->heart_h) * size * 1.12;
}

void wroclaw_set_heart_avoid(Wroclaw *w, const Rect *r)
{
    w->has_avoid = r != NULL;
    if (r)
        w->avoid = *r;
    if (!r || w->heart_q < 0 || !w->heart_visible)
        return;
    Spot spot;
    bool ok = free_heart_spot(0.5, 0.5, w->heart_cx - w->qw / 2.0, w->heart_cy - w->qh / 2.0,
                              w->qw, w->qh, heart_radius(w, w->heart_base > 0 ? w->heart_base : 1.15),
                              &w->avoid, 1, &spot);
    if (!ok || spot.u != 0.5 || spot.v != 0.5 || spot.scale != 1) {
        w->heart_q = -1;
        w->heart_visible = false;
    }
}

void wroclaw_next_word(Wroclaw *w, double interval)
{
    int heart_row = w->heart_q < 0 ? -1 : w->heart_q / 2;
    symbols_next_word(&w->sym, w->t, interval, heart_row);
}

static double approach(double value, double target, double dt)
{
    if (target > value)
        return MIN(target, value + dt / FADE_IN);
    return MAX(target, value - dt / FADE_OUT);
}

static void update_grid(Wroclaw *w, Quad *x, const Grid *g, int word)
{
    if (x->grid_word != word || x->grid_cycle != g->cycle) {
        x->grid_word = word;
        x->grid_cycle = g->cycle;
        for (int i = 0; i < GRID_MAX; i++)
            x->lv[i] = false;
        x->placed = 0;
    }
    double cell_w = w->qw * GRID_W / GRID_COLS, cell_h = w->qh * GRID_H / GRID_ROWS;
    int n = g->shown;
    for (int i = 0; i < n; i++) {
        if (i >= x->placed) {
            x->lx[i] = w->qw / 2.0 + g->letters[i].x * cell_w;
            x->ly[i] = w->qh / 2.0 + g->letters[i].y * cell_h;
            x->placed = i + 1;
        }
        double a = MIN(1, g->letters[i].age / LETTER_IN);
        x->lv[i] = a > 0.001;
        x->la[i] = a * a * (3 - 2 * a);
    }
    double to_next = 1 - (n > 0 ? g->letters[n - 1].age : 0);
    if (n == GRID_MAX && to_next < GRID_RESET) {
        double a = MAX(0, to_next / GRID_RESET);
        for (int i = 0; i < GRID_MAX; i++)
            x->la[i] = a;
    }
}

static bool big_rect(Wroclaw *w, int q, Rect *out)
{
    if (!w->big || w->big->ink_w <= 0)
        return false;
    double gap = w->qh * RED_HEART_MARGIN;
    double x0 = (q % 2) * w->qw, y0 = (q / 2) * w->qh;
    *out = (Rect){x0 + w->qw / 2.0 - w->big->ink_w / 2 - gap, y0 + w->qh / 2.0 - w->big->ink_h / 2 - gap,
                  w->big->ink_w + 2 * gap, w->big->ink_h + 2 * gap};
    return true;
}

static void update_red_heart(Wroclaw *w, double t)
{
    int bq = sym_big_q(&w->sym);
    bool ready = w->quads[bq].big_alpha > 0.95;
    if (w->rh.on && (t > w->rh.end || w->rh.q != bq || !ready)) {
        w->rh.on = false;
        w->rh_next = t + rnd_range(RED_HEART_GAP_A, RED_HEART_GAP_B);
    }
    if (!w->rh.on && t >= w->rh_next) {
        w->rh_next = t + 1.5;
        Rect big;
        if (ready && big_rect(w, bq, &big)) {
            double size = 0.8 + rnd() * 0.3;
            int col = bq % 2, row = bq / 2;
            Rect av[2] = {big, w->has_avoid ? w->avoid : (Rect){0}};
            Spot spot;
            if (free_heart_spot(0.18 + rnd() * 0.64, 0.2 + rnd() * 0.6, col * w->qw, row * w->qh,
                                w->qw, w->qh, heart_radius(w, size), av, 2, &spot)) {
                double life = rnd_range(RED_HEART_LIFE_A, RED_HEART_LIFE_B);
                double base = (rnd() - 0.5) * 14;
                w->rh = (RedHeart){
                    true, bq, t, t + life, size * spot.scale, base,
                    3 + rnd() * (15 - 3 - fabs(base)), 0.35 + rnd() * 0.45, rnd() * 6.2832,
                    col * w->qw + spot.u * w->qw, row * w->qh + spot.v * w->qh,
                };
            }
        }
    }
    if (!w->rh.on) {
        w->rh_visible = false;
        return;
    }
    double age = t - w->rh.start;
    w->rh_visible = true;
    w->rh_alpha = MAX(0, MIN(1, MIN(age / 0.25, (w->rh.end - t) / 0.4)));
    w->rh_scale = w->rh.size * (0.9 + 0.22 * heartbeat(age));
    w->rh_tilt = w->rh.base + w->rh.amp * sin(6.2832 * w->rh.freq * age + w->rh.phase);
}

static int yellow_heart_quadrant(Wroclaw *w, double t)
{
    if (w->has_avoid) {
        double cx = w->avoid.x + w->avoid.w / 2, cy = w->avoid.y + w->avoid.h / 2;
        int q = (cx >= w->qw ? 1 : 0) + (cy >= w->qh ? 2 : 0);
        if (q != sym_text_q(&w->sym) && full_color(&w->sched, q, t) == R)
            return q;
    }
    return sym_heart_q(&w->sym);
}

void wroclaw_set_time(Wroclaw *w, double t)
{
    double dt = w->have_last ? clampd(t - w->last_t, 0, 0.25) : 0;
    w->last_t = t;
    w->have_last = true;
    w->t = t;

    QState st[4];
    for (int q = 0; q < 4; q++)
        st[q] = schedule_state(&w->sched, q, t);
    char key[256];
    g_snprintf(key, sizeof key, "%d%d%d%d|%d%d%d%d|%.4f,%.4f,%.4f,%.4f|%.4f,%.4f,%.4f,%.4f",
               st[0].base, st[1].base, st[2].base, st[3].base,
               st[0].target, st[1].target, st[2].target, st[3].target,
               st[0].progress, st[1].progress, st[2].progress, st[3].progress,
               st[0].seed, st[1].seed, st[2].seed, st[3].seed);
    if (strcmp(key, w->key) != 0) {
        g_strlcpy(w->key, key, sizeof w->key);
        memcpy(w->paint_state, st, sizeof w->paint_state);
        w->paint_dirty = true;
    }

    redness(st, w->red);
    w->have_red = true;
    symbols_update(&w->sym, w->red);

    int bq = sym_big_q(&w->sym), gq = sym_grid_q(&w->sym);
    Grid grid;
    grid_layout(t - w->sym.word_start, w->sym.interval, &grid);
    for (int q = 0; q < 4; q++) {
        Quad *x = &w->quads[q];
        bool yellow = 1 - w->red[q] >= SHOW_YELLOW;
        bool want_big = q == bq && yellow;
        bool want_grid = q == gq && yellow;
        x->big_alpha = approach(x->big_alpha, want_big && x->grid_alpha < 0.02 ? 1 : 0, dt);
        x->grid_alpha = approach(x->grid_alpha, want_grid && x->big_alpha < 0.02 ? 1 : 0, dt);
        if (q == gq)
            update_grid(w, x, &grid, w->sym.word);
    }

    update_red_heart(w, t);

    VisibleHeart heart = schedule_visible(&w->sched, t);
    if (!heart.on) {
        w->heart_visible = false;
        w->heart_has_key = false;
        w->heart_q = -1;
        return;
    }
    if (!w->heart_has_key || heart.key != w->heart_key) {
        w->heart_has_key = true;
        w->heart_key = heart.key;
        int q = yellow_heart_quadrant(w, t);
        w->heart_q = full_color(&w->sched, q, t) == R ? q : -1;
        int col = q % 2, row = q / 2;
        Spot spot;
        bool ok = w->heart_q >= 0 &&
                  free_heart_spot(heart.u, heart.v, col * w->qw, row * w->qh, w->qw, w->qh,
                                  heart_radius(w, heart.size), &w->avoid, w->has_avoid ? 1 : 0, &spot);
        if (!ok)
            w->heart_q = -1;
        if (w->heart_q >= 0) {
            w->heart_cx = col * w->qw + spot.u * w->qw;
            w->heart_cy = row * w->qh + spot.v * w->qh;
            w->heart_base = heart.size * spot.scale;
        }
    }
    if (w->heart_q < 0) {
        w->heart_visible = false;
        return;
    }
    w->heart_visible = true;
    w->heart_alpha = heart.alpha;
    w->heart_scale = w->heart_base * (0.9 + 0.22 * heart.beat);
    w->heart_tilt = heart.tilt;
}

static void draw_text_center(TextTex *t, double cx, double cy, double alpha)
{
    if (!t || alpha <= 0.001)
        return;
    double bx = cx - t->ink_x - t->ink_w / 2, by = cy - t->ink_y - t->ink_h / 2;
    Xform f = xform_at(round(bx - t->ox), round(by - t->oy), t->tex.w, t->tex.h, alpha);
    gl_draw_tex(&t->tex, &f);
}

static void render_paint(Wroclaw *w)
{
    const QState *st = w->paint_state;
    fbo_ensure(&w->paint, w->W, w->H);
    GLint vp[4];
    glGetIntegerv(GL_VIEWPORT, vp);
    GLint prev_fb = 0;
    glGetIntegerv(GL_FRAMEBUFFER_BINDING, &prev_fb);
    glBindFramebuffer(GL_FRAMEBUFFER, w->paint.fb);
    glViewport(0, 0, w->W, w->H);
    glUseProgram(w->prog);
    glUniform2f(w->u_res, w->W, w->H);
    glUniform4f(w->u_base, st[0].base, st[1].base, st[2].base, st[3].base);
    glUniform4f(w->u_target, st[0].target, st[1].target, st[2].target, st[3].target);
    glUniform4f(w->u_prog, st[0].progress, st[1].progress, st[2].progress, st[3].progress);
    glUniform4f(w->u_seed, st[0].seed, st[1].seed, st[2].seed, st[3].seed);
    glUniform1f(w->u_time, 0);
    glUniform2f(w->u_origin, 0, 0);
    glUniform1f(w->u_darken, 0);
    gl_draw_fullscreen(w->prog);
    glBindFramebuffer(GL_FRAMEBUFFER, prev_fb);
    glViewport(vp[0], vp[1], vp[2], vp[3]);
    w->paint_dirty = false;
}

void wroclaw_draw(Wroclaw *w)
{
    if (w->prog && w->paint_dirty)
        render_paint(w);
    if (w->paint.fb) {
        Xform f = xform_at(0, 0, w->W, w->H, 1);
        gl_draw_tex(&w->paint.tex, &f);
    } else {
        Xform f = xform_at(0, 0, w->W, w->H, 1);
        gl_draw_color(&f, w->start_rgb[0], w->start_rgb[1], w->start_rgb[2], 1);
    }
    for (int q = 0; q < 4; q++) {
        Quad *x = &w->quads[q];
        double x0 = (q % 2) * w->qw, y0 = (q / 2) * w->qh;
        if (x->big_alpha > 0.001)
            draw_text_center(w->big, x0 + w->qw / 2.0, y0 + w->qh / 2.0, x->big_alpha);
        if (x->grid_alpha > 0.001) {
            for (int i = 0; i < GRID_MAX; i++)
                if (x->lv[i] && i < x->placed)
                    draw_text_center(w->small, x0 + x->lx[i], y0 + x->ly[i], x->grid_alpha * x->la[i]);
        }
    }
    if (w->rh_visible) {
        Xform f = xform_at(w->rh.cx - w->heart_w / 2.0, w->rh.cy - w->heart_h / 2.0,
                           w->heart_w, w->heart_h, w->rh_alpha);
        f.sx = f.sy = w->rh_scale;
        f.angle = w->rh_tilt;
        gl_draw_tex(&w->heart_r, &f);
    }
    if (w->heart_visible) {
        Xform f = xform_at(w->heart_cx - w->heart_w / 2.0, w->heart_cy - w->heart_h / 2.0,
                           w->heart_w, w->heart_h, w->heart_alpha);
        f.sx = f.sy = w->heart_scale;
        f.angle = w->heart_tilt;
        gl_draw_tex(&w->heart_y, &f);
    }
}
