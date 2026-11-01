#include "backgrounds.h"
#include "shaders.h"

struct Bg {
    StyleId style;
    int W, H, ox, oy;
    double t;
    GLuint prog;
    GLint u_time, u_res, u_origin, u_darken;
    Lublin *lublin;
    Wroclaw *wroclaw;
};

Bg *bg_new(StyleId style, int width, int height, int ox, int oy, const char *word_font)
{
    Bg *bg = g_new0(Bg, 1);
    bg->style = style;
    bg->W = width;
    bg->H = height;
    bg->ox = ox;
    bg->oy = oy;
    switch (style) {
    case STYLE_LUBLIN:
        bg->lublin = lublin_new(width, height);
        break;
    case STYLE_WROCLOVE:
        bg->wroclaw = wroclaw_new(width, height, word_font);
        break;
    case STYLE_OCEAN:
    case STYLE_AURORA:
    default:
        bg->prog = gl_compile(NULL, style == STYLE_OCEAN ? SHADER_OCEAN : SHADER_AURORA,
                              style == STYLE_OCEAN ? "ocean" : "aurora");
        if (bg->prog) {
            bg->u_time = glGetUniformLocation(bg->prog, "time");
            bg->u_res = glGetUniformLocation(bg->prog, "resolution");
            bg->u_origin = glGetUniformLocation(bg->prog, "origin");
            bg->u_darken = glGetUniformLocation(bg->prog, "darken");
        }
        break;
    }
    return bg;
}

void bg_free(Bg *bg)
{
    if (!bg)
        return;
    if (bg->prog)
        glDeleteProgram(bg->prog);
    lublin_free(bg->lublin);
    wroclaw_free(bg->wroclaw);
    g_free(bg);
}

void bg_set_time(Bg *bg, double t)
{
    bg->t = t;
    if (bg->lublin)
        lublin_tick(bg->lublin);
    if (bg->wroclaw)
        wroclaw_set_time(bg->wroclaw, t);
}

void bg_draw(Bg *bg)
{
    if (bg->lublin) {
        lublin_draw(bg->lublin);
        return;
    }
    if (bg->wroclaw) {
        wroclaw_draw(bg->wroclaw);
        return;
    }
    if (!bg->prog) {
        Xform f = xform_at(0, 0, bg->W, bg->H, 1);
        if (bg->style == STYLE_OCEAN)
            gl_draw_color(&f, 0x0b / 255.0, 0x4d / 255.0, 0x66 / 255.0, 1);
        else
            gl_draw_color(&f, 0x02 / 255.0, 0x06 / 255.0, 0x17 / 255.0, 1);
        return;
    }
    glUseProgram(bg->prog);
    glUniform1f(bg->u_time, (float)bg->t);
    glUniform2f(bg->u_res, MAX(bg->W, 1), MAX(bg->H, 1));
    glUniform2f(bg->u_origin, bg->ox, bg->oy);
    glUniform1f(bg->u_darken, 0.32f);
    gl_draw_fullscreen(bg->prog);
}

bool bg_has_quadrants(Bg *bg)
{
    return bg->wroclaw != NULL;
}

int bg_text_quadrant(Bg *bg, double t)
{
    return bg->wroclaw ? wroclaw_text_quadrant(bg->wroclaw, t) : -1;
}

int bg_clock_quadrant(Bg *bg)
{
    return bg->wroclaw ? wroclaw_clock_quadrant(bg->wroclaw) : -1;
}

int bg_heart_quadrant(Bg *bg)
{
    return bg->wroclaw ? wroclaw_heart_quadrant(bg->wroclaw) : -1;
}

void bg_next_word(Bg *bg, double interval)
{
    if (bg->wroclaw)
        wroclaw_next_word(bg->wroclaw, interval);
}

void bg_set_heart_avoid(Bg *bg, const Rect *r)
{
    if (bg->wroclaw)
        wroclaw_set_heart_avoid(bg->wroclaw, r);
}
