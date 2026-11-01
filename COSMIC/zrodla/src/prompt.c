#include "prompt.h"
#include "text.h"
#include "util.h"
#include "view.h"

#include <pango/pangocairo.h>
#include <string.h>
#include <xkbcommon/xkbcommon-keysyms.h>

#define IDLE_HIDE_S 12
#define MAX_FAILS 5
#define LOCKOUT_S 30
#define MAX_LENGTH 6

struct Prompt {
    Config cfg;
    CodeGuard *guard;
    PromptFunc on_success, on_shown, on_hidden;
    void *data;
    bool visible;
    char input[MAX_LENGTH + 1];
    char message[128];
    double hide_at;
    Tween op, shake;
    int shake_step;
    Tex tex;
    char key[256];
    double box_w, box_h, tex_ox, tex_oy;
};

Prompt *prompt_new(const Config *cfg, CodeGuard *guard, PromptFunc on_success, PromptFunc on_shown,
                   PromptFunc on_hidden, void *data)
{
    Prompt *p = g_new0(Prompt, 1);
    p->cfg = *cfg;
    p->guard = guard;
    p->on_success = on_success;
    p->on_shown = on_shown;
    p->on_hidden = on_hidden;
    p->data = data;
    strcpy(p->message, " ");
    tween_init(&p->op, 0);
    tween_init(&p->shake, 0);
    return p;
}

void prompt_release_gl(Prompt *p)
{
    tex_free(&p->tex);
    p->key[0] = 0;
}

void prompt_free(Prompt *p)
{
    if (!p)
        return;
    prompt_release_gl(p);
    g_free(p);
}

bool prompt_visible(Prompt *p)
{
    return p->visible;
}

static int locked_remaining(Prompt *p)
{
    return MAX(0, (int)ceil(p->guard->locked_until - now_s()));
}

static void arm_hide(Prompt *p)
{
    p->hide_at = now_s() + IDLE_HIDE_S;
}

void prompt_show(Prompt *p)
{
    arm_hide(p);
    if (p->visible)
        return;
    p->visible = true;
    if (p->on_shown)
        p->on_shown(p->data);
    tween_to(&p->op, 1, 0, 220, EASE_OUT_QUAD, NULL, NULL);
}

void prompt_hide(Prompt *p)
{
    p->hide_at = 0;
    if (!p->visible)
        return;
    p->visible = false;
    p->input[0] = 0;
    tween_to(&p->op, 0, 0, 300, EASE_OUT_QUAD, NULL, NULL);
    if (p->on_hidden)
        p->on_hidden(p->data);
}

static void shake_next(void *data);

static void start_shake(Prompt *p)
{
    p->shake_step = 0;
    shake_next(p);
}

static void shake_next(void *data)
{
    Prompt *p = data;
    static const double steps[] = {1, -1, 0.6, -0.6, 0};
    if (p->shake_step >= 5)
        return;
    double target = steps[p->shake_step++];
    tween_to(&p->shake, target, 0, 55, EASE_IN_OUT_SINE, shake_next, p);
}

static void submit(Prompt *p)
{
    if (!p->input[0])
        return;
    if (code_verify(p->cfg.unlock_code, p->input)) {
        p->input[0] = 0;
        p->guard->fails = 0;
        if (p->on_success)
            p->on_success(p->data);
        return;
    }
    p->guard->fails++;
    p->input[0] = 0;
    start_shake(p);
    if (p->guard->fails >= MAX_FAILS) {
        p->guard->fails = 0;
        p->guard->locked_until = now_s() + LOCKOUT_S;
    } else {
        g_strlcpy(p->message, "Nieprawidłowy kod", sizeof p->message);
    }
}

void prompt_key(Prompt *p, unsigned int sym, const char *utf8)
{
    prompt_show(p);
    if (locked_remaining(p) > 0)
        return;
    if (sym == XKB_KEY_Escape) {
        prompt_hide(p);
        return;
    }
    if (sym == XKB_KEY_BackSpace) {
        size_t n = strlen(p->input);
        if (n)
            p->input[n - 1] = 0;
        strcpy(p->message, " ");
        return;
    }
    if (sym == XKB_KEY_Return || sym == XKB_KEY_KP_Enter || sym == XKB_KEY_ISO_Enter) {
        submit(p);
        return;
    }
    if (utf8 && strlen(utf8) == 1 && g_ascii_isalnum(utf8[0])) {
        size_t n = strlen(p->input);
        if (n < MAX_LENGTH) {
            p->input[n] = utf8[0];
            p->input[n + 1] = 0;
            strcpy(p->message, " ");
            if (n + 1 == MAX_LENGTH)
                submit(p);
        }
    }
}

void prompt_tick(Prompt *p)
{
    tween_tick(&p->op);
    tween_tick(&p->shake);
    int left = locked_remaining(p);
    if (left > 0) {
        g_snprintf(p->message, sizeof p->message, "Zbyt wiele prób, spróbuj za %d s", left);
        arm_hide(p);
    } else if (g_str_has_prefix(p->message, "Zbyt wiele")) {
        strcpy(p->message, " ");
    }
    if (p->visible && p->hide_at > 0 && now_s() >= p->hide_at && left == 0)
        prompt_hide(p);
}

static void rounded_rect(cairo_t *cr, double x, double y, double w, double h, double r)
{
    if (r <= 0) {
        cairo_rectangle(cr, x, y, w, h);
        return;
    }
    cairo_new_sub_path(cr);
    cairo_arc(cr, x + w - r, y + r, r, -M_PI / 2, 0);
    cairo_arc(cr, x + w - r, y + h - r, r, 0, M_PI / 2);
    cairo_arc(cr, x + r, y + h - r, r, M_PI / 2, M_PI);
    cairo_arc(cr, x + r, y + r, r, M_PI, 3 * M_PI / 2);
    cairo_close_path(cr);
}

static PangoLayout *layout(cairo_t *cr, const char *family, const char *generic, double px,
                           const char *text, double spacing_em)
{
    PangoLayout *l = pango_cairo_create_layout(cr);
    PangoFontDescription *fd = pango_font_description_new();
    char *fam = g_strdup_printf("%s,%s", family, generic);
    pango_font_description_set_family(fd, fam);
    g_free(fam);
    pango_font_description_set_absolute_size(fd, px * PANGO_SCALE);
    pango_layout_set_font_description(l, fd);
    pango_font_description_free(fd);
    if (spacing_em) {
        PangoAttrList *a = pango_attr_list_new();
        pango_attr_list_insert(a, pango_attr_letter_spacing_new((int)(spacing_em * px * PANGO_SCALE)));
        pango_layout_set_attributes(l, a);
        pango_attr_list_unref(a);
    }
    pango_layout_set_text(l, text, -1);
    return l;
}

static void rebuild(Prompt *p, int H, double scale)
{
    const StyleDef *st = style_def(p->cfg.style);
    const char *wf, *tf;
    style_fonts(&p->cfg, &wf, &tf);
    double pad_v = round(H * 0.022), pad_h = round(H * 0.04);
    double title_px = round(H * 0.019), title_mb = round(H * 0.016);
    double slot = round(H * 0.042), slot_m = round(slot * 0.14);
    double msg_px = round(H * 0.015), msg_mt = round(H * 0.014);
    double border = MAX(1, round(scale));

    cairo_surface_t *tmp = cairo_image_surface_create(CAIRO_FORMAT_ARGB32, 1, 1);
    cairo_t *mc = cairo_create(tmp);
    PangoLayout *lt = layout(mc, tf, st->text_generic, title_px, "Wpisz kod, aby odblokować", 0.06);
    PangoLayout *lm = layout(mc, tf, st->text_generic, msg_px, p->message, 0);
    int tw, th, mw, mh;
    pango_layout_get_pixel_size(lt, &tw, &th);
    pango_layout_get_pixel_size(lm, &mw, &mh);
    double slots_w = MAX_LENGTH * (slot + 2 * slot_m);
    double inner_w = MAX(MAX(tw, slots_w), mw);
    double bw = inner_w + 2 * pad_h, bh = pad_v + th + title_mb + slot + msg_mt + mh + pad_v;
    double margin = 4;
    int W = (int)ceil(bw + 2 * margin), Hh = (int)ceil(bh + 2 * margin);

    cairo_surface_t *s = cairo_image_surface_create(CAIRO_FORMAT_ARGB32, W, Hh);
    cairo_t *cr = cairo_create(s);
    double r = st->code_square ? 0 : 14 * scale;
    rounded_rect(cr, margin, margin, bw, bh, r);
    cairo_set_source_rgba(cr, 0, 0, 0, 0.72);
    cairo_fill_preserve(cr);
    cairo_set_line_width(cr, border);
    cairo_set_source_rgba(cr, st->code_border[0], st->code_border[1], st->code_border[2], st->code_border[3]);
    cairo_stroke(cr);

    double y = margin + pad_v;
    cairo_set_source_rgba(cr, 1, 1, 1, 0.85);
    cairo_move_to(cr, margin + (bw - tw) / 2, y);
    pango_cairo_show_layout(cr, lt);
    y += th + title_mb;

    double sx = margin + (bw - slots_w) / 2;
    size_t n = strlen(p->input);
    for (int i = 0; i < MAX_LENGTH; i++) {
        double x = sx + slot_m + i * (slot + 2 * slot_m);
        bool filled = (size_t)i < n;
        rounded_rect(cr, x, y, slot, slot, st->code_square ? 0 : 8 * scale);
        cairo_set_source_rgba(cr, 1, 1, 1, 0.04);
        cairo_fill_preserve(cr);
        if (filled)
            cairo_set_source_rgba(cr, st->code_filled[0], st->code_filled[1], st->code_filled[2], st->code_filled[3]);
        else
            cairo_set_source_rgba(cr, 1, 1, 1, 0.35);
        cairo_stroke(cr);
        if (filled) {
            PangoLayout *ld = layout(cr, tf, st->text_generic, round(slot * 0.6), "•", 0);
            int dw, dh;
            pango_layout_get_pixel_size(ld, &dw, &dh);
            cairo_set_source_rgba(cr, 1, 1, 1, 1);
            cairo_move_to(cr, x + (slot - dw) / 2, y + (slot - dh) / 2);
            pango_cairo_show_layout(cr, ld);
            g_object_unref(ld);
        }
    }
    y += slot + msg_mt;
    cairo_set_source_rgba(cr, 0xff / 255.0, 0x9a / 255.0, 0x9a / 255.0, 1);
    cairo_move_to(cr, margin + (bw - mw) / 2, y);
    pango_cairo_show_layout(cr, lm);

    cairo_destroy(cr);
    g_object_unref(lt);
    g_object_unref(lm);
    cairo_destroy(mc);
    cairo_surface_destroy(tmp);

    tex_free(&p->tex);
    p->tex = tex_from_cairo(s);
    cairo_surface_destroy(s);
    p->box_w = bw;
    p->box_h = bh;
    p->tex_ox = margin;
    p->tex_oy = margin;
}

void prompt_draw(Prompt *p, int W, int H, double scale)
{
    double a = tween_value(&p->op);
    if (a <= 0.001)
        return;
    char key[256];
    g_snprintf(key, sizeof key, "%d|%d|%zu|%s", W, H, strlen(p->input), p->message);
    if (strcmp(key, p->key) != 0 || !p->tex.id) {
        g_strlcpy(p->key, key, sizeof p->key);
        rebuild(p, H, scale);
    }
    double d = round(H * 0.012);
    double x = (W - p->box_w) / 2 + tween_value(&p->shake) * d;
    double y = H - round(H * 0.12) - p->box_h;
    Xform f = xform_at(round(x - p->tex_ox), round(y - p->tex_oy), p->tex.w, p->tex.h, a);
    gl_draw_tex(&p->tex, &f);
}
