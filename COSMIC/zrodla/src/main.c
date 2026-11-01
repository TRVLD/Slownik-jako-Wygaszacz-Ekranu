#include "applet.h"
#include "config.h"
#include "engine.h"
#include "gl.h"
#include "prompt.h"
#include "text.h"
#include "util.h"
#include "view.h"
#include "words.h"

#include <errno.h>
#include <fcntl.h>
#include <fontconfig/fontconfig.h>
#include <pango/pangocairo.h>
#include <stdio.h>
#include <string.h>
#include <sys/file.h>
#include <unistd.h>

typedef struct {
    GMainLoop *loop;
    GSettings *settings;
    Applet *applet;
    Engine *engine;
    int priv_fd;
    int lock_fd;
    guint retry_id;
} App;

static char *lock_path(void)
{
    const char *rt = g_get_user_runtime_dir();
    const char *fid = g_getenv("FLATPAK_ID");
    char *dir = fid ? g_build_filename(rt, "app", fid, NULL) : g_strdup(rt);
    g_mkdir_with_parents(dir, 0700);
    char *p = g_build_filename(dir, "wyraz-engine.lock", NULL);
    g_free(dir);
    return p;
}

static bool take_lock(App *app)
{
    if (app->lock_fd >= 0)
        return true;
    char *p = lock_path();
    int fd = open(p, O_RDWR | O_CREAT | O_CLOEXEC, 0600);
    g_free(p);
    if (fd < 0)
        return true;
    if (flock(fd, LOCK_EX | LOCK_NB) != 0) {
        close(fd);
        return false;
    }
    app->lock_fd = fd;
    return true;
}

static struct wl_display *engine_display(App *app)
{
    if (app->priv_fd >= 0) {
        struct wl_display *d = wl_display_connect_to_fd(app->priv_fd);
        app->priv_fd = -1;
        return d;
    }
    return NULL;
}

static void start_engine(App *app)
{
    struct wl_display *d = engine_display(app);
    if (!d) {
        d = wl_display_connect(NULL);
    }
    if (!d) {
        if (app->applet)
            applet_set_engine_state(app->applet, false, "Brak połączenia z kompozytorem.");
        return;
    }
    app->engine = engine_new(d, app->settings);
    if (!app->engine) {
        wl_display_disconnect(d);
        if (app->applet)
            applet_set_engine_state(app->applet, false,
                                    "Panel nie dał dostępu do warstwy ekranu (zbyt stary COSMIC?).");
        return;
    }
    LOG("Silnik wygaszacza działa");
    if (app->applet)
        applet_set_engine_state(app->applet, true, NULL);
}

static gboolean retry_lock(gpointer data)
{
    App *app = data;
    if (app->engine || !take_lock(app))
        return G_SOURCE_CONTINUE;
    start_engine(app);
    app->retry_id = 0;
    return G_SOURCE_REMOVE;
}

static int take_priv_fd(void)
{
    const char *s = g_getenv("X_PRIVILEGED_WAYLAND_SOCKET");
    if (!s || !*s)
        return -1;
    char *end = NULL;
    long fd = strtol(s, &end, 10);
    if (!end || *end || fd < 0)
        return -1;
    int flags = fcntl((int)fd, F_GETFD);
    if (flags < 0)
        return -1;
    fcntl((int)fd, F_SETFD, flags | FD_CLOEXEC);
    g_unsetenv("X_PRIVILEGED_WAYLAND_SOCKET");
    return (int)fd;
}

static int run_applet(App *app)
{
    app->priv_fd = take_priv_fd();
    struct wl_display *panel = wl_display_connect(NULL);
    if (!panel) {
        fprintf(stderr, "wyraz-cosmic: brak połączenia z panelem/kompozytorem Wayland\n");
        return 1;
    }
    app->applet = applet_new(panel, app->settings);
    if (!app->applet)
        return 1;
    if (take_lock(app)) {
        start_engine(app);
    } else {
        applet_set_engine_state(app->applet, false, NULL);
        app->retry_id = g_timeout_add_seconds(10, retry_lock, app);
    }
    g_main_loop_run(app->loop);
    return 0;
}

static void preview_hidden(void *data)
{
    g_main_loop_quit(((App *)data)->loop);
}

static int run_daemon(App *app, bool preview)
{
    app->priv_fd = take_priv_fd();
    if (!preview && !take_lock(app)) {
        fprintf(stderr, "wyraz-cosmic: silnik już działa (aplet w panelu)\n");
        return 1;
    }
    start_engine(app);
    if (!app->engine)
        return 1;
    if (preview) {
        engine_set_hidden_cb(app->engine, preview_hidden, app);
        engine_show_now(app->engine);
    }
    g_main_loop_run(app->loop);
    engine_free(app->engine);
    return 0;
}

static void save_png(int w, int h, const char *path)
{
    cairo_surface_t *s = gl_read_pixels(w, h);
    cairo_surface_write_to_png(s, path);
    cairo_surface_destroy(s);
    printf("  %s\n", path);
}

static void advance_time(double dt)
{
    g_usleep((gulong)(dt * 1e6));
}

static int run_render_test(const char *dir, int W, int H)
{
    if (!egl_init_surfaceless()) {
        fprintf(stderr, "Brak EGL surfaceless (Mesa)\n");
        return 1;
    }
    gl_setup();
    g_mkdir_with_parents(dir, 0755);
    GSettings *settings = config_settings_new();
    static const char *styles[] = {"aurora", "ocean", "lublin", "wroclove"};
    static const char *positions[] = {"special", "random", "custom"};
    static const char *clocks[] = {"futhark", "sourcesans", "sanfrancisco", "garamond"};
    Entry *words[3];
    words[0] = entry_new("Wrocławianka", LANG_PL);
    g_ptr_array_add(words[0]->d, g_strdup("mieszkanka Wrocławia"));
    words[1] = entry_new("konstantynopolitańczykowianeczka", LANG_PL);
    g_ptr_array_add(words[1]->d, g_strdup("bardzo długie słowo, które sprawdza, czy hasło zmieści się w jednej linii i czy rozmiar kroju zostanie zmniejszony"));
    g_ptr_array_add(words[1]->d, g_strdup("drugie znaczenie z numeracją"));
    words[2] = entry_new("serendipity", LANG_EN);
    g_ptr_array_add(words[2]->d, g_strdup("noun: good luck in making unexpected and fortunate discoveries"));
    Fbo fb = {0};
    fbo_ensure(&fb, W, H);
    const char *only = g_getenv("WYRAZ_TEST_ONLY");
    double toff = g_getenv("WYRAZ_TEST_TOFFSET") ? g_ascii_strtod(g_getenv("WYRAZ_TEST_TOFFSET"), NULL) : 0;
    for (int si = 0; si < 4; si++) {
        if (only && strcmp(only, styles[si]) != 0)
            continue;
        for (int pi = 0; pi < 3; pi++) {
            g_setenv("WYRAZ_STYLE", styles[si], TRUE);
            g_setenv("WYRAZ_CLOCK_POSITION", positions[pi], TRUE);
            g_setenv("WYRAZ_CLOCK_STYLE", clocks[si], TRUE);
            Config cfg;
            config_read(settings, &cfg);
            cfg.clock_x = 85;
            cfg.clock_y = 15;
            cfg.clock_enabled = true;
            View *v = view_new(&cfg, W, H, 0, 0, 1.0);
            const Entry *e = words[(si + pi) % 3];
            view_present(v, e, true, 30);
            double t0 = now_s();
            double times[] = {3.2};
            for (size_t k = 0; k < G_N_ELEMENTS(times); k++) {
                while (now_s() - t0 < times[k]) {
                    view_set_time(v, toff + now_s() - t0);
                    advance_time(0.033);
                }
                view_set_time(v, toff + now_s() - t0);
                glBindFramebuffer(GL_FRAMEBUFFER, fb.fb);
                gl_begin(W, H);
                view_draw(v);
                char *path = g_strdup_printf("%s/%s-%s%s.png", dir, styles[si], positions[pi], toff > 0 ? "-late" : "");
                glFinish();
                save_png(W, H, path);
                g_free(path);
            }
            view_free(v);
        }
    }
    g_setenv("WYRAZ_STYLE", "aurora", TRUE);
    g_setenv("WYRAZ_CLOCK_POSITION", "special", TRUE);
    Config cfg;
    config_read(settings, &cfg);
    View *v = view_new(&cfg, W, H, 0, 0, 1.0);
    view_present(v, words[0], true, 30);
    CodeGuard guard = {0};
    Prompt *p = prompt_new(&cfg, &guard, NULL, NULL, NULL, NULL);
    double t0 = now_s();
    view_set_blur(v, true);
    prompt_show(p);
    prompt_key(p, 'a', "a");
    prompt_key(p, 'b', "b");
    while (now_s() - t0 < 3.0) {
        view_set_time(v, now_s() - t0);
        prompt_tick(p);
        advance_time(0.033);
    }
    glBindFramebuffer(GL_FRAMEBUFFER, fb.fb);
    gl_begin(W, H);
    view_draw(v);
    prompt_draw(p, W, H, 1.0);
    char *path = g_strdup_printf("%s/code-prompt.png", dir);
    save_png(W, H, path);
    g_free(path);
    prompt_free(p);
    view_free(v);
    for (int i = 0; i < 3; i++)
        entry_free(words[i]);
    fbo_free(&fb);
    return 0;
}

static void add_app_fonts(void)
{
    const char *env = g_getenv("WYRAZ_FONT_DIR");
    char **dirs = g_strsplit(env && *env ? env : WYRAZ_FONTDIRS, ":", -1);
    for (char **d = dirs; *d; d++)
        if (**d && g_file_test(*d, G_FILE_TEST_IS_DIR))
            FcConfigAppFontAddDir(NULL, (const FcChar8 *)*d);
    g_strfreev(dirs);
}

int main(int argc, char **argv)
{
    App app = {.priv_fd = -1, .lock_fd = -1};
    add_app_fonts();
    const char *mode = g_getenv("COSMIC_PANEL_NAME") ? "applet" : "help";
    const char *dir = NULL;
    int W = 1600, H = 900;
    for (int i = 1; i < argc; i++) {
        if (!strcmp(argv[i], "--applet"))
            mode = "applet";
        else if (!strcmp(argv[i], "--daemon"))
            mode = "daemon";
        else if (!strcmp(argv[i], "--preview"))
            mode = "preview";
        else if (!strcmp(argv[i], "--render-test") && i + 1 < argc) {
            mode = "render";
            dir = argv[++i];
        } else if (!strcmp(argv[i], "--size") && i + 1 < argc) {
            sscanf(argv[++i], "%dx%d", &W, &H);
        } else if (!strcmp(argv[i], "--version")) {
            printf("wyraz-cosmic %s\n", WYRAZ_VERSION);
            return 0;
        } else {
            mode = "help";
        }
    }
    if (!strcmp(mode, "help")) {
        printf("Słownik jako Wygaszacz Ekranu dla COSMIC (%s)\n\n"
               "Program działa jako aplet panelu COSMIC: dodaj go w Ustawieniach COSMIC\n"
               "→ Pulpit → Panel → Aplety → „Słownik jako Wygaszacz Ekranu”.\n\n"
               "  --daemon            sam wygaszacz (poza panelem, bez Flatpaka)\n"
               "  --preview           pokaż wygaszacz od razu\n"
               "  --render-test DIR   zapisz klatki stylów do PNG (test offscreen)\n"
               "  --size WxH          rozmiar klatek testu (domyślnie 1600x900)\n",
               WYRAZ_VERSION);
        return 0;
    }
    if (!strcmp(mode, "render"))
        return run_render_test(dir, W, H);

    app.loop = g_main_loop_new(NULL, FALSE);
    app.settings = config_settings_new();
    int rc;
    if (!strcmp(mode, "applet"))
        rc = run_applet(&app);
    else
        rc = run_daemon(&app, !strcmp(mode, "preview"));
    g_settings_sync();
    return rc;
}
