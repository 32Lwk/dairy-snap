import { withNestedFine, type NestedFineDef } from "./interest-taxonomy-nested";

/** 映像・エンタメ › 漫画 */
export const MEDIA_MANGA_FINES: NestedFineDef[] = [
  withNestedFine("media:manga:weekly_jump", "少年誌・ジャンプ系", {
    weekly: "週刊少年ジャンプ本誌で連載追い",
    jump_plus: "少年ジャンプ＋・電子掲載も追う",
    anime_mix: "アニメ化タイミングで原作を読む派",
    ranking: "掲載順・打ち切り・読切文化に詳しい",
    goods: "ジャンプフェスタ・応募者全員サービス",
  }, {
    one_piece: "ONE PIECE",
    jjk: "呪術廻戦",
    mha: "僕のヒーローアカデミア",
    chainsaw: "チェンソーマン",
    kaiju: "怪獣8号",
  }),
  withNestedFine("media:manga:young_magazine", "青年誌", {
    gekiga: "劇画・硬派ドラマ路線",
    monthly: "月刊・隔月誌の読み切り文化",
    award: "漫画大賞・文化賞・メディア露出",
    realism: "取材・リアリティ・職人描写重視",
    digital_mag: "電子雑誌・先行配信",
  }, {
    kingdom: "キングダム",
    vinland: "ヴィンランド・サガ",
    golden: "ゴールデンカムイ",
    berserk: "ベルセルク",
    ajin: "亜人",
  }),
  withNestedFine("media:manga:shojo", "少女・女性向け誌", {
    romance: "恋愛・三角関係の機微",
    fantasy: "ファンタジー少女・異世界乙女",
    bl_gl_border: "BL誌と境界のある作品も含めて追う",
    cover: "表紙・カラー・装丁コレクション",
    drama_adapt: "実写・舞台化も追う",
  }, {
    yona: "暁のヨナ",
    skip_loid: "スキップとローファー",
    fruits: "フルーツバスケット",
    nana: "NANA",
  }),
  withNestedFine("media:manga:webtoon", "Webtoon・縦読み", {
    korean: "韓国原作・LINEマンガ・ピッコマ",
    japan_orig: "日本オリジナル縦読み",
    wait_free: "待てば無料・先読み課金",
    color: "全話カラー・スクロール演出",
    noveltie: "小説原作のWebtoon化",
  }, {
    solo_level: "俺だけレベルアップな件",
    tower_god: "神之塔",
    lookism: "外見至上主義",
    true_beauty: "女神降臨",
  }),
  withNestedFine("media:manga:comiket", "同人誌・即売会", {
    comiket: "コミックマーケット本体",
    regional: "地方即売会・オンリーイベント",
    circle: "サークル参加・製本・入稿",
    partition: "成人向け島のルール・自主規制",
    reprint: "再販・委託・BOOTH通販",
  }, {
    touhou: "東方Project",
    type_moon: "TYPE-MOON",
    imas: "アイドルマスター二次創作",
    genshin: "原神二次創作",
  }),
  withNestedFine("media:manga:collector", "初版・帯付き・収集", {
    first: "初版・刷次・重版待ち",
    obi: "帯・付録・応募券 intact",
    climate: "暗所・湿度管理・スリーブ",
    sign: "サイン会・抽選・店舗特典",
    complete: "全巻収納・BOX・文庫版揃え",
  }, {
    kanzenban: "完全版・愛蔵版",
    anniversary: "周年記念セット",
  }),
];

/** 映像・エンタメ › ラノベ・小説 */
export const MEDIA_LIGHTNOVEL_FINES: NestedFineDef[] = [
  withNestedFine("media:lightnovel:dengeki", "電撃・富士見等レーベル", {
    label_loyal: "レーベル横断で追う",
    illustrator: "イラストレーター軸で買う",
    bunko: "文庫化・新装版まで揃える",
    drama_cd: "ドラマCD・特装版派",
    collab_cafe: "コラボカフェ・ミュージアム",
  }, {
    sao: "ソードアート・オンライン",
    index: "とある魔術の禁書目録",
    shana: "灼眼のシャナ",
  }),
  withNestedFine("media:lightnovel:webnovel", "Web小説・なろう系", {
    narou: "小説家になろう・カクヨム等",
    reinc: "転生・チート・スローライフ",
    villainess: "悪役令嬢・乙女ゲー世界",
    pay_ep: "有料エピソード・支援文化",
    print_on_demand: "書籍化待ち・商業化祝い",
  }, {
    rezero: "Re:ゼロ（web起点の文脈も）",
    slime: "転スラ",
    mushoku: "無職転生",
  }),
  withNestedFine("media:lightnovel:cross_media", "アニメ化・メディアミックス追跡", {
    timing: "放送クールに合わせて原作再読",
    diff: "原作改変・脚本派／原作至上派",
    goods_chain: "BD特典・イベント抽選",
    global: "海外版翻訳・同時展開",
  }, {
    overlord: "オーバーロード",
    konosuba: "このすば",
    shield: "盾の勇者の成り上がり",
  }),
  withNestedFine("media:lightnovel:illustrator", "イラストレーター推し", {
    artbook: "画集・展覧会・複製原画",
    twitter: "SNSラフ・制作過程フォロー",
    collab: "他媒体とのイラスト仕事も追う",
    style: "線・色・デザイン言語で語る",
  }, {
    abec: "abec（SAO等）",
    shirabi: "しらび",
    mishima: "三嶋くろね",
  }),
];

/** 映像・エンタメ › 映画 */
export const MEDIA_MOVIE_FINES: NestedFineDef[] = [
  withNestedFine("media:movie:hollywood", "ハリウッド・洋画", {
    franchise: "MCU・続編フランちゃいズ",
    oscar: "アカデミー・賞レース",
    director: "監督フィルモグラフィー通し",
    sub_dub: "字幕派・吹替派・両方",
    imax_ov: "IMAX・ドルビーシネマ",
  }, {
    dune: "DUNE",
    oppenheimer: "オッペンハイマー",
    batman: "THE BATMAN",
  }),
  withNestedFine("media:movie:japanese", "邦画", {
    show_gate: "邦画の日・映画祭割引",
    j_horror: "Jホラー史・貞子系譜",
    indie_j: "インディーズ邦画・自主映画",
    actor: "俳優・監督のフィルモグラフィー",
    local: "ロケ地巡り・地方映画館",
  }, {
    shoplifters: "万引き家族",
    drive_my_car: "ドライブ・マイ・カー",
    godzilla: "ゴジラ（邦画枠）",
  }),
  withNestedFine("media:movie:animation", "アニメ映画", {
    ghibli: "ジブリ・宮崎作品史",
    shinkai: "新海誠作品の光とレンズ",
    late_night_anime_film: "深夜枠原作の劇場版",
    seiyuu_event: "声優舞台挨拶・応援上映",
  }, {
    kimi_no_na: "君の名は。",
    suzume: "すずめの戸締まり",
    jujutsu_zero: "劇場版 呪術廻戦 0",
  }),
  withNestedFine("media:movie:documentary", "ドキュメンタリー", {
    social: "社会問題・調査報道系",
    nature: "自然・動物・環境",
    music_doc: "音楽・ライブ・バンド史",
    war_history: "戦争・歴史・政治",
    personal: "私小説的・家族史",
  }, {
    free_solo: "フリーソロ",
    march_penguin: "皇帝ペンギン（古典）",
  }),
  withNestedFine("media:movie:horror", "ホラー", {
    jump_scare: "ジャンプスケア・エンタメホラー",
    slow_burn: "じわじわ系・民俗ホラー",
    splatter: "スプラッター耐性で選ぶ",
    found_footage: "フェイクドキュメンタリー",
  }, {
    ring: "リング",
    ju_on: "呪怨",
    hereditary: "ヘレディタリー",
  }),
  withNestedFine("media:movie:sf", "SF", {
    hard_sf: "ハードSF・設定重視",
    cyberpunk: "サイバーパンク",
    space_opera: "スペースオペラ",
    time_travel: "タイムトラベル系",
  }, {
    blade_runner: "ブレードランナー",
    matrix: "マトリックス",
    interstellar: "インターステラー",
  }),
  withNestedFine("media:movie:indie", "インディー・映画祭", {
    festival: "カンヌ・ベルリン・ロカルノ",
    crowdfunding: "クラファン映画・自主上映",
    short_film: "短編プログラム",
    arthouse: "アートハウス系劇場通い",
  }, {
    moonlight: "ムーンライト",
    parasite: "パラサイト",
  }),
  withNestedFine("media:movie:thriller", "サスペンス・スリラー", {
    mystery: "本格推理・倒叙",
    legal: "法廷・リーガルスリラー",
    spy: "スパイ・諜報",
    psycho: "サイコスリラー",
  }, {
    seven: "セブン",
    silence_lambs: "羊たちの沈黙",
  }),
  withNestedFine("media:movie:romance", "恋愛映画・ロマコメ", {
    meet_cute: "運命の出会い系",
    sad_end: "切ない結末派",
    queer_romance: "クィア・多様な恋愛描写",
    classic: "古典ハリウッド・白黒",
  }, {
    before_sunrise: "ビフォア・サンライズ",
    notebook: "ノートブック",
  }),
  withNestedFine("media:movie:disney", "ディズニー・ピクサー・大作アニメ映画", {
    princess: "プリンセス・ミュージカル",
    pixar: "ピクサー・泣ける3幕構成",
    marvel_animation: "スパイダーバース等アニメーション",
    park: "パーク・ショー・D23",
  }, {
    toy_story: "トイ・ストーリー",
    frozen: "アナと雪の女王",
    inside_out: "インサイド・ヘッド",
  }),
  withNestedFine("media:movie:4dx_imax", "IMAX・特別上映・音響重視", {
    seat: "前列・中央・音響席こだわり",
    film_print: "フィルム上映・レストア",
    atmos: "ドルビーアトモス・振動",
    repeat: "週替わり再上映・週末朝イチ",
  }, {
    dune_imax: "DUNE（IMAX体験）",
    interstellar_imax: "インターステラー再上映",
  }),
];

/** 映像・エンタメ › ドラマ */
export const MEDIA_DRAMA_FINES: NestedFineDef[] = [
  withNestedFine("media:drama:japanese", "日本の連ドラ・大河", {
    nhk_taiga: "大河ドラマ通年",
    getsuku: "月9・フジ月ほかゴールデン",
    wowow: "WOWOW・サスペンス路線",
    tbs_sun: "日曜劇場・家族向け大作",
    streaming_j: "配信先行の日ドラ",
  }, {
    hanzawa: "半沢直樹",
    oshin: "おしん（古典）",
  }),
  withNestedFine("media:drama:kdrama", "韓ドラ", {
    netflix_k: "Netflix韓国オリジナル",
    chaebol: "財閥・復讐・メロドラマ",
    ost: "OST・音源チャートも追う",
    fashion: "衣装・メイク文化",
  }, {
    squid_game: "イカゲーム",
    crash_landing: "愛の不時着",
  }),
  withNestedFine("media:drama:us_uk", "海外ドラマ（米英など）", {
    cable: "HBO・ケーブル黄金期",
    sitcom: "シットコム・30分コメディ",
    prestige: "プレステージ・ミニシリーズ",
    weekly_disc: "週次ディスカッション文化",
  }, {
    breaking_bad: "ブレイキング・バッド",
    got: "ゲーム・オブ・スローンズ",
    office: "ザ・オフィス",
  }),
  withNestedFine("media:drama:streaming", "配信オリジナル（Netflix等）", {
    binge: "一気見・スポイラー管理",
    weekly_drop: "週次配信も楽しむ",
    dub_global: "吹替・字幕・多言語",
    cancel: "打ち切り・ファンキャンペーン",
  }, {
    stranger_things: "ストレンジャー・シングス",
    witcher: "ウィッチャー",
  }),
  withNestedFine("media:drama:asian", "アジア圏ドラマ", {
    taiwan: "台湾ドラマ",
    viet: "ベトナム・タイ等東南アジア",
    fusion: "日中韓合作",
    fan_sub: "ファン字幕・非公式流通の文脈",
  }, {
    meteor_garden: "流星花園（古典）",
  }),
  withNestedFine("media:drama:thai", "タイドラマ", {
    bl_thai: "タイBLブーム",
    lakorn: "ラコーン・伝統フォーマット",
    fan_meet: "ファンミーティング文化",
  }, {
    twogether: "2gether",
  }),
  withNestedFine("media:drama:cdrama", "中国ドラマ", {
    wuxia: "武侠・古装",
    xianxia: "仙侠・CG大作",
    modern_cdrama: "現代劇・職場ドラマ",
    censorship: "編集差・配信版の違いに詳しい",
  }, {
    story_yanxi: "延禧攻略",
  }),
  withNestedFine("media:drama:reality", "恋リア・サバイバル系", {
    love_real: "恋愛リアリティの倫理議論も楽しむ",
    survival_edit: "編集・悪役扱いのメタ視聴",
    vote: "視聴者投票・SNS炎上",
    global_format: "フォーマット輸入・ローカライズ",
  }, {
    terrace_house: "テラスハウス",
    single_inferno: "イカゲーム以外のサバイバル系",
  }),
];

/** 映像・エンタメ › YouTube */
export const MEDIA_YOUTUBE_FINES: NestedFineDef[] = [
  withNestedFine("media:youtube:commentary", "解説・論説", {
    longessay: "長尺エッセイ・スライド",
    debate: "討論・対談切り抜き",
    factcheck: "ファクトチェック・二次資料",
    politics: "政治・社会（立場を超えて視聴）",
  }, {
    news_depth: "ニュース深掘り系",
  }),
  withNestedFine("media:youtube:gameplay", "ゲーム実況", {
    solo: "ソロ実況・ノーカット",
    collab: "コラボ・オフライン会合",
    speedrun_yt: "RTA・検証動画",
    retro: "レトロ・縦長配信",
  }, {
    lets_play: "海外Let's Play文化",
  }),
  withNestedFine("media:youtube:vlog", "Vlog・日常", {
    daily: "日課・ルーティン",
    travel_vlog: "旅行・一人旅",
    family: "育児・カップル",
    minimalist: "ミニマル・ルームツアー",
  }, {
    room_tour: "ルームツアー",
  }),
  withNestedFine("media:youtube:cooking", "料理・グルメ", {
    recipe: "レシピ再現",
    street_food: "屋台・海外グルメ",
    asmr_cook: "音フェチ調理",
    science: "料理の科学・分子ガストロ",
  }, {
    babish: "Binging with Babish（海外例）",
  }),
  withNestedFine("media:youtube:edu", "教育・ハウツー", {
    stem: "数学・物理・プログラミング",
    language: "語学・発音",
    career: "就活・キャリア",
    history_edu: "歴史・地学マップ",
  }, {
    khan_style: "白板・スライド講義系",
  }),
  withNestedFine("media:youtube:music_cover", "音楽・カバー", {
    utaite_yt: "歌ってみた・バンドカバー",
    reaction_music: "海外の反応系",
    live_clip: "ライブ切り抜き公式／非公式",
  }, {
    first_take: "THE FIRST TAKE型フォーマット",
  }),
  withNestedFine("media:youtube:asmr", "ASMR・睡眠導入", {
    no_talking: "ノートーキング",
    roleplay: "ロールプレイ",
    sfx: "道具音・環境音",
    science_asmr: "ゾクゾクの脳科学話題",
  }, {
    tapping: "タッピング定番",
  }),
  withNestedFine("media:youtube:reaction", "リアクション・海外の反応", {
    culture_gap: "文化差コメンタリー",
    anime_react: "アニメ同時視聴",
    respect: "著作権・収益還元の話題も理解",
  }, {
    sync_watch: "同時視聴フォーマット",
  }),
  withNestedFine("media:youtube:longform", "長尺ドキュメンタリー", {
    essay_film: "エッセイ映画的长さの動画",
    investigation: "取材数年スパン",
    map_story: "地図・年表つき",
  }, {
    cold_case: "未解決事件系",
  }),
];

/** 映像・エンタメ › VTuber */
export const MEDIA_VTUBER_FINES: NestedFineDef[] = [
  withNestedFine("media:vtuber:nijisanji", "にじさんじ", {
    unit: "ユニット・にじさんじEN/JP横断",
    song: "にじさんじ楽曲・ライブ",
    goods_lottery: "くじ・グッズ戦争",
    lore: "設定・世界観厨",
  }, {
    kuzuha: "葛葉",
    kanae: "叶",
    luxiem: "Luxiem",
  }),
  withNestedFine("media:vtuber:hololive", "ホロライブ", {
    holo_en: "ホロEN・各期生",
    holo_jp: "ホロJP・伝説配信",
    holo_song: "オリ曲・ライブBlu-ray",
    expo: "EXPO・ホロフェス",
  }, {
    suisei: "星街すいせい",
    marine: "宝鐘マリン",
    pekora: "兎田ぺこら",
  }),
  withNestedFine("media:vtuber:indie", "個人勢・小箱", {
    small_corp: "小規模事務所",
    personal: "完全個人・ママ・パパ文化",
    multiverse: "他分野からの転身",
  }, {
    indie_scene: "個人勢シーン",
  }),
  withNestedFine("media:vtuber:vrchat", "VRChat・3D配信", {
    world: "ワールド探訪・イベント",
    full_body: "フルトラ・パフォーマンス",
    club: "クラブイベント・DJ",
  }, {
    vket: "バーチャルマーケット",
  }),
  withNestedFine("media:vtuber:music_3d", "3Dライブ・歌枠", {
    live_ticket: "チケット・配信アーカイブ",
    motion: "モーションキャプチャ品質",
    chorus: "合唱・コラボライブ",
  }, {
    holofes: "hololive SUPER EXPO",
  }),
  withNestedFine("media:vtuber:asmr_v", "ASMR・囁き配信", {
    binaural: "バイノーラル機材",
    scenario: "シチュエーション台本",
    boundary: "リスナー距離感の文化",
  }, {
    ear_cleaning: "耳かきロールプレイ",
  }),
  withNestedFine("media:vtuber:collab", "コラボ・凸待ち文化", {
    totsu: "凸待ちルール・マナー",
    cross_box: "他箱コラボ政治",
    tournament: "大会・マリカ杯等",
  }, {
    mario_kart_tourna: "マリカ杯系",
  }),
  withNestedFine("media:vtuber:merch", "グッズ・ボイス・課金文化", {
    voice_pack: "ボイス販売・シチュボイス",
    gacha_ichiban: "一番くじ・コンプリート",
    sc: "スパチャ文化・読み上げ",
  }, {
    birthday_goods: "誕生日グッズ",
  }),
];

/** 映像・エンタメ › バラエティ */
export const MEDIA_VARIETY_FINES: NestedFineDef[] = [
  withNestedFine("media:variety:terrestrial", "地上波バラエティ", {
    golden_time: "ゴールデン帯のレギュラー",
    marathon: "24時間テレビ・長時間特番",
    location: "ロケ・旅番組",
    quiz: "クイズ・賞金バラエティ",
  }, {
    gaki_tsuka: "ガキ使（古典）",
    vs_arashi: "VS嵐（古典）",
  }),
  withNestedFine("media:variety:comedy", "お笑い・コント", {
    manzai: "漫才・コンビ遍歴",
    conte: "コント・短尺映像",
    m1: "M-1・大会レース",
    owarai_youtube: "お笑いYouTube・独立",
  }, {
    downtown: "ダウンタウン",
  }),
  withNestedFine("media:variety:talk", "トーク・討論番組", {
    wide_show: "ワイドショー・政治討論",
    podcast_style: "ラジオ派生トーク",
    academic: "教養・識者鼎談",
  }, {
    news_station: "ニュースステーション系譜",
  }),
  withNestedFine("media:variety:docu_tv", "ドキュメンタリー番組", {
    nhk_docu: "NHKスペシャル等",
    human: "人間ドキュメンタリー",
    nature_tv: "自然大特集",
  }, {
    project_x: "プロジェクトX（古典）",
  }),
];

/** 映像・エンタメ › その他 */
export const MEDIA_OTHER_FINES: NestedFineDef[] = [
  withNestedFine("media:other:podcast", "ポッドキャスト・ラジオ", {
    commute: "通勤・作業用リスニング",
    narrative_pod: "ナラティブ・シリアル",
    tech_pod: "テック・ビジネス",
    otaku_pod: "オタク系・二次創作トーク",
  }, {
    radiko: "radiko・タイムフリー",
  }),
  withNestedFine("media:other:stage", "舞台・2.5次元", {
    ticket_lot: "チケット争奪・一般先行",
    dvd_stage: "舞台DVD・配信購入",
    actor_2_5: "俳優の横串ファン",
  }, {
    touken_ranbu: "刀剣乱舞（舞台）",
  }),
  withNestedFine("media:other:short", "ショート動画（TikTok等）", {
    algo: "アルゴリズム・FYP探求",
    trend_dance: "トレンドダンス・音源",
    commerce: "ショートコマース",
  }, {
    tiktok_jp: "TikTok JP文化",
  }),
  withNestedFine("media:other:figure_photo", "フィギュア・撮影・推し活", {
    lighting: "ライティング・撮影棚",
    diorama: "ジオラマ・背景ボード",
    import: "海外取寄・関税",
  }, {
    nendoroid: "ねんどろいど",
  }),
  withNestedFine("media:other:seiyuu_radio", "声優ラジオ・ポッドキャスト", {
    mail: "お便り・公開収録",
    event_reading: "朗読・リーディング",
    unit_radio: "ユニット番組",
  }, {
    agson: "AGSON系譜",
  }),
];
