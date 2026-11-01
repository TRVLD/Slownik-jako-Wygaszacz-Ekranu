#include "view.h"

#include <string.h>

#define WORD_OUT_MS 900
#define WORD_IN_MS 1500
#define CLOCK_MARGIN 0.06
#define CLOCK_TOP 0.08
#define HEART_GAP 0.02
#define DEF_MIN 0.02
#define DEF_STEP 0.92
#define CLOCK_FADE_MS 700
#define CLOCK_MOVE_MS 320

static const double CLOCK_SIZES[] = {0.075, 0.11, 0.16, 0.22};
static const double CLOCK_SCALES[] = {1, 0.85, 0.72, 0.6, 0.5, 0.42, 0.35};
#define NSCALES 7

#define RGBA(r, g, b, a) {(r) / 255.0, (g) / 255.0, (b) / 255.0, (a)}

static const StyleDef STYLES[4] = {
    [STYLE_AURORA] = {
        .word_scale = 0.13, .char_width = 0.56, .def_width = 0.64,
        .word_generic = "serif", .text_generic = "serif",
        .word_rgba = RGBA(0xf4, 0xf6, 0xee, 1), .word_weight = PANGO_WEIGHT_NORMAL,
        .word_nshadow = 1, .word_shadow = {0, 0, 34, RGBA(110, 255, 190, 0.32)},
        .rule_rgba = RGBA(150, 255, 210, 0.55), .rule_h = 1,
        .def_rgba = RGBA(0xe6, 0xef, 0xe9, 1), .def_italic = true, .def_weight = PANGO_WEIGHT_NORMAL,
        .def_nshadow = 1, .def_shadow = {0, 1, 12, RGBA(0, 0, 0, 0.65)},
        .footer_rgba = RGBA(255, 255, 255, 0.5), .credit_rgba = RGBA(255, 255, 255, 0.55),
        .clock_rgba = RGBA(255, 255, 255, 1),
        .neon_rgba = RGBA(0xea, 0xff, 0xf4, 1), .neon_glow = RGBA(110, 255, 190, 0.95),
        .code_filled = RGBA(150, 255, 210, 0.85), .code_border = RGBA(255, 255, 255, 0.16),
    },
    [STYLE_OCEAN] = {
        .word_scale = 0.13, .char_width = 0.56, .def_width = 0.64,
        .word_generic = "serif", .text_generic = "serif",
        .word_rgba = RGBA(0xf1, 0xf8, 0xfb, 1), .word_weight = PANGO_WEIGHT_NORMAL,
        .word_nshadow = 1, .word_shadow = {0, 0, 34, RGBA(110, 210, 255, 0.34)},
        .rule_rgba = RGBA(150, 220, 255, 0.55), .rule_h = 1,
        .def_rgba = RGBA(0xe3, 0xee, 0xf4, 1), .def_italic = true, .def_weight = PANGO_WEIGHT_NORMAL,
        .def_nshadow = 1, .def_shadow = {0, 1, 12, RGBA(0, 10, 30, 0.7)},
        .footer_rgba = RGBA(255, 255, 255, 0.5), .credit_rgba = RGBA(255, 255, 255, 0.55),
        .clock_rgba = RGBA(255, 255, 255, 1),
        .neon_rgba = RGBA(0xea, 0xf8, 0xff, 1), .neon_glow = RGBA(90, 200, 255, 0.95),
        .code_filled = RGBA(150, 220, 255, 0.85), .code_border = RGBA(255, 255, 255, 0.16),
    },
    [STYLE_LUBLIN] = {
        .word_scale = 0.16, .char_width = 0.42, .def_width = 0.64,
        .word_generic = "serif", .text_generic = "sans-serif",
        .word_rgba = RGBA(255, 255, 255, 1), .word_weight = PANGO_WEIGHT_NORMAL,
        .word_nshadow = 1, .word_shadow = {0, 2, 18, RGBA(0, 0, 0, 0.9)},
        .rule_rgba = RGBA(0xe6, 0x1e, 0x29, 1), .rule_h = 4,
        .def_rgba = RGBA(0xf2, 0xf2, 0xf2, 1), .def_italic = false, .def_weight = PANGO_WEIGHT_LIGHT,
        .def_nshadow = 1, .def_shadow = {0, 1, 10, RGBA(0, 0, 0, 0.95)},
        .footer_rgba = RGBA(255, 255, 255, 0.55), .credit_rgba = RGBA(255, 255, 255, 0.55),
        .clock_rgba = RGBA(255, 255, 255, 1),
        .neon_rgba = RGBA(0xff, 0xf0, 0xf0, 1), .neon_glow = RGBA(230, 30, 41, 0.95),
        .code_filled = RGBA(0x75, 0xb9, 0x4a, 1), .code_border = RGBA(230, 30, 41, 0.6),
        .code_square = true,
    },
    [STYLE_WROCLOVE] = {
        .word_scale = 0.11, .char_width = 0.52, .def_width = 0.5,
        .word_generic = "serif", .text_generic = "sans-serif",
        .word_rgba = RGBA(0x23, 0x1f, 0x20, 1), .word_weight = PANGO_WEIGHT_BOLD,
        .word_nshadow = 0,
        .rule_rgba = RGBA(0x23, 0x1f, 0x20, 1), .rule_h = 3,
        .def_rgba = RGBA(0x23, 0x1f, 0x20, 1), .def_italic = false, .def_weight = PANGO_WEIGHT_NORMAL,
        .def_nshadow = 0,
        .footer_rgba = RGBA(35, 31, 32, 0.65), .credit_rgba = RGBA(35, 31, 32, 0.7),
        .clock_rgba = RGBA(0x23, 0x1f, 0x20, 1),
        .neon_rgba = RGBA(0xc8, 0x10, 0x2e, 1), .neon_glow = RGBA(200, 16, 46, 0.85),
        .code_filled = RGBA(0xfd, 0xcf, 0x00, 1), .code_border = RGBA(255, 255, 255, 0.16),
    },
};

const StyleDef *style_def(StyleId id)
{
    return &STYLES[CLAMP((int)id, 0, 3)];
}

void style_fonts(const Config *cfg, const char **word, const char **text)
{
    switch (cfg->style) {
    case STYLE_LUBLIN:
        *word = cfg->renaissance_font;
        *text = "Exo 2";
        break;
    case STYLE_WROCLOVE:
        *word = "Crimson Text";
        *text = cfg->wroclove_font;
        break;
    default:
        *word = cfg->font_family;
        *text = cfg->font_family;
        break;
    }
}

static const char *DAYS[] = {"niedziela", "poniedziałek", "wtorek", "środa", "czwartek", "piątek", "sobota"};
static const char *MONTHS[] = {"stycznia", "lutego", "marca", "kwietnia", "maja", "czerwca", "lipca",
                               "sierpnia", "września", "października", "listopada", "grudnia"};

char *polish_date(bool with_time)
{
    GDateTime *dt = g_date_time_new_now_local();
    const char *day = DAYS[g_date_time_get_day_of_week(dt) % 7];
    const char *month = MONTHS[g_date_time_get_month(dt) - 1];
    char *out;
    if (with_time) {
        char *hm = g_date_time_format(dt, "%H:%M");
        out = g_strdup_printf("%s, %d %s · %s", day, g_date_time_get_day_of_month(dt), month, hm);
        g_free(hm);
    } else {
        out = g_strdup_printf("%s, %d %s", day, g_date_time_get_day_of_month(dt), month);
    }
    g_date_time_unref(dt);
    return out;
}

char *clock_time(void)
{
    GDateTime *dt = g_date_time_new_now_local();
    char *s = g_date_time_format(dt, "%H:%M");
    g_date_time_unref(dt);
    return s;
}

typedef enum { HOW_RANDOM, HOW_SPECIAL, HOW_CUSTOM } How;

typedef struct {
    Rect r;
    double ax, ay;
} CRect;

typedef struct {
    CRect rect;
    int si;
    How how;
} ClockBox;

struct View {
    Config cfg;
    const StyleDef *st;
    int W, H, ox, oy;
    double scale;
    char *word_font, *text_font;
    Bg *bg;
    double time;

    bool quad;
    int qw, qh;
    int text_q, pending_q;
    bool moving;
    Tween quad_op;
    int move_to;

    double tx, ty;
    double cscale;
    Tween content_op, content_ty;
    TextTex *word, *def, *credit;
    bool credit_visible;
    double def_px;
    char *def_text;
    TextStyle def_style;
    Tween word_op, word_ty, rule_op, rule_sx, def_op, def_ty, credit_op;
    double rule_w, rule_h, rule_mt, rule_mb, credit_mt;
    double cw, ch, y_rule, y_def, y_credit;
    Entry *pending;
    bool pending_first;
    double lift;

    TextTex *footer;
    char *footer_text;
    double footer_mb;

    bool clock_on;
    TextTex *clock;
    char clock_text[16];
    int clock_tex_si;
    double clock_opacity;
    ClockBox box;
    bool have_box;
    int run_si;
    bool clock_shown, clock_waiting;
    Tween clock_op;
    bool move_pending;
    double move_at;
    ClockBox move_box;
    int heart_q;
    double clock_lx, clock_ly;
    bool reserve_ok[NSCALES];
    double reserve_w[NSCALES], reserve_h[NSCALES];
    bool clock_error;

    Tween blur;
    Fbo f_scene, f_tmp, f_blur;
};

int view_width(View *v) { return v->W; }
int view_height(View *v) { return v->H; }
double view_scale(View *v) { return v->scale; }

static double clock_px(View *v, int si)
{
    return MAX(12 * v->scale, round(v->H * CLOCK_SIZES[v->cfg.clock_size] * CLOCK_SCALES[si]));
}

static void clock_style(View *v, int si, TextStyle *ts)
{
    double px = clock_px(v, si);
    const StyleDef *st = v->st;
    switch (v->cfg.clock_style) {
    case CS_NEON:
        text_style_init(ts, "Tilt Neon", "sans-serif", px);
        memcpy(ts->rgba, st->neon_rgba, sizeof ts->rgba);
        ts->nshadows = 1;
        ts->shadow[0] = (Shadow){0, 0, MAX(4, round(px * 0.12)), {0}};
        memcpy(ts->shadow[0].rgba, st->neon_glow, sizeof ts->shadow[0].rgba);
        return;
    case CS_FUTHARK:
        text_style_init(ts, "Wyraz Futhark", "sans-serif", px);
        break;
    case CS_SOURCESANS:
        text_style_init(ts, "Source Sans 3", "sans-serif", px);
        ts->weight = PANGO_WEIGHT_HEAVY;
        ts->features = "tnum";
        break;
    case CS_GARAMOND:
        text_style_init(ts, "EB Garamond", "serif", px);
        ts->features = "lnum, tnum";
        break;
    case CS_SANFRANCISCO:
    default:
        text_style_init(ts, "Inter", "sans-serif", px);
        ts->weight = PANGO_WEIGHT_SEMIBOLD;
        ts->features = "tnum";
        break;
    }
    memcpy(ts->rgba, st->clock_rgba, sizeof ts->rgba);
}

static void clock_measure(View *v, const char *text, int si, TextTex *m)
{
    TextStyle ts;
    clock_style(v, si, &ts);
    text_measure(text, &ts, m);
}

static void clock_reserve(View *v, int si, double *w, double *h)
{
    if (!v->reserve_ok[si]) {
        double mw = 0, top = INFINITY, bottom = -INFINITY;
        for (int d = 0; d < 10; d++) {
            char s[8];
            g_snprintf(s, sizeof s, "%d%d:%d%d", d, d, d, d);
            TextTex m;
            clock_measure(v, s, si, &m);
            mw = MAX(mw, m.ink_w);
            top = MIN(top, m.ink_y);
            bottom = MAX(bottom, m.ink_y + m.ink_h);
        }
        v->reserve_w[si] = mw;
        v->reserve_h[si] = bottom - top;
        v->reserve_ok[si] = true;
    }
    *w = v->reserve_w[si];
    *h = v->reserve_h[si];
}

static Rect footer_rect(View *v)
{
    double fw = v->footer ? v->footer->bw : 0, fh = v->footer ? v->footer->bh : 0;
    return (Rect){(v->W - fw) / 2, v->H - fh, fw, fh};
}

static Rect quad_rect(View *v, int q)
{
    return (Rect){(q % 2) * v->qw, (q / 2) * v->qh, v->qw, v->qh};
}

static int occupied(View *v, Rect out[2])
{
    int n = 0;
    int cur = v->text_q >= 0 ? v->text_q : bg_text_quadrant(v->bg, v->time);
    if (cur >= 0)
        out[n++] = quad_rect(v, cur);
    if (v->pending_q >= 0 && v->pending_q != cur)
        out[n++] = quad_rect(v, v->pending_q);
    return n;
}

typedef struct {
    double x, y, w, h, cw, ch;
} Ink;

static Ink text_ink(View *v)
{
    double x1 = INFINITY, y1 = INFINITY, x2 = -INFINITY, y2 = -INFINITY;
#define ADD(X, Y, W_, H_) do { if ((W_) > 0 && (H_) > 0) { \
        x1 = MIN(x1, X); y1 = MIN(y1, Y); x2 = MAX(x2, (X) + (W_)); y2 = MAX(y2, (Y) + (H_)); } } while (0)
    if (v->word) {
        double cx = (v->cw - v->word->bw) / 2;
        ADD(cx + v->word->ink_x, v->word->ink_y, v->word->ink_w, v->word->ink_h);
    }
    ADD((v->cw - v->rule_w) / 2, v->y_rule, v->rule_w, v->rule_h);
    if (v->def) {
        double cx = (v->cw - v->def->bw) / 2;
        ADD(cx + v->def->ink_x, v->y_def + v->def->ink_y, v->def->ink_w, v->def->ink_h);
    }
    if (v->credit && v->credit_visible) {
        double cx = (v->cw - v->credit->bw) / 2;
        ADD(cx + v->credit->ink_x, v->y_credit + v->credit->ink_y, v->credit->ink_w, v->credit->ink_h);
    }
#undef ADD
    if (x1 == INFINITY)
        return (Ink){0, 0, v->cw, v->ch, v->cw, v->ch};
    return (Ink){x1, y1, x2 - x1, y2 - y1, v->cw, v->ch};
}

static Rect text_rect(View *v, Ink ink, double s, double tx, double ty)
{
    double cx = v->W / 2.0 + tx, cy = v->H / 2.0 + ty;
    return (Rect){cx + (ink.x - ink.cw / 2) * s, cy + (ink.y - ink.ch / 2) * s, ink.w * s, ink.h * s};
}

static bool fit_text(View *v, Ink ink, Rect C, double m, double *odx, double *ody)
{
    double W = v->W;
    Rect f = footer_rect(v);
    double eps = 0.5;
    Rect t = text_rect(v, ink, 1, v->tx, v->ty);
    if (rect_is_free(t, &C, 1, m - eps)) {
        *odx = *ody = 0;
        return true;
    }
    double moves[4][2] = {
        {0, C.y + C.h + m - t.y},
        {0, C.y - m - (t.y + t.h)},
        {C.x + C.w + m - t.x, 0},
        {C.x - m - (t.x + t.w), 0},
    };
    bool found = false;
    double best = INFINITY;
    for (int i = 0; i < 4; i++) {
        Rect r = {t.x + moves[i][0], t.y + moves[i][1], t.w, t.h};
        bool inside = r.x >= m - eps && r.x + r.w <= W - m + eps && r.y >= m - eps && r.y + r.h <= f.y - m + eps;
        if (!inside || !rect_is_free(r, &C, 1, m - eps))
            continue;
        double d = fabs(moves[i][0]) + fabs(moves[i][1]);
        if (d < best) {
            best = d;
            *odx = moves[i][0];
            *ody = moves[i][1];
            found = true;
        }
    }
    return found;
}

static void apply_text_fit(View *v, double dx, double dy)
{
    v->tx += signd(dx) * ceil(fabs(dx));
    v->ty += signd(dy) * ceil(fabs(dy));
}

static CRect special_rect(View *v, double rw, double rh)
{
    double W = v->W, H = v->H;
    if (v->quad) {
        int cq = bg_clock_quadrant(v->bg);
        if (cq < 0)
            cq = bg_heart_quadrant(v->bg);
        int q = cq >= 0 ? cq : 3 - MAX(0, v->text_q);
        int col = q % 2, row = q / 2;
        return (CRect){{col * v->qw + (v->qw - rw) / 2, row * v->qh + (v->qh - rh) / 2, rw, rh}, 0.5, 0.5};
    }
    if (v->cfg.style == STYLE_OCEAN)
        return (CRect){{(W - rw) / 2, round(H * CLOCK_TOP), rw, rh}, 0.5, 0};
    return (CRect){{(W - rw) / 2, H - rh, rw, rh}, 0.5, 1};
}

static CRect fallback_rect(View *v, double rw, double rh, double m)
{
    double W = v->W, H = v->H;
    if (v->cfg.style == STYLE_OCEAN)
        return (CRect){{(W - rw) / 2, round(H * CLOCK_TOP), rw, rh}, 0.5, 0};
    Rect f = footer_rect(v);
    return (CRect){{(W - rw) / 2, f.y - m - rh, rw, rh}, 0.5, 1};
}

static bool random_rect(View *v, double rw, double rh, double m, const Rect *obs, int nobs, CRect *out)
{
    double W = v->W, H = v->H;
    double step = MAX(8, round(m / 2));
    GArray *free_ = g_array_new(FALSE, FALSE, sizeof(Rect));
    for (double y = m; y <= H - m - rh + 0.5; y += step) {
        for (double x = m; x <= W - m - rw + 0.5; x += step) {
            Rect r = {x, y, rw, rh};
            if (rect_is_free(r, obs, nobs, m))
                g_array_append_val(free_, r);
        }
    }
    if (!free_->len) {
        g_array_unref(free_);
        return false;
    }
    GArray *pool = free_;
    GArray *far = NULL;
    if (v->have_box) {
        Rect prev = v->box.rect.r;
        far = g_array_new(FALSE, FALSE, sizeof(Rect));
        for (guint i = 0; i < free_->len; i++) {
            Rect r = g_array_index(free_, Rect, i);
            if (hypot(r.x - prev.x, r.y - prev.y) > W * 0.2)
                g_array_append_val(far, r);
        }
        if (far->len)
            pool = far;
    }
    Rect pick = g_array_index(pool, Rect, (guint)(rnd() * pool->len));
    *out = (CRect){pick, 0, 0};
    g_array_unref(free_);
    if (far)
        g_array_unref(far);
    return true;
}

static void ensure_clock_tex(View *v, int si)
{
    if (v->clock && v->clock_tex_si == si)
        return;
    text_free(v->clock);
    TextStyle ts;
    clock_style(v, si, &ts);
    v->clock = text_render(v->clock_text, &ts);
    v->clock_tex_si = si;
}

static void align_clock(View *v)
{
    if (!v->have_box)
        return;
    ensure_clock_tex(v, v->box.si);
    if (!v->clock)
        return;
    CRect *rc = &v->box.rect;
    double y = rc->r.y + rc->ay * (rc->r.h - v->clock->ink_h);
    double lx;
    if (rc->ax == 0.5)
        lx = rc->r.x + rc->r.w / 2 - v->clock->bw / 2;
    else
        lx = rc->r.x + rc->ax * (rc->r.w - v->clock->ink_w) - v->clock->ink_x;
    v->clock_lx = round(lx);
    v->clock_ly = round(y - v->clock->ink_y);
}

static void fade_clock(View *v, double opacity, double delay, double dur)
{
    v->clock_shown = opacity > 0;
    tween_to(&v->clock_op, opacity, delay, dur, EASE_OUT_QUAD, NULL, NULL);
}

static void avoid_heart(View *v, const Rect *r)
{
    if (!v->quad)
        return;
    if (!r) {
        bg_set_heart_avoid(v->bg, NULL);
        return;
    }
    double m = round(v->H * HEART_GAP);
    Rect a = {r->x - m, r->y - m, r->w + 2 * m, r->h + 2 * m};
    bg_set_heart_avoid(v->bg, &a);
}

static void place_clock(View *v, const ClockBox *box)
{
    v->box = *box;
    v->have_box = true;
    align_clock(v);
    fade_clock(v, v->clock_opacity, 250, CLOCK_FADE_MS);
}

static void move_clock(View *v, const ClockBox *box)
{
    v->move_pending = false;
    if (!box) {
        v->have_box = false;
        avoid_heart(v, NULL);
        fade_clock(v, 0, 0, 300);
        return;
    }
    avoid_heart(v, &box->rect.r);
    bool same = v->have_box && v->box.si == box->si && fabs(v->box.rect.r.x - box->rect.r.x) < 2 &&
                fabs(v->box.rect.r.y - box->rect.r.y) < 2;
    if (same && v->clock_shown) {
        v->box = *box;
        align_clock(v);
        return;
    }
    if (!v->clock_shown) {
        place_clock(v, box);
        return;
    }
    fade_clock(v, 0, 0, 300);
    v->move_pending = true;
    v->move_at = now_s() + CLOCK_MOVE_MS / 1000.0;
    v->move_box = *box;
}

static void layout_clock(View *v, bool fresh)
{
    if (!v->clock_on)
        return;
    if (v->clock_waiting && !fresh)
        return;
    v->clock_waiting = false;
    double m = round(v->H * CLOCK_MARGIN);
    bool random = v->cfg.clock_pos == CLOCK_RANDOM;
    double rw, rh;

    if (v->cfg.clock_pos == CLOCK_CUSTOM) {
        clock_reserve(v, 0, &rw, &rh);
        double ax = clampd(v->cfg.clock_x, 0, 100) / 100.0, ay = clampd(v->cfg.clock_y, 0, 100) / 100.0;
        ClockBox b = {{{ax * (v->W - rw), ay * (v->H - rh), rw, rh}, ax, ay}, 0, HOW_CUSTOM};
        move_clock(v, &b);
        return;
    }
    if (!random) {
        clock_reserve(v, 0, &rw, &rh);
        ClockBox b = {special_rect(v, rw, rh), 0, HOW_SPECIAL};
        move_clock(v, &b);
        return;
    }

    int scales[NSCALES], ns = 0;
    if (v->run_si >= 0)
        scales[ns++] = v->run_si;
    else
        for (int i = 0; i < NSCALES; i++)
            scales[ns++] = i;

    ClockBox box;
    bool have = false;
    if (v->quad) {
        Rect taken[2];
        int nt = occupied(v, taken);
        if (!fresh && v->have_box && rect_is_free(v->box.rect.r, taken, nt, m)) {
            box = v->box;
            have = true;
        }
        for (int k = 0; k < ns && !have; k++) {
            clock_reserve(v, scales[k], &rw, &rh);
            CRect rc;
            if (random_rect(v, rw, rh, m, taken, nt, &rc)) {
                box = (ClockBox){rc, scales[k], HOW_RANDOM};
                have = true;
            }
        }
    } else {
        Ink ink = text_ink(v);
        Rect obs[2] = {text_rect(v, ink, 1, v->tx, v->ty), footer_rect(v)};
        for (int k = 0; k < ns && !have; k++) {
            for (int how = 0; how < 2 && !have; how++) {
                clock_reserve(v, scales[k], &rw, &rh);
                if (how == 0) {
                    CRect rc;
                    if (random_rect(v, rw, rh, m, obs, 2, &rc)) {
                        box = (ClockBox){rc, scales[k], HOW_RANDOM};
                        have = true;
                    }
                } else {
                    CRect rc = fallback_rect(v, rw, rh, m);
                    double dx, dy;
                    bool fit = fit_text(v, ink, rc.r, m, &dx, &dy);
                    if (!fit && v->cfg.style == STYLE_OCEAN) {
                        rc.r.y = m;
                        fit = fit_text(v, ink, rc.r, m, &dx, &dy);
                    }
                    if (fit) {
                        apply_text_fit(v, dx, dy);
                        box = (ClockBox){rc, scales[k], HOW_SPECIAL};
                        have = true;
                    }
                }
            }
        }
    }
    if (have && v->run_si < 0)
        v->run_si = box.si;
    move_clock(v, have ? &box : NULL);
}

static void safe_layout_clock(View *v, bool fresh)
{
    layout_clock(v, fresh);
}

static void hide_clock(View *v)
{
    if (!v->clock_on)
        return;
    v->clock_waiting = true;
    v->move_pending = false;
    if (v->clock_shown)
        fade_clock(v, 0, 0, 500);
}

static void place_quad(View *v, int q)
{
    v->text_q = q;
    v->pending_q = -1;
    safe_layout_clock(v, false);
}

static void expect_quad(View *v, int q)
{
    v->pending_q = q;
    safe_layout_clock(v, false);
}

static void moving_done(void *data)
{
    ((View *)data)->moving = false;
}

static void follow_fade_out_done(void *data)
{
    View *v = data;
    place_quad(v, v->move_to);
    tween_to(&v->quad_op, 1, 0, 1100, EASE_OUT_QUAD, moving_done, v);
}

static void follow_red(View *v, int q)
{
    if (q == v->text_q || v->moving)
        return;
    if (v->text_q < 0) {
        place_quad(v, q);
        tween_to(&v->quad_op, 1, 0, 600, EASE_OUT_QUAD, NULL, NULL);
        return;
    }
    v->moving = true;
    v->move_to = q;
    expect_quad(v, q);
    tween_to(&v->quad_op, 0, 0, 700, EASE_IN_QUAD, follow_fade_out_done, v);
}

static void make_def(View *v)
{
    text_free(v->def);
    v->def_style.size_px = v->def_px;
    v->def = text_render(v->def_text, &v->def_style);
}

static void relayout_content(View *v)
{
    double ww = v->word ? v->word->bw : 0, wh = v->word ? v->word->bh : 0;
    double dw = v->def ? v->def->bw : 0, dh = v->def ? v->def->bh : 0;
    double crw = v->credit && v->credit_visible ? v->credit->bw : 0;
    double crh = v->credit && v->credit_visible ? v->credit->bh : 0;
    v->cw = MAX(MAX(ww, v->rule_w), MAX(dw, crw));
    v->y_rule = wh + v->rule_mt;
    v->y_def = v->y_rule + v->rule_h + v->rule_mb;
    v->y_credit = v->y_def + dh + (v->credit_visible ? v->credit_mt : 0);
    v->ch = v->y_credit + crh;
}

static void shrink_definition(View *v, double max_h)
{
    double min = round(v->H * DEF_MIN);
    TextTex m;
    for (;;) {
        v->def_style.size_px = v->def_px;
        text_measure(v->def_text, &v->def_style, &m);
        double ch = (v->word ? v->word->bh : 0) + v->rule_mt + v->rule_h + v->rule_mb + m.bh +
                    (v->credit_visible && v->credit ? v->credit_mt + v->credit->bh : 0);
        if (ch <= max_h || v->def_px <= min)
            break;
        v->def_px = MAX(min, floor(v->def_px * DEF_STEP));
    }
}

static void apply_entry(View *v, const Entry *e)
{
    const StyleDef *st = v->st;
    double H = v->H, W = v->W;
    glong len = g_utf8_strlen(e->w, -1);
    double box_w = v->quad ? W / 2 : W;
    double max_px = v->quad ? H * st->word_scale * 0.72 : H * st->word_scale;
    double word_px = MAX(24 * v->scale, MIN(max_px, (box_w * 0.86) / (MAX(len, 4) * st->char_width)));

    TextStyle ws;
    text_style_init(&ws, v->word_font, st->word_generic, round(word_px));
    memcpy(ws.rgba, st->word_rgba, sizeof ws.rgba);
    ws.weight = st->word_weight;
    ws.nshadows = st->word_nshadow;
    ws.shadow[0] = st->word_shadow;
    ws.shadow[0].blur *= v->scale;
    ws.shadow[0].x *= v->scale;
    ws.shadow[0].y *= v->scale;
    text_free(v->word);
    v->word = text_render(e->w, &ws);

    g_free(v->def_text);
    v->def_text = format_definition(e->d, 3, 220);
    glong dl = g_utf8_strlen(v->def_text, -1);
    double def_scale = 0.034;
    if (dl > 450)
        def_scale = 0.022;
    else if (dl > 300)
        def_scale = 0.025;
    else if (dl > 160)
        def_scale = 0.029;
    if (v->quad)
        def_scale *= 0.82;
    v->def_px = round(H * def_scale);

    v->credit_visible = e->prank;

    double drift = v->quad ? 0.4 : 1;
    v->tx = round((rnd() - 0.5) * 0.05 * drift * W);
    v->ty = round((rnd() - 0.5) * 0.04 * drift * H);

    v->cscale = 1;
    if (v->quad) {
        shrink_definition(v, v->qh * 0.8);
        make_def(v);
        relayout_content(v);
        double fit = MIN(1, MIN(v->qh * 0.8 / MAX(v->ch, 1), v->qw * 0.9 / MAX(v->cw, 1)));
        v->cscale = fit;
    } else {
        make_def(v);
        relayout_content(v);
    }
    safe_layout_clock(v, true);
}

static void show_new(View *v)
{
    if (!v->pending)
        return;
    bool first = v->pending_first;
    apply_entry(v, v->pending);
    tween_set(&v->content_op, 1);
    tween_set(&v->content_ty, 0);

    tween_set(&v->credit_op, 0);
    if (v->pending->prank)
        tween_to(&v->credit_op, 200 / 255.0, first ? 1700 : 1200, WORD_IN_MS, EASE_OUT_QUAD, NULL, NULL);

    tween_set(&v->word_op, 0);
    tween_set(&v->word_ty, v->lift);
    tween_to(&v->word_op, 1, first ? 700 : 200, WORD_IN_MS, EASE_OUT_CUBIC, NULL, NULL);
    tween_to(&v->word_ty, 0, first ? 700 : 200, WORD_IN_MS, EASE_OUT_CUBIC, NULL, NULL);

    tween_set(&v->rule_op, 0);
    tween_set(&v->rule_sx, 0);
    tween_to(&v->rule_op, 1, first ? 1000 : 500, 1200, EASE_IN_OUT_SINE, NULL, NULL);
    tween_to(&v->rule_sx, 1, first ? 1000 : 500, 1200, EASE_IN_OUT_SINE, NULL, NULL);

    tween_set(&v->def_op, 0);
    tween_set(&v->def_ty, round(v->lift * 0.6));
    tween_to(&v->def_op, 235 / 255.0, first ? 1250 : 750, WORD_IN_MS, EASE_OUT_CUBIC, NULL, NULL);
    tween_to(&v->def_ty, 0, first ? 1250 : 750, WORD_IN_MS, EASE_OUT_CUBIC, NULL, NULL);

    entry_free(v->pending);
    v->pending = NULL;
}

static void content_out_done(void *data)
{
    show_new(data);
}

static void quad_move_done(void *data)
{
    View *v = data;
    place_quad(v, v->move_to);
    show_new(v);
    tween_to(&v->quad_op, 1, 0, 400, EASE_OUT_QUAD, moving_done, v);
}

void view_present(View *v, const Entry *e, bool first, int interval)
{
    v->lift = round(v->H * 0.022);
    int move_to = -1;
    if (v->quad) {
        bg_next_word(v->bg, interval);
        int q = bg_text_quadrant(v->bg, v->time);
        if (!first && !v->moving && v->text_q >= 0 && q != v->text_q)
            move_to = q;
    }
    entry_free(v->pending);
    v->pending = entry_copy(e);
    v->pending_first = first;
    if (first) {
        show_new(v);
        return;
    }
    if (v->clock_on && v->cfg.clock_pos == CLOCK_RANDOM)
        hide_clock(v);
    if (move_to >= 0) {
        v->moving = true;
        v->move_to = move_to;
        expect_quad(v, move_to);
        tween_to(&v->quad_op, 0, 0, WORD_OUT_MS, EASE_IN_QUAD, quad_move_done, v);
        return;
    }
    tween_to(&v->content_ty, -v->lift, 0, WORD_OUT_MS, EASE_IN_QUAD, NULL, NULL);
    tween_to(&v->content_op, 0, 0, WORD_OUT_MS, EASE_IN_QUAD, content_out_done, v);
}

static void make_footer(View *v)
{
    TextStyle fs;
    text_style_init(&fs, v->text_font, v->st->text_generic, round(v->H * 0.016));
    memcpy(fs.rgba, v->st->footer_rgba, sizeof fs.rgba);
    fs.letter_spacing_em = 0.08;
    text_free(v->footer);
    v->footer = text_render(v->footer_text, &fs);
}

void view_update_clock(View *v, const char *footer, const char *time)
{
    if (g_strcmp0(v->footer_text, footer) != 0) {
        g_free(v->footer_text);
        v->footer_text = g_strdup(footer);
        make_footer(v);
    }
    if (v->clock_on && strcmp(v->clock_text, time) != 0) {
        g_strlcpy(v->clock_text, time, sizeof v->clock_text);
        text_free(v->clock);
        v->clock = NULL;
        align_clock(v);
    }
}

View *view_new(const Config *cfg, int W, int H, int ox, int oy, double scale)
{
    View *v = g_new0(View, 1);
    v->cfg = *cfg;
    v->st = style_def(cfg->style);
    v->W = MAX(1, W);
    v->H = MAX(1, H);
    v->ox = ox;
    v->oy = oy;
    v->scale = scale > 0 ? scale : 1;
    const char *wf, *tf;
    style_fonts(cfg, &wf, &tf);
    v->word_font = g_strdup(wf);
    v->text_font = g_strdup(tf);
    v->bg = bg_new(cfg->style, v->W, v->H, ox, oy, "Crimson Text");
    v->quad = bg_has_quadrants(v->bg);
    v->qw = v->W / 2;
    v->qh = v->H / 2;
    v->text_q = v->pending_q = -1;
    v->heart_q = -1;
    v->run_si = -1;
    tween_init(&v->quad_op, 0);
    tween_init(&v->content_op, 1);
    tween_init(&v->content_ty, 0);
    tween_init(&v->word_op, 0);
    tween_init(&v->word_ty, 0);
    tween_init(&v->rule_op, 0);
    tween_init(&v->rule_sx, 0);
    tween_init(&v->def_op, 0);
    tween_init(&v->def_ty, 0);
    tween_init(&v->credit_op, 0);
    tween_init(&v->clock_op, 0);
    tween_init(&v->blur, 0);

    double Hh = v->H;
    v->rule_w = round(Hh * 0.12);
    v->rule_h = MAX(1, round(v->st->rule_h * v->scale));
    v->rule_mt = round(Hh * 0.02);
    v->rule_mb = round(Hh * 0.032);
    v->credit_mt = round(Hh * 0.03);
    v->footer_mb = round(Hh * (v->quad ? 0.025 : 0.045));

    text_style_init(&v->def_style, v->text_font, v->st->text_generic, round(Hh * 0.034));
    memcpy(v->def_style.rgba, v->st->def_rgba, sizeof v->def_style.rgba);
    v->def_style.italic = v->st->def_italic;
    v->def_style.weight = v->st->def_weight;
    v->def_style.nshadows = v->st->def_nshadow;
    v->def_style.shadow[0] = v->st->def_shadow;
    v->def_style.shadow[0].blur *= v->scale;
    v->def_style.shadow[0].y *= v->scale;
    v->def_style.wrap_width = v->quad ? round(v->qw * 0.84) : round(v->W * v->st->def_width);

    TextStyle cs;
    text_style_init(&cs, v->text_font, v->st->text_generic, round(Hh * 0.013));
    memcpy(cs.rgba, v->st->credit_rgba, sizeof cs.rgba);
    cs.letter_spacing_em = 0.06;
    v->credit = text_render(PRANK_CREDIT, &cs);

    v->clock_on = cfg->clock_enabled;
    v->clock_opacity = 1 - clampd(cfg->clock_transparency, 0, 100) / 100.0;
    char *t = clock_time();
    g_strlcpy(v->clock_text, t, sizeof v->clock_text);
    g_free(t);
    v->footer_text = polish_date(!v->clock_on);
    make_footer(v);
    return v;
}

void view_free(View *v)
{
    if (!v)
        return;
    bg_free(v->bg);
    text_free(v->word);
    text_free(v->def);
    text_free(v->credit);
    text_free(v->footer);
    text_free(v->clock);
    entry_free(v->pending);
    fbo_free(&v->f_scene);
    fbo_free(&v->f_tmp);
    fbo_free(&v->f_blur);
    g_free(v->def_text);
    g_free(v->footer_text);
    g_free(v->word_font);
    g_free(v->text_font);
    g_free(v);
}

void view_set_time(View *v, double t)
{
    v->time = t;
    Tween *all[] = {&v->quad_op, &v->content_op, &v->content_ty, &v->word_op, &v->word_ty, &v->rule_op,
                    &v->rule_sx, &v->def_op, &v->def_ty, &v->credit_op, &v->clock_op, &v->blur};
    for (size_t i = 0; i < G_N_ELEMENTS(all); i++)
        tween_tick(all[i]);
    if (v->move_pending && now_s() >= v->move_at) {
        v->move_pending = false;
        place_clock(v, &v->move_box);
    }
    bg_set_time(v->bg, t);
    if (v->quad) {
        follow_red(v, bg_text_quadrant(v->bg, t));
        int hq = bg_clock_quadrant(v->bg);
        if (hq != v->heart_q) {
            v->heart_q = hq;
            if (v->cfg.clock_pos == CLOCK_SPECIAL)
                safe_layout_clock(v, false);
        }
    }
}

void view_set_blur(View *v, bool on)
{
    tween_to(&v->blur, on ? 1 : 0, 0, on ? 350 : 450, EASE_OUT_QUAD, NULL, NULL);
}

static void draw_text_in_group(TextTex *t, double bx, double by, double alpha, double pvx, double pvy,
                               double s)
{
    if (!t || alpha <= 0.001)
        return;
    Xform f = xform_at(bx - t->ox, by - t->oy, t->tex.w, t->tex.h, alpha);
    f.px = pvx;
    f.py = pvy;
    f.sx = f.sy = s;
    gl_draw_tex(&t->tex, &f);
}

static void draw_content(View *v, double group_alpha)
{
    double cx, cy;
    if (v->quad) {
        int q = v->text_q >= 0 ? v->text_q : 0;
        double mb = round(v->H * 0.04);
        cx = (q % 2) * v->qw + v->qw / 2.0 + v->tx;
        cy = (q / 2) * v->qh + (v->qh - mb) / 2.0 + v->ty;
    } else {
        cx = v->W / 2.0 + v->tx;
        cy = v->H / 2.0 + v->ty;
    }
    double cty = tween_value(&v->content_ty);
    double s = v->cscale;
    double x0 = round(cx - v->cw / 2), y0 = round(cy - v->ch / 2) + cty;
    double pvx = cx, pvy = cy + cty;
    double a = group_alpha * tween_value(&v->content_op);
    if (a <= 0.001)
        return;
    if (v->word)
        draw_text_in_group(v->word, x0 + round((v->cw - v->word->bw) / 2), y0 + tween_value(&v->word_ty),
                           a * tween_value(&v->word_op), pvx, pvy, s);
    double rop = a * tween_value(&v->rule_op);
    if (rop > 0.001) {
        double rx = x0 + (v->cw - v->rule_w) / 2, ry = y0 + v->y_rule;
        double sx = tween_value(&v->rule_sx);
        double rcx = rx + v->rule_w / 2;
        double w = v->rule_w * sx;
        double gx = pvx + (rcx - w / 2 - pvx) * s, gy = pvy + (ry - pvy) * s;
        Xform f = xform_at(gx, gy, w * s, v->rule_h * s, 1);
        gl_draw_color(&f, v->st->rule_rgba[0], v->st->rule_rgba[1], v->st->rule_rgba[2], v->st->rule_rgba[3] * rop);
    }
    if (v->def)
        draw_text_in_group(v->def, x0 + round((v->cw - v->def->bw) / 2),
                           y0 + v->y_def + tween_value(&v->def_ty), a * tween_value(&v->def_op), pvx, pvy, s);
    if (v->credit && v->credit_visible)
        draw_text_in_group(v->credit, x0 + round((v->cw - v->credit->bw) / 2), y0 + v->y_credit,
                           a * tween_value(&v->credit_op), pvx, pvy, s);
}

static void draw_footer(View *v, double alpha)
{
    if (!v->footer)
        return;
    double fx, fy;
    if (v->quad) {
        int q = v->text_q >= 0 ? v->text_q : 0;
        fx = (q % 2) * v->qw + (v->qw - v->footer->bw) / 2;
        fy = (q / 2) * v->qh + v->qh - v->footer_mb - v->footer->bh;
    } else {
        fx = (v->W - v->footer->bw) / 2;
        fy = v->H - v->footer_mb - v->footer->bh;
    }
    Xform f = xform_at(round(fx - v->footer->ox), round(fy - v->footer->oy), v->footer->tex.w,
                       v->footer->tex.h, alpha);
    gl_draw_tex(&v->footer->tex, &f);
}

static void draw_scene(View *v)
{
    bg_draw(v->bg);
    if (v->clock_on && v->have_box) {
        ensure_clock_tex(v, v->box.si);
        double a = tween_value(&v->clock_op);
        if (v->clock && a > 0.001) {
            Xform f = xform_at(v->clock_lx - v->clock->ox, v->clock_ly - v->clock->oy, v->clock->tex.w,
                               v->clock->tex.h, a);
            gl_draw_tex(&v->clock->tex, &f);
        }
    }
    if (v->quad) {
        double qa = tween_value(&v->quad_op);
        draw_content(v, qa);
        draw_footer(v, qa);
    } else {
        draw_content(v, 1);
        draw_footer(v, 1);
    }
}

void view_draw(View *v)
{
    double b = tween_value(&v->blur);
    if (b <= 0.01) {
        draw_scene(v);
        return;
    }
    draw_scene(v);
    int fw = MAX(1, v->W / 4), fh = MAX(1, v->H / 4);
    fbo_ensure(&v->f_scene, fw, fh);
    GLint prev = 0;
    glGetIntegerv(GL_FRAMEBUFFER_BINDING, &prev);
    glBindFramebuffer(GL_FRAMEBUFFER, v->f_scene.fb);
    glViewport(0, 0, fw, fh);
    gl_canvas(v->W, v->H);
    glClearColor(0, 0, 0, 1);
    glClear(GL_COLOR_BUFFER_BIT);
    draw_scene(v);
    gl_blur(&v->f_scene, &v->f_tmp, &v->f_blur, 64 * v->scale / 4);
    glBindFramebuffer(GL_FRAMEBUFFER, prev);
    gl_viewport(v->W, v->H);
    Xform f = xform_at(0, 0, v->W, v->H, b);
    gl_draw_tex(&v->f_blur.tex, &f);
    gl_draw_color(&f, 0, 0, 0, 0.28);
}
