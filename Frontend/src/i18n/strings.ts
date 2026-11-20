import { useDemoStore, type Lang } from '../store/demoStore';

/**
 * Patient-mode strings in English, Assamese and Hindi.
 * First draft — to be checked by native speakers (and Bodo / Manipuri added) before release.
 */
const en = {
  home: 'Home',
  play: 'Play',
  family: 'My Family',
  reminders: 'Reminders',
  settings: 'Settings',
  sos: 'SOS',
  callForHelp: 'Call for help',
  gentleGame: 'A gentle game',
  photosVoices: 'Photos and voices',
  medWaterMeals: 'Medicine, water, meals',
  goodMorning: 'Good morning',
  goodAfternoon: 'Good afternoon',
  goodEvening: 'Good evening',
  listen: 'Listen',
  today: 'Today',
  seeAll: 'See all',
  open: 'Open',
  next: 'Next',
  leavesToday: (d: number, n: number) => `${d} of ${n} leaves today`,
  allDone: 'Everything is done for today.',
  nextIs: (title: string, time: string) => `Next: ${title} at ${time}.`,
};

type Strings = typeof en;

const as: Strings = {
  home: 'ঘৰ',
  play: 'খেল',
  family: 'মোৰ পৰিয়াল',
  reminders: 'সোঁৱৰণী',
  settings: 'ছেটিংছ',
  sos: 'SOS',
  callForHelp: 'সহায় মাতক',
  gentleGame: 'এটা সহজ খেল',
  photosVoices: 'ফটো আৰু মাত',
  medWaterMeals: 'ঔষধ, পানী, আহাৰ',
  goodMorning: 'শুভ পুৱা',
  goodAfternoon: 'নমস্কাৰ',
  goodEvening: 'শুভ সন্ধিয়া',
  listen: 'শুনক',
  today: 'আজি',
  seeAll: 'সকলো চাওক',
  open: 'খোলক',
  next: 'পিছৰটো',
  leavesToday: (d, n) => `আজি ${n} টাৰ ভিতৰত ${d} টা পাত`,
  allDone: 'আজিৰ সকলো কাম হৈ গ’ল।',
  nextIs: (title, time) => `পিছৰটো: ${time} বজাত ${title}।`,
};

const hi: Strings = {
  home: 'होम',
  play: 'खेलें',
  family: 'मेरा परिवार',
  reminders: 'रिमाइंडर',
  settings: 'सेटिंग्स',
  sos: 'SOS',
  callForHelp: 'मदद बुलाएँ',
  gentleGame: 'एक आसान खेल',
  photosVoices: 'फ़ोटो और आवाज़ें',
  medWaterMeals: 'दवा, पानी, खाना',
  goodMorning: 'सुप्रभात',
  goodAfternoon: 'नमस्ते',
  goodEvening: 'शुभ संध्या',
  listen: 'सुनें',
  today: 'आज',
  seeAll: 'सब देखें',
  open: 'खोलें',
  next: 'अगला',
  leavesToday: (d, n) => `आज ${n} में से ${d} पत्ते`,
  allDone: 'आज के सारे काम हो गए।',
  nextIs: (title, time) => `अगला: ${time} बजे ${title}।`,
};

export const STRINGS: Record<Lang, Strings> = { en, as, hi };
export const LANG_LABEL: Record<Lang, string> = { en: 'English', as: 'অসমীয়া (Assamese)', hi: 'हिन्दी (Hindi)' };

export const useT = () => STRINGS[useDemoStore((s) => s.settings.lang)];
