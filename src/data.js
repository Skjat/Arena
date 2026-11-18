// Игровые данные: оружие, доспехи, заклинания, архетипы врагов, лестница боёв.

// Базовые свойства типов оружия.
// swing  — длительность взмаха игрока (сек), reach — дальность (м),
// windup — время замаха у врагов (телеграф), enemyReach — дальность удара врага.
export const WEAPON_TYPES = {
  dagger: {
    name: 'Кинжал', swing: 0.2, reach: 1.75, stamina: 6, knock: 1.6, sever: 0.2, crush: 0,
    bleed: 0.8, block: 0.35, thrust: 1.35, slash: 1.0, backstab: 3.0, guardBreak: false,
    windup: 0.34, strike: 0.1, recover: 0.3, enemyReach: 1.35, prefRange: 1.1, twoHanded: false,
    armorPierce: 0, len: 0.42,
    desc: 'Очень быстрый, но короткий. Удар в спину ×3. Кровотечение.'
  },
  sword: {
    name: 'Меч', swing: 0.3, reach: 2.25, stamina: 10, knock: 2.6, sever: 0.45, crush: 0,
    bleed: 0.4, block: 0.6, thrust: 1.1, slash: 1.0, backstab: 2.0, guardBreak: false,
    windup: 0.5, strike: 0.14, recover: 0.42, enemyReach: 1.85, prefRange: 1.6, twoHanded: false,
    armorPierce: 0, len: 1.0,
    desc: 'Сбалансированный клинок. Хорошо рубит конечности.'
  },
  axe: {
    name: 'Топор', swing: 0.42, reach: 2.1, stamina: 14, knock: 4.2, sever: 0.75, crush: 0.1,
    bleed: 0.5, block: 0.45, thrust: 0.7, slash: 1.0, backstab: 2.0, guardBreak: true,
    windup: 0.68, strike: 0.16, recover: 0.55, enemyReach: 1.8, prefRange: 1.55, twoHanded: false,
    armorPierce: 0.15, len: 0.95,
    desc: 'Тяжёлый и медленный. Отрубает головы и руки. Пробивает блок.'
  },
  mace: {
    name: 'Булава', swing: 0.46, reach: 2.0, stamina: 15, knock: 7.5, sever: 0.0, crush: 0.85,
    bleed: 0.2, block: 0.5, thrust: 0.8, slash: 1.0, backstab: 2.0, guardBreak: true,
    windup: 0.75, strike: 0.18, recover: 0.6, enemyReach: 1.7, prefRange: 1.5, twoHanded: false,
    armorPierce: 0.5, len: 0.85,
    desc: 'Дробит черепа и броню (игнорирует 50% доспеха). Мощно отбрасывает.'
  },
  spear: {
    name: 'Копьё', swing: 0.34, reach: 3.15, stamina: 11, knock: 3.2, sever: 0.1, crush: 0,
    bleed: 0.5, block: 0.5, thrust: 1.45, slash: 0.7, backstab: 2.0, guardBreak: false,
    windup: 0.5, strike: 0.13, recover: 0.45, enemyReach: 2.75, prefRange: 2.4, twoHanded: true,
    armorPierce: 0.25, len: 2.0,
    desc: 'Самая большая дальность. Уколы (тап) наносят ×1.45 урона.'
  },
  greatsword: {
    name: 'Двуручник', swing: 0.5, reach: 2.7, stamina: 18, knock: 5.5, sever: 0.65, crush: 0,
    bleed: 0.5, block: 0.75, thrust: 0.9, slash: 1.0, backstab: 2.0, guardBreak: true,
    windup: 0.8, strike: 0.2, recover: 0.6, enemyReach: 2.25, prefRange: 1.9, twoHanded: true,
    armorPierce: 0.1, len: 1.45,
    desc: 'Огромный урон и размах. Медленный. Отличный блок.'
  }
};

// Материалы/тиры для визуала.
export const TIERS = {
  rusty:    { blade: 0x8a6e5a, metal: 0.55, rough: 0.75, grip: 0x4a3020, glow: 0 },
  iron:     { blade: 0xa8acb2, metal: 0.85, rough: 0.42, grip: 0x3a2618, glow: 0 },
  steel:    { blade: 0xdfe6ee, metal: 1.0, rough: 0.22, grip: 0x221a14, glow: 0 },
  obsidian: { blade: 0x1c1626, metal: 0.9, rough: 0.12, grip: 0x3a1010, glow: 0x7a2cff },
  runic:    { blade: 0x9ad7ff, metal: 1.0, rough: 0.15, grip: 0x10202a, glow: 0x33ccff },
  dragon:   { blade: 0xb02a10, metal: 0.95, rough: 0.2, grip: 0x1a0a05, glow: 0xff5500 }
};

export const WEAPONS = {
  rusty_sword:     { name: 'Ржавый меч', type: 'sword', tier: 'rusty', dmg: 18, price: 0, rank: 0 },
  iron_dagger:     { name: 'Железный кинжал', type: 'dagger', tier: 'iron', dmg: 14, price: 120, rank: 0 },
  iron_spear:      { name: 'Железное копьё', type: 'spear', tier: 'iron', dmg: 20, price: 180, rank: 0 },
  iron_axe:        { name: 'Секира', type: 'axe', tier: 'iron', dmg: 27, price: 240, rank: 0 },
  steel_sword:     { name: 'Стальной гладиус', type: 'sword', tier: 'steel', dmg: 27, price: 340, rank: 2 },
  war_mace:        { name: 'Боевая булава', type: 'mace', tier: 'iron', dmg: 31, price: 420, rank: 2 },
  stiletto:        { name: 'Стилет', type: 'dagger', tier: 'steel', dmg: 20, price: 460, rank: 3 },
  greatsword:      { name: 'Двуручный меч', type: 'greatsword', tier: 'steel', dmg: 38, price: 650, rank: 4 },
  partisan:        { name: 'Партизана', type: 'spear', tier: 'steel', dmg: 31, price: 700, rank: 4 },
  obsidian_axe:    { name: 'Обсидиановый топор', type: 'axe', tier: 'obsidian', dmg: 44, price: 1050, rank: 6 },
  obsidian_blade:  { name: 'Обсидиановый клинок', type: 'sword', tier: 'obsidian', dmg: 40, price: 1150, rank: 6 },
  shadow_fang:     { name: 'Клык тени', type: 'dagger', tier: 'obsidian', dmg: 30, price: 1250, rank: 7 },
  runic_hammer:    { name: 'Рунный молот', type: 'mace', tier: 'runic', dmg: 54, price: 1700, rank: 8 },
  dragon_lance:    { name: 'Драконье копьё', type: 'spear', tier: 'dragon', dmg: 47, price: 1800, rank: 9 },
  runic_greatsword:{ name: 'Рунный двуручник', type: 'greatsword', tier: 'runic', dmg: 62, price: 2300, rank: 10 },
  dragon_fang:     { name: 'Драконий клык', type: 'sword', tier: 'dragon', dmg: 56, price: 2600, rank: 11 }
};

export const ARMOR_SLOTS = { head: 'Шлем', body: 'Доспех', hands: 'Перчатки', feet: 'Сапоги' };

// armor — броня, weight — вес (замедляет), прочие бонусы.
export const ARMOR = {
  rags:            { name: 'Лохмотья', slot: 'body', armor: 0, weight: 0, price: 0, look: 'rags', color: 0x7a6a55, rank: 0 },
  leather_cap:     { name: 'Кожаный шлем', slot: 'head', armor: 3, weight: 0, price: 70, look: 'cap', color: 0x6b4a2c, rank: 0 },
  leather_armor:   { name: 'Кожаная броня', slot: 'body', armor: 7, weight: 1, price: 150, look: 'leather', color: 0x6b4a2c, rank: 0 },
  leather_gloves:  { name: 'Кожаные перчатки', slot: 'hands', armor: 2, weight: 0, price: 60, look: 'gloves', color: 0x5a3c22, rank: 0 },
  leather_boots:   { name: 'Кожаные сапоги', slot: 'feet', armor: 2, weight: 0, price: 80, speed: 0.04, look: 'boots', color: 0x5a3c22, rank: 0 },
  iron_helm:       { name: 'Железный шлем', slot: 'head', armor: 7, weight: 1, price: 220, look: 'helm', color: 0x8d9298, rank: 1 },
  chainmail:       { name: 'Кольчуга', slot: 'body', armor: 13, weight: 2, price: 400, look: 'chain', color: 0x8d9298, rank: 2 },
  iron_gauntlets:  { name: 'Железные рукавицы', slot: 'hands', armor: 4, weight: 1, price: 240, look: 'gauntlets', color: 0x8d9298, rank: 2 },
  steel_greaves:   { name: 'Стальные поножи', slot: 'feet', armor: 5, weight: 1, price: 320, look: 'greaves', color: 0xbfc6cf, rank: 3 },
  gladiator_helm:  { name: 'Шлем гладиатора', slot: 'head', armor: 11, weight: 1, price: 480, look: 'gladiator', color: 0xb08a3c, rank: 3 },
  plate_armor:     { name: 'Латы', slot: 'body', armor: 21, weight: 3, price: 950, look: 'plate', color: 0xbfc6cf, rank: 5 },
  wind_boots:      { name: 'Сапоги ветра', slot: 'feet', armor: 3, weight: 0, price: 700, speed: 0.14, staminaRegen: 0.3, look: 'boots', color: 0x3a7a8a, rank: 5 },
  runic_gauntlets: { name: 'Рунные перчатки', slot: 'hands', armor: 6, weight: 0, price: 760, manaRegen: 0.35, look: 'gauntlets', color: 0x2a6a9a, rank: 6 },
  knight_helm:     { name: 'Рыцарский шлем', slot: 'head', armor: 15, weight: 2, price: 900, look: 'knight', color: 0xbfc6cf, rank: 6 },
  archmage_robe:   { name: 'Мантия архимага', slot: 'body', armor: 10, weight: 0, price: 1300, manaMax: 50, manaRegen: 0.5, look: 'robe', color: 0x3a2a7a, rank: 7 },
  dragon_helm:     { name: 'Драконий шлем', slot: 'head', armor: 20, weight: 1, price: 1600, look: 'dragon', color: 0x7a1a10, rank: 9 },
  dragon_plate:    { name: 'Драконьи латы', slot: 'body', armor: 30, weight: 2, price: 2200, hpBonus: 30, look: 'dragonplate', color: 0x7a1a10, rank: 10 }
};

// Заклинания. glyph — символ, который нужно нарисовать.
export const SPELLS = {
  blink: {
    name: 'Блинк', glyph: 'arrow', mana: 15, cd: 0.8, color: 0x66ccff,
    xp: [0, 90, 200],
    hint: 'Стрела: ↑ вперёд, ↓ назад, ← → в стороны',
    desc: 'Мгновенный рывок по направлению стрелы. Окажись за спиной врага — удар в спину.',
    lv: [{ dist: 6 }, { dist: 8 }, { dist: 10 }]
  },
  shield: {
    name: 'Щит', glyph: 'circle', mana: 25, cd: 2, color: 0x88e0ff,
    xp: [0, 100, 220],
    hint: 'Круг',
    desc: 'Магическая сфера поглощает урон. На 3 уровне отражает снаряды.',
    lv: [{ absorb: 30, dur: 6 }, { absorb: 50, dur: 7 }, { absorb: 80, dur: 8, reflect: true }]
  },
  fireball: {
    name: 'Огненный шар', glyph: 'triangle', mana: 30, cd: 1, color: 0xff6a1a,
    xp: [60, 140, 300],
    hint: 'Треугольник',
    desc: 'Взрывается, поджигает и сбивает с ног. Избыточный урон разрывает на куски.',
    lv: [{ dmg: 30, burn: 4, radius: 2.2 }, { dmg: 42, burn: 6, radius: 2.6 }, { dmg: 56, burn: 8, radius: 3.0 }]
  },
  push: {
    name: 'Толчок', glyph: 'v', mana: 25, cd: 1, color: 0xd0c8ff,
    xp: [90, 150, 300],
    hint: 'Галочка V',
    desc: 'Волна силы швыряет врагов в стены. Удар о стену калечит.',
    lv: [{ dmg: 8, force: 10 }, { dmg: 12, force: 13 }, { dmg: 16, force: 16 }]
  },
  lightning: {
    name: 'Молния', glyph: 'z', mana: 35, cd: 1, color: 0x9fd8ff,
    xp: [140, 220, 400],
    hint: 'Зигзаг Z',
    desc: 'Мгновенный разряд, оглушает. На 2–3 уровне перескакивает на других врагов.',
    lv: [{ dmg: 26, stun: 0.9, chain: 0 }, { dmg: 36, stun: 1.1, chain: 1 }, { dmg: 48, stun: 1.4, chain: 2 }]
  },
  frost: {
    name: 'Ледяная хватка', glyph: 'x', mana: 30, cd: 1, color: 0x9ff0ff,
    xp: [160, 240, 420],
    hint: 'Крест X',
    desc: 'Замораживает врага. Мощный удар по замёрзшему разбивает его вдребезги.',
    lv: [{ dmg: 12, freeze: 2.2 }, { dmg: 18, freeze: 2.8 }, { dmg: 24, freeze: 3.4 }]
  },
  drain: {
    name: 'Кровопийца', glyph: 's', mana: 40, cd: 1.5, color: 0xff2244,
    xp: [220, 300, 480],
    hint: 'Буква S',
    desc: 'Высасывает жизнь врага и лечит вас.',
    lv: [{ total: 26 }, { total: 38 }, { total: 52 }]
  },
  meteor: {
    name: 'Метеор', glyph: 'star', mana: 70, cd: 3, color: 0xff3300,
    xp: [450, 600, 900],
    hint: 'Звезда ☆ (одним росчерком)',
    desc: 'Обрушивает метеор на врага. Чудовищный взрыв.',
    lv: [{ dmg: 80, radius: 3.4 }, { dmg: 110, radius: 3.8 }, { dmg: 150, radius: 4.2 }]
  }
};

export const SPELL_ORDER = ['blink', 'shield', 'fireball', 'push', 'lightning', 'frost', 'drain', 'meteor'];

// Пассивные магические улучшения (за опыт).
export const MAGIC_UPGRADES = {
  manaPool:  { name: 'Источник маны', desc: '+20 к максимуму маны', max: 5, cost: (lvl) => 80 + lvl * 70 },
  manaFlow:  { name: 'Поток', desc: '+25% к восстановлению маны', max: 4, cost: (lvl) => 100 + lvl * 90 },
  vitality:  { name: 'Закалка крови', desc: '+15 к здоровью', max: 5, cost: (lvl) => 90 + lvl * 80 }
};

// Время каста врагов (телеграф) и кулдауны ИИ.
export const ENEMY_CAST = {
  fireball: { time: 0.85, cd: 5.5 },
  lightning: { time: 1.05, cd: 7 },
  push: { time: 0.6, cd: 6 },
  frost: { time: 0.85, cd: 7 },
  blink: { time: 0.3, cd: 5 },
  shield: { time: 0.5, cd: 12 },
  drain: { time: 0.8, cd: 10 },
  meteor: { time: 1.2, cd: 12 }
};

// Внешний вид: look определяет шлем/одежду.
export const ARCHETYPES = {
  recruit: {
    title: 'Новобранец', weapon: 'rusty_sword', hp: 70, armor: { head: 0, body: 3, limbs: 0 },
    spells: [], aggr: 0.45, block: 0.18, dodge: 0.05, react: 0.38, speed: 3.2,
    look: { helm: 'none', top: 'tunic', cloth: 0x7a5a3a, pants: 0x4a3a2a, skin: 0xd8a888, hair: 0x3a2412 }
  },
  cutthroat: {
    title: 'Головорез', weapon: 'iron_dagger', hp: 65, armor: { head: 0, body: 4, limbs: 0 },
    spells: ['blink'], aggr: 0.85, block: 0.08, dodge: 0.45, react: 0.3, speed: 4.1,
    look: { helm: 'hood', top: 'leather', cloth: 0x2a2a30, pants: 0x1e1e22, skin: 0xc89070, hair: 0x111111 }
  },
  spearman: {
    title: 'Копейщик', weapon: 'iron_spear', hp: 85, armor: { head: 6, body: 7, limbs: 2 },
    spells: ['push'], aggr: 0.55, block: 0.3, dodge: 0.2, react: 0.32, speed: 3.3, keepDistance: true,
    look: { helm: 'helm', top: 'leather', cloth: 0x8a2a1a, pants: 0x3a2a1a, skin: 0xb88060, hair: 0x2a1a0a }
  },
  pyromancer: {
    title: 'Пиромант', weapon: 'iron_dagger', hp: 72, armor: { head: 0, body: 3, limbs: 0 },
    spells: ['fireball', 'shield'], caster: true, aggr: 0.4, block: 0.1, dodge: 0.3, react: 0.34, speed: 3.4,
    look: { helm: 'mage', top: 'robe', cloth: 0x9a2a10, pants: 0x3a1a0a, skin: 0xd8a080, hair: 0xaa3311, glow: 0xff5500 }
  },
  executioner: {
    title: 'Палач', weapon: 'iron_axe', hp: 125, armor: { head: 4, body: 6, limbs: 2 },
    spells: [], aggr: 0.6, block: 0.22, dodge: 0.05, react: 0.36, speed: 3.0,
    look: { helm: 'executioner', top: 'bare', cloth: 0x1a1a1a, pants: 0x2a1a12, skin: 0xc08060, hair: 0x000000, bulk: 1.15 }
  },
  knight: {
    title: 'Рыцарь', weapon: 'steel_sword', hp: 105, armor: { head: 14, body: 18, limbs: 6 },
    spells: ['shield'], aggr: 0.5, block: 0.55, dodge: 0.05, react: 0.26, speed: 2.9,
    look: { helm: 'knight', top: 'plate', cloth: 0x2a3a8a, pants: 0x9aa2ab, skin: 0xe0b090, hair: 0x6a4a2a }
  },
  stormcaller: {
    title: 'Громовержец', weapon: 'iron_spear', hp: 85, armor: { head: 0, body: 6, limbs: 0 },
    spells: ['lightning', 'blink'], caster: true, aggr: 0.45, block: 0.25, dodge: 0.3, react: 0.3, speed: 3.4,
    look: { helm: 'mage', top: 'robe', cloth: 0x1a3a8a, pants: 0x101a3a, skin: 0xc8a080, hair: 0xdddddd, glow: 0x66bbff }
  },
  berserker: {
    title: 'Берсерк', weapon: 'greatsword', hp: 120, armor: { head: 3, body: 2, limbs: 0 },
    spells: [], aggr: 0.95, block: 0.05, dodge: 0.1, react: 0.4, speed: 3.8,
    look: { helm: 'horns', top: 'bare', cloth: 0x5a3a20, pants: 0x3a2a1a, skin: 0xd09070, hair: 0xb04a10, bulk: 1.2 }
  },
  crusher: {
    title: 'Крушитель', weapon: 'war_mace', hp: 160, armor: { head: 8, body: 12, limbs: 4 },
    spells: ['push'], aggr: 0.55, block: 0.25, dodge: 0.02, react: 0.4, speed: 2.7,
    look: { helm: 'helm', top: 'chain', cloth: 0x4a4a4a, pants: 0x2a2a2a, skin: 0x9a7058, hair: 0x111111, bulk: 1.3 }
  },
  frostwitch: {
    title: 'Ледяная ведьма', weapon: 'stiletto', hp: 80, armor: { head: 0, body: 5, limbs: 0 },
    spells: ['frost', 'blink', 'shield'], caster: true, aggr: 0.55, block: 0.15, dodge: 0.4, react: 0.28, speed: 3.6,
    look: { helm: 'mage', top: 'robe', cloth: 0x7ad0e0, pants: 0x2a4a5a, skin: 0xe8d0c8, hair: 0xeef8ff, glow: 0x88eeff }
  },
  bloodmage: {
    title: 'Кровавый маг', weapon: 'stiletto', hp: 90, armor: { head: 0, body: 6, limbs: 0 },
    spells: ['drain', 'fireball', 'shield'], caster: true, aggr: 0.5, block: 0.15, dodge: 0.3, react: 0.3, speed: 3.4,
    look: { helm: 'mage', top: 'robe', cloth: 0x5a0a14, pants: 0x1a0508, skin: 0xd8b0a0, hair: 0x111111, glow: 0xff1133 }
  },
  champion: {
    title: 'Чемпион арены', weapon: 'obsidian_blade', hp: 150, armor: { head: 14, body: 16, limbs: 5 },
    spells: ['fireball', 'lightning', 'blink', 'shield', 'push'], caster: true, aggr: 0.7, block: 0.5, dodge: 0.3, react: 0.22, speed: 3.6,
    look: { helm: 'gladiator', top: 'plate', cloth: 0x6a0a0a, pants: 0x2a1a1a, skin: 0xc89070, hair: 0x1a0a00, bulk: 1.1 }
  },
  warlord: {
    title: 'Повелитель войны', weapon: 'runic_greatsword', hp: 190, armor: { head: 18, body: 22, limbs: 8 },
    spells: ['meteor', 'push', 'shield', 'lightning'], caster: true, aggr: 0.7, block: 0.45, dodge: 0.15, react: 0.22, speed: 3.3,
    look: { helm: 'dragon', top: 'plate', cloth: 0x1a1a1a, pants: 0x101010, skin: 0xa07050, hair: 0x000000, bulk: 1.25, glow: 0xff4400 }
  }
};

const NAMES = ['Гай', 'Бруто', 'Кассий', 'Ульф', 'Торвальд', 'Зара', 'Мирра', 'Ксандр', 'Вар', 'Огмар',
  'Сильвия', 'Рагнар', 'Кай', 'Децим', 'Луций', 'Ашер', 'Мордек', 'Ивар', 'Сигрид', 'Тит', 'Хальв',
  'Вейла', 'Гракх', 'Нерон', 'Бьорн', 'Ирма', 'Скар', 'Малек', 'Орса', 'Фенрик'];

function rngFor(seed) {
  let s = seed * 9301 + 49297;
  return () => { s = (s * 9301 + 49297) % 233280; return s / 233280; };
}

// Генерация n-го боя лестницы.
export function getFight(n) {
  const r = rngFor(n * 7 + 3);
  const pick = (arr) => arr[Math.floor(r() * arr.length)];
  const fixed = {
    1: [['recruit']], 2: [['cutthroat']], 3: [['spearman']], 4: [['pyromancer']],
    5: [['executioner', 'boss']], 6: [['recruit'], ['recruit']], 7: [['knight']], 8: [['stormcaller']],
    9: [['berserker']], 10: [['crusher', 'boss']], 11: [['frostwitch']], 12: [['cutthroat'], ['spearman']],
    13: [['bloodmage']], 14: [['knight'], ['pyromancer']], 15: [['champion', 'boss']],
    20: [['warlord', 'boss']]
  };
  let list = fixed[n];
  if (!list) {
    const pool = ['recruit', 'cutthroat', 'spearman', 'pyromancer', 'executioner', 'knight', 'stormcaller',
      'berserker', 'crusher', 'frostwitch', 'bloodmage', 'champion'];
    if (n % 5 === 0) {
      list = [[pick(['champion', 'warlord', 'berserker', 'crusher']), 'boss']];
      if (n >= 25) list.push([pick(pool)]);
    } else {
      const count = n >= 22 ? (r() < 0.5 ? 3 : 2) : (r() < 0.55 ? 2 : 1);
      list = [];
      for (let i = 0; i < count; i++) list.push([pick(pool)]);
    }
  }
  const usedNames = new Set();
  const enemies = list.map(([arch, boss]) => {
    let name;
    do { name = pick(NAMES); } while (usedNames.has(name) && usedNames.size < NAMES.length);
    usedNames.add(name);
    // В групповых боях противники слабее.
    const groupScale = list.length > 1 ? 0.72 : 1;
    return { archetype: arch, boss: !!boss, name, level: n, groupScale };
  });
  const gold = Math.round(45 + n * 22 + (list.some((e) => e[1]) ? 60 + n * 6 : 0));
  const xp = Math.round(35 + n * 12 + (list.some((e) => e[1]) ? 40 : 0));
  return { n, enemies, gold, xp };
}

export function rankName(fightsWon) {
  const ranks = ['Раб', 'Новичок', 'Боец', 'Гладиатор', 'Ветеран', 'Мясник', 'Чемпион', 'Легенда', 'Бог арены'];
  const idx = Math.min(ranks.length - 1, Math.floor(fightsWon / 3));
  return ranks[idx];
}

export function rankIndex(fightsWon) {
  return Math.floor(fightsWon / 2);
}
