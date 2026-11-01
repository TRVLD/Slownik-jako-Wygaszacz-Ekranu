#pragma once

#include <gio/gio.h>
#include <stdbool.h>

typedef enum { STYLE_AURORA, STYLE_OCEAN, STYLE_LUBLIN, STYLE_WROCLOVE } StyleId;
typedef enum { CLOCK_SMALL, CLOCK_MEDIUM, CLOCK_LARGE, CLOCK_HUGE } ClockSize;
typedef enum { CLOCK_RANDOM, CLOCK_SPECIAL, CLOCK_CUSTOM } ClockPos;
typedef enum { CS_NEON, CS_FUTHARK, CS_SANFRANCISCO, CS_SOURCESANS, CS_GARAMOND } ClockStyle;

typedef struct {
    int words_pl, words_en;
    int change_interval;
    int idle_minutes;
    StyleId style;
    char renaissance_font[64];
    char wroclove_font[64];
    char font_family[64];
    bool clock_enabled;
    int clock_transparency;
    ClockSize clock_size;
    ClockPos clock_pos;
    int clock_x, clock_y;
    ClockStyle clock_style;
    bool respect_inhibitors;
    gint64 paused_until;
    bool code_enabled;
    char unlock_code[96];
} Config;

void config_read(GSettings *settings, Config *cfg);

GSettings *config_settings_new(void);

bool code_has(const char *stored);
bool code_verify(const char *stored, const char *input);
