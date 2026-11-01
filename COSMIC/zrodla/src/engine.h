#pragma once

#include <gio/gio.h>
#include <stdbool.h>
#include <wayland-client.h>

typedef struct Engine Engine;

Engine *engine_new(struct wl_display *display, GSettings *settings);
void engine_free(Engine *e);

void engine_show_now(Engine *e);
void engine_set_hidden_cb(Engine *e, void (*cb)(void *data), void *data);
