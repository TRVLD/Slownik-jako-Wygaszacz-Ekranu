export const PRANK_PROVERBS = [
    ['Tak krawiec kraje, jak mu materii staje.',
        '‘w swoich działaniach jesteśmy ograniczeni okolicznościami’'],
    ['Panu Bogu świeczkę i diabłu ogarek.',
        '‘chcieć zadowolić dwie przeciwstawne strony’'],
    ['Nie święci garnki lepią.',
        '‘nie trzeba być wyjątkową osobą, aby coś zrobić’'],
    ['Na bezrybiu i rak ryba.',
        '‘gdy nie ma rzeczy, na której nam zależy, musimy się zadowolić jej namiastką’'],
    ['Kto wiatr sieje, ten zbiera burzę.',
        '‘musimy spodziewać się poważnych konsekwencji naszych złych czynów’'],
    ['Czym skorupka za młodu nasiąknie, tym na starość trąci.',
        '‘nabyte w młodości cechy i przyzwyczajenia ujawniają się w życiu dojrzałym’'],
    ['Kowal zawinił, a Cygana powiesili.',
        '‘ktoś został niesprawiedliwie ukarany za czyjeś winy’'],
    ['Zły to ptak, co własne gniazdo kala.',
        '‘ktoś, kto występuje przeciwko własnemu środowisku, własnej rodzinie’'],
    ['Łaska pańska na pstrym koniu jeździ.',
        '‘przychylność możnych jest zależna od ich kaprysów’'],
    ['Przyganiał kocioł garnkowi, a sam smoli.',
        '‘ktoś zwraca uwagę innym, a sam popełnia podobne błędy’'],
    ['Pańskie oko konia tuczy.',
        '‘warto osobiście angażować się w swoje sprawy, a nie polegać wyłącznie na innych’'],
    ['Czego oko nie widzi, tego sercu nie żal.',
        '‘jeśli nic nie wiemy o przykrych dla nas faktach, to nie cierpimy z tego powodu’'],
    ['Gdzie drwa rąbią, tam wióry lecą.',
        '‘każdy czyn ma swoje skutki uboczne’'],
    ['Na złodzieju czapka gore.',
        '‘winowajca nie umie ukryć lęku przed zdemaskowaniem i swoim zachowaniem zwraca na siebie uwagę’'],
    ['Złej baletnicy przeszkadza rąbek u spódnicy.',
        '‘osoba, która nie umie czegoś zrobić, chętnie zrzuca winę na niesprzyjające okoliczności’'],
    ['Nie dla psa kiełbasa, nie dla kota spyrka.',
        '‘pewne rzeczy są dostępne tylko dla określonej grupy odbiorców’'],
];

export const PRANK_CREDIT = 'Poprawność Językowa, IDiKS, UWr';

export function isAprilFirst(dt) {
    return dt.get_month() === 4 && dt.get_day_of_month() === 1;
}

export function pickProverbs(n = 3) {
    const pool = [...PRANK_PROVERBS];
    const out = [];
    while (out.length < n && pool.length) {
        const i = Math.floor(Math.random() * pool.length);
        const [text, meaning] = pool.splice(i, 1)[0];
        out.push({text, meaning});
    }
    return out;
}
