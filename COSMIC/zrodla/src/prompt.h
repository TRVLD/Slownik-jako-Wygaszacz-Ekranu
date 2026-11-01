#pragma once

#include "config.h"
#include "gl.h"

#include <stdbool.h>

typedef struct {
    int fails;
    double locked_until;
} CodeGuard;

typedef struct Prompt Prompt;

typedef void (*PromptFunc)(void *data);

Prompt *prompt_new(const Config *cfg, CodeGuard *guard, PromptFunc on_success,
                   PromptFunc on_shown, PromptFunc on_hidden, void *data);
void prompt_free(Prompt *p);
void prompt_show(Prompt *p);
void prompt_hide(Prompt *p);
bool prompt_visible(Prompt *p);
void prompt_key(Prompt *p, unsigned int keysym, const char *utf8);
void prompt_tick(Prompt *p);
void prompt_draw(Prompt *p, int W, int H, double scale);
void prompt_release_gl(Prompt *p);
