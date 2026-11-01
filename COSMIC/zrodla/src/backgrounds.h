#pragma once

#include "config.h"
#include "gl.h"
#include "util.h"

typedef struct Bg Bg;

Bg *bg_new(StyleId style, int width, int height, int ox, int oy, const char *word_font);
void bg_free(Bg *bg);
void bg_set_time(Bg *bg, double t);
void bg_draw(Bg *bg);

bool bg_has_quadrants(Bg *bg);
int bg_text_quadrant(Bg *bg, double t);
int bg_clock_quadrant(Bg *bg);
int bg_heart_quadrant(Bg *bg);
void bg_next_word(Bg *bg, double interval);
void bg_set_heart_avoid(Bg *bg, const Rect *r);

typedef struct Lublin Lublin;
Lublin *lublin_new(int width, int height);
void lublin_free(Lublin *l);
void lublin_tick(Lublin *l);
void lublin_draw(Lublin *l);

typedef struct Wroclaw Wroclaw;
Wroclaw *wroclaw_new(int width, int height, const char *word_font);
void wroclaw_free(Wroclaw *w);
void wroclaw_set_time(Wroclaw *w, double t);
void wroclaw_draw(Wroclaw *w);
int wroclaw_text_quadrant(Wroclaw *w, double t);
int wroclaw_clock_quadrant(Wroclaw *w);
int wroclaw_heart_quadrant(Wroclaw *w);
void wroclaw_next_word(Wroclaw *w, double interval);
void wroclaw_set_heart_avoid(Wroclaw *w, const Rect *r);
