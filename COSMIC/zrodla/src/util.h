#pragma once

#include <glib.h>
#include <stdbool.h>
#include <math.h>

#define LOG(...)  g_message("[Wyraz] " __VA_ARGS__)
#define WARN(...) g_warning("[Wyraz] " __VA_ARGS__)

#ifndef M_PI
#define M_PI 3.14159265358979323846
#endif

double now_s(void);

double rnd(void);
double rnd_range(double a, double b);

static inline double clampd(double v, double lo, double hi)
{
    return v < lo ? lo : (v > hi ? hi : v);
}

static inline double signd(double v)
{
    return v > 0 ? 1.0 : (v < 0 ? -1.0 : 0.0);
}

typedef struct {
    double x, y, w, h;
} Rect;

bool rect_is_free(Rect r, const Rect *rects, int n, double m);

typedef enum {
    EASE_LINEAR,
    EASE_OUT_QUAD,
    EASE_IN_QUAD,
    EASE_OUT_CUBIC,
    EASE_IN_OUT_SINE,
} EaseMode;

double ease_apply(EaseMode mode, double t);

typedef void (*TweenDone)(void *data);

typedef struct {
    double from, to;
    double start;
    double dur;
    EaseMode mode;
    bool active;
    TweenDone done;
    void *data;
} Tween;

void tween_init(Tween *tw, double value);
void tween_set(Tween *tw, double value);
void tween_to(Tween *tw, double to, double delay_ms, double dur_ms, EaseMode mode,
              TweenDone done, void *data);
double tween_value(const Tween *tw);
bool tween_tick(Tween *tw);
void tween_stop(Tween *tw);

const char *data_dir(void);
