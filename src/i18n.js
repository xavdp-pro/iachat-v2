import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import frTranslation from './locales/fr.json';

i18n
  .use(initReactI18next)
  .init({
    resources: {
      fr: { translation: frTranslation },
    },
    lng: localStorage.getItem('i18nextLng') || navigator.language?.split('-')[0] || 'fr',
    fallbackLng: 'fr',
    interpolation: { escapeValue: false },
  });

// HMR : quand fr.json change, on met à jour i18next sans rechargement de page
if (import.meta.hot) {
  import.meta.hot.accept('./locales/fr.json', (newMod) => {
    i18n.addResourceBundle('fr', 'translation', newMod.default, true, true);
    i18n.reloadResources(['fr']).then(() => i18n.changeLanguage(i18n.language));
  });
}

export default i18n;

