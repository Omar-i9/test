export type Stadium = {
  id: string;
  nameAr: string;
  nameEn: string;
  cityAr: string;
  cityEn: string;
  locationAr?: string;
  locationEn?: string;
  contactPhone?: string;
  descriptionAr?: string;
  descriptionEn?: string;
};

export const stadiums: Stadium[] = [
  {
    id: 'stadium-qasrawi',
    nameAr: 'ملعب القصرواي',
    nameEn: 'Al Qasrawi Stadium',
    cityAr: 'الخليل',
    cityEn: 'Hebron',
    locationAr: 'مفرق المدارس، أول نزول حارة الزغير',
    locationEn: 'Schools Junction, first descent of Harat Al-Zughair',
    contactPhone: '+972 59-472-3000',
    descriptionAr: 'ملعب رياضي في الخليل',
    descriptionEn: 'Sports stadium in Hebron'
  },
  {
    id: 'stadium-ahli',
    nameAr: 'ملعب الأهلي',
    nameEn: 'Al Ahli Stadium',
    cityAr: 'الخليل',
    cityEn: 'Hebron',
    locationAr: 'أول طلعة المستشفى الأهلي القديمة',
    locationEn: 'First ascent of the old Al Ahli Hospital',
    contactPhone: '+972 59-555-0322',
    descriptionAr: 'ملعب رياضي في الخليل',
    descriptionEn: 'Sports stadium in Hebron'
  },
  {
    id: 'stadium-women',
    nameAr: 'ملعب سيدات الخليل',
    nameEn: 'Hebron Women Stadium',
    cityAr: 'الخليل',
    cityEn: 'Hebron',
    locationAr: 'مفرق الأهلي، جمعية سيدات الخليل',
    locationEn: 'Al Ahli Junction, Hebron Women Association',
    contactPhone: '+972 59-784-1444',
    descriptionAr: 'ملعب رياضي للسيدات في الخليل',
    descriptionEn: 'Women sports stadium in Hebron'
  },
  {
    id: 'stadium-shareef',
    nameAr: 'ملاعب الشريف',
    nameEn: 'Al Shareef Stadiums',
    cityAr: 'الخليل',
    cityEn: 'Hebron',
    locationAr: 'مفرق الجامعة، خلف مول السلايمة',
    locationEn: 'University Junction, behind Al-Salaymeh Mall',
    contactPhone: '+972 59-479-7777',
    descriptionAr: 'ملاعب رياضية في الخليل',
    descriptionEn: 'Sports stadiums in Hebron'
  },
  {
    id: 'stadium-salam',
    nameAr: 'ملعب السلام',
    nameEn: 'Al Salam Stadium',
    cityAr: 'الخليل',
    cityEn: 'Hebron',
    locationAr: 'شارع السلام بالقرب من أفوكادو',
    locationEn: 'Al Salam Street near Avocado',
    contactPhone: '+972 59-995-1151',
    descriptionAr: 'ملعب رياضي في الخليل',
    descriptionEn: 'Sports stadium in Hebron'
  }
];

export function getStadiumById(id: string): Stadium | undefined {
  return stadiums.find(s => s.id === id);
}

export function searchStadiums(query: string, language: 'ar' | 'en'): Stadium[] {
  const all = stadiums.map((stadium, index) => ({ stadium, index }));
  const raw = query.trim();
  if (!raw) return all.map(({ stadium }) => stadium);
  const normalizedQuery = normalizeArabicText(raw.toLocaleLowerCase());
  const tokens = normalizedQuery.split(/\s+/).filter(Boolean);
  const distance = (a: string, b: string): number => {
    if (a === b) return 0;
    if (!a) return b.length;
    if (!b) return a.length;
    let previous = Array.from({ length: b.length + 1 }, (_, i) => i);
    for (let i = 1; i <= a.length; i += 1) {
      const current = [i];
      for (let j = 1; j <= b.length; j += 1) {
        current[j] = Math.min(current[j - 1] + 1, previous[j] + 1, previous[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
      }
      previous = current;
    }
    return previous[b.length];
  };
  const ranked = all.map(({ stadium, index }) => {
    const fields = [
      language === 'ar' ? stadium.nameAr : stadium.nameEn,
      language === 'ar' ? stadium.cityAr : stadium.cityEn,
      language === 'ar' ? stadium.locationAr || '' : stadium.locationEn || '',
      language === 'ar' ? stadium.descriptionAr || '' : stadium.descriptionEn || '',
    ].map(value => normalizeArabicText(value.toLocaleLowerCase())).filter(Boolean);
    let score = Infinity;
    for (const field of fields) {
      if (field === normalizedQuery) score = Math.min(score, 0);
      else if (field.startsWith(normalizedQuery)) score = Math.min(score, 1 + (field.length - normalizedQuery.length) / 100);
      else if (field.includes(normalizedQuery)) score = Math.min(score, 2 + field.indexOf(normalizedQuery) / 100 + (field.length - normalizedQuery.length) / 1000);
      for (const token of tokens) {
        if (field.startsWith(token)) score = Math.min(score, 3 + (field.length - token.length) / 100);
        else if (field.includes(token)) score = Math.min(score, 4 + field.indexOf(token) / 100);
        else if (token.length >= 3) {
          const words = field.split(/[^\p{L}\p{N}]+/u).filter(Boolean);
          for (const word of words) {
            const d = distance(token, word);
            const threshold = token.length >= 7 ? 2 : 1;
            if (d <= threshold) score = Math.min(score, 5 + d + Math.abs(word.length - token.length) / 100);
          }
        }
      }
    }
    // Multi-word queries must match most tokens; this prevents an unrelated field from dominating.
    if (tokens.length > 1) {
      const matched = tokens.filter(token => fields.some(field => field.includes(token) || (token.length >= 3 && field.split(/[^\p{L}\p{N}]+/u).some(word => distance(token, word) <= (token.length >= 7 ? 2 : 1))))).length;
      if (matched < Math.ceil(tokens.length * 0.7)) score = Infinity;
    }
    return { stadium, index, score };
  }).filter(item => Number.isFinite(item.score) && item.score < 7);
  return ranked.sort((a, b) => a.score - b.score || a.index - b.index).map(({ stadium }) => stadium);
}

function normalizeArabicText(text: string): string {
  return text
    .replace(/[أإآ]/g, 'ا')
    .replace(/[هة]/g, 'ه')
    .replace(/[يى]/g, 'ي')
    .replace(/[وؤ]/g, 'و')
    .replace(/\s+/g, ' ')
    .trim();
}
