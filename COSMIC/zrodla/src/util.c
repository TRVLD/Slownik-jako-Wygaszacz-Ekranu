#include "util.h"

#include <stdlib.h>

double now_s(void)
{
    return g_get_monotonic_time() / 1e6;
}

static GRand *rng;

double rnd(void)
{
    if (!rng)
        rng = g_rand_new();
    return g_rand_double(rng);
}

double rnd_range(double a, double b)
{
    return a + (b - a) * rnd();
}

bool rect_is_free(Rect r, const Rect *rects, int n, double m)
{
    for (int i = 0; i < n; i++) {
        const Rect *o = &rects[i];
        if (!(r.x + r.w + m <= o->x || o->x + o->w + m <= r.x ||
              r.y + r.h + m <= o->y || o->y + o->h + m <= r.y))
            return false;
    }
    return true;
}

double ease_apply(EaseMode mode, double t)
{
    t = clampd(t, 0, 1);
    switch (mode) {
    case EASE_OUT_QUAD:
        return -t * (t - 2);
    case EASE_IN_QUAD:
        return t * t;
    case EASE_OUT_CUBIC: {
        double p = t - 1;
        return p * p * p + 1;
    }
    case EASE_IN_OUT_SINE:
        return -0.5 * (cos(M_PI * t) - 1);
    case EASE_LINEAR:
    default:
        return t;
    }
}

void tween_init(Tween *tw, double value)
{
    *tw = (Tween){.from = value, .to = value, .active = false};
}

double tween_value(const Tween *tw)
{
    if (!tw->active)
        return tw->to;
    double now = now_s();
    if (now <= tw->start)
        return tw->from;
    if (tw->dur <= 0)
        return tw->to;
    double k = ease_apply(tw->mode, (now - tw->start) / tw->dur);
    return tw->from + (tw->to - tw->from) * k;
}

void tween_set(Tween *tw, double value)
{
    tw->active = false;
    tw->from = tw->to = value;
    tw->done = NULL;
    tw->data = NULL;
}

void tween_stop(Tween *tw)
{
    double v = tween_value(tw);
    tween_set(tw, v);
}

void tween_to(Tween *tw, double to, double delay_ms, double dur_ms, EaseMode mode,
              TweenDone done, void *data)
{
    TweenDone old = tw->active ? tw->done : NULL;
    void *old_data = tw->data;
    double cur = tween_value(tw);
    tw->from = cur;
    tw->to = to;
    tw->start = now_s() + delay_ms / 1000.0;
    tw->dur = dur_ms / 1000.0;
    tw->mode = mode;
    tw->active = true;
    tw->done = done;
    tw->data = data;
    if (old)
        old(old_data);
}

bool tween_tick(Tween *tw)
{
    if (!tw->active)
        return false;
    if (now_s() < tw->start + tw->dur)
        return true;
    TweenDone done = tw->done;
    void *data = tw->data;
    tw->active = false;
    tw->from = tw->to;
    tw->done = NULL;
    tw->data = NULL;
    if (done)
        done(data);
    return false;
}

const char *data_dir(void)
{
    static char *dir;
    if (!dir) {
        const char *env = g_getenv("WYRAZ_DATA_DIR");
        dir = g_strdup(env && *env ? env : WYRAZ_DATADIR);
    }
    return dir;
}
