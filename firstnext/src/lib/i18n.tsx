import { createContext, useContext, useState, useEffect, ReactNode } from 'react';

export type Locale = 'zh' | 'en';

interface I18nContextType {
  locale: Locale;
  setLocale: (locale: Locale) => void;
  t: (key: string) => string;
}

const I18nContext = createContext<I18nContextType | null>(null);

// 加载翻译文件的函数
async function loadTranslations(locale: Locale): Promise<Record<string, string>> {
  try {
    const response = await fetch(`/locales/${locale}.json`);
    if (!response.ok) {
      console.warn(`Failed to load ${locale} translations`);
      return {};
    }
    return await response.json();
  } catch (error) {
    console.warn(`Failed to load ${locale} translations:`, error);
    return {};
  }
}

export function I18nProvider({ children }: { children: ReactNode }) {
  const [locale, setLocale] = useState<Locale>(() => {
    if (typeof window !== 'undefined') {
      const saved = localStorage.getItem('locale') as Locale;
      if (saved && (saved === 'zh' || saved === 'en')) {
        return saved;
      }
      const browserLang = navigator.language.split('-')[0];
      return browserLang === 'zh' ? 'zh' : 'en';
    }
    return 'en';
  });

  const [translations, setTranslations] = useState<Record<string, string>>({});
  const [mounted, setMounted] = useState(false);

  // 加载翻译
  useEffect(() => {
    let cancelled = false;

    async function load() {
      const newTranslations = await loadTranslations(locale);
      if (!cancelled) {
        setTranslations(newTranslations);
        setMounted(true);
      }
    }

    load();

    return () => {
      cancelled = true;
    };
  }, [locale]);

  useEffect(() => {
    localStorage.setItem('locale', locale);
  }, [locale]);

  const t = (key: string): string => {
    return translations[key] || key;
  };

  // 防止 hydration 不匹配
  if (!mounted && typeof window !== 'undefined') {
    return (
      <I18nContext.Provider value={{ locale, setLocale: () => {}, t: (k: string) => k }}>
        {children}
      </I18nContext.Provider>
    );
  }

  return (
    <I18nContext.Provider value={{ locale, setLocale, t }}>
      {children}
    </I18nContext.Provider>
  );
}

export function useI18n() {
  const context = useContext(I18nContext);
  if (!context) {
    throw new Error('useI18n must be used within an I18nProvider');
  }
  return context;
}
