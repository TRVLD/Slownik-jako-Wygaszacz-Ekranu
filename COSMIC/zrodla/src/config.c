#include "config.h"
#include "util.h"

#include <string.h>

#define SCHEMA_ID "eu.jaroszek.Wyraz"

GSettings *config_settings_new(void)
{
    GSettingsSchemaSource *src = g_settings_schema_source_get_default();
    GSettingsSchema *schema = src ? g_settings_schema_source_lookup(src, SCHEMA_ID, TRUE) : NULL;
    if (!schema) {
        WARN("Brak schematu ustawień %s, używam wartości domyślnych", SCHEMA_ID);
        return NULL;
    }
    g_settings_schema_unref(schema);
    return g_settings_new(SCHEMA_ID);
}

static void copy_str(GSettings *s, const char *key, char *dst, size_t n, const char *def)
{
    char *v = s ? g_settings_get_string(s, key) : g_strdup(def);
    g_strlcpy(dst, v ? v : def, n);
    g_free(v);
}

static int pick(const char *v, const char *const *names, int n, int def)
{
    for (int i = 0; i < n; i++)
        if (g_strcmp0(v, names[i]) == 0)
            return i;
    return def;
}

void config_read(GSettings *s, Config *c)
{
    static const char *const styles[] = {"aurora", "ocean", "lublin", "wroclove"};
    static const char *const sizes[] = {"small", "medium", "large", "huge"};
    static const char *const poss[] = {"random", "special", "custom"};
    static const char *const cstyles[] = {"neon", "futhark", "sanfrancisco", "sourcesans", "garamond"};
    char tmp[32];

    memset(c, 0, sizeof(*c));
    c->words_pl = s ? g_settings_get_int(s, "words-per-day") : 5;
    c->words_en = s ? g_settings_get_int(s, "words-per-day-en") : 0;
    c->change_interval = MAX(5, s ? g_settings_get_int(s, "change-interval") : 30);
    c->idle_minutes = MAX(1, s ? g_settings_get_int(s, "idle-minutes") : 1);
    copy_str(s, "background-style", tmp, sizeof tmp, "lublin");
    c->style = pick(tmp, styles, 4, STYLE_AURORA);
    copy_str(s, "renaissance-font", c->renaissance_font, sizeof c->renaissance_font, "Quintessential");
    copy_str(s, "wroclove-text-font", c->wroclove_font, sizeof c->wroclove_font, "Belleza");
    copy_str(s, "font-family", c->font_family, sizeof c->font_family, "P052");
    c->clock_enabled = s ? g_settings_get_boolean(s, "clock-enabled") : true;
    c->clock_transparency = s ? g_settings_get_int(s, "clock-transparency") : 85;
    copy_str(s, "clock-size", tmp, sizeof tmp, "medium");
    c->clock_size = pick(tmp, sizes, 4, CLOCK_MEDIUM);
    copy_str(s, "clock-position", tmp, sizeof tmp, "special");
    c->clock_pos = pick(tmp, poss, 3, CLOCK_SPECIAL);
    c->clock_x = s ? g_settings_get_int(s, "clock-x") : 50;
    c->clock_y = s ? g_settings_get_int(s, "clock-y") : 50;
    copy_str(s, "clock-style", tmp, sizeof tmp, "sanfrancisco");
    c->clock_style = pick(tmp, cstyles, 5, CS_SANFRANCISCO);
    c->respect_inhibitors = s ? g_settings_get_boolean(s, "respect-inhibitors") : true;
    c->paused_until = s ? g_settings_get_int64(s, "paused-until") : 0;
    c->code_enabled = s ? g_settings_get_boolean(s, "unlock-code-enabled") : false;
    copy_str(s, "unlock-code", c->unlock_code, sizeof c->unlock_code, "");

    const char *env = g_getenv("WYRAZ_STYLE");
    if (env)
        c->style = pick(env, styles, 4, c->style);
    env = g_getenv("WYRAZ_CLOCK_POSITION");
    if (env)
        c->clock_pos = pick(env, poss, 3, c->clock_pos);
    env = g_getenv("WYRAZ_CLOCK_STYLE");
    if (env)
        c->clock_style = pick(env, cstyles, 5, c->clock_style);
}

static bool is_hex(const char *s, size_t n)
{
    for (size_t i = 0; i < n; i++)
        if (!g_ascii_isxdigit(s[i]) || g_ascii_isupper(s[i]))
            return false;
    return true;
}

bool code_has(const char *stored)
{
    return stored && strlen(stored) == 81 && stored[16] == '$' &&
           is_hex(stored, 16) && is_hex(stored + 17, 64);
}

static bool code_valid(const char *input)
{
    size_t n = input ? strlen(input) : 0;
    if (n < 1 || n > 6)
        return false;
    for (size_t i = 0; i < n; i++)
        if (!g_ascii_isalnum(input[i]))
            return false;
    return true;
}

bool code_verify(const char *stored, const char *input)
{
    if (!code_has(stored) || !code_valid(input))
        return false;
    char salt[17];
    memcpy(salt, stored, 16);
    salt[16] = 0;
    char *text = g_strdup_printf("%s:%s", salt, input);
    char *hash = g_compute_checksum_for_string(G_CHECKSUM_SHA256, text, -1);
    bool ok = g_strcmp0(hash, stored + 17) == 0;
    g_free(hash);
    g_free(text);
    return ok;
}
