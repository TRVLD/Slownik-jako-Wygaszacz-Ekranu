#pragma once

#include "gl.h"

#include <pango/pango.h>
#include <stdbool.h>

typedef struct {
    double x, y, blur;
    double rgba[4];
} Shadow;

typedef struct {
    const char *family;
    const char *generic;
    int weight;
    bool italic;
    double size_px;
    double rgba[4];
    double wrap_width;
    PangoAlignment align;
    double letter_spacing_em;
    const char *features;
    int nshadows;
    Shadow shadow[2];
} TextStyle;

typedef struct {
    Tex tex;
    double ox, oy;
    double bw, bh;
    double ink_x, ink_y, ink_w, ink_h;
} TextTex;

void text_style_init(TextStyle *st, const char *family, const char *generic, double size_px);

void text_measure(const char *text, const TextStyle *st, TextTex *out);
TextTex *text_render(const char *text, const TextStyle *st);
void text_free(TextTex *t);

PangoContext *text_context(void);
