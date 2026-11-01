#pragma once

#include <glib.h>
#include <stdbool.h>

enum { LANG_PL = 0, LANG_EN = 1, LANG_N = 2 };

typedef struct {
    char *w;
    GPtrArray *d;
    int lang;
    bool prank;
} Entry;

Entry *entry_new(const char *w, int lang);
Entry *entry_copy(const Entry *e);
void entry_free(Entry *e);

typedef struct WordStore WordStore;

WordStore *word_store_new(void);
void word_store_free(WordStore *s);

Entry *word_store_next(WordStore *s, const int counts[LANG_N], int *index, int *total);
void word_store_ensure_today(WordStore *s, const int counts[LANG_N]);
void word_store_reset_today(WordStore *s);
void word_store_save(WordStore *s);

char *format_definition(GPtrArray *meanings, int max_meanings, int max_chars);

char *day_key_now(void);

bool is_april_first(void);
GPtrArray *pick_proverbs(int n);
extern const char *PRANK_CREDIT;
