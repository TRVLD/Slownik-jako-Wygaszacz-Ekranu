#include "gl.h"
#include "util.h"

#include <EGL/eglext.h>
#include <string.h>
#include <wayland-egl.h>

#ifndef EGL_PLATFORM_WAYLAND_KHR
#define EGL_PLATFORM_WAYLAND_KHR 0x31D8
#endif
#ifndef EGL_PLATFORM_SURFACELESS_MESA
#define EGL_PLATFORM_SURFACELESS_MESA 0x31DD
#endif

static EGLDisplay dpy = EGL_NO_DISPLAY;
static EGLContext ctx = EGL_NO_CONTEXT;
static EGLConfig cfg;
static int vp_w = 1, vp_h = 1;

static GLuint prog_tex, prog_blur;
static GLint u_res, u_rect, u_pivot, u_scale, u_rot, u_uv, u_color, u_bgra, u_tex;
static GLint b_res, b_dir, b_tex, b_uv;
static GLuint vbo;
static Tex white;

static bool egl_finish_init(void)
{
    EGLint major, minor;
    if (!eglInitialize(dpy, &major, &minor)) {
        WARN("eglInitialize nie powiodło się");
        return false;
    }
    eglBindAPI(EGL_OPENGL_ES_API);
    const EGLint attrs[] = {
        EGL_SURFACE_TYPE, EGL_WINDOW_BIT,
        EGL_RED_SIZE, 8, EGL_GREEN_SIZE, 8, EGL_BLUE_SIZE, 8, EGL_ALPHA_SIZE, 8,
        EGL_RENDERABLE_TYPE, EGL_OPENGL_ES2_BIT,
        EGL_NONE,
    };
    const EGLint attrs_nowin[] = {
        EGL_SURFACE_TYPE, 0,
        EGL_RED_SIZE, 8, EGL_GREEN_SIZE, 8, EGL_BLUE_SIZE, 8, EGL_ALPHA_SIZE, 8,
        EGL_RENDERABLE_TYPE, EGL_OPENGL_ES2_BIT,
        EGL_NONE,
    };
    EGLint n = 0;
    if (!eglChooseConfig(dpy, attrs, &cfg, 1, &n) || n < 1) {
        if (!eglChooseConfig(dpy, attrs_nowin, &cfg, 1, &n) || n < 1) {
            WARN("Brak konfiguracji EGL RGBA8888");
            return false;
        }
    }
    const EGLint cattrs[] = {EGL_CONTEXT_CLIENT_VERSION, 2, EGL_NONE};
    ctx = eglCreateContext(dpy, cfg, EGL_NO_CONTEXT, cattrs);
    if (ctx == EGL_NO_CONTEXT) {
        WARN("Nie udało się utworzyć kontekstu GLES2");
        return false;
    }
    LOG("EGL %d.%d, %s", major, minor, eglQueryString(dpy, EGL_VENDOR));
    return true;
}

bool egl_init_wayland(struct wl_display *display)
{
    PFNEGLGETPLATFORMDISPLAYEXTPROC get_platform =
        (PFNEGLGETPLATFORMDISPLAYEXTPROC)eglGetProcAddress("eglGetPlatformDisplayEXT");
    if (get_platform)
        dpy = get_platform(EGL_PLATFORM_WAYLAND_KHR, display, NULL);
    if (dpy == EGL_NO_DISPLAY)
        dpy = eglGetDisplay((EGLNativeDisplayType)display);
    if (dpy == EGL_NO_DISPLAY)
        return false;
    return egl_finish_init();
}

bool egl_init_surfaceless(void)
{
    PFNEGLGETPLATFORMDISPLAYEXTPROC get_platform =
        (PFNEGLGETPLATFORMDISPLAYEXTPROC)eglGetProcAddress("eglGetPlatformDisplayEXT");
    if (get_platform)
        dpy = get_platform(EGL_PLATFORM_SURFACELESS_MESA, EGL_DEFAULT_DISPLAY, NULL);
    if (dpy == EGL_NO_DISPLAY)
        return false;
    if (!egl_finish_init())
        return false;
    return eglMakeCurrent(dpy, EGL_NO_SURFACE, EGL_NO_SURFACE, ctx);
}

void egl_shutdown(void)
{
    if (dpy == EGL_NO_DISPLAY)
        return;
    eglMakeCurrent(dpy, EGL_NO_SURFACE, EGL_NO_SURFACE, EGL_NO_CONTEXT);
    if (ctx != EGL_NO_CONTEXT)
        eglDestroyContext(dpy, ctx);
    eglTerminate(dpy);
    dpy = EGL_NO_DISPLAY;
    ctx = EGL_NO_CONTEXT;
    prog_tex = prog_blur = 0;
    vbo = 0;
    white.id = 0;
}

EGLSurface egl_window_surface(struct wl_egl_window *win)
{
    EGLSurface s = eglCreateWindowSurface(dpy, cfg, (EGLNativeWindowType)win, NULL);
    if (s == EGL_NO_SURFACE)
        WARN("eglCreateWindowSurface: 0x%x", eglGetError());
    return s;
}

void egl_destroy_surface(EGLSurface s)
{
    if (s != EGL_NO_SURFACE) {
        eglMakeCurrent(dpy, EGL_NO_SURFACE, EGL_NO_SURFACE, ctx);
        eglDestroySurface(dpy, s);
    }
}

bool egl_make_current(EGLSurface s)
{
    if (!eglMakeCurrent(dpy, s, s, ctx))
        return false;
    if (s != EGL_NO_SURFACE)
        eglSwapInterval(dpy, 0);
    return true;
}

void egl_swap(EGLSurface s)
{
    eglSwapBuffers(dpy, s);
}

static const char *VS_TEX =
    "attribute vec2 a_pos;\n"
    "uniform vec2 u_res;\n"
    "uniform vec4 u_rect;\n"
    "uniform vec2 u_pivot;\n"
    "uniform vec2 u_scale;\n"
    "uniform vec2 u_rot;\n"
    "uniform vec4 u_uv;\n"
    "varying vec2 v_uv;\n"
    "void main() {\n"
    "  vec2 p = u_rect.xy + a_pos * u_rect.zw;\n"
    "  vec2 d = (p - u_pivot) * u_scale;\n"
    "  d = vec2(u_rot.x * d.x - u_rot.y * d.y, u_rot.y * d.x + u_rot.x * d.y);\n"
    "  p = u_pivot + d;\n"
    "  gl_Position = vec4(p.x / u_res.x * 2.0 - 1.0, 1.0 - p.y / u_res.y * 2.0, 0.0, 1.0);\n"
    "  v_uv = mix(u_uv.xy, u_uv.zw, a_pos);\n"
    "}\n";

static const char *FS_TEX =
    "precision mediump float;\n"
    "uniform sampler2D u_tex;\n"
    "uniform vec4 u_color;\n"
    "uniform float u_bgra;\n"
    "varying vec2 v_uv;\n"
    "void main() {\n"
    "  vec4 t = texture2D(u_tex, v_uv);\n"
    "  t = mix(t, t.bgra, u_bgra);\n"
    "  gl_FragColor = t * u_color;\n"
    "}\n";

static const char *VS_FULL =
    "attribute vec2 a_pos;\n"
    "uniform vec4 u_uv;\n"
    "varying vec2 v_uv;\n"
    "void main() {\n"
    "  v_uv = mix(u_uv.xy, u_uv.zw, a_pos);\n"
    "  gl_Position = vec4(a_pos.x * 2.0 - 1.0, 1.0 - a_pos.y * 2.0, 0.0, 1.0);\n"
    "}\n";

static const char *FS_BLUR =
    "precision mediump float;\n"
    "uniform sampler2D u_tex;\n"
    "uniform vec2 u_res;\n"
    "uniform vec2 u_dir;\n"
    "varying vec2 v_uv;\n"
    "void main() {\n"
    "  vec2 o1 = 1.411764705882353 * u_dir / u_res;\n"
    "  vec2 o2 = 3.2941176470588234 * u_dir / u_res;\n"
    "  vec2 o3 = 5.176470588235294 * u_dir / u_res;\n"
    "  vec4 c = texture2D(u_tex, v_uv) * 0.1964825501511404;\n"
    "  c += texture2D(u_tex, v_uv + o1) * 0.2969069646728344;\n"
    "  c += texture2D(u_tex, v_uv - o1) * 0.2969069646728344;\n"
    "  c += texture2D(u_tex, v_uv + o2) * 0.09447039785044732;\n"
    "  c += texture2D(u_tex, v_uv - o2) * 0.09447039785044732;\n"
    "  c += texture2D(u_tex, v_uv + o3) * 0.010381362401148057;\n"
    "  c += texture2D(u_tex, v_uv - o3) * 0.010381362401148057;\n"
    "  gl_FragColor = c;\n"
    "}\n";

static GLuint compile_one(GLenum type, const char *src, const char *name)
{
    GLuint sh = glCreateShader(type);
    glShaderSource(sh, 1, &src, NULL);
    glCompileShader(sh);
    GLint ok = 0;
    glGetShaderiv(sh, GL_COMPILE_STATUS, &ok);
    if (!ok) {
        char log[2048];
        glGetShaderInfoLog(sh, sizeof log, NULL, log);
        WARN("Shader %s: %s", name, log);
        glDeleteShader(sh);
        return 0;
    }
    return sh;
}

GLuint gl_compile(const char *vs, const char *fs, const char *name)
{
    GLuint v = compile_one(GL_VERTEX_SHADER, vs ? vs : VS_FULL, name);
    GLuint f = compile_one(GL_FRAGMENT_SHADER, fs, name);
    if (!v || !f)
        return 0;
    GLuint p = glCreateProgram();
    glAttachShader(p, v);
    glAttachShader(p, f);
    glBindAttribLocation(p, 0, "a_pos");
    glLinkProgram(p);
    glDeleteShader(v);
    glDeleteShader(f);
    GLint ok = 0;
    glGetProgramiv(p, GL_LINK_STATUS, &ok);
    if (!ok) {
        char log[2048];
        glGetProgramInfoLog(p, sizeof log, NULL, log);
        WARN("Program %s: %s", name, log);
        glDeleteProgram(p);
        return 0;
    }
    return p;
}

bool gl_setup(void)
{
    if (prog_tex)
        return true;
    prog_tex = gl_compile(VS_TEX, FS_TEX, "tex");
    prog_blur = gl_compile(NULL, FS_BLUR, "blur");
    if (!prog_tex)
        return false;
    u_res = glGetUniformLocation(prog_tex, "u_res");
    u_rect = glGetUniformLocation(prog_tex, "u_rect");
    u_pivot = glGetUniformLocation(prog_tex, "u_pivot");
    u_scale = glGetUniformLocation(prog_tex, "u_scale");
    u_rot = glGetUniformLocation(prog_tex, "u_rot");
    u_uv = glGetUniformLocation(prog_tex, "u_uv");
    u_color = glGetUniformLocation(prog_tex, "u_color");
    u_bgra = glGetUniformLocation(prog_tex, "u_bgra");
    u_tex = glGetUniformLocation(prog_tex, "u_tex");
    if (prog_blur) {
        b_res = glGetUniformLocation(prog_blur, "u_res");
        b_dir = glGetUniformLocation(prog_blur, "u_dir");
        b_tex = glGetUniformLocation(prog_blur, "u_tex");
        b_uv = glGetUniformLocation(prog_blur, "u_uv");
    }
    static const float quad[] = {0, 0, 1, 0, 0, 1, 1, 1};
    glGenBuffers(1, &vbo);
    glBindBuffer(GL_ARRAY_BUFFER, vbo);
    glBufferData(GL_ARRAY_BUFFER, sizeof quad, quad, GL_STATIC_DRAW);

    static const unsigned char px[4] = {255, 255, 255, 255};
    glGenTextures(1, &white.id);
    glBindTexture(GL_TEXTURE_2D, white.id);
    glTexImage2D(GL_TEXTURE_2D, 0, GL_RGBA, 1, 1, 0, GL_RGBA, GL_UNSIGNED_BYTE, px);
    glTexParameteri(GL_TEXTURE_2D, GL_TEXTURE_MIN_FILTER, GL_NEAREST);
    glTexParameteri(GL_TEXTURE_2D, GL_TEXTURE_MAG_FILTER, GL_NEAREST);
    white.w = white.h = 1;
    return true;
}

static void set_tex_params(void)
{
    glTexParameteri(GL_TEXTURE_2D, GL_TEXTURE_MIN_FILTER, GL_LINEAR);
    glTexParameteri(GL_TEXTURE_2D, GL_TEXTURE_MAG_FILTER, GL_LINEAR);
    glTexParameteri(GL_TEXTURE_2D, GL_TEXTURE_WRAP_S, GL_CLAMP_TO_EDGE);
    glTexParameteri(GL_TEXTURE_2D, GL_TEXTURE_WRAP_T, GL_CLAMP_TO_EDGE);
}

Tex tex_from_cairo(cairo_surface_t *s)
{
    Tex t = {0};
    cairo_surface_flush(s);
    int w = cairo_image_surface_get_width(s);
    int h = cairo_image_surface_get_height(s);
    int stride = cairo_image_surface_get_stride(s);
    unsigned char *data = cairo_image_surface_get_data(s);
    if (w <= 0 || h <= 0 || !data)
        return t;
    glGenTextures(1, &t.id);
    glBindTexture(GL_TEXTURE_2D, t.id);
    glPixelStorei(GL_UNPACK_ALIGNMENT, 4);
    if (stride == w * 4) {
        glTexImage2D(GL_TEXTURE_2D, 0, GL_RGBA, w, h, 0, GL_RGBA, GL_UNSIGNED_BYTE, data);
    } else {
        unsigned char *tight = g_malloc((gsize)w * h * 4);
        for (int y = 0; y < h; y++)
            memcpy(tight + (gsize)y * w * 4, data + (gsize)y * stride, (gsize)w * 4);
        glTexImage2D(GL_TEXTURE_2D, 0, GL_RGBA, w, h, 0, GL_RGBA, GL_UNSIGNED_BYTE, tight);
        g_free(tight);
    }
    set_tex_params();
    t.w = w;
    t.h = h;
    t.bgra = true;
    return t;
}

void tex_free(Tex *t)
{
    if (t->id)
        glDeleteTextures(1, &t->id);
    memset(t, 0, sizeof *t);
}

void fbo_ensure(Fbo *f, int w, int h)
{
    w = MAX(1, w);
    h = MAX(1, h);
    if (f->fb && f->tex.w == w && f->tex.h == h)
        return;
    fbo_free(f);
    GLint prev = 0;
    glGetIntegerv(GL_FRAMEBUFFER_BINDING, &prev);
    glGenTextures(1, &f->tex.id);
    glBindTexture(GL_TEXTURE_2D, f->tex.id);
    glTexImage2D(GL_TEXTURE_2D, 0, GL_RGBA, w, h, 0, GL_RGBA, GL_UNSIGNED_BYTE, NULL);
    set_tex_params();
    f->tex.w = w;
    f->tex.h = h;
    f->tex.bgra = false;
    f->tex.flip = true;
    glGenFramebuffers(1, &f->fb);
    glBindFramebuffer(GL_FRAMEBUFFER, f->fb);
    glFramebufferTexture2D(GL_FRAMEBUFFER, GL_COLOR_ATTACHMENT0, GL_TEXTURE_2D, f->tex.id, 0);
    if (glCheckFramebufferStatus(GL_FRAMEBUFFER) != GL_FRAMEBUFFER_COMPLETE)
        WARN("Niekompletny FBO %dx%d", w, h);
    glBindFramebuffer(GL_FRAMEBUFFER, (GLuint)prev);
}

void fbo_free(Fbo *f)
{
    if (f->fb)
        glDeleteFramebuffers(1, &f->fb);
    f->fb = 0;
    tex_free(&f->tex);
}

void fbo_bind(Fbo *f)
{
    glBindFramebuffer(GL_FRAMEBUFFER, f->fb);
    gl_viewport(f->tex.w, f->tex.h);
}

void fbo_unbind(int vw, int vh)
{
    glBindFramebuffer(GL_FRAMEBUFFER, 0);
    gl_viewport(vw, vh);
}

void gl_viewport(int vw, int vh)
{
    vp_w = MAX(1, vw);
    vp_h = MAX(1, vh);
    glViewport(0, 0, vp_w, vp_h);
}

void gl_canvas(int w, int h)
{
    vp_w = MAX(1, w);
    vp_h = MAX(1, h);
}

void gl_begin(int vw, int vh)
{
    gl_viewport(vw, vh);
    glDisable(GL_DEPTH_TEST);
    glDisable(GL_SCISSOR_TEST);
    glClearColor(0, 0, 0, 1);
    glClear(GL_COLOR_BUFFER_BIT);
    glEnable(GL_BLEND);
    glBlendFunc(GL_ONE, GL_ONE_MINUS_SRC_ALPHA);
}

static void bind_quad(void)
{
    glBindBuffer(GL_ARRAY_BUFFER, vbo);
    glEnableVertexAttribArray(0);
    glVertexAttribPointer(0, 2, GL_FLOAT, GL_FALSE, 0, NULL);
}

static void draw_with(const Tex *t, const Xform *f, double r, double g, double b, double a)
{
    if (!t->id || a <= 0.001)
        return;
    glUseProgram(prog_tex);
    bind_quad();
    glActiveTexture(GL_TEXTURE0);
    glBindTexture(GL_TEXTURE_2D, t->id);
    glUniform1i(u_tex, 0);
    glUniform2f(u_res, vp_w, vp_h);
    glUniform4f(u_rect, f->x, f->y, f->w, f->h);
    glUniform2f(u_pivot, f->px, f->py);
    glUniform2f(u_scale, f->sx, f->sy);
    double rad = f->angle * M_PI / 180.0;
    glUniform2f(u_rot, cos(rad), sin(rad));
    if (t->flip)
        glUniform4f(u_uv, 0, 1, 1, 0);
    else
        glUniform4f(u_uv, 0, 0, 1, 1);
    glUniform1f(u_bgra, t->bgra ? 1.0f : 0.0f);
    glUniform4f(u_color, r * a, g * a, b * a, a);
    glDrawArrays(GL_TRIANGLE_STRIP, 0, 4);
}

void gl_draw_tex(const Tex *t, const Xform *f)
{
    draw_with(t, f, 1, 1, 1, f->alpha);
}

void gl_draw_color(const Xform *f, double r, double g, double b, double a)
{
    draw_with(&white, f, r, g, b, a * f->alpha);
}

void gl_draw_fullscreen(GLuint program)
{
    glUseProgram(program);
    bind_quad();
    GLint uv = glGetUniformLocation(program, "u_uv");
    if (uv >= 0)
        glUniform4f(uv, 0, 0, 1, 1);
    glDisable(GL_BLEND);
    glDrawArrays(GL_TRIANGLE_STRIP, 0, 4);
    glEnable(GL_BLEND);
    glBlendFunc(GL_ONE, GL_ONE_MINUS_SRC_ALPHA);
}

void gl_fade(double opacity)
{
    if (opacity >= 0.999)
        return;
    glBlendFunc(GL_ZERO, GL_SRC_ALPHA);
    Xform f = xform_at(0, 0, vp_w, vp_h, 1);
    draw_with(&white, &f, 1, 1, 1, clampd(opacity, 0, 1));
    glBlendFunc(GL_ONE, GL_ONE_MINUS_SRC_ALPHA);
}

void gl_blur(Fbo *src, Fbo *tmp, Fbo *dst, double radius)
{
    if (!prog_blur)
        return;
    int w = src->tex.w, h = src->tex.h;
    fbo_ensure(tmp, w, h);
    fbo_ensure(dst, w, h);
    double step = clampd(radius / 6.0, 0.75, 1.5);
    int passes = (int)clampd(ceil(radius / 4.0), 3, 8);
    glUseProgram(prog_blur);
    bind_quad();
    glDisable(GL_BLEND);
    glUniform1i(b_tex, 0);
    glUniform2f(b_res, w, h);
    glUniform4f(b_uv, 0, 1, 1, 0);
    glActiveTexture(GL_TEXTURE0);
    Fbo *from = src;
    for (int pass = 0; pass < passes; pass++) {
        glBindFramebuffer(GL_FRAMEBUFFER, tmp->fb);
        glViewport(0, 0, w, h);
        glBindTexture(GL_TEXTURE_2D, from->tex.id);
        glUniform2f(b_dir, step, 0);
        glDrawArrays(GL_TRIANGLE_STRIP, 0, 4);
        glBindFramebuffer(GL_FRAMEBUFFER, dst->fb);
        glBindTexture(GL_TEXTURE_2D, tmp->tex.id);
        glUniform2f(b_dir, 0, step);
        glDrawArrays(GL_TRIANGLE_STRIP, 0, 4);
        from = dst;
    }
    glEnable(GL_BLEND);
    glBlendFunc(GL_ONE, GL_ONE_MINUS_SRC_ALPHA);
}

cairo_surface_t *gl_read_pixels(int w, int h)
{
    cairo_surface_t *s = cairo_image_surface_create(CAIRO_FORMAT_ARGB32, w, h);
    unsigned char *data = cairo_image_surface_get_data(s);
    int stride = cairo_image_surface_get_stride(s);
    unsigned char *buf = g_malloc((gsize)w * h * 4);
    glPixelStorei(GL_PACK_ALIGNMENT, 4);
    glReadPixels(0, 0, w, h, GL_RGBA, GL_UNSIGNED_BYTE, buf);
    for (int y = 0; y < h; y++) {
        const unsigned char *src = buf + (gsize)(h - 1 - y) * w * 4;
        guint32 *dst = (guint32 *)(data + (gsize)y * stride);
        for (int x = 0; x < w; x++) {
            const unsigned char *p = src + x * 4;
            dst[x] = ((guint32)p[3] << 24) | ((guint32)p[0] << 16) | ((guint32)p[1] << 8) | p[2];
        }
    }
    g_free(buf);
    cairo_surface_mark_dirty(s);
    return s;
}
