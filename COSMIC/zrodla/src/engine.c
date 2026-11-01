#include "engine.h"
#include "config.h"
#include "gl.h"
#include "prompt.h"
#include "util.h"
#include "view.h"
#include "wlsource.h"
#include "words.h"

#include "ext-idle-notify-v1-client-protocol.h"
#include "fractional-scale-v1-client-protocol.h"
#include "keyboard-shortcuts-inhibit-unstable-v1-client-protocol.h"
#include "viewporter-client-protocol.h"
#include "wlr-layer-shell-unstable-v1-client-protocol.h"

#include <string.h>
#include <sys/mman.h>
#include <unistd.h>
#include <wayland-egl.h>
#include <xkbcommon/xkbcommon.h>

#define FADE_IN_MS 1400
#define FADE_OUT_MS 350
#define FRAME_MS 33
#define MOTION_THRESHOLD 3
#define MOTION_GRACE_S 0.4
#define INHIBIT_POLL_S 30
#define PREVIEW_IDLE_MS 1500
#define PREVIEW_TIMEOUT_S 20
#define VISIBLE_WINDOW_S 4.0
#define VISIBLE_MIN_FRAMES 6

typedef struct Output Output;

struct Output {
    Engine *e;
    uint32_t name;
    struct wl_output *wo;
    int32_t x, y, scale;
    char *oname;

    struct wl_surface *surf;
    struct zwlr_layer_surface_v1 *ls;
    struct wp_viewport *vp;
    struct wp_fractional_scale_v1 *fs;
    struct wl_egl_window *win;
    EGLSurface es;
    struct wl_callback *frame;
    struct zwp_keyboard_shortcuts_inhibitor_v1 *ksi;
    int frames;
    int lw, lh, pw, ph;
    int scale120;
    bool configured;
    View *view;
};

struct Engine {
    struct wl_display *display;
    struct wl_registry *registry;
    struct wl_compositor *compositor;
    struct wl_seat *seat;
    struct wl_pointer *pointer;
    struct wl_keyboard *keyboard;
    struct wl_touch *touch;
    struct zwlr_layer_shell_v1 *layer_shell;
    struct ext_idle_notifier_v1 *notifier;
    uint32_t notifier_ver;
    struct wp_viewporter *viewporter;
    struct wp_fractional_scale_manager_v1 *fsm;
    struct zwp_keyboard_shortcuts_inhibit_manager_v1 *ksim;
    GPtrArray *outputs;
    guint wl_source;

    struct xkb_context *xkb;
    struct xkb_keymap *keymap;
    struct xkb_state *xkb_state;

    struct ext_idle_notification_v1 *idle_note;
    struct ext_idle_notification_v1 *preview_note;
    bool is_idle;

    GSettings *settings;
    gulong settings_handler;
    Config cfg;
    WordStore *store;
    GDBusConnection *bus;

    bool visible, hiding;
    double show_start, shown_at, vis_window_start;
    Tween root;
    guint frame_id, clock_id, advance_id, poll_id, preview_timeout_id;
    Entry *current;
    GPtrArray *prank;
    int advances;
    bool code_required;
    CodeGuard guard;
    Prompt *prompt;
    char *pending_footer, *pending_time;

    struct wl_surface *ptr_surface;
    double ptr_x, ptr_y;
    bool ptr_base;
    uint32_t mpris_gen;

    void (*hidden_cb)(void *data);
    void *hidden_data;
};

static void engine_hide(Engine *e, bool immediate);
static void engine_show(Engine *e);
static void render_output(Output *o);

static bool make_current(Output *o)
{
    return o->es != EGL_NO_SURFACE && egl_make_current(o->es);
}

static void destroy_overlay(Output *o)
{
    if (o->view || o->es != EGL_NO_SURFACE) {
        if (make_current(o)) {
            view_free(o->view);
            if (o->e->prompt && o->e->outputs->len && g_ptr_array_index(o->e->outputs, 0) == o)
                prompt_release_gl(o->e->prompt);
        }
        o->view = NULL;
        egl_destroy_surface(o->es);
        o->es = EGL_NO_SURFACE;
    }
    if (o->win)
        wl_egl_window_destroy(o->win);
    o->win = NULL;
    if (o->frame)
        wl_callback_destroy(o->frame);
    o->frame = NULL;
    if (o->ksi)
        zwp_keyboard_shortcuts_inhibitor_v1_destroy(o->ksi);
    o->ksi = NULL;
    if (o->fs)
        wp_fractional_scale_v1_destroy(o->fs);
    o->fs = NULL;
    if (o->vp)
        wp_viewport_destroy(o->vp);
    o->vp = NULL;
    if (o->ls)
        zwlr_layer_surface_v1_destroy(o->ls);
    o->ls = NULL;
    if (o->surf)
        wl_surface_destroy(o->surf);
    o->surf = NULL;
    o->configured = false;
}

static double out_scale(Output *o)
{
    if (o->scale120 > 0)
        return o->scale120 / 120.0;
    return MAX(1, o->scale);
}

static void build_view(Output *o)
{
    Engine *e = o->e;
    if (!make_current(o))
        return;
    gl_setup();
    view_free(o->view);
    double s = out_scale(o);
    o->view = view_new(&e->cfg, o->pw, o->ph, (int)lround(o->x * s), (int)lround(o->y * s), s);
    if (e->current)
        view_present(o->view, e->current, true, e->cfg.change_interval);
    if (e->prompt && prompt_visible(e->prompt))
        view_set_blur(o->view, true);
}

static void apply_size(Output *o)
{
    double s = out_scale(o);
    int pw, ph;
    if (o->e->viewporter && o->scale120 > 0) {
        pw = (int)lround(o->lw * s);
        ph = (int)lround(o->lh * s);
        if (!o->vp)
            o->vp = wp_viewporter_get_viewport(o->e->viewporter, o->surf);
        wp_viewport_set_destination(o->vp, o->lw, o->lh);
        wl_surface_set_buffer_scale(o->surf, 1);
    } else {
        int is = MAX(1, (int)lround(s));
        pw = o->lw * is;
        ph = o->lh * is;
        wl_surface_set_buffer_scale(o->surf, is);
    }
    pw = MAX(1, pw);
    ph = MAX(1, ph);
    bool changed = pw != o->pw || ph != o->ph;
    o->pw = pw;
    o->ph = ph;
    if (!o->win) {
        o->win = wl_egl_window_create(o->surf, pw, ph);
        o->es = egl_window_surface(o->win);
        changed = true;
    } else if (changed) {
        wl_egl_window_resize(o->win, pw, ph, 0, 0);
    }
    if (changed || !o->view)
        build_view(o);
}

static void ls_configure(void *data, struct zwlr_layer_surface_v1 *ls, uint32_t serial, uint32_t w, uint32_t h)
{
    Output *o = data;
    zwlr_layer_surface_v1_ack_configure(ls, serial);
    o->lw = w ? (int)w : 1920;
    o->lh = h ? (int)h : 1080;
    apply_size(o);
    o->configured = true;
    render_output(o);
}

static void ls_closed(void *data, struct zwlr_layer_surface_v1 *ls)
{
    (void)ls;
    destroy_overlay(data);
}

static const struct zwlr_layer_surface_v1_listener ls_listener = {
    .configure = ls_configure,
    .closed = ls_closed,
};

static void fs_preferred(void *data, struct wp_fractional_scale_v1 *fs, uint32_t scale)
{
    (void)fs;
    Output *o = data;
    if ((int)scale == o->scale120)
        return;
    o->scale120 = (int)scale;
    if (o->configured)
        apply_size(o);
}

static const struct wp_fractional_scale_v1_listener fs_listener = {
    .preferred_scale = fs_preferred,
};

static void create_overlay(Output *o)
{
    Engine *e = o->e;
    if (o->surf)
        return;
    o->surf = wl_compositor_create_surface(e->compositor);
    if (e->fsm) {
        o->fs = wp_fractional_scale_manager_v1_get_fractional_scale(e->fsm, o->surf);
        wp_fractional_scale_v1_add_listener(o->fs, &fs_listener, o);
    }
    o->ls = zwlr_layer_shell_v1_get_layer_surface(e->layer_shell, o->surf, o->wo,
                                                  ZWLR_LAYER_SHELL_V1_LAYER_OVERLAY, "wyraz-screensaver");
    zwlr_layer_surface_v1_add_listener(o->ls, &ls_listener, o);
    zwlr_layer_surface_v1_set_size(o->ls, 0, 0);
    zwlr_layer_surface_v1_set_anchor(o->ls, ZWLR_LAYER_SURFACE_V1_ANCHOR_TOP |
                                                ZWLR_LAYER_SURFACE_V1_ANCHOR_BOTTOM |
                                                ZWLR_LAYER_SURFACE_V1_ANCHOR_LEFT |
                                                ZWLR_LAYER_SURFACE_V1_ANCHOR_RIGHT);
    zwlr_layer_surface_v1_set_exclusive_zone(o->ls, -1);
    zwlr_layer_surface_v1_set_keyboard_interactivity(o->ls, 1);
    if (e->ksim && e->seat)
        o->ksi = zwp_keyboard_shortcuts_inhibit_manager_v1_inhibit_shortcuts(e->ksim, o->surf, e->seat);
    o->frames = 0;
    wl_surface_commit(o->surf);
}

static void make_input_transparent(Output *o)
{
    if (!o->surf || !o->ls)
        return;
    zwlr_layer_surface_v1_set_keyboard_interactivity(o->ls, 0);
    if (o->ksi)
        zwp_keyboard_shortcuts_inhibitor_v1_destroy(o->ksi);
    o->ksi = NULL;
    struct wl_region *r = wl_compositor_create_region(o->e->compositor);
    wl_surface_set_input_region(o->surf, r);
    wl_region_destroy(r);
    wl_surface_commit(o->surf);
}

static void frame_done(void *data, struct wl_callback *cb, uint32_t t)
{
    (void)t;
    Output *o = data;
    wl_callback_destroy(cb);
    o->frame = NULL;
    o->frames++;
}

static const struct wl_callback_listener frame_listener = {.done = frame_done};

static void render_output(Output *o)
{
    Engine *e = o->e;
    if (!o->configured || o->frame || !o->view || !make_current(o))
        return;
    if (e->pending_footer)
        view_update_clock(o->view, e->pending_footer, e->pending_time);
    gl_begin(o->pw, o->ph);
    view_draw(o->view);
    if (e->prompt && g_ptr_array_index(e->outputs, 0) == o)
        prompt_draw(e->prompt, o->pw, o->ph, out_scale(o));
    gl_fade(tween_value(&e->root));
    o->frame = wl_surface_frame(o->surf);
    wl_callback_add_listener(o->frame, &frame_listener, o);
    egl_swap(o->es);
}

static void finish_hide(void *data)
{
    Engine *e = data;
    for (guint i = 0; i < e->outputs->len; i++)
        destroy_overlay(g_ptr_array_index(e->outputs, i));
    prompt_free(e->prompt);
    e->prompt = NULL;
    if (e->frame_id)
        g_source_remove(e->frame_id);
    e->frame_id = 0;
    e->hiding = false;
    wl_display_flush(e->display);
    if (e->hidden_cb)
        e->hidden_cb(e->hidden_data);
}

static bool check_visibility(Engine *e)
{
    double now = now_s();
    if (!e->visible || e->hiding || now - e->vis_window_start < VISIBLE_WINDOW_S)
        return true;
    int frames = 0;
    for (guint i = 0; i < e->outputs->len; i++) {
        Output *o = g_ptr_array_index(e->outputs, i);
        frames = MAX(frames, o->frames);
        o->frames = 0;
    }
    e->vis_window_start = now;
    if (frames > VISIBLE_MIN_FRAMES || !e->outputs->len)
        return true;
    if (frames == 0 && e->code_required) {
        return true;
    }
    LOG("Wygaszacz nie jest wyświetlany (najwyżej %d ramek w %.0f s: blokada albo wyłączony ekran), chowam",
        frames, VISIBLE_WINDOW_S);
    e->frame_id = 0;
    engine_hide(e, true);
    return false;
}

static gboolean on_frame(gpointer data)
{
    Engine *e = data;
    if (!check_visibility(e))
        return G_SOURCE_REMOVE;
    double t = now_s() - e->show_start;
    if (e->prompt)
        prompt_tick(e->prompt);
    for (guint i = 0; i < e->outputs->len; i++) {
        Output *o = g_ptr_array_index(e->outputs, i);
        if (o->view && make_current(o))
            view_set_time(o->view, t);
    }
    for (guint i = 0; i < e->outputs->len; i++)
        render_output(g_ptr_array_index(e->outputs, i));
    g_clear_pointer(&e->pending_footer, g_free);
    g_clear_pointer(&e->pending_time, g_free);
    wl_display_flush(e->display);
    bool running = tween_tick(&e->root);
    if (e->hiding && !running) {
        e->frame_id = 0;
        finish_hide(e);
        return G_SOURCE_REMOVE;
    }
    return G_SOURCE_CONTINUE;
}

static gboolean on_clock(gpointer data)
{
    Engine *e = data;
    g_free(e->pending_footer);
    g_free(e->pending_time);
    e->pending_footer = polish_date(!e->cfg.clock_enabled);
    e->pending_time = clock_time();
    return G_SOURCE_CONTINUE;
}

static void present_all(Engine *e, bool first)
{
    for (guint i = 0; i < e->outputs->len; i++) {
        Output *o = g_ptr_array_index(e->outputs, i);
        if (o->view && make_current(o))
            view_present(o->view, e->current, first, e->cfg.change_interval);
    }
}

static int counts_of(Engine *e, int out[LANG_N])
{
    out[LANG_PL] = e->cfg.words_pl;
    out[LANG_EN] = e->cfg.words_en;
    return 0;
}

static gboolean on_advance(gpointer data)
{
    Engine *e = data;
    if (!e->visible)
        return G_SOURCE_CONTINUE;
    e->advances++;
    if (e->prank && e->prank->len && e->advances % 2 == 0) {
        entry_free(e->current);
        e->current = entry_copy(g_ptr_array_index(e->prank, 0));
        g_ptr_array_remove_index(e->prank, 0);
        present_all(e, false);
        return G_SOURCE_CONTINUE;
    }
    int counts[LANG_N];
    counts_of(e, counts);
    Entry *item = word_store_next(e->store, counts, NULL, NULL);
    if (item) {
        entry_free(e->current);
        e->current = item;
        present_all(e, false);
    }
    return G_SOURCE_CONTINUE;
}

static void blur_all(Engine *e, bool on)
{
    for (guint i = 0; i < e->outputs->len; i++) {
        Output *o = g_ptr_array_index(e->outputs, i);
        if (o->view)
            view_set_blur(o->view, on);
    }
}

static void prompt_success(void *data) { engine_hide(data, false); }
static void prompt_shown(void *data) { blur_all(data, true); }
static void prompt_hidden(void *data) { blur_all(data, false); }

static void engine_show(Engine *e)
{
    if (e->visible)
        return;
    if (e->hiding)
        finish_hide(e);
    config_read(e->settings, &e->cfg);
    int counts[LANG_N];
    counts_of(e, counts);
    Entry *item = word_store_next(e->store, counts, NULL, NULL);
    if (!item) {
        WARN("Brak haseł do pokazania");
        return;
    }
    entry_free(e->current);
    e->current = item;
    if (e->prank)
        g_ptr_array_unref(e->prank);
    e->prank = is_april_first() ? pick_proverbs(3) : NULL;
    e->advances = 0;
    e->code_required = e->cfg.code_enabled && code_has(e->cfg.unlock_code);
    e->prompt = prompt_new(&e->cfg, &e->guard, prompt_success, prompt_shown, prompt_hidden, e);
    e->visible = true;
    e->hiding = false;
    e->show_start = e->shown_at = e->vis_window_start = now_s();
    e->ptr_base = false;
    tween_set(&e->root, 0);
    tween_to(&e->root, 1, 0, FADE_IN_MS, EASE_OUT_QUAD, NULL, NULL);
    on_clock(e);
    for (guint i = 0; i < e->outputs->len; i++)
        create_overlay(g_ptr_array_index(e->outputs, i));
    wl_display_flush(e->display);
    if (!e->frame_id)
        e->frame_id = g_timeout_add(FRAME_MS, on_frame, e);
    e->clock_id = g_timeout_add_seconds(1, on_clock, e);
    e->advance_id = g_timeout_add_seconds(MAX(5, e->cfg.change_interval), on_advance, e);
    LOG("Wygaszacz: start (%u monitorów)", e->outputs->len);
}

static void engine_hide(Engine *e, bool immediate)
{
    if (!e->visible)
        return;
    e->visible = false;
    if (e->clock_id)
        g_source_remove(e->clock_id);
    if (e->advance_id)
        g_source_remove(e->advance_id);
    e->clock_id = e->advance_id = 0;
    if (e->preview_note)
        ext_idle_notification_v1_destroy(e->preview_note);
    e->preview_note = NULL;
    e->code_required = false;
    for (guint i = 0; i < e->outputs->len; i++)
        make_input_transparent(g_ptr_array_index(e->outputs, i));
    wl_display_flush(e->display);
    word_store_save(e->store);
    if (immediate) {
        finish_hide(e);
        return;
    }
    e->hiding = true;
    tween_to(&e->root, 0, 0, FADE_OUT_MS, EASE_OUT_QUAD, NULL, NULL);
    LOG("Wygaszacz: koniec");
}

static void dismiss(Engine *e)
{
    if (!e->visible || e->hiding)
        return;
    if (e->code_required && e->prompt)
        prompt_show(e->prompt);
    else
        engine_hide(e, false);
}

void engine_show_now(Engine *e)
{
    engine_show(e);
}

void engine_set_hidden_cb(Engine *e, void (*cb)(void *data), void *data)
{
    e->hidden_cb = cb;
    e->hidden_data = data;
}

static const char *const MUSIC_PLAYERS[] = {
    "spotify", "rhythmbox", "lollypop", "amberol", "elisa", "strawberry", "clementine",
    "audacious", "quodlibet", "cmus", "ncspot", "tauon", "deadbeef", "mpd", "music",
    "tidal", "cider", "harmonoid", "g4music", "gapless", "shortwave", "podcasts", "kasts",
    "exaile", "gmusicbrowser", "guayadeque", "museeks", "nuclear", "pithos", "radio",
};

static bool is_music_player(const char *bus_name)
{
    char *low = g_ascii_strdown(bus_name + strlen("org.mpris.MediaPlayer2."), -1);
    bool music = false;
    for (size_t i = 0; i < G_N_ELEMENTS(MUSIC_PLAYERS) && !music; i++)
        music = strstr(low, MUSIC_PLAYERS[i]) != NULL;
    g_free(low);
    return music;
}

typedef struct {
    Engine *e;
    uint32_t gen;
    int pending;
    bool playing;
    void (*done)(Engine *e, bool playing);
} MprisCheck;

static void mpris_finish(MprisCheck *c)
{
    if (--c->pending > 0)
        return;
    if (c->gen == c->e->mpris_gen)
        c->done(c->e, c->playing);
    g_free(c);
}

static void mpris_status_cb(GObject *src, GAsyncResult *res, gpointer data)
{
    MprisCheck *c = data;
    GVariant *v = g_dbus_connection_call_finish(G_DBUS_CONNECTION(src), res, NULL);
    if (v) {
        GVariant *inner = NULL;
        g_variant_get(v, "(v)", &inner);
        if (inner && g_variant_is_of_type(inner, G_VARIANT_TYPE_STRING) &&
            g_strcmp0(g_variant_get_string(inner, NULL), "Playing") == 0)
            c->playing = true;
        if (inner)
            g_variant_unref(inner);
        g_variant_unref(v);
    }
    mpris_finish(c);
}

static void mpris_names_cb(GObject *src, GAsyncResult *res, gpointer data)
{
    MprisCheck *c = data;
    GVariant *v = g_dbus_connection_call_finish(G_DBUS_CONNECTION(src), res, NULL);
    if (v) {
        GVariantIter *it;
        const char *name;
        g_variant_get(v, "(as)", &it);
        while (g_variant_iter_loop(it, "&s", &name)) {
            if (!g_str_has_prefix(name, "org.mpris.MediaPlayer2.") || is_music_player(name))
                continue;
            c->pending++;
            g_dbus_connection_call(c->e->bus, name, "/org/mpris/MediaPlayer2",
                                   "org.freedesktop.DBus.Properties", "Get",
                                   g_variant_new("(ss)", "org.mpris.MediaPlayer2.Player", "PlaybackStatus"),
                                   G_VARIANT_TYPE("(v)"), G_DBUS_CALL_FLAGS_NONE, 1000, NULL,
                                   mpris_status_cb, c);
        }
        g_variant_iter_free(it);
        g_variant_unref(v);
    }
    mpris_finish(c);
}

static void mpris_check(Engine *e, void (*done)(Engine *e, bool playing))
{
    if (!e->bus) {
        done(e, false);
        return;
    }
    MprisCheck *c = g_new0(MprisCheck, 1);
    c->e = e;
    c->gen = ++e->mpris_gen;
    c->pending = 1;
    c->done = done;
    g_dbus_connection_call(e->bus, "org.freedesktop.DBus", "/org/freedesktop/DBus", "org.freedesktop.DBus",
                           "ListNames", NULL, G_VARIANT_TYPE("(as)"), G_DBUS_CALL_FLAGS_NONE, 1000, NULL,
                           mpris_names_cb, c);
}

static bool paused(Engine *e)
{
    return e->cfg.paused_until > g_get_real_time() / G_USEC_PER_SEC;
}

static void stop_poll(Engine *e)
{
    if (e->poll_id)
        g_source_remove(e->poll_id);
    e->poll_id = 0;
}

static gboolean poll_tick(gpointer data);

static void after_mpris(Engine *e, bool playing)
{
    if (!e->is_idle || e->visible || paused(e))
        return;
    if (playing) {
        if (!e->poll_id)
            e->poll_id = g_timeout_add_seconds(INHIBIT_POLL_S, poll_tick, e);
        return;
    }
    stop_poll(e);
    engine_show(e);
}

static gboolean poll_tick(gpointer data)
{
    Engine *e = data;
    if (!e->is_idle || e->visible) {
        e->poll_id = 0;
        return G_SOURCE_REMOVE;
    }
    mpris_check(e, after_mpris);
    return G_SOURCE_CONTINUE;
}

static void on_resumed(Engine *e)
{
    if (!e->visible || e->hiding || now_s() - e->shown_at < MOTION_GRACE_S)
        return;
    dismiss(e);
}

static void note_idled(void *data, struct ext_idle_notification_v1 *n)
{
    Engine *e = data;
    if (n == e->preview_note) {
        if (e->preview_timeout_id)
            g_source_remove(e->preview_timeout_id);
        e->preview_timeout_id = 0;
        LOG("Podgląd: mysz stoi, pokazuję wygaszacz");
        engine_show(e);
        return;
    }
    e->is_idle = true;
    config_read(e->settings, &e->cfg);
    if (e->visible || paused(e))
        return;
    if (e->cfg.respect_inhibitors)
        mpris_check(e, after_mpris);
    else
        engine_show(e);
}

static void note_resumed(void *data, struct ext_idle_notification_v1 *n)
{
    Engine *e = data;
    if (n == e->idle_note) {
        e->is_idle = false;
        stop_poll(e);
    }
    on_resumed(e);
}

static const struct ext_idle_notification_v1_listener note_listener = {
    .idled = note_idled,
    .resumed = note_resumed,
};

static struct ext_idle_notification_v1 *make_note(Engine *e, uint32_t ms, bool input_only)
{
    struct ext_idle_notification_v1 *n;
    if (input_only && e->notifier_ver >= 2)
        n = ext_idle_notifier_v1_get_input_idle_notification(e->notifier, ms, e->seat);
    else
        n = ext_idle_notifier_v1_get_idle_notification(e->notifier, ms, e->seat);
    ext_idle_notification_v1_add_listener(n, &note_listener, e);
    return n;
}

static void arm_idle(Engine *e)
{
    if (e->idle_note)
        ext_idle_notification_v1_destroy(e->idle_note);
    e->is_idle = false;
    stop_poll(e);
    uint32_t ms = (uint32_t)MAX(1, e->cfg.idle_minutes) * 60u * 1000u;
    e->idle_note = make_note(e, ms, !e->cfg.respect_inhibitors);
    wl_display_flush(e->display);
    LOG("Bezczynność: %d min%s", e->cfg.idle_minutes, e->cfg.respect_inhibitors ? " (z blokadami)" : "");
}

static gboolean preview_timeout(gpointer data)
{
    Engine *e = data;
    e->preview_timeout_id = 0;
    if (!e->visible && e->preview_note) {
        ext_idle_notification_v1_destroy(e->preview_note);
        e->preview_note = NULL;
        LOG("Podgląd: mysz się nie zatrzymała, rezygnuję");
    }
    return G_SOURCE_REMOVE;
}

static void start_preview(Engine *e)
{
    if (e->visible) {
        LOG("Podgląd: wygaszacz już działa");
        return;
    }
    if (e->preview_note)
        ext_idle_notification_v1_destroy(e->preview_note);
    e->preview_note = make_note(e, PREVIEW_IDLE_MS, true);
    if (e->preview_timeout_id)
        g_source_remove(e->preview_timeout_id);
    e->preview_timeout_id = g_timeout_add_seconds(PREVIEW_TIMEOUT_S, preview_timeout, e);
    wl_display_flush(e->display);
    LOG("Podgląd: czekam, aż mysz się zatrzyma");
}

static void on_setting(GSettings *s, const char *key, gpointer data)
{
    (void)s;
    Engine *e = data;
    Config old = e->cfg;
    config_read(e->settings, &e->cfg);
    if (!strcmp(key, "idle-minutes") || !strcmp(key, "respect-inhibitors")) {
        if (old.idle_minutes != e->cfg.idle_minutes || old.respect_inhibitors != e->cfg.respect_inhibitors)
            arm_idle(e);
    } else if (!strcmp(key, "preview-request")) {
        start_preview(e);
    } else if (!strcmp(key, "reset-today-request")) {
        int counts[LANG_N];
        counts_of(e, counts);
        word_store_reset_today(e->store);
        word_store_ensure_today(e->store, counts);
    } else if (!strcmp(key, "unlock-code-enabled") || !strcmp(key, "unlock-code")) {
        if (e->visible && e->code_required && !(e->cfg.code_enabled && code_has(e->cfg.unlock_code))) {
            e->code_required = false;
            if (e->prompt)
                prompt_hide(e->prompt);
        }
    }
}

static void moved(Engine *e)
{
    if (now_s() - e->shown_at < MOTION_GRACE_S)
        return;
    dismiss(e);
}

static void ptr_enter(void *data, struct wl_pointer *p, uint32_t serial, struct wl_surface *s, wl_fixed_t x,
                      wl_fixed_t y)
{
    Engine *e = data;
    wl_pointer_set_cursor(p, serial, NULL, 0, 0);
    double fx = wl_fixed_to_double(x), fy = wl_fixed_to_double(y);
    if (!e->ptr_base) {
        e->ptr_base = true;
        e->ptr_surface = s;
        e->ptr_x = fx;
        e->ptr_y = fy;
    } else if (s != e->ptr_surface) {
        moved(e);
    }
}

static void ptr_leave(void *d, struct wl_pointer *p, uint32_t serial, struct wl_surface *s)
{
    (void)d; (void)p; (void)serial; (void)s;
}

static void ptr_motion(void *data, struct wl_pointer *p, uint32_t time, wl_fixed_t x, wl_fixed_t y)
{
    (void)p;
    (void)time;
    Engine *e = data;
    double fx = wl_fixed_to_double(x), fy = wl_fixed_to_double(y);
    if (!e->ptr_base) {
        e->ptr_base = true;
        e->ptr_x = fx;
        e->ptr_y = fy;
        return;
    }
    if (fabs(fx - e->ptr_x) > MOTION_THRESHOLD || fabs(fy - e->ptr_y) > MOTION_THRESHOLD)
        moved(e);
}

static void ptr_button(void *data, struct wl_pointer *p, uint32_t serial, uint32_t time, uint32_t button,
                       uint32_t state)
{
    (void)p; (void)serial; (void)time; (void)button;
    if (state == WL_POINTER_BUTTON_STATE_PRESSED)
        dismiss(data);
}

static void ptr_axis(void *data, struct wl_pointer *p, uint32_t time, uint32_t axis, wl_fixed_t v)
{
    (void)p; (void)time; (void)axis; (void)v;
    dismiss(data);
}

static void ptr_frame(void *d, struct wl_pointer *p) { (void)d; (void)p; }
static void ptr_axis_source(void *d, struct wl_pointer *p, uint32_t s) { (void)d; (void)p; (void)s; }
static void ptr_axis_stop(void *d, struct wl_pointer *p, uint32_t t, uint32_t a) { (void)d; (void)p; (void)t; (void)a; }
static void ptr_axis_discrete(void *d, struct wl_pointer *p, uint32_t a, int32_t v) { (void)d; (void)p; (void)a; (void)v; }

static const struct wl_pointer_listener ptr_listener = {
    .enter = ptr_enter,
    .leave = ptr_leave,
    .motion = ptr_motion,
    .button = ptr_button,
    .axis = ptr_axis,
    .frame = ptr_frame,
    .axis_source = ptr_axis_source,
    .axis_stop = ptr_axis_stop,
    .axis_discrete = ptr_axis_discrete,
};

static void kb_keymap(void *data, struct wl_keyboard *k, uint32_t format, int32_t fd, uint32_t size)
{
    (void)k;
    Engine *e = data;
    if (format != WL_KEYBOARD_KEYMAP_FORMAT_XKB_V1) {
        close(fd);
        return;
    }
    char *map = mmap(NULL, size, PROT_READ, MAP_PRIVATE, fd, 0);
    close(fd);
    if (map == MAP_FAILED)
        return;
    struct xkb_keymap *km = xkb_keymap_new_from_string(e->xkb, map, XKB_KEYMAP_FORMAT_TEXT_V1,
                                                       XKB_KEYMAP_COMPILE_NO_FLAGS);
    munmap(map, size);
    if (!km)
        return;
    if (e->xkb_state)
        xkb_state_unref(e->xkb_state);
    if (e->keymap)
        xkb_keymap_unref(e->keymap);
    e->keymap = km;
    e->xkb_state = xkb_state_new(km);
}

static void kb_enter(void *d, struct wl_keyboard *k, uint32_t s, struct wl_surface *f, struct wl_array *keys)
{
    (void)d; (void)k; (void)s; (void)f; (void)keys;
}

static void kb_leave(void *d, struct wl_keyboard *k, uint32_t s, struct wl_surface *f)
{
    (void)d; (void)k; (void)s; (void)f;
}

static void kb_key(void *data, struct wl_keyboard *k, uint32_t serial, uint32_t time, uint32_t key, uint32_t state)
{
    (void)k; (void)serial; (void)time;
    Engine *e = data;
    if (state != WL_KEYBOARD_KEY_STATE_PRESSED || !e->visible || e->hiding)
        return;
    if (!e->code_required || !e->prompt) {
        engine_hide(e, false);
        return;
    }
    xkb_keysym_t sym = 0;
    char utf8[16] = "";
    if (e->xkb_state) {
        sym = xkb_state_key_get_one_sym(e->xkb_state, key + 8);
        xkb_state_key_get_utf8(e->xkb_state, key + 8, utf8, sizeof utf8);
    }
    prompt_key(e->prompt, sym, utf8);
}

static void kb_mods(void *data, struct wl_keyboard *k, uint32_t serial, uint32_t dep, uint32_t lat, uint32_t lock,
                    uint32_t group)
{
    (void)k; (void)serial;
    Engine *e = data;
    if (e->xkb_state)
        xkb_state_update_mask(e->xkb_state, dep, lat, lock, 0, 0, group);
}

static void kb_repeat(void *d, struct wl_keyboard *k, int32_t r, int32_t del) { (void)d; (void)k; (void)r; (void)del; }

static const struct wl_keyboard_listener kb_listener = {
    .keymap = kb_keymap,
    .enter = kb_enter,
    .leave = kb_leave,
    .key = kb_key,
    .modifiers = kb_mods,
    .repeat_info = kb_repeat,
};

static void touch_down(void *data, struct wl_touch *t, uint32_t serial, uint32_t time, struct wl_surface *s,
                       int32_t id, wl_fixed_t x, wl_fixed_t y)
{
    (void)t; (void)serial; (void)time; (void)s; (void)id; (void)x; (void)y;
    dismiss(data);
}
static void touch_up(void *d, struct wl_touch *t, uint32_t s, uint32_t tm, int32_t id) { (void)d; (void)t; (void)s; (void)tm; (void)id; }
static void touch_motion(void *d, struct wl_touch *t, uint32_t tm, int32_t id, wl_fixed_t x, wl_fixed_t y) { (void)d; (void)t; (void)tm; (void)id; (void)x; (void)y; }
static void touch_frame(void *d, struct wl_touch *t) { (void)d; (void)t; }
static void touch_cancel(void *d, struct wl_touch *t) { (void)d; (void)t; }

static const struct wl_touch_listener touch_listener = {
    .down = touch_down,
    .up = touch_up,
    .motion = touch_motion,
    .frame = touch_frame,
    .cancel = touch_cancel,
};

static void seat_caps(void *data, struct wl_seat *seat, uint32_t caps)
{
    Engine *e = data;
    if ((caps & WL_SEAT_CAPABILITY_POINTER) && !e->pointer) {
        e->pointer = wl_seat_get_pointer(seat);
        wl_pointer_add_listener(e->pointer, &ptr_listener, e);
    } else if (!(caps & WL_SEAT_CAPABILITY_POINTER) && e->pointer) {
        wl_pointer_release(e->pointer);
        e->pointer = NULL;
    }
    if ((caps & WL_SEAT_CAPABILITY_KEYBOARD) && !e->keyboard) {
        e->keyboard = wl_seat_get_keyboard(seat);
        wl_keyboard_add_listener(e->keyboard, &kb_listener, e);
    } else if (!(caps & WL_SEAT_CAPABILITY_KEYBOARD) && e->keyboard) {
        wl_keyboard_release(e->keyboard);
        e->keyboard = NULL;
    }
    if ((caps & WL_SEAT_CAPABILITY_TOUCH) && !e->touch) {
        e->touch = wl_seat_get_touch(seat);
        wl_touch_add_listener(e->touch, &touch_listener, e);
    } else if (!(caps & WL_SEAT_CAPABILITY_TOUCH) && e->touch) {
        wl_touch_release(e->touch);
        e->touch = NULL;
    }
}

static void seat_name(void *d, struct wl_seat *s, const char *n) { (void)d; (void)s; (void)n; }

static const struct wl_seat_listener seat_listener = {
    .capabilities = seat_caps,
    .name = seat_name,
};

static void out_geometry(void *data, struct wl_output *wo, int32_t x, int32_t y, int32_t pw, int32_t ph,
                         int32_t sub, const char *make, const char *model, int32_t tr)
{
    (void)wo; (void)pw; (void)ph; (void)sub; (void)make; (void)model; (void)tr;
    Output *o = data;
    o->x = x;
    o->y = y;
}
static void out_mode(void *d, struct wl_output *w, uint32_t f, int32_t wi, int32_t h, int32_t r) { (void)d; (void)w; (void)f; (void)wi; (void)h; (void)r; }
static void out_done(void *d, struct wl_output *w) { (void)d; (void)w; }
static void out_scale_ev(void *data, struct wl_output *w, int32_t s) { (void)w; ((Output *)data)->scale = s; }
static void out_name(void *data, struct wl_output *w, const char *n)
{
    (void)w;
    Output *o = data;
    g_free(o->oname);
    o->oname = g_strdup(n);
}
static void out_desc(void *d, struct wl_output *w, const char *n) { (void)d; (void)w; (void)n; }

static const struct wl_output_listener out_listener = {
    .geometry = out_geometry,
    .mode = out_mode,
    .done = out_done,
    .scale = out_scale_ev,
    .name = out_name,
    .description = out_desc,
};

static void output_free(Output *o)
{
    destroy_overlay(o);
    if (o->wo) {
        if (wl_output_get_version(o->wo) >= 3)
            wl_output_release(o->wo);
        else
            wl_output_destroy(o->wo);
    }
    g_free(o->oname);
    g_free(o);
}

static void reg_global(void *data, struct wl_registry *r, uint32_t name, const char *iface, uint32_t ver)
{
    Engine *e = data;
    if (!strcmp(iface, wl_compositor_interface.name)) {
        e->compositor = wl_registry_bind(r, name, &wl_compositor_interface, MIN(ver, 4));
    } else if (!strcmp(iface, wl_seat_interface.name) && !e->seat) {
        e->seat = wl_registry_bind(r, name, &wl_seat_interface, MIN(ver, 5));
        wl_seat_add_listener(e->seat, &seat_listener, e);
    } else if (!strcmp(iface, wl_output_interface.name)) {
        Output *o = g_new0(Output, 1);
        o->e = e;
        o->name = name;
        o->scale = 1;
        o->es = EGL_NO_SURFACE;
        o->wo = wl_registry_bind(r, name, &wl_output_interface, MIN(ver, 4));
        wl_output_add_listener(o->wo, &out_listener, o);
        g_ptr_array_add(e->outputs, o);
        if (e->visible)
            create_overlay(o);
    } else if (!strcmp(iface, zwlr_layer_shell_v1_interface.name)) {
        e->layer_shell = wl_registry_bind(r, name, &zwlr_layer_shell_v1_interface, MIN(ver, 4));
    } else if (!strcmp(iface, ext_idle_notifier_v1_interface.name)) {
        e->notifier_ver = MIN(ver, 2);
        e->notifier = wl_registry_bind(r, name, &ext_idle_notifier_v1_interface, e->notifier_ver);
    } else if (!strcmp(iface, wp_viewporter_interface.name)) {
        e->viewporter = wl_registry_bind(r, name, &wp_viewporter_interface, 1);
    } else if (!strcmp(iface, wp_fractional_scale_manager_v1_interface.name)) {
        e->fsm = wl_registry_bind(r, name, &wp_fractional_scale_manager_v1_interface, 1);
    } else if (!strcmp(iface, zwp_keyboard_shortcuts_inhibit_manager_v1_interface.name)) {
        e->ksim = wl_registry_bind(r, name, &zwp_keyboard_shortcuts_inhibit_manager_v1_interface, 1);
    }
}

static void reg_remove(void *data, struct wl_registry *r, uint32_t name)
{
    (void)r;
    Engine *e = data;
    for (guint i = 0; i < e->outputs->len; i++) {
        Output *o = g_ptr_array_index(e->outputs, i);
        if (o->name == name) {
            g_ptr_array_remove_index(e->outputs, i);
            output_free(o);
            return;
        }
    }
}

static const struct wl_registry_listener reg_listener = {
    .global = reg_global,
    .global_remove = reg_remove,
};

static void on_lost(void *data)
{
    (void)data;
    WARN("Utracono połączenie z kompozytorem, kończę");
    exit(0);
}

Engine *engine_new(struct wl_display *display, GSettings *settings)
{
    Engine *e = g_new0(Engine, 1);
    e->display = display;
    e->settings = settings;
    e->outputs = g_ptr_array_new();
    e->xkb = xkb_context_new(XKB_CONTEXT_NO_FLAGS);
    tween_init(&e->root, 0);
    config_read(settings, &e->cfg);

    e->registry = wl_display_get_registry(display);
    wl_registry_add_listener(e->registry, &reg_listener, e);
    wl_display_roundtrip(display);
    wl_display_roundtrip(display);

    if (!e->compositor || !e->layer_shell || !e->notifier || !e->seat) {
        WARN("Kompozytor nie udostępnia potrzebnych protokołów (%s%s%s%s). "
             "Wygaszacz działa tylko jako aplet panelu COSMIC.",
             e->compositor ? "" : "wl_compositor ", e->layer_shell ? "" : "zwlr_layer_shell_v1 ",
             e->notifier ? "" : "ext_idle_notifier_v1 ", e->seat ? "" : "wl_seat");
        engine_free(e);
        return NULL;
    }
    if (!egl_init_wayland(display)) {
        WARN("Nie udało się uruchomić EGL");
        engine_free(e);
        return NULL;
    }
    e->store = word_store_new();
    e->bus = g_bus_get_sync(G_BUS_TYPE_SESSION, NULL, NULL);
    if (settings)
        e->settings_handler = g_signal_connect(settings, "changed", G_CALLBACK(on_setting), e);
    e->wl_source = wl_source_attach(display, on_lost, e);
    arm_idle(e);
    return e;
}

void engine_free(Engine *e)
{
    if (!e)
        return;
    if (e->visible || e->hiding) {
        e->hidden_cb = NULL;
        engine_hide(e, true);
    }
    if (e->settings_handler)
        g_signal_handler_disconnect(e->settings, e->settings_handler);
    stop_poll(e);
    if (e->preview_timeout_id)
        g_source_remove(e->preview_timeout_id);
    for (guint i = 0; i < e->outputs->len; i++)
        output_free(g_ptr_array_index(e->outputs, i));
    g_ptr_array_unref(e->outputs);
    if (e->idle_note)
        ext_idle_notification_v1_destroy(e->idle_note);
    if (e->preview_note)
        ext_idle_notification_v1_destroy(e->preview_note);
    if (e->wl_source)
        g_source_remove(e->wl_source);
    egl_shutdown();
    word_store_free(e->store);
    entry_free(e->current);
    if (e->prank)
        g_ptr_array_unref(e->prank);
    if (e->xkb_state)
        xkb_state_unref(e->xkb_state);
    if (e->keymap)
        xkb_keymap_unref(e->keymap);
    if (e->xkb)
        xkb_context_unref(e->xkb);
    if (e->bus)
        g_object_unref(e->bus);
    g_free(e->pending_footer);
    g_free(e->pending_time);
    g_free(e);
}
