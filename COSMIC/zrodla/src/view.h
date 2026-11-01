#pragma once

#include "backgrounds.h"
#include "config.h"
#include "text.h"
#include "words.h"

typedef struct View View;

typedef struct {
    double word_scale, char_width, def_width;
    const char *word_generic, *text_generic;
    double word_rgba[4];
    int word_weight;
    int word_nshadow;
    Shadow word_shadow;
    double rule_rgba[4];
    double rule_h;
    double def_rgba[4];
    bool def_italic;
    int def_weight;
    int def_nshadow;
    Shadow def_shadow;
    double footer_rgba[4];
    double credit_rgba[4];
    double clock_rgba[4];
    double neon_rgba[4];
    double neon_glow[4];
    double code_filled[4];
    double code_border[4];
    bool code_square;
} StyleDef;

const StyleDef *style_def(StyleId id);
void style_fonts(const Config *cfg, const char **word, const char **text);

View *view_new(const Config *cfg, int W, int H, int ox, int oy, double scale);
void view_free(View *v);

void view_set_time(View *v, double t);
void view_draw(View *v);
void view_present(View *v, const Entry *e, bool first, int interval);
void view_update_clock(View *v, const char *footer, const char *time);
void view_set_blur(View *v, bool on);

int view_width(View *v);
int view_height(View *v);
double view_scale(View *v);

char *polish_date(bool with_time);
char *clock_time(void);
