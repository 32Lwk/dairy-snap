import { withNestedFine, type NestedFineDef } from "./interest-taxonomy-nested";

/** ゲーム › 家庭用 */
export const GAMES_CONSOLE_FINES: NestedFineDef[] = [
  withNestedFine("games:console:ps", "PlayStation", {
    ps_plus: "PS Plus・フリープレイ",
    exclusive: "独占タイトル・第一方",
    dualsense: "DualSense・触覚フィードバック",
    region: "リージョン・アカウント分割",
    platinum: "プラチナトロフィー・コンプ",
  }, {
    gow_ragnarok: "God of War Ragnarök",
    ff16: "FINAL FANTASY XVI",
    persona: "ペルソナシリーズ",
  }),
  withNestedFine("games:console:nintendo", "Nintendo Switch", {
    portable: "携帯モード中心",
    dock: "ドック・プロコン",
    family: "ファミリー・同梱ソフト",
    limited: "限定モデル・コレクター",
  }, {
    zelda_totk: "ゼルダの伝説 TotK",
    mario_kart: "マリオカート8DX",
    splatoon: "スプラトゥーン3",
  }),
  withNestedFine("games:console:xbox", "Xbox", {
    game_pass: "Game Pass・クラウド",
    back_compat: "後方互換・FPSブースト",
    elite: "Eliteコントローラー",
    pc_bridge: "PC／Xboxクロスセーブ",
  }, {
    starfield: "Starfield",
    halo: "Halo",
  }),
  withNestedFine("games:console:retro", "レトロ・ミニコン", {
    mini_hw: "ミニハード・純正エミュ",
    crt: "ブラウン管・スキャンライン",
    import: "海外ROM・変換",
    preservation: "アーカイブ・保存版",
  }, {
    snes_mini: "スーファミミニ",
  }),
  withNestedFine("games:console:jrpg", "JRPG・RPG", {
    turn: "ターン制・コマンド",
    action_rpg: "アクションRPG寄り",
    story_heavy: "シナリオ・演出重視",
    grinding: "育成・周回・隠しボス",
  }, {
    ff7_rebirth: "FF7リバース",
    trails: "軌跡シリーズ",
  }),
  withNestedFine("games:console:action", "アクション・アドベンチャー", {
    combo: "コンボ・フレーム研究",
    exploration: "探索・収集要素",
    stealth: "ステルス路線",
  }, {
    gow: "God of War",
    uncharted: "アンチャーテッド",
  }),
  withNestedFine("games:console:open_world", "オープンワールド・探索", {
    map_clean: "マップコンプ・？マーク",
    photo: "フォトモード",
    mod_console: "コンソールMod（環境次第）",
  }, {
    elden: "エルデンリング",
    botw: "BotW",
  }),
  withNestedFine("games:console:fromsoftware", "ソウルライク・高難度アクション", {
    soul: "死にゲー耐性・学習曲線",
    lore: "アイテム説明・環境語り",
    pvp: "侵入・闘技場",
    no_hit: "ノーダメ・制限プレイ",
  }, {
    dark_souls: "DARK SOULS",
    sekiro: "SEKIRO",
    bloodborne: "Bloodborne",
  }),
];

/** ゲーム › PC */
export const GAMES_PC_FINES: NestedFineDef[] = [
  withNestedFine("games:pc:steam", "Steam 中心", {
    sale: "セール・ウィッシュリスト",
    deck: "Steam Deck",
    workshop: "ワークショップMod",
    refund: "返金ポリシー活用",
  }, {
    baldurs_gate3: "Baldur's Gate 3",
    elden_steam: "ELDEN RING（Steam）",
  }),
  withNestedFine("games:pc:fps", "FPS・TPS", {
    comp: "ランク・eスポーツ志向",
    aim: "エイム練習・感度設定",
    anticheat: "チート対策・公平性",
  }, {
    cs2: "Counter-Strike 2",
    apex_pc: "Apex Legends",
  }),
  withNestedFine("games:pc:moba", "MOBA", {
    lane: "レーン・ロール専門",
    meta: "パッチノート・Tierリスト",
    toxicity: "コミュニティ文化への理解",
  }, {
    dota2: "Dota 2",
    lol_pc: "LoL",
  }),
  withNestedFine("games:pc:mmo", "MMO・オンラインRPG", {
    raid: "レイド・固定",
    economy: "経済・ギルド政治",
    fashion: "ミラプリ・コス重視",
  }, {
    ffxiv: "FFXIV",
    wow: "World of Warcraft",
  }),
  withNestedFine("games:pc:indie", "インディーゲーム", {
    itch: "itch.io・バンドル",
    pixel: "ドット絵・小チーム美学",
    narrative_indie: "ナラティブインディー",
  }, {
    hades: "Hades",
    hollow_knight: "Hollow Knight",
  }),
  withNestedFine("games:pc:sim", "シミュ・建設・4X", {
    factorio: "工場・最適化脳",
    city_builder: "都市・交通計画",
    grand_strategy: "大局・外交",
  }, {
    cities_skylines: "Cities: Skylines",
    stellaris: "Stellaris",
  }),
  withNestedFine("games:pc:strategy", "RTS・ターン制ストラテジー", {
    apm: "APM・マイクロ",
    tbs: "ターン制・雪崩式",
    esports_rts: "観戦・リプレイ文化",
  }, {
    aoe4: "Age of Empires IV",
    civ: "シヴィライゼーション",
  }),
  withNestedFine("games:pc:deckbuilder", "デッキ構築・カードローグ", {
    rng: "RNG耐性・スリーブ運",
    build_craft: "シナジー構築",
  }, {
    slay_spire: "Slay the Spire",
    balatro: "Balatro",
  }),
];

/** ゲーム › スマホ */
export const GAMES_MOBILE_FINES: NestedFineDef[] = [
  withNestedFine("games:mobile:gacha", "ソシャゲ・ガチャ", {
    pity: "天井・確率・石管理",
    waifu_meta: "キャラ愛・メタの板挟み",
    daily: "デイリー・労働感の自己管理",
    whale_f2p: "課金倫理・F2P美学",
  }, {
    genshin: "原神",
    uma: "ウマ娘",
    priconne: "プリンセスコネクト",
  }),
  withNestedFine("games:mobile:puzzle", "パズル・カジュアル", {
    match3: "マッチ3・課金ステージ",
    brain: "脳トレ・論理",
  }, {
    sudoku_app: "数独・定番パズル",
  }),
  withNestedFine("games:mobile:idle", "放置・育成", {
    offline: "オフライン報酬",
    minmax_idle: "効率シミュレーション",
  }, {
    cookie_clicker: "クッキークリッカー系",
  }),
  withNestedFine("games:mobile:rhythm", "リズムゲーム", {
    finger: "指押し・判定調整",
    sekai: "プロセカ等の音ゲー文化",
  }, {
    project_sekai: "プロジェクトセカイ",
    bandori_m: "バンドリ！モバイル",
  }),
  withNestedFine("games:mobile:party", "パーティー・対戦", {
    local_bt: "ローカル通信・対面",
    voice_chat: "ボイチャ文化",
  }, {
    mario_kart_tour: "マリオカート ツアー",
  }),
  withNestedFine("games:mobile:puzzle_deep", "パズル沼・脳トレ", {
    hard_logic: "高難度論理",
    community_level: "ユーザー作成ステージ",
  }, {
    witness_style: "オープンワールドパズル系",
  }),
];

/** ゲーム › ボドゲ */
export const GAMES_BOARD_FINES: NestedFineDef[] = [
  withNestedFine("games:board:euro", "ユーロゲーム", {
    points_soup: "点数細工・エンジン構築",
    low_luck: "低ランダム性志向",
    bgg: "BoardGameGeek・重ゲー会",
  }, {
    catan: "カタン",
    wingspan: "ウイングスパン",
  }),
  withNestedFine("games:board:ameritrash", "アメリカン・重厚系", {
    mini: "ミニチュア・ペイント",
    long_play: "半日プレイ",
    narrative_bd: "キャンペーン・物語",
  }, {
    gloomhaven: "グルームヘイヴン",
  }),
  withNestedFine("games:board:party_bg", "パーティー・軽量", {
    hidden_role: "人狼系・正体隠匿",
    dexterity: "手先・反射系",
  }, {
    codenames: "コードネーム",
  }),
  withNestedFine("games:board:shogi_go", "将棋・囲碁・チェス", {
    shogi_pro: "棋戦・棋士推し",
    go_ai: "囲碁AI・定石研究",
    chess_rapid: "ブリッツ・チェス",
  }, {
    meijin: "名人戦（将棋）",
  }),
];

/** ゲーム › TCG */
export const GAMES_TCG_FINES: NestedFineDef[] = [
  withNestedFine("games:tcg:pokemon", "ポケカ", {
    standard: "スタンダード回し",
    collection: "コレクション・未開封",
    judge: "ルール・ジャッジ志向",
  }, {
    pikachu: "ピカチュウプロモ",
    charizard: "リザードン",
  }),
  withNestedFine("games:tcg:onepiece", "ワンピースカード", {
    leader: "リーダー構築・メタ",
    championship: "大会・CS",
  }, {
    luffy: "ルフィリーダー",
  }),
  withNestedFine("games:tcg:magic", "マジック：ザ・ギャザリング", {
    commander: "統率者・マルチ",
    draft: "ドラフト・シールド",
    legacy: "レガシー・ヴィンテージ",
  }, {
    black_lotus: "ブラックロータス（文化）",
  }),
  withNestedFine("games:tcg:yugioh", "遊戯王", {
    master_duel: "マスターデュエル・OCG",
    combo_ygo: "コンボ・FTK文化の理解",
  }, {
    blue_eyes: "青眼の白龍",
  }),
  withNestedFine("games:tcg:ws", "ヴァイス・他IP系", {
    signed: "サイン・SP",
    waifu_deck: "推しデッキ",
  }, {
    hololive_ws: "ホロライブWS",
  }),
  withNestedFine("games:tcg:digimon", "デジモンカード", {
    memory_gauge: "メモリーゲージ理解",
    bt_meta: "BT環境",
  }, {
    agumon: "アグモン",
  }),
  withNestedFine("games:tcg:shadowverse", "Shadowverse EVOLVE 等", {
    rotate: "ローテ・環境",
    evo_line: "進化ライン構築",
  }, {
    sv_evolve: "シャドバEVOLVE",
  }),
];

/** ゲーム › eスポーツ */
export const GAMES_ESPORTS_FINES: NestedFineDef[] = [
  withNestedFine("games:esports:lol", "LoL", {
    rank: "ランク・ロール専",
    worlds: "Worlds・メタ読み",
    lck_lpl: "海外リーグ視聴",
  }, {
    faker: "Faker",
    t1: "T1",
  }),
  withNestedFine("games:esports:valorant", "VALORANT", {
    agent: "エージェントプール",
    vct: "VCT・国際大会",
  }, {
    champions_tour: "Champions",
  }),
  withNestedFine("games:esports:apex", "Apex 等バトロワ", {
    algs: "ALGS・プロシーン",
    movement: "ムーブメント技術",
  }, {
    apex_pred: "プレデター帯",
  }),
  withNestedFine("games:esports:ow", "Overwatch 系", {
    role_queue: "ロールキュー・OWCS",
    lore_ow: "世界観・短編アニメ",
  }, {
    ow2: "Overwatch 2",
  }),
  withNestedFine("games:esports:smash", "スマブラ・対戦会", {
    local_smash: "対戦会・オフライン",
    ultimate_meta: "スマSPメタ",
  }, {
    evo_smash: "EVO（スマブラ）",
  }),
  withNestedFine("games:esports:sf6", "スト6・格ゲー大会", {
    combo_sf: "コンボ・ドライブ",
    cpt: "CPT・世界大会",
  }, {
    evo_sf: "EVO（スト）",
  }),
  withNestedFine("games:esports:watch", "大会観戦・配信", {
    co_stream: "同時視聴・解説配信",
    stats: "スタッツ・ピックバン分析",
  }, {
    twitch_esports: "Twitch公式",
  }),
];

/** ゲーム › 対戦格闘 */
export const GAMES_FIGHTING_FINES: NestedFineDef[] = [
  withNestedFine("games:fighting:street_fighter", "ストリートファイター", {
    frame: "フレーム・確反",
    modern_classic: "モダン・クラシック操作",
  }, {
    ryu: "リュウ",
    chunli: "春麗",
  }),
  withNestedFine("games:fighting:tekken", "鉄拳", {
    movement_3d: "横移動・壁コンボ",
    korean_backdash: "バックダッシュ文化",
  }, {
    mishima: "三島家",
  }),
  withNestedFine("games:fighting:ggst", "ギルティギア等アーク", {
    roman_cancel: "ロマキャン・システム深掘り",
    music_arc: "サウンドトラック崇拝",
  }, {
    sol_badguy: "ソル＝バッドガイ",
  }),
  withNestedFine("games:fighting:local", "対戦会・コミュニティ", {
    offline_first: "オフライン至上主義",
    beginner_welcome: "初心者歓迎会",
  }, {
    fighting_game_community: "格ゲコミュニティ",
  }),
];

/** ゲーム › ホラー */
export const GAMES_HORROR_FINES: NestedFineDef[] = [
  withNestedFine("games:horror:psychological", "サイコ・探索ホラー", {
    walking_sim: "ウォーキングシム",
    sanity: "正気度・演出依存",
  }, {
    silent_hill: "サイレントヒル",
    layers_of_fear: "Layers of Fear",
  }),
  withNestedFine("games:horror:action", "バイオ等アクションホラー", {
    resource: "弾薬・インベントリ管理",
    speedrun_horror: "RTAでもホラー",
  }, {
    re4: "バイオRE4",
  }),
  withNestedFine("games:horror:indie", "インディーホラー", {
    streamer_bait: "配信向けジャンプスケア",
    analog: "アナログホラー・VHS",
  }, {
    outlast: "Outlast",
    phasmophobia: "Phasmophobia",
  }),
];

/** ゲーム › ノベル */
export const GAMES_VN_FINES: NestedFineDef[] = [
  withNestedFine("games:visual_novel:galge", "ギャルゲー・恋愛ADV", {
    route: "ルート分岐・攻略順",
    voice_skip: "フルボイス・スキップ文化",
  }, {
    clannad: "CLANNAD",
    steins_gate: "STEINS;GATE",
  }),
  withNestedFine("games:visual_novel:mystery", "推理・サスペンスADV", {
    logic: "論理パート・矛盾探し",
    bad_end: "バッドエンド収集",
  }, {
    danganronpa: "ダンガンロンパ",
    ace_attorney: "逆転裁判",
  }),
  withNestedFine("games:visual_novel:kinetic", "キネティック・読み物系", {
    no_branch: "分岐なし没入",
    ebook_like: "電子書籍的読み方",
  }, {
    house_fata: "ファタモルガーナの館",
  }),
];

/** ゲーム › RTA */
export const GAMES_SPEEDRUN_FINES: NestedFineDef[] = [
  withNestedFine("games:speedrun:any", "Any%・タイムアタック", {
    pb: "自己ベスト更新",
    wr: "世界記録追跡",
  }, {
    sm64: "スーパーマリオ64",
  }),
  withNestedFine("games:speedrun:glitch", "バグ技・理論値", {
    tas: "TAS・人間理論値",
    patch_diff: "バージョン差",
  }, {
    zelda_oob: "ゼルダOOB系",
  }),
  withNestedFine("games:speedrun:community", "大会・コミュニティ", {
    gdq: "GDQ・チャリティ",
    marathon_jp: "日本マラソン会",
  }, {
    agdq: "AGDQ",
  }),
];

/** ゲーム › その他 */
export const GAMES_OTHER_FINES: NestedFineDef[] = [
  withNestedFine("games:other:vr", "VR・MR", {
    comfort: "酔い対策・テレポ移動",
    fitness_vr: "フィットネスVR",
  }, {
    beat_saber: "Beat Saber",
  }),
  withNestedFine("games:other:arcade", "アーケード・メダル", {
    rhythm_arcade: "音ゲー筐体",
    crane: "クレーン・景品",
  }, {
    maimai: "maimai",
  }),
  withNestedFine("games:other:sandbox", "サンドボックス・クラフト", {
    redstone: "レッドストーン・論理回路",
    modded_mc: "Modded Minecraft",
  }, {
    minecraft: "Minecraft",
  }),
  withNestedFine("games:other:roguelike", "ローグライク・ローグライト", {
    meta_prog: "メタ進行・アンロック",
    build_rng: "ビルドの運要素",
  }, {
    hades_rl: "Hades",
    dead_cells: "Dead Cells",
  }),
];
