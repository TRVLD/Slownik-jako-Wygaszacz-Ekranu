# Słownik jako Wygaszacz Ekranu

Rozszerzenie GNOME Shell 50 (Fedora 44, Wayland), które po okresie bezczynności
zamienia ekran w elegancki wygaszacz: na animowanym tle (zorza polarna pod
wolno przesuwającym się, migoczącym niebem gwiazd, głębia
oceanu, figury Lublina albo barwy Wrocławia) pokazuje dużą czcionką losowe hasło
ze *Słownika Języka Polskiego* (i opcjonalnie z angielskiego słownika
*Wordset*) wraz z definicją.

<p align="center">
  <img width="640" alt="Aurora Borealis" src="https://github.com/user-attachments/assets/3c5a7020-3b86-4f98-a653-20cf3cd54f10" /><br>
  <b>Aurora Borealis</b>
</p>

<p align="center">
  <img width="640" alt="Wroclove Herbowy" src="https://github.com/user-attachments/assets/d569f005-7402-439e-99bd-52d8368193ee" /><br>
  <b>Wroclove Herbowy</b>
</p>

<p align="center">
  <img width="640" alt="Lublin Renesans" src="https://github.com/user-attachments/assets/9d43e157-8ebf-4c48-95da-e2c05a95bb23" /><br>
  <b>Lublin Renesans</b>
</p>

<p align="center">
  <img width="640" alt="Blue Ocean" src="https://github.com/user-attachments/assets/8d18555e-b27a-4dc6-844b-6130a195137e" /><br>
  <b>Blue Ocean</b>
</p>


Autor: **[Mariusz T. Jaroszek](https://www.linkedin.com/in/jaroszek/)** · licencja **EUPL 1.2** ([wersja polska](https://eupl.eu/1.2/pl/),
plik `LICENSE`) · udostępniane „tak jak jest” (as-is), bez gwarancji; autor nie
odpowiada za błędy. Wtyczka powstała we współpracy z Claude (Anthropic).

- 96 304 polskie hasła z prawdziwą definicją, w tym 5 601 pisanych wielką
  literą według zasad z 2026 r. (mieszkańcy: Wrocławianka, Lublinianin,
  Łodzianin; marki: Audi), bez odsyłaczy, „nazwisko”, „przymiotnik od: …”
  i haseł wulgarnych.
- 67 483 hasła angielskie ze słownika Wordset (opcjonalnie, domyślnie 0).
- Codziennie losowane jest *N* polskich i *M* angielskich haseł, pokazywanych
  na przemian i powtarzanych w ciągu dnia. **Hasło użyte jednego dnia nigdy
  nie wraca w innym dniu.** Dzisiejsze hasła można wylosować od nowa.
- W ustawieniach można wyszukać dowolne hasło i przeczytać jego definicję
  (wielkość liter nie ma znaczenia, polskie znaki też nie są konieczne).
- Wygaszacz znika po najmniejszym ruchu myszy, kliknięciu, przewinięciu,
  dotyku albo naciśnięciu dowolnego klawisza (naciśnięty klawisz nie trafia
  do aplikacji ani do pola hasła).
- Działa na Waylandzie: bezczynność mierzy monitor wbudowany w Mutter.



## Instalacja (2 minuty)

```bash
cd Slownik-jako-Wygaszacz-Ekranu
./install.sh
```

Następnie **wyloguj się i zaloguj ponownie** — na Waylandzie GNOME Shell
wczytuje nowe rozszerzenia dopiero przy logowaniu. Po zalogowaniu
rozszerzenie jest już włączone.

Czcionka: domyślnie używany jest **C059**, darmowy klon Century Schoolbook.
Jeśli instalator zgłosi jej brak:

```bash
sudo dnf install urw-base35-c059-fonts
```


## Pierwsze uruchomienie

```bash
gnome-extensions prefs wyraz@jaroszek.eu
```

Kliknij **Pokaż podgląd** i puść mysz — po ok. 2 sekundach spokoju pojawi
się wygaszacz. Rusz myszą, żeby go zamknąć.

## Ustawienia

Okno ustawień ma trzy karty. **Ustawienia** zawiera grupy w kolejności:

| Grupa | Ustawienie | Domyślnie | Opis |
|---|---|---|---|
| Słowa | Polskie hasła dziennie | 5 | Ile haseł z SJP losować na każdy dzień (0–100) |
| | Angielskie hasła dziennie | 0 | Ile haseł z Wordset losować na każdy dzień (0–100) |
| | Zmiana hasła co | 30 s | Jak długo jedno hasło jest na ekranie (5–3600 s) |
| Wygląd | Styl | Aurora Borealis | albo Blue Ocean, Lublin Renesans, Wroclove Herbowy |
| | Krój pisma / Pismo haseł / Krój definicji | zależnie od stylu | widoczny tylko wybór pasujący do stylu |
| | Pokaż podgląd | | uruchamia wygaszacz na próbę |
| Wygaszacz | Uruchom po bezczynności | 3 min | Brak ruchu myszy i klawiatury, minimum 1 minuta |
| | Pokazuj także na ekranie blokady | tak | Przykrywa ekran blokady, gdy nikt nie używa komputera |
| | Nie przeszkadzaj podczas filmów | tak | Nie startuje, gdy np. przeglądarka odtwarza wideo |
| | Systemowe wygaszanie ekranu | | ostrzega i pozwala wydłużyć |
| Kod zamykający | Wymagaj kodu, Nowy kod, Stan | wyłączone | opcjonalny kod 1–6 znaków |
| Dzisiejsze hasła | Pokaż hasła | zwinięte | dzisiejsza lista z definicjami (PL/EN) |
| | Wylosuj dzisiejsze hasła od nowa | | nowa lista; obecne hasła zostają oznaczone jako użyte |

Gdy obie liczby haseł są ustawione na 0, wygaszacz pokazuje 1 polskie hasło.

Karta **Słownik** pozwala wyszukać dowolne hasło w obu słownikach (albo
tylko w jednym). Najpierw pokazywane jest dokładne trafienie, potem hasła
zaczynające się od wpisanego tekstu, a na końcu zawierające go.

Karta **O wtyczce** zawiera: odnośniki do dokumentacji i repozytorium, O mnie
(autor, licencja, brak gwarancji), informację o użyciu Claude oraz listę
oprogramowania open source z licencjami.

### Kod zamykający (opcjonalny)

W ustawieniach, w grupie **Kod zamykający**, wpisz 1–6 liter lub cyfr,
zatwierdź przyciskiem ✓ i włącz **Wymagaj kodu do zamknięcia wygaszacza**.
Od tej chwili ruch myszy lub klawisz nie zamyka wygaszacza, tylko pokazuje
pole „Wpisz kod, aby odblokować” z sześcioma kratkami (zawsze sześcioma —
długość kodu nie jest zdradzana), a tło mocno się rozmywa. Wpisz kod i naciśnij Enter; przy 6 znakach sprawdza się sam.
Backspace kasuje znak, Esc chowa pole. Po 5 błędach jest 30 s przerwy.
Wielkość liter ma znaczenie.

- Bez włączonej opcji albo bez kodu wygaszacz działa jak dotąd: znika po
  ruchu myszy lub dowolnym klawiszu.
- W ustawieniach zapisywany jest tylko solony skrót SHA-256 kodu.
- Wygaszacz z kodem nie znika przy systemowym wygaszeniu ekranu. Gdy GNOME
  zablokuje sesję, zabezpieczeniem staje się ekran blokady z hasłem konta.
- **Kod nie zastępuje hasła systemu.** Działa tylko w bieżącej sesji
  graficznej i chroni przed przypadkowym zamknięciem wygaszacza, a nie przed
  dostępem do komputera. Nie wyłączaj ani nie osłabiaj z jego powodu hasła
  konta, blokady ekranu GNOME (Super+L) ani innych zabezpieczeń.

**Zapomniany kod:** dezaktywuj wtyczkę z poziomu niegraficznej sesji, albo wyłącz i włącz komputer, otwórz ustawienia wtyczki i usuń kod

### Ważne: systemowe wygaszanie ekranu

GNOME ma własne „Wygaszanie ekranu” (Ustawienia → Zasilanie), które gasi
monitor i blokuje sesję — domyślnie po 5 minutach. Jeśli jest ustawione na
krócej niż czas wygaszacza, ekran zgaśnie, zanim pojawią się słowa.
Instalator proponuje ustawienie go na 15 min (wygaszacz startuje po 3 min,
więc słowa są widoczne przez 12 min). Można to też zmienić ręcznie albo
przyciskiem **Wydłuż** w ustawieniach rozszerzenia. Gdy przyjdzie systemowe wygaszanie, wygaszacz ustępuje mu
miejsca, a monitor normalnie się wyłącza.

## Jak to działa

- `extension.js` rejestruje w Mutterze watch bezczynności. Po upływie
  zadanego czasu pyta jeszcze `org.gnome.SessionManager`, czy jakaś
  aplikacja nie blokuje bezczynności (wideo); jeśli tak, sprawdza ponownie
  co 30 s.
- `lib/screensaver.js` tworzy pełnoekranową nakładkę na każdym monitorze,
  przejmuje wejście (modal grab), ukrywa kursor i znika przy dowolnym
  zdarzeniu wejściowym.
- `lib/shaders.js` + `lib/backgrounds.js` — tła rysowane na GPU shaderem GLSL
  (`Shell.GLSLEffect`), odświeżane ok. 30 razy na sekundę.
- `lib/lublinShapes.js`, `lib/lublinPhysics.js`, `lib/lublinBackground.js` —
  figury Lublina (Cairo), fizyka „stołu bilardowego”, neon przy zderzeniach
  i animacja zsynchronizowana z odświeżaniem ekranu.
- `lib/wroclawSchedule.js`, `lib/wroclawSymbols.js`, `lib/wroclawBackground.js` —
  harmonogram malowania ćwiartek i bicia serca, role ćwiartek (hasło, serce,
  duże W, siatka małych W) oraz warstwa farby (shader).
- `lib/codePrompt.js` + `lib/unlockCode.js` — pole kodu zamykającego
  i sprawdzanie skrótu.
- `lib/wordStore.js` + `lib/selection.js` — losowanie. Bazy
  (`data/words.tsv`, `data/words-en.tsv`) są wczytywane tylko raz dziennie
  na chwilę losowania.
- `lib/search.js` — wyszukiwanie haseł w oknie ustawień.
  Historia użytych haseł: `~/.local/share/wyraz-screensaver/state.json`.
- Przy każdej zmianie hasła tekst przesuwa się o kilka procent (ochrona
  ekranów OLED przed wypaleniem).

## Rozwiązywanie problemów

Dziennik GNOME Shell (komunikaty rozszerzenia mają prefiks `[Wyraz]`):

```bash
journalctl -f -o cat /usr/bin/gnome-shell
```

Stan rozszerzenia:

```bash
gnome-extensions info wyraz@jaroszek.eu
```

Test w zagnieżdżonej sesji, bez wylogowywania (wymaga devkitu Muttera):

```bash
dbus-run-session gnome-shell --devkit --wayland
```

## Autor, licencja i użyte oprogramowanie

- Autor: Mariusz T. Jaroszek (https://www.linkedin.com/in/jaroszek/). Licencja: Licencja Publiczna Unii Europejskiej v. 1.2
  (EUPL-1.2), tekst w pliku `LICENSE`, wersja polska: https://eupl.eu/1.2/pl/
- Wtyczka jest udostępniana „tak jak jest” (as-is), bez jakichkolwiek gwarancji.
  Autor nie odpowiada za błędy ani za szkody wynikłe z jej użycia.
- Powstała we współpracy z Claude (model Claude Opus 5.5 firmy Anthropic),
  asystentem AI, który na podstawie wskazówek autora napisał kod, shadery,
  skrypty i dokumentację.
- Pełna lista składników open source z licencjami jest na karcie
  **O wtyczce** w ustawieniach (`lib/credits.js`): dane sjp.pl, angielski
  słownik Wordset (CC BY-SA 4.0, oparty na WordNet 3.0), czcionki OFL
  (Crimson Text, Belleza, Hind, Quintessential, Fondamento, Carattere, Exo 2),
  czcionki systemowe (C059: AGPL-3.0 z wyjątkiem dla czcionek, Adwaita Sans:
  OFL-1.1), platforma GNOME (GNOME Shell, Mutter: GPL-2.0-or-later; GJS:
  MIT OR LGPL-2.0-or-later; GTK 4, libadwaita, GLib: LGPL-2.1-or-later;
  Pango: LGPL-2.0-or-later; Cairo: LGPL-2.1-only OR MPL-1.1) oraz narzędzia
  użyte przy tworzeniu (Mesa, Python, Pillow, fontTools, Node.js, Git).

## Odinstalowanie

```bash
./uninstall.sh            # zostawia historię haseł
./uninstall.sh --purge    # usuwa też historię i ustawienia
```

## Źródło danych

Hasła i definicje pochodzą z projektu
[robert00s/sjp](https://github.com/robert00s/sjp) (wydanie 1.0, wrzesień 2019),
zbudowanego na podstawie [sjp.pl](https://sjp.pl). Repozytorium nie zawiera
pliku licencji, więc przed publikacją rozszerzenia (np. na
extensions.gnome.org) warto potwierdzić warunki wykorzystania danych.

Pisownię haseł i definicji dostosowano do zasad Rady Języka Polskiego
obowiązujących od 1 stycznia 2026 r. (słownik z 2019 r. ich nie uwzględniał):
nazwy mieszkańców miast i wsi oraz marek i produktów wielką literą
(np. Warszawiak, Krakowianin), nibynauka i quasinaukowy łącznie,
nienajgorzej łącznie, „czy by” osobno, Pustynia Gobi i Pałac Paca wielką
literą.

Zmiany wprowadza skrypt `tools/build_words.py` na podstawie reguł, a nie
listy zmian z sjp.pl: listy nowych i zmienionych haseł z sjp.pl nie udało
się pobrać w całości. Nazwy mieszkańców i marek trafiają do bazy jako
osobne hasła pisane wielką literą (np. Wrocławianka, Wrocławiak,
Lublinianin, Audi), a jeśli wyraz ma też pospolite znaczenie (krakowiak —
taniec), to znaczenie zostaje pod hasłem małą literą. Te same nazwy są
poprawiane w definicjach innych haseł, także w odmianie. Hasła dodane do
sjp.pl po 2019 r. nie są w bazie. Baza liczy 96 304 hasła.

Angielskie hasła pochodzą ze słownika
[Wordset](https://github.com/wordset/wordset-dictionary) (CC BY-SA 4.0,
oparty na Princeton WordNet 3.0). Zostały jednowyrazowe hasła pisane małą
literą, bez znaczeń obraźliwych i czysto taksonomicznych; treść definicji
nie jest zmieniana. Plik `data/words-en.tsv` jest udostępniany na licencji
CC BY-SA 4.0 (szczegóły w `data/LICENSE-words-en.txt`), niezależnie od
licencji EUPL samej wtyczki.

Odtworzenie bazy od zera:

```bash
./tools/pobierz-slownik.sh
```

Skrypt pobiera słownik w formacie StarDict i filtruje go
(`tools/build_words.py`). Bazę angielską odtwarza
`./tools/pobierz-slownik-en.sh` (`tools/build_words_en.py`).

Czcionki Quintessential, Fondamento, Carattere, Exo 2, Crimson Text,
Belleza i Hind pochodzą z
[Google Fonts](https://github.com/google/fonts) (licencja SIL OFL 1.1,
teksty licencji w `fonts/licencje`). Figury stylu Lublin Renesans
odwzorowują elementy identyfikacji wizualnej miasta Lublin — przed
publikacją rozszerzenia warto sprawdzić zasady korzystania z tych znaków.

## Struktura

```
wyraz-screensaver/
├── install.sh, uninstall.sh, README.md, LICENSE
├── tools/                    budowanie bazy haseł
└── wyraz@jaroszek.eu/        właściwe rozszerzenie
    ├── LICENSE               EUPL-1.2
    ├── metadata.json
    ├── extension.js          bezczynność, blokady, podgląd
    ├── prefs.js              okno ustawień (libadwaita)
    ├── stylesheet.css
    ├── lib/                  wygaszacz, tła, losowanie
    ├── data/words.tsv        96 304 polskie hasła z definicjami
    ├── data/words-en.tsv     67 483 hasła angielskie (Wordset, CC BY-SA 4.0)
    ├── fonts/                czcionki OFL stylów Lublin Renesans i Wroclove Herbowy + licencje
    └── schemas/              ustawienia GSettings
```
