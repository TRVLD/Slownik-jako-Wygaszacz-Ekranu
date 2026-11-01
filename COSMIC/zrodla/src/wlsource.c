#include "wlsource.h"
#include "util.h"

#include <errno.h>

typedef struct {
    GSource base;
    struct wl_display *display;
    gpointer fd_tag;
    bool reading;
    bool lost;
    WlLostFunc lost_cb;
    void *data;
} WlSource;

static gboolean wl_prepare(GSource *base, gint *timeout)
{
    WlSource *s = (WlSource *)base;
    *timeout = -1;
    if (s->lost)
        return FALSE;
    if (s->reading)
        return FALSE;
    while (wl_display_prepare_read(s->display) != 0) {
        if (wl_display_dispatch_pending(s->display) < 0) {
            s->lost = true;
            return TRUE;
        }
    }
    s->reading = true;
    if (wl_display_flush(s->display) < 0 && errno != EAGAIN) {
        wl_display_cancel_read(s->display);
        s->reading = false;
        s->lost = true;
        return TRUE;
    }
    return FALSE;
}

static gboolean wl_check(GSource *base)
{
    WlSource *s = (WlSource *)base;
    if (s->lost)
        return TRUE;
    GIOCondition rev = g_source_query_unix_fd(base, s->fd_tag);
    if (!s->reading)
        return FALSE;
    s->reading = false;
    if (rev & (G_IO_ERR | G_IO_HUP)) {
        wl_display_cancel_read(s->display);
        s->lost = true;
        return TRUE;
    }
    if (rev & G_IO_IN) {
        if (wl_display_read_events(s->display) < 0) {
            s->lost = true;
            return TRUE;
        }
        return TRUE;
    }
    wl_display_cancel_read(s->display);
    return FALSE;
}

static gboolean wl_dispatch(GSource *base, GSourceFunc cb, gpointer user)
{
    (void)cb;
    (void)user;
    WlSource *s = (WlSource *)base;
    if (!s->lost && wl_display_dispatch_pending(s->display) < 0)
        s->lost = true;
    if (s->lost) {
        if (s->lost_cb)
            s->lost_cb(s->data);
        return G_SOURCE_REMOVE;
    }
    return G_SOURCE_CONTINUE;
}

static void wl_finalize(GSource *base)
{
    WlSource *s = (WlSource *)base;
    if (s->reading)
        wl_display_cancel_read(s->display);
    s->reading = false;
}

static GSourceFuncs funcs = {
    .prepare = wl_prepare,
    .check = wl_check,
    .dispatch = wl_dispatch,
    .finalize = wl_finalize,
};

guint wl_source_attach(struct wl_display *display, WlLostFunc lost, void *data)
{
    WlSource *s = (WlSource *)g_source_new(&funcs, sizeof(WlSource));
    s->display = display;
    s->lost_cb = lost;
    s->data = data;
    s->fd_tag = g_source_add_unix_fd(&s->base, wl_display_get_fd(display),
                                     G_IO_IN | G_IO_ERR | G_IO_HUP);
    g_source_set_name(&s->base, "[wyraz] wayland");
    guint id = g_source_attach(&s->base, NULL);
    g_source_unref(&s->base);
    return id;
}
