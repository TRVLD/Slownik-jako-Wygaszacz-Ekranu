#ifndef _GNU_SOURCE
#define _GNU_SOURCE
#endif
#include "applet.h"
#include "util.h"
#include "wlsource.h"

#include "fractional-scale-v1-client-protocol.h"
#include "viewporter-client-protocol.h"
#include "xdg-shell-client-protocol.h"

#include <cairo.h>
#include <fcntl.h>
#include <pango/pangocairo.h>
#include <string.h>
#include <sys/mman.h>
#include <unistd.h>
#include <wayland-cursor.h>

#define POPUP_W 320

typedef struct {
    struct wl_surface *surf;
    struct wp_viewport *vp;
    struct wp_fractional_scale_v1 *fs;
    int scale120;
    int int_scale;
    int lw, lh;
} Surf;

typedef enum { ROW_PREVIEW, ROW_PAUSE, ROW_SETTINGS, NROWS } Row;

struct Applet {
    struct wl_display *display;
    struct wl_registry *registry;
    struct wl_compositor *compositor;
    struct wl_shm *shm;
    struct xdg_wm_base *wm;
    struct wl_seat *seat;
    struct wl_pointer *pointer;
    struct wp_viewporter *viewporter;
    struct wp_fractional_scale_manager_v1 *fsm;
    struct wl_cursor_theme *cursor_theme;
    struct wl_surface *cursor_surf;
    GPtrArray *outputs;

    Surf main;
    struct xdg_surface *xs;
    struct xdg_toplevel *top;
    bool configured;
    bool hover;

    Surf pop;
    struct xdg_surface *pxs;
    struct xdg_popup *popup;
    bool pop_configured;
    int hover_row;
    double row_y[NROWS], row_h;

    struct wl_surface *ptr_surf;
    double px, py;
    uint32_t last_serial;

    GSettings *settings;
    gulong settings_handler;
    bool dark;
    GFileMonitor *theme_mon;
    char *anchor;
    int icon, pad_major, pad_minor;
    bool engine_running;
    char *problem;
    guint tick_id;
};

static int forced_dark(void)
{
    const char *bg = g_getenv("COSMIC_PANEL_BACKGROUND");
    if (!g_strcmp0(bg, "Dark"))
        return 1;
    if (!g_strcmp0(bg, "Light"))
        return 0;
    return -1;
}

static bool read_dark(void)
{
    int forced = forced_dark();
    if (forced >= 0)
        return forced;
    char *path = g_build_filename(g_get_home_dir(), ".config", "cosmic", "com.system76.CosmicTheme.Mode",
                                  "v1", "is_dark", NULL);
    char *s = NULL;
    bool dark = true;
    if (g_file_get_contents(path, &s, NULL, NULL))
        dark = !g_str_has_prefix(g_strstrip(s), "false");
    g_free(s);
    g_free(path);
    return dark;
}

typedef struct {
    double bg[4], fg[4], dim[4], hover[4], sep[4], accent[4];
} Palette;

static void palette(Applet *a, Palette *p)
{
    if (a->dark) {
        *p = (Palette){{0.106, 0.106, 0.106, 0.98}, {0.94, 0.94, 0.94, 1}, {0.94, 0.94, 0.94, 0.6},
                       {1, 1, 1, 0.08}, {1, 1, 1, 0.1}, {0.388, 0.816, 0.875, 1}};
    } else {
        *p = (Palette){{0.965, 0.965, 0.965, 0.98}, {0.1, 0.1, 0.1, 1}, {0.1, 0.1, 0.1, 0.62},
                       {0, 0, 0, 0.07}, {0, 0, 0, 0.1}, {0.0, 0.32, 0.353, 1}};
    }
}

static void buffer_release(void *data, struct wl_buffer *b)
{
    (void)data;
    wl_buffer_destroy(b);
}

static const struct wl_buffer_listener buffer_listener = {.release = buffer_release};

static double surf_scale(Surf *s)
{
    if (s->scale120 > 0)
        return s->scale120 / 120.0;
    return MAX(1, s->int_scale);
}

typedef void (*PaintFunc)(Applet *a, cairo_t *cr, int lw, int lh);

static void paint_surface(Applet *a, Surf *s, PaintFunc paint)
{
    double sc = surf_scale(s);
    bool frac = s->scale120 > 0 && a->viewporter;
    int pw = frac ? (int)lround(s->lw * sc) : s->lw * MAX(1, s->int_scale);
    int ph = frac ? (int)lround(s->lh * sc) : s->lh * MAX(1, s->int_scale);
    if (!frac)
        sc = MAX(1, s->int_scale);
    pw = MAX(1, pw);
    ph = MAX(1, ph);
    int stride = cairo_format_stride_for_width(CAIRO_FORMAT_ARGB32, pw);
    size_t size = (size_t)stride * ph;
    int fd = memfd_create("wyraz-applet", MFD_CLOEXEC);
    if (fd < 0 || ftruncate(fd, (off_t)size) < 0) {
        if (fd >= 0)
            close(fd);
        return;
    }
    void *data = mmap(NULL, size, PROT_READ | PROT_WRITE, MAP_SHARED, fd, 0);
    if (data == MAP_FAILED) {
        close(fd);
        return;
    }
    struct wl_shm_pool *pool = wl_shm_create_pool(a->shm, fd, (int32_t)size);
    struct wl_buffer *buf = wl_shm_pool_create_buffer(pool, 0, pw, ph, stride, WL_SHM_FORMAT_ARGB8888);
    wl_shm_pool_destroy(pool);
    close(fd);
    wl_buffer_add_listener(buf, &buffer_listener, NULL);

    cairo_surface_t *cs = cairo_image_surface_create_for_data(data, CAIRO_FORMAT_ARGB32, pw, ph, stride);
    cairo_t *cr = cairo_create(cs);
    cairo_set_operator(cr, CAIRO_OPERATOR_CLEAR);
    cairo_paint(cr);
    cairo_set_operator(cr, CAIRO_OPERATOR_OVER);
    cairo_scale(cr, (double)pw / s->lw, (double)ph / s->lh);
    paint(a, cr, s->lw, s->lh);
    cairo_destroy(cr);
    cairo_surface_destroy(cs);
    munmap(data, size);

    if (frac) {
        if (!s->vp)
            s->vp = wp_viewporter_get_viewport(a->viewporter, s->surf);
        wp_viewport_set_destination(s->vp, s->lw, s->lh);
        wl_surface_set_buffer_scale(s->surf, 1);
    } else {
        wl_surface_set_buffer_scale(s->surf, MAX(1, s->int_scale));
    }
    wl_surface_attach(s->surf, buf, 0, 0);
    wl_surface_damage(s->surf, 0, 0, s->lw, s->lh);
    wl_surface_commit(s->surf);
}

static void rounded(cairo_t *cr, double x, double y, double w, double h, double r)
{
    cairo_new_sub_path(cr);
    cairo_arc(cr, x + w - r, y + r, r, -M_PI / 2, 0);
    cairo_arc(cr, x + w - r, y + h - r, r, 0, M_PI / 2);
    cairo_arc(cr, x + r, y + h - r, r, M_PI / 2, M_PI);
    cairo_arc(cr, x + r, y + r, r, M_PI, 3 * M_PI / 2);
    cairo_close_path(cr);
}

static PangoLayout *mk_layout(cairo_t *cr, const char *family, int weight, double px, const char *text,
                              int width)
{
    PangoLayout *l = pango_cairo_create_layout(cr);
    PangoFontDescription *fd = pango_font_description_new();
    pango_font_description_set_family(fd, family);
    pango_font_description_set_weight(fd, weight);
    pango_font_description_set_absolute_size(fd, px * PANGO_SCALE);
    pango_layout_set_font_description(l, fd);
    pango_font_description_free(fd);
    if (width > 0) {
        pango_layout_set_width(l, width * PANGO_SCALE);
        pango_layout_set_wrap(l, PANGO_WRAP_WORD);
    }
    pango_layout_set_text(l, text, -1);
    return l;
}

static void paint_icon(Applet *a, cairo_t *cr, int lw, int lh)
{
    Palette p;
    palette(a, &p);
    if (a->hover || a->popup) {
        rounded(cr, 1, 1, lw - 2, lh - 2, MIN(lw, lh) / 2.0 - 1);
        cairo_set_source_rgba(cr, p.hover[0], p.hover[1], p.hover[2], a->popup ? p.hover[3] * 1.6 : p.hover[3]);
        cairo_fill(cr);
    }
    PangoLayout *l = mk_layout(cr, "Crimson Text,serif", PANGO_WEIGHT_BOLD, a->icon * 1.05, "W", 0);
    PangoRectangle ink;
    pango_layout_get_pixel_extents(l, &ink, NULL);
    double x = (lw - ink.width) / 2.0 - ink.x, y = (lh - ink.height) / 2.0 - ink.y;
    cairo_set_source_rgba(cr, p.fg[0], p.fg[1], p.fg[2], 0.92);
    cairo_move_to(cr, x, y);
    pango_cairo_show_layout(cr, l);
    g_object_unref(l);
}

static char *status_text(Applet *a)
{
    if (!a->engine_running)
        return g_strdup(a->problem ? a->problem : "Wygaszacz działa w innym aplecie (inny monitor).");
    gint64 until = g_settings_get_int64(a->settings, "paused-until");
    gint64 now = g_get_real_time() / G_USEC_PER_SEC;
    if (until > now) {
        GDateTime *dt = g_date_time_new_from_unix_local(until);
        char *hm = g_date_time_format(dt, "%H:%M");
        char *s = g_strdup_printf("Wstrzymany do %s", hm);
        g_free(hm);
        g_date_time_unref(dt);
        return s;
    }
    int m = g_settings_get_int(a->settings, "idle-minutes");
    return g_strdup_printf("Uruchomi się po %d min bezczynności", m);
}

static bool is_paused(Applet *a)
{
    return g_settings_get_int64(a->settings, "paused-until") > g_get_real_time() / G_USEC_PER_SEC;
}

static void paint_popup(Applet *a, cairo_t *cr, int lw, int lh)
{
    Palette p;
    palette(a, &p);
    rounded(cr, 0.5, 0.5, lw - 1, lh - 1, 12);
    cairo_set_source_rgba(cr, p.bg[0], p.bg[1], p.bg[2], p.bg[3]);
    cairo_fill_preserve(cr);
    cairo_set_source_rgba(cr, p.sep[0], p.sep[1], p.sep[2], p.sep[3]);
    cairo_set_line_width(cr, 1);
    cairo_stroke(cr);

    double y = 14;
    PangoLayout *t = mk_layout(cr, "sans-serif", PANGO_WEIGHT_BOLD, 14, "Słownik jako Wygaszacz Ekranu", lw - 32);
    cairo_set_source_rgba(cr, p.fg[0], p.fg[1], p.fg[2], p.fg[3]);
    cairo_move_to(cr, 16, y);
    pango_cairo_show_layout(cr, t);
    int tw, th;
    pango_layout_get_pixel_size(t, &tw, &th);
    g_object_unref(t);
    y += th + 2;
    char *st = status_text(a);
    PangoLayout *sl = mk_layout(cr, "sans-serif", PANGO_WEIGHT_NORMAL, 12, st, lw - 32);
    g_free(st);
    cairo_set_source_rgba(cr, p.dim[0], p.dim[1], p.dim[2], p.dim[3]);
    cairo_move_to(cr, 16, y);
    pango_cairo_show_layout(cr, sl);
    pango_layout_get_pixel_size(sl, &tw, &th);
    g_object_unref(sl);
    y += th + 10;

    cairo_rectangle(cr, 12, y, lw - 24, 1);
    cairo_set_source_rgba(cr, p.sep[0], p.sep[1], p.sep[2], p.sep[3]);
    cairo_fill(cr);
    y += 7;

    const char *labels[NROWS] = {
        "Pokaż wygaszacz",
        is_paused(a) ? "Wznów wygaszacz" : "Wstrzymaj na godzinę",
        "Ustawienia…",
    };
    a->row_h = 36;
    for (int i = 0; i < NROWS; i++) {
        if (i == ROW_SETTINGS) {
            cairo_rectangle(cr, 12, y + 3, lw - 24, 1);
            cairo_set_source_rgba(cr, p.sep[0], p.sep[1], p.sep[2], p.sep[3]);
            cairo_fill(cr);
            y += 7;
        }
        a->row_y[i] = y;
        if (a->hover_row == i) {
            rounded(cr, 8, y, lw - 16, a->row_h, 8);
            cairo_set_source_rgba(cr, p.hover[0], p.hover[1], p.hover[2], p.hover[3] * 1.4);
            cairo_fill(cr);
        }
        PangoLayout *rl = mk_layout(cr, "sans-serif", PANGO_WEIGHT_NORMAL, 14, labels[i], 0);
        int rw, rh;
        pango_layout_get_pixel_size(rl, &rw, &rh);
        cairo_set_source_rgba(cr, p.fg[0], p.fg[1], p.fg[2], p.fg[3]);
        cairo_move_to(cr, 20, y + (a->row_h - rh) / 2);
        pango_cairo_show_layout(cr, rl);
        g_object_unref(rl);
        y += a->row_h;
    }
}

static int popup_height(void)
{
    return 14 + 20 + 2 + 34 + 10 + 7 + 3 * 36 + 7 + 10;
}

static void redraw_main(Applet *a)
{
    if (a->configured)
        paint_surface(a, &a->main, paint_icon);
}

static void redraw_popup(Applet *a)
{
    if (a->popup && a->pop_configured)
        paint_surface(a, &a->pop, paint_popup);
}

static void fs_pref(void *data, struct wp_fractional_scale_v1 *fs, uint32_t scale)
{
    Applet *a = data;
    Surf *s = fs == a->main.fs ? &a->main : &a->pop;
    if (s->scale120 == (int)scale)
        return;
    s->scale120 = (int)scale;
    if (s == &a->main)
        redraw_main(a);
    else
        redraw_popup(a);
}

static const struct wp_fractional_scale_v1_listener fs_listener = {.preferred_scale = fs_pref};

static void surf_enter(void *data, struct wl_surface *ws, struct wl_output *out)
{
    Applet *a = data;
    int sc = GPOINTER_TO_INT(wl_output_get_user_data(out));
    Surf *s = ws == a->main.surf ? &a->main : &a->pop;
    if (sc > 0 && sc != s->int_scale) {
        s->int_scale = sc;
        if (s == &a->main)
            redraw_main(a);
        else
            redraw_popup(a);
    }
}

static void surf_leave(void *d, struct wl_surface *s, struct wl_output *o) { (void)d; (void)s; (void)o; }

static const struct wl_surface_listener surf_listener = {.enter = surf_enter, .leave = surf_leave};

static void surf_init(Applet *a, Surf *s)
{
    memset(s, 0, sizeof *s);
    s->int_scale = 1;
    s->surf = wl_compositor_create_surface(a->compositor);
    wl_surface_add_listener(s->surf, &surf_listener, a);
    if (a->fsm) {
        s->fs = wp_fractional_scale_manager_v1_get_fractional_scale(a->fsm, s->surf);
        wp_fractional_scale_v1_add_listener(s->fs, &fs_listener, a);
    }
}

static void surf_fini(Surf *s)
{
    if (s->fs)
        wp_fractional_scale_v1_destroy(s->fs);
    if (s->vp)
        wp_viewport_destroy(s->vp);
    if (s->surf)
        wl_surface_destroy(s->surf);
    memset(s, 0, sizeof *s);
}

static void close_popup(Applet *a)
{
    if (!a->popup)
        return;
    if (a->ptr_surf == a->pop.surf)
        a->ptr_surf = NULL;
    xdg_popup_destroy(a->popup);
    xdg_surface_destroy(a->pxs);
    surf_fini(&a->pop);
    a->popup = NULL;
    a->pxs = NULL;
    a->pop_configured = false;
    redraw_main(a);
}

static void pxs_configure(void *data, struct xdg_surface *xs, uint32_t serial)
{
    Applet *a = data;
    xdg_surface_ack_configure(xs, serial);
    a->pop_configured = true;
    redraw_popup(a);
}

static const struct xdg_surface_listener pxs_listener = {.configure = pxs_configure};

static void popup_configure(void *data, struct xdg_popup *p, int32_t x, int32_t y, int32_t w, int32_t h)
{
    (void)p; (void)x; (void)y;
    Applet *a = data;
    if (w > 0 && h > 0) {
        a->pop.lw = w;
        a->pop.lh = h;
    }
}

static void popup_done(void *data, struct xdg_popup *p)
{
    (void)p;
    close_popup(data);
}

static void popup_repositioned(void *d, struct xdg_popup *p, uint32_t t) { (void)d; (void)p; (void)t; }

static const struct xdg_popup_listener popup_listener = {
    .configure = popup_configure,
    .popup_done = popup_done,
    .repositioned = popup_repositioned,
};

static void open_popup(Applet *a, uint32_t serial)
{
    if (a->popup) {
        close_popup(a);
        return;
    }
    surf_init(a, &a->pop);
    a->pop.lw = POPUP_W;
    a->pop.lh = popup_height();
    a->hover_row = -1;
    a->pxs = xdg_wm_base_get_xdg_surface(a->wm, a->pop.surf);
    xdg_surface_add_listener(a->pxs, &pxs_listener, a);
    struct xdg_positioner *pos = xdg_wm_base_create_positioner(a->wm);
    xdg_positioner_set_size(pos, a->pop.lw, a->pop.lh);
    xdg_positioner_set_anchor_rect(pos, 0, 0, a->main.lw, a->main.lh);
    uint32_t anchor = XDG_POSITIONER_ANCHOR_BOTTOM, gravity = XDG_POSITIONER_GRAVITY_BOTTOM;
    int ox = 0, oy = 4;
    if (g_strcmp0(a->anchor, "Bottom") == 0) {
        anchor = XDG_POSITIONER_ANCHOR_TOP;
        gravity = XDG_POSITIONER_GRAVITY_TOP;
        oy = -4;
    } else if (g_strcmp0(a->anchor, "Left") == 0) {
        anchor = XDG_POSITIONER_ANCHOR_RIGHT;
        gravity = XDG_POSITIONER_GRAVITY_RIGHT;
        ox = 4;
        oy = 0;
    } else if (g_strcmp0(a->anchor, "Right") == 0) {
        anchor = XDG_POSITIONER_ANCHOR_LEFT;
        gravity = XDG_POSITIONER_GRAVITY_LEFT;
        ox = -4;
        oy = 0;
    }
    xdg_positioner_set_anchor(pos, anchor);
    xdg_positioner_set_gravity(pos, gravity);
    xdg_positioner_set_offset(pos, ox, oy);
    xdg_positioner_set_constraint_adjustment(pos, XDG_POSITIONER_CONSTRAINT_ADJUSTMENT_SLIDE_X |
                                                      XDG_POSITIONER_CONSTRAINT_ADJUSTMENT_SLIDE_Y |
                                                      XDG_POSITIONER_CONSTRAINT_ADJUSTMENT_FLIP_X |
                                                      XDG_POSITIONER_CONSTRAINT_ADJUSTMENT_FLIP_Y);
    a->popup = xdg_surface_get_popup(a->pxs, a->xs, pos);
    xdg_positioner_destroy(pos);
    xdg_popup_add_listener(a->popup, &popup_listener, a);
    xdg_popup_grab(a->popup, a->seat, serial);
    wl_surface_commit(a->pop.surf);
    redraw_main(a);
}

static void activate_row(Applet *a, int row)
{
    switch (row) {
    case ROW_PREVIEW:
        g_settings_set_int(a->settings, "preview-request", g_settings_get_int(a->settings, "preview-request") + 1);
        break;
    case ROW_PAUSE:
        if (is_paused(a))
            g_settings_set_int64(a->settings, "paused-until", 0);
        else
            g_settings_set_int64(a->settings, "paused-until", g_get_real_time() / G_USEC_PER_SEC + 3600);
        break;
    case ROW_SETTINGS: {
        GError *err = NULL;
        char *argv[] = {"wyraz-ustawienia", NULL};
        if (!g_spawn_async(NULL, argv, NULL, G_SPAWN_SEARCH_PATH, NULL, NULL, NULL, &err)) {
            WARN("Nie udało się otworzyć ustawień: %s", err->message);
            g_error_free(err);
        }
        break;
    }
    default:
        break;
    }
    g_settings_sync();
    close_popup(a);
}

static void set_cursor(Applet *a, uint32_t serial)
{
    if (!a->cursor_theme)
        return;
    struct wl_cursor *c = wl_cursor_theme_get_cursor(a->cursor_theme, "default");
    if (!c)
        c = wl_cursor_theme_get_cursor(a->cursor_theme, "left_ptr");
    if (!c || !c->image_count)
        return;
    struct wl_cursor_image *img = c->images[0];
    if (!a->cursor_surf)
        a->cursor_surf = wl_compositor_create_surface(a->compositor);
    wl_surface_attach(a->cursor_surf, wl_cursor_image_get_buffer(img), 0, 0);
    wl_surface_damage(a->cursor_surf, 0, 0, (int32_t)img->width, (int32_t)img->height);
    wl_surface_commit(a->cursor_surf);
    wl_pointer_set_cursor(a->pointer, serial, a->cursor_surf, (int32_t)img->hotspot_x, (int32_t)img->hotspot_y);
}

static int row_at(Applet *a, double y)
{
    for (int i = 0; i < NROWS; i++)
        if (y >= a->row_y[i] && y < a->row_y[i] + a->row_h)
            return i;
    return -1;
}

static void p_enter(void *data, struct wl_pointer *p, uint32_t serial, struct wl_surface *s, wl_fixed_t x,
                    wl_fixed_t y)
{
    (void)p;
    Applet *a = data;
    a->ptr_surf = s;
    a->px = wl_fixed_to_double(x);
    a->py = wl_fixed_to_double(y);
    set_cursor(a, serial);
    if (s == a->main.surf) {
        a->hover = true;
        redraw_main(a);
    }
}

static void p_leave(void *data, struct wl_pointer *p, uint32_t serial, struct wl_surface *s)
{
    (void)p; (void)serial;
    Applet *a = data;
    if (s == a->main.surf) {
        a->hover = false;
        redraw_main(a);
    } else if (a->popup && s == a->pop.surf && a->hover_row != -1) {
        a->hover_row = -1;
        redraw_popup(a);
    }
    a->ptr_surf = NULL;
}

static void p_motion(void *data, struct wl_pointer *p, uint32_t t, wl_fixed_t x, wl_fixed_t y)
{
    (void)p; (void)t;
    Applet *a = data;
    a->px = wl_fixed_to_double(x);
    a->py = wl_fixed_to_double(y);
    if (a->popup && a->ptr_surf == a->pop.surf) {
        int r = row_at(a, a->py);
        if (r != a->hover_row) {
            a->hover_row = r;
            redraw_popup(a);
        }
    }
}

static void p_button(void *data, struct wl_pointer *p, uint32_t serial, uint32_t t, uint32_t button,
                     uint32_t state)
{
    (void)p; (void)t; (void)button;
    Applet *a = data;
    if (state == WL_POINTER_BUTTON_STATE_PRESSED) {
        a->last_serial = serial;
        if (a->ptr_surf == a->main.surf)
            open_popup(a, serial);
        return;
    }
    if (a->popup && a->ptr_surf == a->pop.surf) {
        int r = row_at(a, a->py);
        if (r >= 0)
            activate_row(a, r);
    }
}

static void p_axis(void *d, struct wl_pointer *p, uint32_t t, uint32_t a, wl_fixed_t v) { (void)d; (void)p; (void)t; (void)a; (void)v; }
static void p_frame(void *d, struct wl_pointer *p) { (void)d; (void)p; }
static void p_axis_source(void *d, struct wl_pointer *p, uint32_t s) { (void)d; (void)p; (void)s; }
static void p_axis_stop(void *d, struct wl_pointer *p, uint32_t t, uint32_t a) { (void)d; (void)p; (void)t; (void)a; }
static void p_axis_discrete(void *d, struct wl_pointer *p, uint32_t a, int32_t v) { (void)d; (void)p; (void)a; (void)v; }

static const struct wl_pointer_listener pointer_listener = {
    .enter = p_enter,
    .leave = p_leave,
    .motion = p_motion,
    .button = p_button,
    .axis = p_axis,
    .frame = p_frame,
    .axis_source = p_axis_source,
    .axis_stop = p_axis_stop,
    .axis_discrete = p_axis_discrete,
};

static void seat_caps(void *data, struct wl_seat *seat, uint32_t caps)
{
    Applet *a = data;
    if ((caps & WL_SEAT_CAPABILITY_POINTER) && !a->pointer) {
        a->pointer = wl_seat_get_pointer(seat);
        wl_pointer_add_listener(a->pointer, &pointer_listener, a);
    }
}

static void seat_name(void *d, struct wl_seat *s, const char *n) { (void)d; (void)s; (void)n; }

static const struct wl_seat_listener seat_listener = {.capabilities = seat_caps, .name = seat_name};

static void wm_ping(void *data, struct xdg_wm_base *wm, uint32_t serial)
{
    (void)data;
    xdg_wm_base_pong(wm, serial);
}

static const struct xdg_wm_base_listener wm_listener = {.ping = wm_ping};

static void xs_configure(void *data, struct xdg_surface *xs, uint32_t serial)
{
    Applet *a = data;
    xdg_surface_ack_configure(xs, serial);
    a->configured = true;
    redraw_main(a);
}

static const struct xdg_surface_listener xs_listener = {.configure = xs_configure};

static void top_configure(void *d, struct xdg_toplevel *t, int32_t w, int32_t h, struct wl_array *st)
{
    (void)d; (void)t; (void)w; (void)h; (void)st;
}
static void top_close(void *d, struct xdg_toplevel *t) { (void)d; (void)t; }
static void top_bounds(void *d, struct xdg_toplevel *t, int32_t w, int32_t h) { (void)d; (void)t; (void)w; (void)h; }
static void top_caps(void *d, struct xdg_toplevel *t, struct wl_array *c) { (void)d; (void)t; (void)c; }

static const struct xdg_toplevel_listener top_listener = {
    .configure = top_configure,
    .close = top_close,
    .configure_bounds = top_bounds,
    .wm_capabilities = top_caps,
};

static void out_geometry(void *d, struct wl_output *w, int32_t x, int32_t y, int32_t pw, int32_t ph, int32_t s,
                         const char *mk, const char *md, int32_t t)
{
    (void)d; (void)w; (void)x; (void)y; (void)pw; (void)ph; (void)s; (void)mk; (void)md; (void)t;
}
static void out_mode(void *d, struct wl_output *w, uint32_t f, int32_t wi, int32_t h, int32_t r) { (void)d; (void)w; (void)f; (void)wi; (void)h; (void)r; }
static void out_done(void *d, struct wl_output *w) { (void)d; (void)w; }
static void out_scale(void *d, struct wl_output *w, int32_t s) { (void)d; wl_output_set_user_data(w, GINT_TO_POINTER(s)); }

static const struct wl_output_listener out_listener = {
    .geometry = out_geometry,
    .mode = out_mode,
    .done = out_done,
    .scale = out_scale,
};

static void reg_global(void *data, struct wl_registry *r, uint32_t name, const char *iface, uint32_t ver)
{
    Applet *a = data;
    if (!strcmp(iface, wl_compositor_interface.name))
        a->compositor = wl_registry_bind(r, name, &wl_compositor_interface, MIN(ver, 4));
    else if (!strcmp(iface, wl_shm_interface.name))
        a->shm = wl_registry_bind(r, name, &wl_shm_interface, 1);
    else if (!strcmp(iface, xdg_wm_base_interface.name)) {
        a->wm = wl_registry_bind(r, name, &xdg_wm_base_interface, MIN(ver, 4));
        xdg_wm_base_add_listener(a->wm, &wm_listener, a);
    } else if (!strcmp(iface, wl_seat_interface.name) && !a->seat) {
        a->seat = wl_registry_bind(r, name, &wl_seat_interface, MIN(ver, 5));
        wl_seat_add_listener(a->seat, &seat_listener, a);
    } else if (!strcmp(iface, wp_viewporter_interface.name)) {
        a->viewporter = wl_registry_bind(r, name, &wp_viewporter_interface, 1);
    } else if (!strcmp(iface, wp_fractional_scale_manager_v1_interface.name)) {
        a->fsm = wl_registry_bind(r, name, &wp_fractional_scale_manager_v1_interface, 1);
    } else if (!strcmp(iface, wl_output_interface.name)) {
        struct wl_output *o = wl_registry_bind(r, name, &wl_output_interface, MIN(ver, 2));
        wl_output_add_listener(o, &out_listener, a);
        wl_output_set_user_data(o, GINT_TO_POINTER(1));
        g_ptr_array_add(a->outputs, o);
    }
}

static void reg_remove(void *d, struct wl_registry *r, uint32_t n) { (void)d; (void)r; (void)n; }

static const struct wl_registry_listener reg_listener = {.global = reg_global, .global_remove = reg_remove};

static void panel_size(Applet *a)
{
    const char *size = g_getenv("COSMIC_PANEL_SIZE");
    a->icon = 20;
    a->pad_major = 14;
    a->pad_minor = 10;
    if (!size)
        return;
    int custom = 0;
    if (!strcmp(size, "XS")) {
        a->icon = 16; a->pad_major = 12; a->pad_minor = 8;
    } else if (!strcmp(size, "S")) {
        a->icon = 20; a->pad_major = 14; a->pad_minor = 10;
    } else if (!strcmp(size, "M")) {
        a->icon = 28; a->pad_major = 18; a->pad_minor = 14;
    } else if (!strcmp(size, "L")) {
        a->icon = 32; a->pad_major = 20; a->pad_minor = 16;
    } else if (!strcmp(size, "XL")) {
        a->icon = 48; a->pad_major = 20; a->pad_minor = 16;
    } else if (sscanf(size, "Custom(%d)", &custom) == 1) {
        int s = MAX(custom, 16) / 4 * 4;
        a->icon = s / 2;
        a->pad_major = 4 + s / 4;
        a->pad_minor = s / 4;
    }
}

static void on_setting(GSettings *s, const char *key, gpointer data)
{
    (void)s;
    Applet *a = data;
    if (!strcmp(key, "paused-until") || !strcmp(key, "idle-minutes"))
        redraw_popup(a);
}

static void on_theme(GFileMonitor *m, GFile *f, GFile *o, GFileMonitorEvent ev, gpointer data)
{
    (void)m; (void)f; (void)o; (void)ev;
    Applet *a = data;
    bool dark = read_dark();
    if (dark != a->dark) {
        a->dark = dark;
        redraw_main(a);
        redraw_popup(a);
    }
}

static void on_lost(void *data)
{
    (void)data;
    LOG("Panel zamknął połączenie, kończę");
    exit(0);
}

Applet *applet_new(struct wl_display *display, GSettings *settings)
{
    Applet *a = g_new0(Applet, 1);
    a->display = display;
    a->settings = settings;
    a->hover_row = -1;
    a->outputs = g_ptr_array_new();
    a->anchor = g_strdup(g_getenv("COSMIC_PANEL_ANCHOR") ? g_getenv("COSMIC_PANEL_ANCHOR") : "Top");
    a->dark = read_dark();
    panel_size(a);

    a->registry = wl_display_get_registry(display);
    wl_registry_add_listener(a->registry, &reg_listener, a);
    wl_display_roundtrip(display);
    wl_display_roundtrip(display);
    if (!a->compositor || !a->shm || !a->wm) {
        WARN("Panel nie udostępnia wl_compositor/wl_shm/xdg_wm_base");
        g_free(a->anchor);
        g_free(a);
        return NULL;
    }
    const char *ctheme = g_getenv("XCURSOR_THEME");
    const char *csize = g_getenv("XCURSOR_SIZE");
    a->cursor_theme = wl_cursor_theme_load(ctheme, csize ? atoi(csize) : 24, a->shm);

    bool vertical = !g_strcmp0(a->anchor, "Left") || !g_strcmp0(a->anchor, "Right");
    int w = a->icon + 2 * (vertical ? a->pad_minor : a->pad_major);
    int h = a->icon + 2 * (vertical ? a->pad_major : a->pad_minor);
    surf_init(a, &a->main);
    a->main.lw = w;
    a->main.lh = h;
    a->xs = xdg_wm_base_get_xdg_surface(a->wm, a->main.surf);
    xdg_surface_add_listener(a->xs, &xs_listener, a);
    a->top = xdg_surface_get_toplevel(a->xs);
    xdg_toplevel_add_listener(a->top, &top_listener, a);
    xdg_toplevel_set_app_id(a->top, "eu.jaroszek.Wyraz.Applet");
    xdg_toplevel_set_title(a->top, "Wyraz");
    xdg_toplevel_set_min_size(a->top, w, h);
    xdg_toplevel_set_max_size(a->top, w, h);
    wl_surface_commit(a->main.surf);

    if (settings)
        a->settings_handler = g_signal_connect(settings, "changed", G_CALLBACK(on_setting), a);
    char *path = g_build_filename(g_get_home_dir(), ".config", "cosmic", "com.system76.CosmicTheme.Mode", "v1",
                                  "is_dark", NULL);
    GFile *f = g_file_new_for_path(path);
    a->theme_mon = g_file_monitor_file(f, G_FILE_MONITOR_NONE, NULL, NULL);
    if (a->theme_mon)
        g_signal_connect(a->theme_mon, "changed", G_CALLBACK(on_theme), a);
    g_object_unref(f);
    g_free(path);
    wl_source_attach(display, on_lost, a);
    return a;
}

void applet_set_engine_state(Applet *a, bool running, const char *problem)
{
    a->engine_running = running;
    g_free(a->problem);
    a->problem = g_strdup(problem);
    redraw_popup(a);
}

void applet_free(Applet *a)
{
    if (!a)
        return;
    close_popup(a);
    if (a->settings_handler)
        g_signal_handler_disconnect(a->settings, a->settings_handler);
    if (a->theme_mon)
        g_object_unref(a->theme_mon);
    g_free(a->anchor);
    g_free(a->problem);
    g_free(a);
}
