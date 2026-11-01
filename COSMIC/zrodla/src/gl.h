#pragma once

#include <EGL/egl.h>
#include <GLES2/gl2.h>
#include <cairo.h>
#include <stdbool.h>

struct wl_display;
struct wl_egl_window;

typedef struct {
    GLuint id;
    int w, h;
    bool bgra;
    bool flip;
} Tex;

typedef struct {
    GLuint fb;
    Tex tex;
} Fbo;

bool egl_init_wayland(struct wl_display *display);
bool egl_init_surfaceless(void);
void egl_shutdown(void);
EGLSurface egl_window_surface(struct wl_egl_window *win);
void egl_destroy_surface(EGLSurface s);
bool egl_make_current(EGLSurface s);
void egl_swap(EGLSurface s);

bool gl_setup(void);
GLuint gl_compile(const char *vs, const char *fs, const char *name);

Tex tex_from_cairo(cairo_surface_t *s);
void tex_free(Tex *t);

void fbo_ensure(Fbo *f, int w, int h);
void fbo_free(Fbo *f);
void fbo_bind(Fbo *f);
void fbo_unbind(int vw, int vh);

void gl_begin(int vw, int vh);
void gl_viewport(int vw, int vh);
void gl_canvas(int w, int h);

typedef struct {
    double x, y, w, h;
    double px, py;
    double sx, sy;
    double angle;
    double alpha;
} Xform;

static inline Xform xform_at(double x, double y, double w, double h, double alpha)
{
    Xform f = {x, y, w, h, x + w / 2, y + h / 2, 1, 1, 0, alpha};
    return f;
}

void gl_draw_tex(const Tex *t, const Xform *f);
void gl_draw_color(const Xform *f, double r, double g, double b, double a);
void gl_draw_fullscreen(GLuint program);
void gl_fade(double opacity);
void gl_blur(Fbo *src, Fbo *tmp, Fbo *dst, double radius);

cairo_surface_t *gl_read_pixels(int w, int h);
