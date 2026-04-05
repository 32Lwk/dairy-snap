import { withNestedFine, type NestedFineDef } from "./interest-taxonomy-nested";

/** スポーツ › サッカー */
export const SPORTS_SOCCER_FINES: NestedFineDef[] = [
  withNestedFine("sports:soccer:jleague", "Jリーグ", {
    away_tour: "アウェイ遠征・スタグル",
    ultras: "ウルトラス・チャント（文化理解）",
    youth_jleague: "U-18・育成契約",
    acl: "ACL・国際クラブ",
  }, {
    marinos: "横浜F・マリノス",
    antlers: "鹿島アントラーズ",
    frontale: "川崎フロンターレ",
  }),
  withNestedFine("sports:soccer:national", "日本代表（サムライブルー）", {
    wcq: "W杯予選・組み合わせ",
    kit: "ユニ・スポンサー",
    dual_national: "二重国籍・代表選択の話題",
  }, {
    world_cup_2022: "カタールW杯",
  }),
  withNestedFine("sports:soccer:barcelona", "FCバルセロナ", {
    mes_que: "メス・ケ・ウン・クラブ",
    la_masia: "ラ・マシア育成",
    camp_nou: "カンプノウ改修・仮ホーム",
  }, {
    messi_era: "メッシ時代",
    yamal: "ラミン・ヤマル世代",
  }),
  withNestedFine("sports:soccer:real", "レアル・マドリード", {
    galactico: "ガラクティコ政策",
    ucl_kings: "UCL・王者の自負",
  }, {
    cristiano_era: "C・ロナウド時代",
  }),
  withNestedFine("sports:soccer:premier", "プレミアリーグ", {
    big_six: "ビッグ6・争奪戦",
    saturday_night: "深夜キックオフ視聴",
  }, {
    man_city: "マンチェスター・シティ",
    liverpool: "リヴァプール",
  }),
  withNestedFine("sports:soccer:laliga", "ラ・リーガ", {
    el_clasico: "クラシコ文化",
    cantera: "カンテラ育成",
  }, {
    barca_real: "バルサ×レアル",
  }),
  withNestedFine("sports:soccer:seriea", "セリエA", {
    catenaccio: "守備美学・戦術史",
    ultras_ita: "イタリア・ウルトラ文化（理解）",
  }, {
    milan: "ACミラン",
    inter: "インテル",
  }),
  withNestedFine("sports:soccer:bundesliga", "ブンデスリーガ", {
    fifty_one: "50+1ルール",
    standing: "スタンディング文化",
  }, {
    bayern: "バイエルン",
    dortmund: "ドルトムント",
  }),
  withNestedFine("sports:soccer:ucl", "チャンピオンズリーグ", {
    away_goals: "アウェーゴール廃止後の読み",
    anthem: "アンセム・ナイター",
  }, {
    final_ucl: "決勝ナイター",
  }),
  withNestedFine("sports:soccer:jfa_cup", "天皇杯・ルヴァンカップ", {
    giant_killing: "ジャイアントキリング",
    levain_format: "ルヴァン形式理解",
  }, {
    emperor_final: "天皇杯決勝",
  }),
  withNestedFine("sports:soccer:futsal", "フットサル", {
    indoor: "室内コート・靴",
    national_futsal: "日本代表（フットサル）",
  }, {
    futsal_world: "Fリーグ",
  }),
  withNestedFine("sports:soccer:grassroots", "地域リーグ・サークル", {
    weekend: "週末リーグ・仕事との両立",
    mix: "ミックス・男女",
  }, {
    shakaijin: "社会人リーグ",
  }),
  withNestedFine("sports:soccer:womens", "女子サッカー・WEリーグ", {
    we_league: "WEリーグ・プロ化",
    nadeshiko: "なでしこJAPAN",
  }, {
    nadeshiko_final: "W杯なでしこ優勝（2011）",
  }),
  withNestedFine("sports:soccer:youth_jfa", "ユース・JFA系育成", {
    high_school: "高校サッカーとの接続",
    jfa_academy: "JFAアカデミー",
  }, {
    prince_takamado: "高円宮杯",
  }),
  withNestedFine("sports:soccer:europa", "ヨーロッパリーグ・EL", {
    coefficient: "係数・出場権",
    thursday: "木曜ナイト",
  }, {
    sevilla_el: "セビージャEL伝説",
  }),
];

/** スポーツ › 野球 */
export const SPORTS_BASEBALL_FINES: NestedFineDef[] = [
  withNestedFine("sports:baseball:npb", "プロ野球（NPB）", {
    pennant: "ペナント・CS",
    farm: "ファーム・育成契約",
    interleague: "交流戦",
  }, {
    giants: "読売ジャイアンツ",
    hawks: "ソフトバンクホークス",
  }),
  withNestedFine("sports:baseball:central", "セ・リーグ中心", {
    kyojin_hanshin: "巨神戦の歴史",
    hiroshima_carp: "カープ赤文化",
  }, {
    carp: "広島東洋カープ",
  }),
  withNestedFine("sports:baseball:pacific", "パ・リーグ中心", {
    pacific_pitch: "投手有利説・DH",
    lions_eagles: "ライオンズ・イーグルス史",
  }, {
    lions: "埼玉西武ライオンズ",
  }),
  withNestedFine("sports:baseball:koshien", "甲子園・高校野球", {
    brass: "ブラスバンド・応援文化",
    seeding: "組み合わせ・シード",
    summer_winter: "夏・春の違い",
  }, {
    koshien_stadium: "阪神甲子園球場",
  }),
  withNestedFine("sports:baseball:mlb", "MLB", {
    saber_mlb: "Statcast・データ",
    shohei: "二刀流文化の理解",
  }, {
    dodgers: "ドジャース",
    yankees: "ヤンキース",
  }),
  withNestedFine("sports:baseball:indie", "独立リーグ・育成", {
    draft_route: "育成からのドラフト",
    regional_fan: "地域密着",
  }, {
    bc_league: "BCリーグ",
  }),
  withNestedFine("sports:baseball:grass", "草野球・軟式", {
    beer_after: "試合後のビール文化",
    weekend_morning: "早朝・炎天下",
  }, {
    shakaijin_bb: "社会人野球",
  }),
  withNestedFine("sports:baseball:youth", "少年野球", {
    parent: "保護者・マナー議論",
    pitch_count: "球数制限",
  }, {
    little_sen: "リトルシニア",
  }),
  withNestedFine("sports:baseball:stadium", "球場観戦・スタグル", {
    seat_type: "外野・内野・ネット裏",
    dome_vs: "ドーム・天然芝",
  }, {
    tokyo_dome: "東京ドーム",
  }),
  withNestedFine("sports:baseball:wbc", "WBC・国際大会", {
    samurai_japan: "侍ジャパン編成論",
    pitch_limit_wbc: "投手起用議論",
  }, {
    wbc_2023: "WBC2023",
  }),
  withNestedFine("sports:baseball:sabermetrics", "データ・セイバーメトリクス", {
    war: "WAR・期待値",
    spin: "スピンレート",
  }, {
    fangraphs: "FanGraphs文化",
  }),
  withNestedFine("sports:baseball:npb_draft", "ドラフト・育成・ファーム注視", {
    ikusei: "育成選手制度",
    posting: "ポスティング",
  }, {
    draft_meeting: "ドラフト会議",
  }),
];

/** スポーツ › テニス */
export const SPORTS_TENNIS_FINES: NestedFineDef[] = [
  withNestedFine("sports:tennis:grand_slam", "四大大会", {
    surface: "芝・クレー・ハードの違い",
    seed: "シード・ドロー",
  }, {
    wimbledon: "ウィンブルドン",
    roland_garros: "ローラン・ギャロス",
  }),
  withNestedFine("sports:tennis:atp_wta", "ATP / WTAツアー", {
    masters: "マスターズ1000",
    race: "ファイナルズ争い",
  }, {
    atp_finals: "ATPファイナルズ",
  }),
  withNestedFine("sports:tennis:japan_open", "ジャパンオープン等国内大会", {
    venue: "有明・地方大会",
  }, {
    japan_open_tokyo: "ジャパンオープン",
  }),
  withNestedFine("sports:tennis:recreational", "スクール・趣味（硬式・軟式）", {
    string: "ガット・テンション",
    ntrp: "NTRP自己評価",
  }, {
    soft_tennis: "ソフトテニス",
  }),
];

/** スポーツ › バレー */
export const SPORTS_VOLLEYBALL_FINES: NestedFineDef[] = [
  withNestedFine("sports:volleyball:vleague", "V.LEAGUE", {
    v1_men_women: "V1男女",
    sponsor: "企業スポーツ文化",
  }, {
    panasonic_panthers: "パナソニックパンサーズ",
  }),
  withNestedFine("sports:volleyball:national", "全日本・代表戦", {
    ryujin: "龍神NIPPON",
    hirai: "火の鳥NIPPON",
  }, {
    olympic_vb: "五輪バレー",
  }),
  withNestedFine("sports:volleyball:beach", "ビーチバレー", {
    fivb: "FIVBツアー",
    sand: "砂・足元",
  }, {
    beach_olympic: "ビーチ五輪",
  }),
  withNestedFine("sports:volleyball:club", "部活・サークル", {
    rotation: "ローテ・レセプション",
  }, {
    inter_high_vb: "インターハイ",
  }),
];

/** スポーツ › バスケ */
export const SPORTS_BASKETBALL_FINES: NestedFineDef[] = [
  withNestedFine("sports:basketball:b_league", "Bリーグ", {
    b1_b2: "B1・B2・入れ替え",
    arena: "アリーナ文化・MC",
  }, {
    alvark: "アルバルク東京",
    ryukyu: "琉球ゴールデンキングス",
  }),
  withNestedFine("sports:basketball:nba", "NBA", {
    salary_cap: "サラキャップ・トレード",
    playoffs_nba: "プレーオフ形式",
  }, {
    lakers: "レイカーズ",
    warriors: "ウォリアーズ",
  }),
  withNestedFine("sports:basketball:wintercup", "ウインターカップ・高校", {
    kanagawa: "神奈川・強豪県",
    winter_ekiden_cross: "冬の名物大会",
  }, {
    winter_cup: "ウインターカップ",
  }),
  withNestedFine("sports:basketball:street", "3x3・ストリート", {
    olympic_3x3: "3x3五輪",
    ball_handling: "ハンドリング文化",
  }, {
    street_ball: "ストリートボール",
  }),
];

/** スポーツ › クリケット */
export const SPORTS_CRICKET_FINES: NestedFineDef[] = [
  withNestedFine("sports:cricket:ipl", "IPL・T20 リーグ", {
    auction: "オークション・スカッド",
    t20_strategy: "パワープレー理解",
  }, {
    mumbai_indians: "ムンバイ・インディアンス",
  }),
  withNestedFine("sports:cricket:test", "テストクリケット", {
    ashes: "アッシュズ",
    five_day: "5日間文化",
  }, {
    test_cricket: "テストマッチ",
  }),
  withNestedFine("sports:cricket:wc", "ワールドカップ", {
    odi_t20: "ODIとT20W杯の違い",
  }, {
    cricket_world_cup: "クリケットW杯",
  }),
  withNestedFine("sports:cricket:japan", "国内クラブ・日本代表", {
    jca: "日本クリケット協会",
  }, {
    japan_cricket: "日本代表",
  }),
  withNestedFine("sports:cricket:grassroots", "草の根・社会人", {
    expat: "在留外国人チームとの交流",
  }, {
    club_cricket: "クラブクリケット",
  }),
];

/** スポーツ › ランニング */
export const SPORTS_RUNNING_FINES: NestedFineDef[] = [
  withNestedFine("sports:running:marathon", "フル・ハーフマラソン", {
    sub3: "サブ3・サブ4等目標",
    carbon: "カーボンプレート",
  }, {
    tokyo_marathon: "東京マラソン",
    boston_marathon: "ボストンマラソン",
  }),
  withNestedFine("sports:running:ekiden", "駅伝", {
    hakone: "箱根駅伝",
    all_japan: "全日本大学駅伝",
  }, {
    hakone_ekiden: "箱根駅伝",
  }),
  withNestedFine("sports:running:trail", "トレイル・山", {
    utmb: "UTMB・海外大会",
    vertical: "登攀・垂直",
  }, {
    utmb: "UTMB",
  }),
  withNestedFine("sports:running:funrun", "ファンラン・ジョギング", {
    couch: "ゼロから始める",
    parkrun: "Parkrun文化",
  }, {
    color_run: "カラーラン",
  }),
];

/** スポーツ › 水泳 */
export const SPORTS_SWIMMING_FINES: NestedFineDef[] = [
  withNestedFine("sports:swimming:pool", "プール・競泳", {
    stroke: "四種目・IM",
    tech_suit: "高速水着・ルール",
  }, {
    kosuke_hagino: "萩野公介世代",
  }),
  withNestedFine("sports:swimming:openwater", "オープンウォーター", {
    navigation: "コース取り",
  }, {
    openwater_10k: "10kmOW",
  }),
  withNestedFine("sports:swimming:masters", "マスターズ", {
    age_group: "年齢別",
  }, {
    masters_swim: "マスターズ水泳",
  }),
];

/** スポーツ › 格闘技 */
export const SPORTS_MARTIAL_FINES: NestedFineDef[] = [
  withNestedFine("sports:martial:boxing", "ボクシング", {
    weight_class: "階級・減量",
    four_org: "四団体統一",
  }, {
    pacquiao: "パッキャオ",
  }),
  withNestedFine("sports:martial:mma", "MMA・総合", {
    ufc: "UFC・契約",
    ground: "グラウンド・関節技",
  }, {
    ufc_japan: "UFC日本大会",
  }),
  withNestedFine("sports:martial:judo", "柔道", {
    ippon: "一本・審判",
    olympic_judo: "五輪柔道",
  }, {
    tokyo_olympic_judo: "東京五輪柔道",
  }),
  withNestedFine("sports:martial:karate", "空手", {
    kata: "形・組手",
    olympic_karate: "五輪空手（歴史）",
  }, {
    k1_karate: "K-1×空手系譜",
  }),
  withNestedFine("sports:martial:prowrestling", "プロレス", {
    puro: "日本プロレス史",
    sports_ent: "スポーツエンターテインメント",
  }, {
    njpw: "新日本プロレス",
    aew: "AEW",
  }),
  withNestedFine("sports:martial:k1_rizin", "キック・RIZIN 等", {
    rizin_rules: "RIZINルール変遷",
    k1_classic: "K-1 CLASSIC",
  }, {
    rizin: "RIZIN",
  }),
  withNestedFine("sports:martial:fencing", "フェンシング", {
    foil_epee: "フォイル・エペ・サーブル",
  }, {
    olympic_fence: "五輪フェンシング",
  }),
];

/** スポーツ › 相撲 */
export const SPORTS_SUMO_FINES: NestedFineDef[] = [
  withNestedFine("sports:sumo:makuuchi", "幕内・優勝争い", {
    yusho: "優勝・プレーオフ",
    kimarite: "決まり手の美学",
  }, {
    honbasho: "本場所",
  }),
  withNestedFine("sports:sumo:juryo_mae", "十両以下・序ノ口まで追う", {
    sandanme: "三段目・序二段",
    kesho: "化粧まわし",
  }, {
    jonidan: "序ノ口",
  }),
  withNestedFine("sports:sumo:hensho", "巡業・地方場所", {
    fan_meet: "ファンサービス",
  }, {
    jungyo: "巡業",
  }),
  withNestedFine("sports:sumo:ozumo_culture", "番付・行司・文化史", {
    banzuke: "番付・墨書き",
    gyoji: "行司・塩",
  }, {
    kokugikan: "両国国技館",
  }),
];

/** スポーツ › ラグビー */
export const SPORTS_RUGBY_FINES: NestedFineDef[] = [
  withNestedFine("sports:rugby:univ", "大学ラグビー・早慶等", {
    all_japan_univ: "全国大学選手権",
  }, {
    keio_waseda: "早慶戦",
  }),
  withNestedFine("sports:rugby:league_one", "リーグワン・トップリーグ系", {
    division: "ディビジョン制",
  }, {
    brave_blossoms: "リーグワン代表経由",
  }),
  withNestedFine("sports:rugby:national", "日本代表（チェリー）", {
    rwc_japan: "W杯日本開催の記憶",
  }, {
    rwc_2019: "RWC2019",
  }),
  withNestedFine("sports:rugby:wc", "ワールドカップ", {
    pool: "プール戦・ボーナスポイント",
  }, {
    webb_ellis: "ウェッブエリス杯",
  }),
];

/** スポーツ › バドミントン */
export const SPORTS_BADMINTON_FINES: NestedFineDef[] = [
  withNestedFine("sports:badminton:international", "世界選手権・BWFツアー", {
    super_series: "スーパーシリーズ",
  }, {
    axelsen: "アクセルセン",
  }),
  withNestedFine("sports:badminton:domestic", "国内リーグ・全日本", {
    s_j_league: "S/Jリーグ",
  }, {
    all_japan_badminton: "全日本総合",
  }),
  withNestedFine("sports:badminton:club", "サークル・趣味", {
    feather: "シャトル・ガット",
  }, {
    weekend_badminton: "市民大会",
  }),
];

/** スポーツ › 卓球 */
export const SPORTS_TABLE_TENNIS_FINES: NestedFineDef[] = [
  withNestedFine("sports:table_tennis:world", "WTT・世界大会", {
    china_dominance: "中国選手の戦術美",
  }, {
    wtt_finals: "WTT Finals",
  }),
  withNestedFine("sports:table_tennis:t_league", "Tリーグ", {
    team_tt: "チーム戦・ホーム",
  }, {
    t_league_jp: "Tリーグ",
  }),
  withNestedFine("sports:table_tennis:penhold", "プレー・ラバー探求", {
    rubber: "表ソフト・粘着",
  }, {
    ma_long: "馬龍（参考選手）",
  }),
];

/** スポーツ › スケート */
export const SPORTS_SKATE_FINES: NestedFineDef[] = [
  withNestedFine("sports:skate:figure", "フィギュアスケート", {
    isu: "採点・ルール改定史",
    jump: "4回転論争",
  }, {
    yuzuru_hanyu: "羽生結弦",
  }),
  withNestedFine("sports:skate:speed", "スピードスケート", {
    mass_start: "マススタート",
  }, {
    olympic_speed: "五輪スピード",
  }),
  withNestedFine("sports:skate:hockey", "アイスホッケー", {
    nhl: "NHL時間帯視聴",
  }, {
    nhl: "NHL",
  }),
];

/** スポーツ › 体操 */
export const SPORTS_GYMNASTICS_FINES: NestedFineDef[] = [
  withNestedFine("sports:gymnastics:artistic", "体操・種目別", {
    code_points: "コード・難度",
  }, {
    olympic_gym: "五輪体操",
  }),
  withNestedFine("sports:gymnastics:rhythmic", "新体操", {
    apparatus: "具・リボン",
  }, {
    rhythmic_olympic: "新体操五輪",
  }),
  withNestedFine("sports:gymnastics:trampoline", "トランポリン", {
    sync: "シンクロ",
  }, {
    trampoline_olympic: "トランポリン五輪",
  }),
];

/** スポーツ › モーター */
export const SPORTS_MOTOR_FINES: NestedFineDef[] = [
  withNestedFine("sports:motor:f1", "F1", {
    regs: "レギュレーション・予算上限",
    strategy: "タイヤ・ピット戦略",
  }, {
    verstappen: "マックス・フェルスタッペン",
    hamilton: "ルイス・ハミルトン",
  }),
  withNestedFine("sports:motor:moto_gp", "MotoGP・バイクレース", {
    moto2_3: "Moto2・3",
  }, {
    marquez: "マルケス",
  }),
  withNestedFine("sports:motor:super_gt", "SUPER GT・国内四輪", {
    gt500_300: "GT500・GT300",
  }, {
    super_gt_fuji: "富士スピードウェイ",
  }),
  withNestedFine("sports:motor:rally", "ラリー・ダート", {
    wrc: "WRC",
    safety_crew: "クルー・安全",
  }, {
    wrc: "WRC",
  }),
];

/** スポーツ › サーフィン */
export const SPORTS_SURF_FINES: NestedFineDef[] = [
  withNestedFine("sports:surf:short", "ショートボード", {
    aerial: "エア・リップ",
  }, {
    wsl: "WSL",
  }),
  withNestedFine("sports:surf:long", "ロングボード", {
    nose_ride: "ノーズライディング",
  }, {
    malibu_style: "マリブスタイル",
  }),
  withNestedFine("sports:surf:sup_wing", "SUP・ウィングフォイル", {
    flat_water: "平地・海況",
  }, {
    sup_race: "SUPレース",
  }),
];

/** スポーツ › その他 */
export const SPORTS_OTHER_FINES: NestedFineDef[] = [
  withNestedFine("sports:other:golf", "ゴルフ", {
    handicap: "ハンデ・基準",
    major: "メジャー4大会",
  }, {
    masters: "マスターズ",
  }),
  withNestedFine("sports:other:winter", "スキー・スノボ・冬山", {
    powder: "パウダー・バックカントリー",
    safety_snow: "雪崩・装備",
  }, {
    niseko: "ニセコ",
  }),
  withNestedFine("sports:other:equestrian", "馬術・競馬観戦", {
    horse_racing: "中央・地方競馬",
    dressage: "馬術競技",
  }, {
    japan_cup: "ジャパンカップ",
  }),
  withNestedFine("sports:other:triathlon", "トライアスロン・鉄人", {
    ironman: "アイアンマン",
  }, {
    ironman_kona: "コナ",
  }),
  withNestedFine("sports:other:esports_watch", "eスポーツ観戦（競技側）", {
    stadium_esports: "会場観戦",
  }, {
    lol_worlds: "LoL Worlds",
  }),
  withNestedFine("sports:other:watching", "観戦オールラウンド", {
    multi_sport: "何でも観る",
  }, {
    olympic_multi: "五輪総合",
  }),
];
