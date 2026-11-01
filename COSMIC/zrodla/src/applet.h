#pragma once

#include <gio/gio.h>
#include <stdbool.h>
#include <wayland-client.h>

typedef struct Applet Applet;

Applet *applet_new(struct wl_display *display, GSettings *settings);
void applet_free(Applet *a);
void applet_set_engine_state(Applet *a, bool running, const char *problem);
