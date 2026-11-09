// 教科の一覧（ラベルの色）と、プリントの文字から教科を推定する簡単なキーワード判定。

export interface SubjectDef {
  /** 表示名（保存する値もこれ） */
  name: string;
  /** ラベルの文字色（背景 bg の上でコントラスト比 4.5:1 以上。タブの丸印にも使う） */
  fg: string;
  /** ラベルの背景色 */
  bg: string;
  /** 見つかれば強くその教科と判断する語（教科名・科目名） */
  names: string[];
  /** その教科でよく出る語 */
  words: string[];
}

export const UNCLASSIFIED = '未分類';
export const UNCLASSIFIED_COLOR = { fg: '#4b5563', bg: '#eef0f2' };

export const SUBJECTS: SubjectDef[] = [
  {
    name: '国語',
    fg: '#a61e45',
    bg: '#fde8ee',
    names: ['国語', '現代文', '古文', '漢文', '論理国語', '文学国語', '言語文化', '古典探究', '現代の国語'],
    words: ['漢字', '評論', '小説', '随筆', '読解', '古典', '和歌', '俳句', '短歌', '敬語', '熟語', '筆者', '作者', '段落', '慣用句', 'ことわざ', '四字熟語', '品詞', '活用形', '係り結び', '歴史的仮名遣い', '登場人物'],
  },
  {
    name: '数学',
    fg: '#1d4fb8',
    bg: '#e6effd',
    names: ['数学', '算数', '数Ⅰ', '数Ⅱ', '数Ⅲ', '数学Ⅰ', '数学Ⅱ', '数学Ⅲ', '数学A', '数学B', '数学C'],
    words: ['方程式', '関数', '微分', '積分', '因数分解', '公約数', '公倍数', '三角比', '三角関数', 'ベクトル', '数列', '確率', '平方根', '不等式', '証明', '約数', '倍数', '比例', '反比例', '図形', '面積', '体積', '素数', '集合', '座標', '二次', '一次', '連立', '展開', '整数', '分数', '小数', 'log', 'sin', 'cos'],
  },
  {
    name: '英語',
    fg: '#5536bd',
    bg: '#efeafd',
    names: ['英語', '英文法', '英作文', 'English', 'ENGLISH', '英語コミュニケーション', '論理・表現', 'コミュニケーション英語'],
    words: ['文法', '助動詞', '関係代名詞', '関係副詞', '不定詞', '動名詞', '分詞', '仮定法', '受動態', '比較級', '最上級', '現在完了', '時制', '前置詞', '接続詞', '英単語', '単語', '和訳', '英訳', '並べかえ', '並べ替え', 'Lesson', 'Unit', '長文', 'リスニング', '発音', 'アクセント'],
  },
  {
    name: '物理',
    fg: '#0b5a88',
    bg: '#e3f2fb',
    names: ['物理', '物理基礎'],
    words: ['力学', '速度', '加速度', '運動方程式', '運動量', '力学的エネルギー', '電流', '電圧', '電気抵抗', 'オーム', '波動', '摩擦', '仕事率', '磁場', '磁界', '電場', '電界', 'ばね', '弾性', '屈折', '干渉', '等加速度', '重力加速度', 'ニュートン'],
  },
  {
    name: '化学',
    fg: '#0f6657',
    bg: '#e2f4f0',
    names: ['化学', '化学基礎'],
    words: ['モル', '物質量', '元素', '原子', '分子', 'イオン', '化学反応', '化学式', '反応式', '酸化', '還元', '周期表', '中和', '溶液', '濃度', '電子配置', '化合物', '有機', '無機', '同位体', '電気分解', '沈殿', '酸と塩基', 'pH', 'mol'],
  },
  {
    name: '生物',
    fg: '#3b6614',
    bg: '#ecf5e1',
    names: ['生物', '生物基礎'],
    words: ['細胞', '遺伝', 'DNA', 'RNA', '酵素', '光合成', '呼吸', '生態系', 'タンパク質', '染色体', '進化', 'ホルモン', '免疫', '神経', '代謝', '形質'],
  },
  {
    name: '地学',
    fg: '#6b4a10',
    bg: '#f6efdc',
    names: ['地学', '地学基礎'],
    words: ['地層', '岩石', '鉱物', '火山', '地震', '天体', '気象', 'プレート', '化石', '恒星', '惑星', '前線', '震源'],
  },
  {
    name: '理科',
    fg: '#0d6069',
    bg: '#e0f3f5',
    names: ['理科'],
    words: ['実験', '観察'],
  },
  {
    name: '歴史',
    fg: '#963b0c',
    bg: '#fcebdd',
    names: ['歴史', '日本史', '世界史', '歴史総合', '日本史探究', '世界史探究'],
    words: ['時代', '幕府', '天皇', '戦争', '革命', '条約', '王朝', '文明', '江戸', '明治', '大正', '昭和', '鎌倉', '室町', '平安', '奈良', '縄文', '弥生', '古墳', '将軍', '大名', '帝国', '藩', '律令', '遣唐使', '世紀'],
  },
  {
    name: '地理',
    fg: '#6f5200',
    bg: '#fbf1d4',
    names: ['地理', '地理総合', '地理探究'],
    words: ['地形', '気候', '人口', '緯度', '経度', '地図', '農業', '工業', '貿易', '都市', '河川', '平野', '山脈', '降水量', '時差'],
  },
  {
    name: '公民',
    fg: '#46560f',
    bg: '#eef2dc',
    names: ['公民', '公共', '政治・経済', '政治経済', '倫理', '現代社会'],
    words: ['政治', '経済', '憲法', '選挙', '国会', '内閣', '裁判', '人権', '三権分立', '需要', '供給', '税金', '社会保障', '民主主義'],
  },
  {
    name: '社会',
    fg: '#86451a',
    bg: '#f8ebe0',
    names: ['社会科'],
    words: [],
  },
  {
    name: '保健',
    fg: '#1d6829',
    bg: '#e5f4e7',
    names: ['保健', '保健体育', '体育'],
    words: ['生活習慣病', '健康', '感染症', '喫煙', '飲酒', '応急手当', '栄養', '睡眠', '心肺蘇生', '薬物乱用', '病原体', 'ストレス'],
  },
  {
    name: '情報',
    fg: '#3a4859',
    bg: '#e8edf2',
    names: ['情報Ⅰ', '情報Ⅱ', '情報I', '情報II', '情報科', '情報の科学', '社会と情報'],
    words: ['プログラム', 'プログラミング', 'アルゴリズム', 'ネットワーク', 'データベース', '二進法', '2進法', '情報モラル', 'フローチャート', 'ビット', 'バイト', '変数', '配列'],
  },
];

const BY_NAME = new Map(SUBJECTS.map((s) => [s.name, s]));

export function subjectDef(name: string): SubjectDef | undefined {
  return BY_NAME.get(name);
}

/** ラベルの色（一覧にない教科名は灰色） */
export function subjectColor(name: string | null | undefined): { fg: string; bg: string } {
  const s = name ? BY_NAME.get(name) : undefined;
  return s ? { fg: s.fg, bg: s.bg } : UNCLASSIFIED_COLOR;
}

/** 教科タブの並び順（一覧の順。一覧にないものは後ろに名前順） */
export function subjectOrder(name: string): number {
  const i = SUBJECTS.findIndex((s) => s.name === name);
  return i < 0 ? SUBJECTS.length : i;
}

/** フォルダ名が教科名と同じなら、その教科名 */
export function subjectFromFolderName(folderName: string | null | undefined): string | null {
  const n = folderName?.trim();
  return n && BY_NAME.has(n) ? n : null;
}

function countOf(text: string, word: string): number {
  if (!word) return 0;
  let n = 0;
  let i = text.indexOf(word);
  while (i >= 0 && n < 5) {
    n++;
    i = text.indexOf(word, i + word.length);
  }
  return n;
}

/**
 * プリントのタイトルと本文から教科を推定する。決められないときは null。
 * タイトル（名前）に教科名があればほぼそれで決まり、本文はよく出る語の数で判断する。
 */
export function inferSubject(title: string, body = ''): string | null {
  const t = title.normalize('NFKC');
  const b = body.normalize('NFKC').slice(0, 20000);
  const scores = new Map<string, number>();
  for (const s of SUBJECTS) {
    let score = 0;
    for (const raw of s.names) {
      const w = raw.normalize('NFKC');
      if (t.includes(w)) score += 20;
      score += Math.min(countOf(b, w), 3) * 4;
    }
    for (const raw of s.words) {
      const w = raw.normalize('NFKC');
      if (t.includes(w)) score += 4;
      if (countOf(b, w)) score += 2 + Math.min(countOf(b, w) - 1, 2);
    }
    if (score) scores.set(s.name, score);
  }
  // 英文が多ければ英語らしい（3文字以上の英単語が多い）
  const englishWords = (b.match(/[A-Za-z]{3,}/g) ?? []).length + (t.match(/[A-Za-z]{3,}/g) ?? []).length;
  const japanese = (b + t).match(/[぀-ヿ一-鿿]/g)?.length ?? 0;
  if (englishWords >= 8 && englishWords * 3 >= japanese) scores.set('英語', (scores.get('英語') ?? 0) + 6);

  const ranked = [...scores].sort((a, b) => b[1] - a[1]);
  if (!ranked.length) return null;
  const [best, second] = ranked;
  // 弱い手がかり1つだけ、または上位2つが僅差なら決めない
  if (best[1] < 4) return null;
  if (second && best[1] - second[1] < 2) return null;
  return best[0];
}
