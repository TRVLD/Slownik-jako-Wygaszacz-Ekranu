#include "text.h"
#include "util.h"

#include <pango/pangocairo.h>
#include <string.h>

static PangoContext *ctx;

PangoContext *text_context(void)
{
    if (!ctx) {
        PangoFontMap *fm = pango_cairo_font_map_get_default();
        ctx = pango_font_map_create_context(fm);
        cairo_font_options_t *fo = cairo_font_options_create();
        cairo_font_options_set_antialias(fo, CAIRO_ANTIALIAS_GRAY);
        cairo_font_options_set_hint_style(fo, CAIRO_HINT_STYLE_SLIGHT);
        cairo_font_options_set_hint_metrics(fo, CAIRO_HINT_METRICS_OFF);
        pango_cairo_context_set_font_options(ctx, fo);
        cairo_font_options_destroy(fo);
        pango_cairo_context_set_resolution(ctx, 96.0);
    }
    return ctx;
}

void text_style_init(TextStyle *st, const char *family, const char *generic, double size_px)
{
    memset(st, 0, sizeof *st);
    st->family = family;
    st->generic = generic ? generic : "serif";
    st->weight = PANGO_WEIGHT_NORMAL;
    st->size_px = size_px;
    st->rgba[0] = st->rgba[1] = st->rgba[2] = st->rgba[3] = 1;
    st->align = PANGO_ALIGN_CENTER;
}

static PangoLayout *make_layout(const char *text, const TextStyle *st)
{
    PangoLayout *l = pango_layout_new(text_context());
    PangoFontDescription *fd = pango_font_description_new();
    char *fam;
    if (!st->family || !*st->family || g_strcmp0(st->family, st->generic) == 0)
        fam = g_strdup(st->generic);
    else
        fam = g_strdup_printf("%s,%s", st->family, st->generic);
    pango_font_description_set_family(fd, fam);
    g_free(fam);
    pango_font_description_set_weight(fd, st->weight);
    pango_font_description_set_style(fd, st->italic ? PANGO_STYLE_ITALIC : PANGO_STYLE_NORMAL);
    pango_font_description_set_absolute_size(fd, MAX(1.0, st->size_px) * PANGO_SCALE);
    pango_layout_set_font_description(l, fd);
    pango_font_description_free(fd);

    PangoAttrList *attrs = pango_attr_list_new();
    if (st->letter_spacing_em != 0)
        pango_attr_list_insert(attrs, pango_attr_letter_spacing_new(
            (int)(st->letter_spacing_em * st->size_px * PANGO_SCALE)));
    if (st->features && *st->features)
        pango_attr_list_insert(attrs, pango_attr_font_features_new(st->features));
    pango_layout_set_attributes(l, attrs);
    pango_attr_list_unref(attrs);

    pango_layout_set_alignment(l, st->align);
    if (st->wrap_width > 0) {
        pango_layout_set_width(l, (int)(st->wrap_width * PANGO_SCALE));
        pango_layout_set_wrap(l, PANGO_WRAP_WORD_CHAR);
    }
    pango_layout_set_ellipsize(l, PANGO_ELLIPSIZE_NONE);
    pango_layout_set_text(l, text, -1);
    return l;
}

static void fill_metrics(PangoLayout *l, const TextStyle *st, TextTex *out)
{
    PangoRectangle ink, log;
    pango_layout_get_pixel_extents(l, &ink, &log);
    out->bw = st->wrap_width > 0 ? st->wrap_width : log.width;
    out->bh = log.height;
    double shift = st->wrap_width > 0 ? 0 : log.x;
    out->ink_x = ink.x - shift;
    out->ink_y = ink.y - log.y;
    out->ink_w = ink.width;
    out->ink_h = ink.height;
}

void text_measure(const char *text, const TextStyle *st, TextTex *out)
{
    memset(out, 0, sizeof *out);
    PangoLayout *l = make_layout(text ? text : "", st);
    fill_metrics(l, st, out);
    g_object_unref(l);
}

static void box_blur_a8(unsigned char *data, int w, int h, int stride, double sigma)
{
    if (sigma < 0.5)
        return;
    int r = (int)floor(sqrt(12.0 * sigma * sigma / 3.0 + 1.0) / 2.0);
    if (r < 1)
        return;
    unsigned char *tmp = g_malloc((gsize)MAX(w, h));
    for (int pass = 0; pass < 3; pass++) {
        for (int y = 0; y < h; y++) {
            unsigned char *row = data + (gsize)y * stride;
            int sum = 0;
            for (int x = -r; x <= r; x++)
                sum += row[CLAMP(x, 0, w - 1)];
            for (int x = 0; x < w; x++) {
                tmp[x] = (unsigned char)(sum / (2 * r + 1));
                sum += row[MIN(x + r + 1, w - 1)] - row[MAX(x - r, 0)];
            }
            memcpy(row, tmp, w);
        }
        for (int x = 0; x < w; x++) {
            int sum = 0;
            for (int y = -r; y <= r; y++)
                sum += data[(gsize)CLAMP(y, 0, h - 1) * stride + x];
            for (int y = 0; y < h; y++) {
                tmp[y] = (unsigned char)(sum / (2 * r + 1));
                sum += data[(gsize)MIN(y + r + 1, h - 1) * stride + x] -
                       data[(gsize)MAX(y - r, 0) * stride + x];
            }
            for (int y = 0; y < h; y++)
                data[(gsize)y * stride + x] = tmp[y];
        }
    }
    g_free(tmp);
}

TextTex *text_render(const char *text, const TextStyle *st)
{
    if (!text || !*text)
        return NULL;
    TextTex *t = g_new0(TextTex, 1);
    PangoLayout *l = make_layout(text, st);
    fill_metrics(l, st, t);
    PangoRectangle ink, log;
    pango_layout_get_pixel_extents(l, &ink, &log);

    double pad = 4 + st->size_px * 0.15;
    for (int i = 0; i < st->nshadows; i++)
        pad = MAX(pad, st->shadow[i].blur * 1.6 + MAX(fabs(st->shadow[i].x), fabs(st->shadow[i].y)) + 4);
    double x0 = MIN(0, ink.x) - pad, y0 = MIN(0, ink.y) - pad;
    double x1 = MAX(MAX(log.x + log.width, ink.x + ink.width), st->wrap_width) + pad;
    double y1 = MAX(log.y + log.height, ink.y + ink.height) + pad;
    int W = (int)ceil(x1 - x0), H = (int)ceil(y1 - y0);
    W = CLAMP(W, 1, 8192);
    H = CLAMP(H, 1, 8192);
    double shift = st->wrap_width > 0 ? 0 : log.x;
    t->ox = -x0 + shift;
    t->oy = -y0 + log.y;

    cairo_surface_t *surf = cairo_image_surface_create(CAIRO_FORMAT_ARGB32, W, H);
    cairo_t *cr = cairo_create(surf);
    for (int i = 0; i < st->nshadows; i++) {
        const Shadow *sh = &st->shadow[i];
        cairo_surface_t *mask = cairo_image_surface_create(CAIRO_FORMAT_A8, W, H);
        cairo_t *mc = cairo_create(mask);
        cairo_move_to(mc, -x0, -y0);
        pango_cairo_show_layout(mc, l);
        cairo_destroy(mc);
        cairo_surface_flush(mask);
        box_blur_a8(cairo_image_surface_get_data(mask), W, H,
                    cairo_image_surface_get_stride(mask), sh->blur / 2.0);
        cairo_surface_mark_dirty(mask);
        cairo_set_source_rgba(cr, sh->rgba[0], sh->rgba[1], sh->rgba[2], sh->rgba[3]);
        cairo_mask_surface(cr, mask, sh->x, sh->y);
        cairo_surface_destroy(mask);
    }
    cairo_set_source_rgba(cr, st->rgba[0], st->rgba[1], st->rgba[2], st->rgba[3]);
    cairo_move_to(cr, -x0, -y0);
    pango_cairo_show_layout(cr, l);
    cairo_destroy(cr);
    g_object_unref(l);

    t->tex = tex_from_cairo(surf);
    cairo_surface_destroy(surf);
    return t;
}

void text_free(TextTex *t)
{
    if (!t)
        return;
    tex_free(&t->tex);
    g_free(t);
}
