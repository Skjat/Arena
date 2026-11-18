// Сохранение прогресса в localStorage.
const KEY = 'arena-blood-save-v1';

export function defaultSave() {
  return {
    version: 1,
    gold: 0,
    xp: 0,
    totalXp: 0,
    fight: 1,
    fightsWon: 0,
    owned: { weapons: ['rusty_sword'], armor: ['rags'] },
    equipped: { weapon: 'rusty_sword', head: null, body: 'rags', hands: null, feet: null },
    spells: { blink: 1, shield: 1 },
    upgrades: { manaPool: 0, manaFlow: 0, vitality: 0 },
    stats: { kills: 0, decapitations: 0, dismemberments: 0, deaths: 0, parries: 0, gibbed: 0 },
    settings: { sound: true, haptics: true, quality: 'auto', lefty: false, blood: 2, sens: 1 },
    prefs: { arena: 'colosseum', format: 'duel' },
    seenTutorial: false
  };
}

export function loadSave() {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return defaultSave();
    const data = JSON.parse(raw);
    const def = defaultSave();
    // Мягкое слияние с дефолтом (на случай новых полей).
    const merged = { ...def, ...data };
    for (const k of ['owned', 'equipped', 'spells', 'upgrades', 'stats', 'settings', 'prefs']) {
      merged[k] = { ...def[k], ...(data[k] || {}) };
    }
    return merged;
  } catch (e) {
    return defaultSave();
  }
}

export function writeSave(save) {
  try { localStorage.setItem(KEY, JSON.stringify(save)); } catch (e) { /* приватный режим */ }
}

export function resetSave() {
  try { localStorage.removeItem(KEY); } catch (e) { /* ignore */ }
  return defaultSave();
}
