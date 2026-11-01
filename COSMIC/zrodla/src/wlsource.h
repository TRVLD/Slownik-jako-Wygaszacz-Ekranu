#pragma once

#include <glib.h>
#include <wayland-client.h>

typedef void (*WlLostFunc)(void *data);

guint wl_source_attach(struct wl_display *display, WlLostFunc lost, void *data);
