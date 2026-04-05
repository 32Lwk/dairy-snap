import { withNestedFine, type NestedFineDef } from "./interest-taxonomy-nested";

/** 音楽 › J-POP（各アーティスト＝詳細タグ。micro は楽しみ方、works は入口例） */
export const MUSIC_JPOP_FINES: NestedFineDef[] = [
  withNestedFine("music:jpop:nogizaka", "乃木坂46", { live: "ライブ・選抜・神席", fc: "公式FC・生写真", media: "ドラマ・モデル・バラエティ", disk: "シングル・CW・ユニット曲" }, { gate: "ぐるぐるカーテン", influencer: "インフルエンサー", sing_out: "Sing Out!" }),
  withNestedFine("music:jpop:sakurazaka", "櫻坂46", { live: "パフォーマンス重視の構成", fc: "FC・ミートアップ", dance: "ダンスパートの見所", story: "楽曲世界観・連作性" }, { nobody: "Nobody's fault", ban: "BAN", start_over: "Start over!" }),
  withNestedFine("music:jpop:hinatazaka", "日向坂46", { live: "おひさま文化・明るさと切なさ", fc: "ひな図書等デジタル", variety_hina: "日向坂で会いましょう", coupling: "カップリングの強さ" }, { kyun: "キュン", kitsune: "キツネ", azato_kawaii: "アザトカワイイ" }),
  withNestedFine("music:jpop:yoasobi", "YOASobi", { novel_music: "小説を音楽にプロジェクト", anime_tie: "アニメ・ドラマタイアップ", streaming: "ストリーミング・チャート", live_yoasobi: "ライブの編成・照明" }, { racing_into: "夜に駆ける", idol_idol: "アイドル", gunjo: "群青" }),
  withNestedFine("music:jpop:ado", "Ado", { vocal_shout: "シャウト・声域の暴力性", uta_movie: "ウタ／ONE PIECE FILM RED", cover_culture: "カバー・歌ってみた文化との接点", live_ado: "ライブの熱量" }, { usseewa: "うっせぇわ", new_genesis: "新時代", show: "唱" }),
  withNestedFine("music:jpop:kinggnu", "King Gnu", { band_sound: "バンドサウンド・編曲の厚み", mill: "常田大希プロデュース美学", live_kinggnu: "ステージ構成・照明", award: "レコード大賞・批評賞" }, { hakujitsu: "白日", ichizu: "一途", vinyl: "Vinyl" }),
  withNestedFine("music:jpop:offical_hige", "Official髭男dism", { piano_guitar: "ピアノロック・ギターリフ", drama_tie: "ドラマ主題歌の定番", live_hige: "ホール・ドーム公演", member_song: "メンバー作曲のバランス" }, { pretender: "Pretender", i_love: "I LOVE...", subtitle: "Subtitle" }),
  withNestedFine("music:jpop:mga", "Mrs. GREEN APPLE", { art_pop: "アートワーク・MV美学", band_evolution: "編成・サウンド変遷", live_mga: "ライブ演出", message: "歌詞の肯定・救済" }, { inferno: "インフェルノ", darling: "ダーリン", ao_to_natsu: "青と夏" }),
  withNestedFine("music:jpop:befirst", "BE:FIRST", { dance_vocal: "ダンスボーカルグループ", skater: "SKY-HIプロデュース文脈", global_be: "海外チャート・越境", growth: "デビューからの成長曲線" }, { gift: "Gifted.", brave_gen: "Brave Generation", main_st: "Mainstream" }),
  withNestedFine("music:jpop:snowman", "Snow Man", { johnnys_new: "STARTO社・男子グループ", dance_snow: "9人ダンス同期", drama_member: "メンバー個人の俳優活動", goods_snow: "グッズ・控えめに楽しむ" }, { dd: "D.D.", secret_touch: "Secret Touch", orange_kiss: "オレンジkiss" }),
  withNestedFine("music:jpop:yorushika", "ヨルシカ", { n_buna: "n-buna楽曲構造", suis: "suisの声質", concept_album: "コンセプト・物語アルバム", mv_yorushika: "MV・アニメーション" }, { say_it: "言って。", hito_toshi: "ただ君に晴れ", ghost: "花に亡霊" }),
  withNestedFine("music:jpop:radwimps", "RADWIMPS", { yojiro: "野田洋次郎の語り", shinkai: "新海誠映画音楽", rock_orchestra: "ロックとオーケの融合", live_rad: "ライブの合唱パート" }, { zenzenzense: "前前前世", spark: "スパークル", grand_escape: "グランドエスケープ" }),
  withNestedFine("music:jpop:vaundy", "Vaundy", { selfproduce: "自作自演・ワンオペ文化", tie_cm: "CM・ドラマタイアップ", genreless: "ジャンルレス志向", live_vaundy: "弾き語りとバンド" }, { kaikai_kiki: "怪獣の花唄", chainsaw_blood: "CHAINSAW BLOOD", odoriko: "踊り子" }),
  withNestedFine("music:jpop:back_number", "back number", { ichiro: "清水依与吏の歌詞世界", ballad: "バラード・失恋の定番", live_bn: "ドーム級の合唱", drama_bn: "ドラマ主題歌" }, { happy_birthday: "HAPPY BIRTHDAY", christmas_song: "クリスマスソング", heroine: "ヒロイン" }),
  withNestedFine("music:jpop:bump", "BUMP OF CHICKEN", { long_band: "長寿バンドの変化", fujiwara: "藤原基央の詞", orchestra_live: "オーケストラ公演", anime_bump: "アニメ主題歌" }, { karma: "カルマ", spacecraft: "天体観測", hello_world: "Hello,world!" }),
  withNestedFine("music:jpop:aimer", "Aimer", { husky: "ハスキーボイス", fate: "Fateシリーズ楽曲", ballad_aimer: "バラードの切なさ", live_aimer: "ライブの静と動" }, { brave_shine: "Brave Shine", zankyo: "残響散花", ref_rain: "Ref:rain" }),
  withNestedFine("music:jpop:milet", "milet", { bilingual: "日英歌詞・海外志向", drama_milet: "ドラマ主題歌", live_milet: "ライブのスケール", collab: "コラボ曲" }, { us: "us", checkmate: "checkmate", ordinary: "Ordinary days" }),
  withNestedFine("music:jpop:uver", "UVERworld", { mix_rock: "ミクスチャーロック", anime_uver: "アニメタイアップ多作", live_uver: "ライブの一体感", message_uver: "前向きメッセージ" }, { core_pride: "CORE PRIDE", odd_future: "ODD FUTURE", namely: "ナノ・セカンド" }),
  withNestedFine("music:jpop:sekai_no_owari", "SEKAI NO OWARI", { fantasy_live: "ファンタジー舞台セット", fukase: "Fukaseの世界観", orchestra_end: "オーケ公演", movie_end: "映画主題歌" }, { dragon_night: "Dragon Night", starlight_parade: "スターライトパレード", silent: "silent" }),
  withNestedFine("music:jpop:bandori", "バンドサウンド・ロック寄りJ-POP", { bandboom: "バンドブーム再燃", girl_band: "ガールズバンド文化", anime_band: "バンドアニメ", livehouse_band: "ライブハウスとメジャーの往復" }, { ppp: "Poppin'Party（企画例）", afterglow: "Afterglow（企画例）", silent_siren: "SILENT SIREN" }),
];

/** 音楽 › K-POP */
export const MUSIC_KPOP_FINES: NestedFineDef[] = [
  withNestedFine("music:kpop:bts", "BTS", { army: "ARMY文化・応援棒", discography: "英語曲・アルバム変遷", solo_parallel: "ソロ活動とグループ", un: "UN・メッセージ性" }, { dynamite: "Dynamite", butter: "Butter", spring_day: "Spring Day" }),
  withNestedFine("music:kpop:newjeans", "NewJeans", { y2k: "Y2K美学・MV", min_hee: "ミンヒジン制作文脈", global_nj: "Billboard・越境", choreo_nj: "振付の覚えやすさ" }, { hype_boy: "Hype boy", ditto: "Ditto", super_shy: "Super Shy" }),
  withNestedFine("music:kpop:seventeen", "SEVENTEEN", { self_prod: "セルフプロデュース", performance_unit: "パフォチ・ボカチ・ヒポチ", carat: "CARAT", concert_svt: "長尺コンサート" }, { dont_wanna_cry: "울고 싶지 않아", super: "SUPER", home: "HOME" }),
  withNestedFine("music:kpop:twice", "TWICE", { cute_concept: "キュートから成熟へ", japan_twice: "日本活動・歌詞", once: "ONCE" }, { cheer_up: "CHEER UP", fancy: "FANCY", feel_special: "Feel Special" }),
  withNestedFine("music:kpop:straykids", "Stray Kids", { producing_3racha: "3RACHA制作", noise_music: "ノイズ・強烈サウンド", stay: "STAY", world_tour_skz: "ワールドツアー" }, { gods_menu: "神메뉴", s_class: "S-Class", maniac: "MANIAC" }),
  withNestedFine("music:kpop:ive", "IVE", { twin_tower: "ツインタワー的ビジュアル", concept_ive: "自信系コンセプト", dive: "DIVE" }, { love_dive: "LOVE DIVE", after_like: "After LIKE", eleven: "ELEVEN" }),
  withNestedFine("music:kpop:blackpink", "BLACKPINK", { yg_style: "YGサウンド", coachella: "コーチェラ・大型フェス", blink: "BLINK" }, { ddu_du: "DDU-DU DDU-DU", kill_this_love: "Kill This Love", pink_venom: "Pink Venom" }),
  withNestedFine("music:kpop:enhypen", "ENHYPEN", { hybe_story: "HYBEナラティブ", dark_concept: "ダークファンタジー", engene: "ENGENE" }, { fever: "FEVER", polaroid_love: "Polaroid Love", bite_me: "Bite Me" }),
  withNestedFine("music:kpop:le_sserafim", "LE SSERAFIM", { fearless_concept: "FEARLESS系コンセプト", sakura_kimchaewon: "IZ*ONE出身メンバー文脈", fearnot: "FEARNOT" }, { fearless: "FEARLESS", antifragile: "ANTIFRAGILE", unforgiven: "UNFORGIVEN" }),
  withNestedFine("music:kpop:ateez", "ATEEZ", { pirate_concept: "海賊・冒険世界観", performance_ateez: "刀ダンス・激しめ", atiny: "ATINY" }, { wonderland: "Wonderland", bouncy: "BOUNCY", answer: "Answer" }),
  withNestedFine("music:kpop:gidle", "(G)I-DLE", { soyeon: "ソヨン制作中心", concept_gidle: "コンセプト変化", neverland: "Neverland" }, { tomboy: "TOMBOY", nxde: "Nxde", queencard: "Queencard" }),
  withNestedFine("music:kpop:aespa", "aespa", { metaverse: "æ・KWANGYA世界観", ai_avatar: "アバター・映像", my: "MY" }, { next_level: "Next Level", savage: "Savage", spicy: "Spicy" }),
  withNestedFine("music:kpop:txt", "TOMORROW X TOGETHER", { youth_txt: "青春ナラティブ", hybe_txt: "HYBE内ポジション", moa: "MOA" }, { crown: "CROWN", loser_lover: "0X1=LOVESONG", sugar_rush: "Sugar Rush Ride" }),
  withNestedFine("music:kpop:itzy", "ITZY", { teen_crush: "Teen Crush", dance_itzy: "ダンス難易度", midzy: "MIDZY" }, { dalla_dalla: "DALLA DALLA", wannabe: "WANNABE", cake: "CAKE" }),
  withNestedFine("music:kpop:nmixx", "NMIXX", { mixx_pop: "MIXX POP", jyp_nmixx: "JYPの実力派箱", nswer: "NSWER" }, { o_o: "O.O", dice: "DICE", party_o_clock: "Party O'Clock" }),
  withNestedFine("music:kpop:boynextdoor", "BOYNEXTDOOR", { neighbor_concept: "隣人・日常コンセプト", zico_pd: "ZICO制作文脈", onedoor: "ONEDOOR" }, { but_i_like_you: "But I Like You", one_and_only: "One and Only" }),
];

/** 音楽 › ロック */
export const MUSIC_ROCK_FINES: NestedFineDef[] = [
  withNestedFine("music:rock:jrock", "邦楽ロック・バンド", { livehouse_chain: "ライブハウスチェーン", indies_major: "インディーズ→メジャー", fes_rock: "夏フェス・ロック枠" }, { bump: "BUMP OF CHICKEN", asian_kung_fu: "ASIAN KUNG-FU GENERATION", ellegarden: "ELLEGARDEN" }),
  withNestedFine("music:rock:classic_rock", "クラシックロック・70–80s", { vinyl_rock: "オリジナル盤", guitar_hero: "ギターヒーロー崇拝", rock_doc: "ドキュメンタリー" }, { led_zeppelin: "Led Zeppelin", queen: "Queen", pink_floyd: "Pink Floyd" }),
  withNestedFine("music:rock:alternative", "オルタナ・インディーロック", { college_radio: "カレッジロック系譜", pitchfork: "批評メディア文化", diy: "自主制作・カセット" }, { radiohead: "Radiohead", arctic_monkeys: "Arctic Monkeys", the_strokes: "The Strokes" }),
  withNestedFine("music:rock:punk", "パンク・ハードコア", { straight_edge: "ストレートエッジ", diy_punk: "DIY倫理", subculture_fashion: "ファッション史" }, { ramones: "Ramones", bad_religion: "Bad Religion", hi_std: "Hi-STANDARD" }),
  withNestedFine("music:rock:metal_heavy", "ヘヴィメタル・NWOBHM", { twin_guitar: "ツインギター", leather: "レザー・パッチ文化" }, { iron_maiden: "Iron Maiden", judas_priest: "Judas Priest" }),
  withNestedFine("music:rock:metal_extreme", "デス・ブラック等エクストリーム", { blast_beat: "ブラストビート", growl: "グロウル", underground_metal: "地下レーベル" }, { cannibal_corpse: "Cannibal Corpse", mayhem: "Mayhem" }),
  withNestedFine("music:rock:metal_melodic", "メロディックメタル・パワメタ", { neoclassical: "ネオクラシカル速弾き", fantasy_lyrics: "ファンタジー歌詞" }, { dragonforce: "DragonForce", stratovarius: "Stratovarius" }),
  withNestedFine("music:rock:metal_core", "メタルコア・Djent", { breakdown: "ブレイクダウン", poly: "ポリリズム", seven_string: "7弦文化" }, { architects: "Architecturesque", periphery: "Periphery" }),
  withNestedFine("music:rock:britpop", "ブリットポップ", { blur_oasis: "Blur vs Oasis", uk_chart: "UKチャート文化" }, { oasis: "Oasis", blur: "Blur", pulp: "Pulp" }),
  withNestedFine("music:rock:grunge", "グランジ", { seattle: "シアトル・地下から主流へ", flannel: "フランネル・美学" }, { nirvana: "Nirvana", pearl_jam: "Pearl Jam", soundgarden: "Soundgarden" }),
  withNestedFine("music:rock:livehouse", "ライブハウス通い", { drink_ticket: "ドリンク代文化", front_row: "最前管理", tshirt_merch: "物販T" }, { shibuya_quattro: "渋谷クアトロ系譜", club_quattro: "名古屋クラブクアトロ" }),
];

/** 音楽 › クラシック */
export const MUSIC_CLASSICAL_FINES: NestedFineDef[] = [
  withNestedFine("music:classical:orchestra", "オーケストラ", { conductor_war: "指揮者論争（好みの話）", hall_acoustic: "ホール音響・座席", program_note: "曲目解説" }, { beethoven9: "ベートーヴェン交響曲第9番", mahler5: "マーラー交響曲第5番" }),
  withNestedFine("music:classical:chamber", "室内楽・弦楽四重奏", { quartet_cycle: "全曲演奏サイクル", score_read: "スコア読みながら聴く" }, { beethoven_late_quartet: "ベートーヴェン後期四重奏曲", ravel_string: "ラヴェル弦楽四重奏曲" }),
  withNestedFine("music:classical:piano", "ピアノ独奏・協奏曲", { technique_debate: "技巧と音楽性の議論", competition: "コンクール文化" }, { chopin_nocturne: "ショパン夜想曲", rach3: "ラフマニノフピアノ協奏曲第3番" }),
  withNestedFine("music:classical:opera", "オペラ・声楽", { surtitle: "字幕・語学", staging_regie: "演出（レジエ）論争" }, { carmen: "カルメン", la_traviata: "ラ・トラヴィアータ" }),
  withNestedFine("music:classical:baroque", "バロック", { historically_informed: "古楽器・HIP", counterpoint: "対位法のよろこび" }, { bach_bwv: "バッハ平均律", vivaldi_four: "ヴィヴァルディ四季" }),
  withNestedFine("music:classical:romantic", "ロマン派", { symphony_narrative: "交響曲の物語性", virtuoso: "ヴィルトゥオーゾ文化" }, { tchaikovsky6: "チャイコフスキー悲愴", brahms1: "ブラームス交響曲第1番" }),
  withNestedFine("music:classical:modern", "現代音楽・ミニマル", { twelve_tone: "十二音技法", minimal_reich: "ミニマル・ライヒ" }, { music_for_18: "Music for 18 Musicians", the_rite: "春の祭り" }),
  withNestedFine("music:classical:film_score", "映画音楽・サントラ", { composer_study: "作曲家別通し", ost_collect: "盤・限定盤" }, { star_wars_theme: "スター・ウォーズ", lord_rings: "ロード・オブ・ザ・リング" }),
  withNestedFine("music:classical:choral", "合唱・聖歌", { mass_setting: "ミサ曲", community_choir: "市民合唱" }, { mozart_requiem: "モーツァルトレクイエム", carmina: "カルミナ・ブラーナ" }),
  withNestedFine("music:classical:early", "古楽・ルネサンス", { lute: "リュート・ヴィオール", pitch: "ピッチ・音律の話" }, { palestrina: "パレストリーナ", dowland: "ダウランド" }),
  withNestedFine("music:classical:conductors", "オケ・指揮者・名盤探求", { label_war: "レーベル比較", remaster: "リマスター論争" }, { karajan: "カラヤン", bernstein: "バーンスタイン" }),
];

/** 音楽 › ジャズ */
export const MUSIC_JAZZ_FINES: NestedFineDef[] = [
  withNestedFine("music:jazz:swing", "スイング・ビッグバンド", { bigband_arrange: "アレンジの厚み", lindy: "リンディホップ文化" }, { duke_ellington: "Duke Ellington", count_basie: "Count Basie" }),
  withNestedFine("music:jazz:bebop", "ビバップ・モダンジャズ", { changes: "コード進行脳", parker: "バード研究" }, { charlie_parker: "Charlie Parker", dizzy_gillespie: "Dizzy Gillespie" }),
  withNestedFine("music:jazz:cool_west", "クールジャズ・ウェストコースト", { relaxed: "リラックスした音色", arrangement_cool: "アレンジの透明感" }, { miles_birth: "Miles Davis Birth of the Cool", dave_brubeck: "Dave Brubeck" }),
  withNestedFine("music:jazz:fusion", "フュージョン", { electric: "エレクトリック化", rock_jazz: "ロックとの融合" }, { bitches_brew: "Bitches Brew", weather_report: "Weather Report" }),
  withNestedFine("music:jazz:latin", "ラテンジャズ・ボサノヴァ", { clave: "クラーヴェ", bossa_history: "ボサノヴァ史" }, { getz_gilberto: "Getz/Gilberto", antonio_jobim: "Antônio Carlos Jobim" }),
  withNestedFine("music:jazz:vocal", "ジャズボーカル・スタンダード", { fakebook: "フェイクブック", scat: "スキャット" }, { ella_fitzgerald: "Ella Fitzgerald", sarah_vaughan: "Sarah Vaughan" }),
  withNestedFine("music:jazz:cafe_live", "ジャズ喫茶・ライブハウス", { analog_jazz_kissa: "ジャズ喫茶の音圧", reservation: "予約・開演時間" }, { blue_note_tokyo: "ブルーノート東京", cotton_club: "コットンクラブ" }),
  withNestedFine("music:jazz:contemporary", "コンテンポラリー・ヨーロッパ系", { ecm: "ECMサウンド", nordic: "北欧ジャズ" }, { keith_jarrett_koln: "ケルンコンサート", esbjorn_svensson: "E.S.T." }),
  withNestedFine("music:jazz:free", "フリージャズ・アヴァンギャルド", { improvisation: "即興の倫理", noise_jazz: "ノイズとの境界" }, { coltrane_ascension: "Ascension", ornette: "Ornette Coleman" }),
  withNestedFine("music:jazz:soul_jazz", "ソウルジャズ・ファンク寄り", { organ_trio: "オルガントリオ", groove: "グルーヴ重視" }, { jimmy_smith: "Jimmy Smith", herbie_hancock_headhunters: "Head Hunters" }),
];

/** 音楽 › アニソン */
export const MUSIC_ANIME_SONG_FINES: NestedFineDef[] = [
  withNestedFine("music:anime:op", "OP", { credit_watch: "クレジットまで見る派", tv_size: "TVサイズとフルの違い", spoiler_op: "ネタバレOP論争" }, { gurenge: "紅蓮華", idol_op: "アイドル（OP）" }),
  withNestedFine("music:anime:ed", "ED", { story_ed: "EDで物語を締める演出", coupling_anison: "カップリング収集" }, { unravel: "unravel", peace_sign: "ピースサイン" }),
  withNestedFine("music:anime:insert", "劇中歌・挿入歌", { drama_scene: "シーンと一体化", live_insert: "ライブで再現" }, { god_knows: "God knows...", dovchin: "ドヴォルザーク風ジョーク曲など" }),
  withNestedFine("music:anime:character", "キャラソン", { chara_album: "キャラソンアルバム", drama_cd_anime: "ドラマCD" }, { renai_circulation: "恋愛サーキュレーション" }),
  withNestedFine("music:anime:cover", "歌ってみた・カバー", { mix: "MIX依頼文化", rights: "権利・カバー規約" }, { niconico_utattemita: "ニコニコ歌ってみた" }),
  withNestedFine("music:anime:live_event", "アニサマ・ライブイベント", { penlight: "ペンライト・席礼", setlist: "セットリスト考察" }, { anisama: "Animelo Summer Live", lisani: "LiSAっ子ライブ文化" }),
  withNestedFine("music:anime:orchestra", "アニサマシンフォニック等オケ", { arrangement_orchestra: "編曲のオケ化", hall_anime: "ホール響き" }, { orchestra_nier: "NieRオーケストラ" }),
  withNestedFine("music:anime:dj_event", "アニクラ・DJイベント", { remix_4_4: "4つ打ちリミックス", club_anime: "クラブとオタク文化の接点" }, { anikura: "アニクラ" }),
];

/** 音楽 › アイドル */
export const MUSIC_IDOL_FINES: NestedFineDef[] = [
  withNestedFine("music:idol:48g", "48グループ", { handshake: "握手会・写メ会の文化", senbatsu: "選抜・総選挙の記憶", theater: "劇場公演" }, { akb48: "AKB48", ske48: "SKE48" }),
  withNestedFine("music:idol:46g", "坂道・46系", { nogizaka_branch: "乃木坂・櫻坂・日向坂の違い", mv_cinema: "MVの映像美", sync_perfection: "同期・フォーメーション" }, { nogizaka: "乃木坂46", sakurazaka: "櫻坂46" }),
  withNestedFine("music:idol:starto", "STARTO（旧ジャニーズ）系", { johnnys_history: "事務所史・商標の話を尊重", group_evolution: "グループの変遷", fan_manners: "ファンルール議論" }, { arashi: "嵐", snow_man_idol: "Snow Man" }),
  withNestedFine("music:idol:momoclo", "ももクロ・スタダ系", { color_z: "色担当文化", owarai_mix: "お笑いとの親和", momokuro: "夏の大作ライブ" }, { momoclo: "ももいろクローバーZ" }),
  withNestedFine("music:idol:wack", "WACK・オルタナ系", { punk_idol: "パンク的アイドル", controversy: "過激演出と批評", bi_s: "BiSH・BiS系譜" }, { bish: "BiSH" }),
  withNestedFine("music:idol:chika", "地下アイドル・ライブハウス", { cheki: "チェキ文化", two_man: "ツーマン・対バン", oshi_distance: "推し距離感" }, { live_idol_scene: "ライブアイドルシーン" }),
  withNestedFine("music:idol:kpop_idol", "K-POPアイドル", { lightstick: "応援棒・シーソング", comeback: "カムバサイクル", photocard: "トレカ" }, { bts_idol: "BTS", blackpink_idol: "BLACKPINK" }),
  withNestedFine("music:idol:cheer", "チア・ダンス寄りアイドル", { formation_dance: "フォーメーションダンス", sports_link: "スポーツ連携" }, { cheer_idol: "チアアイドル系譜" }),
];

/** 音楽 › ボカロ */
export const MUSIC_VOCALOID_FINES: NestedFineDef[] = [
  withNestedFine("music:vocaloid:miku", "初音ミク", { piapro: "ピアプロ・二次創作", magical_mirai: "マジカルミライ", module: "モジュール・衣装" }, { miku_miku: "みくみくにしてあげる♪", senbonzakura: "千本桜" }),
  withNestedFine("music:vocaloid:producer", "ボカロP・作曲", { dtm_tech: "DTM技術", vocaloid_editor: "エディタ文化", niconico_ranking: "週刊ランキング記憶" }, { kemu: "kemu", deco27: "DECO*27", nayutan: "ナユタン星人" }),
  withNestedFine("music:vocaloid:utaite", "歌い手", { collab_utattemita: "コラボ・オリジナル", live_utaite: "ワンマン・イベント" }, { luz: "luz", mafumafu: "まふまふ" }),
  withNestedFine("music:vocaloid:night_owl", "ボカロニコ文化・深夜テンション", { comment_rap: "コメント芸", mylist: "マイリスト文化" }, { niconico_douga: "ニコニコ動画" }),
  withNestedFine("music:vocaloid:live", "マジカルミライ等ライブ", { hologram: "ホログラム・演出論争を知る", band_set: "バンドセット" }, { magical_mirai_live: "マジカルミライ" }),
  withNestedFine("music:vocaloid:cevio", "CeVIO・SynthV 等ボイス系", { voicebank: "ボイスバンク比較", license: "利用規約" }, { kasane_teto: "重音テトSV", tsurumaki_maki: "弦巻マキ" }),
  withNestedFine("music:vocaloid:project_sekai", "プロセカ・音ゲー文化", { sekai: "セカイ・バーチャルライブ", gacha_music: "音ゲーとガチャ", chart_diff: "MASTER譜面" }, { project_sekai: "プロジェクトセカイ" }),
];

/** 音楽 › ヒップホップ */
export const MUSIC_HIPHOP_FINES: NestedFineDef[] = [
  withNestedFine("music:hiphop:j_rap", "日本語ラップ・HIPHOP", { rhyme_scheme: "ライム・語感", boom_bap_j: "Boom Bap系日本語", podcast_hiphop: "ポッドキャスト文化" }, { king_giddra: "KING GIDDRA", rip_slyme: "RIP SLYME", badhop: "BAD HOP" }),
  withNestedFine("music:hiphop:us_uk", "US / UK ヒップホップ", { east_west: "イースト・ウェスト史", uk_grime: "UK Grime", chart_hiphop: "チャートと批評" }, { kendrick: "Kendrick Lamar", drake: "Drake", stormzy: "Stormzy" }),
  withNestedFine("music:hiphop:trap", "トラップ・808", { hi_hat_roll: "ハイハットロール", analog_kick: "808キック（アナログ）" }, { future: "Future", metro_boomin: "Metro Boomin" }),
  withNestedFine("music:hiphop:rnb", "R&B・ネオソウル", { vocal_run: "ボーカルラン", slow_jam: "スロウジャム" }, { frank_ocean: "Frank Ocean", sza: "SZA" }),
  withNestedFine("music:hiphop:beats", "ビートメイキング", { sample_clear: "サンプルクリアランス", daw_hiphop: "DAWワークフロー" }, { j_dilla: "J Dilla", nujabes: "Nujabes" }),
  withNestedFine("music:hiphop:battle", "MCバトル・サイファー", { freestyle: "フリースタイル", judge_battle: "審査員・大会形式" }, { mcbattle_jp: "UMB・FREESTYLE DUNGEON" }),
  withNestedFine("music:hiphop:drill", "ドリル・ローファイ", { uk_drill: "UKドリル", chicago_drill: "シカゴドリル" }, { pop_smoke: "Pop Smoke", central_cee: "Central Cee" }),
  withNestedFine("music:hiphop:lofi", "Lo-fi HipHop・作業用", { study_beats: "study beats", stream_lofi: "24h配信" }, { lofi_girl: "Lofi Girl" }),
];

/** 音楽 › シティポップ */
export const MUSIC_CITYPOP_FINES: NestedFineDef[] = [
  withNestedFine("music:citypop:80s_j", "80年代邦楽シティポップ", { fm_tower: "FMブーム・タワー系", citypop_revival: "海外再評価" }, { mariya_takeuchi: "竹内まりや", tatsuro: "山下達郎", anri: "杏里" }),
  withNestedFine("music:citypop:drive", "ドライブ・夜の高速音楽", { highway_mix: "高速道路ミックス", night_city: "夜景と音の相性" }, { plastic_love: "Plastic Love" }),
  withNestedFine("music:citypop:seaside", "海・リゾート音像", { summer_wind: "夏・風のイメージ", yacht: "ヨットロック接続" }, { summer_connection: "夏色のナンシー" }),
  withNestedFine("music:citypop:neo", "ネオシティ・再発掘・海外人気", { youtube_algo: "YouTubeアルゴリズムと再発掘", vinyl_city: "オリジナル盤高騰" }, { night_tempo: "Night Tempo（再編）" }),
  withNestedFine("music:citypop:vinyl", "オリジナル盤・レコード収集", { matrix: "マトリクス・刻印", cleaning: "洗浄・針圧" }, { og_press: "オリジナルプレス" }),
];

/** 音楽 › EDM */
export const MUSIC_EDM_FINES: NestedFineDef[] = [
  withNestedFine("music:edm:house", "House・Garage", { four_on_floor: "4つ打ち", uk_garage: "UKガラージ" }, { daft_punk: "Daft Punk", disclosure: "Disclosure" }),
  withNestedFine("music:edm:techno", "Techno・ミニマル", { berghain: "ベルリン・クラブ文化（一般論）", acid: "アシッド" }, { jeff_mills: "Jeff Mills", richie_hawtin: "Richie Hawtin" }),
  withNestedFine("music:edm:dnb", "Drum&Bass・ベースミュージック", { amen: "アーメンブレイク", neuro: "Neurofunk" }, { goldie: "Goldie", netsky: "Netsky" }),
  withNestedFine("music:edm:hardstyle", "ハードスタイル・ハードコア", { kick_distortion: "キック歪み", gabber: "ガバ" }, { headhunterz: "Headhunterz", angerfist: "Angerfist" }),
  withNestedFine("music:edm:festival", "フェス・クラブ・DJ現場", { festival_law: "安全管理・薬の話題は否定", vip: "VIP席・音響位置" }, { ultra: "Ultra", tomorrowland: "Tomorrowland" }),
  withNestedFine("music:edm:anison_remix", "アニソンリミックス・アニクラ", { remix_culture: "リミックス文化", club_otaku: "オタクとクラブの共存" }, { anison_remix: "アニソンリミックス" }),
];

/** 音楽 › ミュージカル・舞台 */
export const MUSIC_STAGE_FINES: NestedFineDef[] = [
  withNestedFine("music:stage:2.5", "2.5次元ミュージカル", { ticket_war_25: "チケット争奪", actor_2_5: "俳優と原作の距離" }, { touken_musical: "刀剣乱舞ミュージカル", hypstage: "ヒプステ" }),
  withNestedFine("music:stage:takarazuka", "宝塚歌劇", { otokoyaku: "男役・娘役", fan_club_takarazuka: "友の会", revue: "レビュー" }, { cosmos_takarazuka: "宙組・星組など（例）" }),
  withNestedFine("music:stage:shiki", "四季・劇団四季系", { long_run: "ロングラン公演", family_musical: "ファミリー向け" }, { lion_king: "ライオンキング", cats_jp: "キャッツ" }),
  withNestedFine("music:stage:broadway", "ブロードウェイ・海外作品", { tony: "トニー賞", revival: "リバイバル" }, { hamilton: "Hamilton", wicked: "Wicked" }),
  withNestedFine("music:stage:small_theater", "小劇場・演劇ユニット", { fringe: "フリンジ・実験", playwright: "作劇家志向" }, { studio_alfa: "スタジオアルタ系譜" }),
];

/** 音楽 › レゲエ */
export const MUSIC_REGGAE_FINES: NestedFineDef[] = [
  withNestedFine("music:reggae:roots", "ルーツレゲエ・ダブ", { rasta: "ラスタ文化への敬意", dub_mix: "ダブミックス" }, { bob_marley: "Bob Marley", peter_tosh: "Peter Tosh" }),
  withNestedFine("music:reggae:dancehall", "ダンスホール・デジタル", { sound_system: "サウンドシステム", slackness: "スラックネス（文脈理解）" }, { vybz_kartel: "Vybz Kartel", sean_paul: "Sean Paul" }),
  withNestedFine("music:reggae:ska", "スカ・パンク寄り", { two_tone: "ツートーン", ska_punk: "スカパンク" }, { specials: "The Specials", mighty_bosstones: "Mighty Mighty Bosstones" }),
  withNestedFine("music:reggae:latin", "ラテン・サルサ・レゲトン", { perreo: "ペレオ", reggaeton_global: "レゲトンの世界展開" }, { bad_bunny: "Bad Bunny", daddy_yankee: "Daddy Yankee" }),
];

/** 音楽 › その他 */
export const MUSIC_OTHER_FINES: NestedFineDef[] = [
  withNestedFine("music:other:world", "ワールドミュージック", { field_recording: "フィールドレコーディング", respect_culture: "文化の盗用問題に配慮" }, { ravi_shankar: "Ravi Shankar", buena_vista: "Buena Vista Social Club" }),
  withNestedFine("music:other:folk", "フォーク・シンガーソング", { protest_song: "プロテストソング", acoustic_live: "アコースティックライブ" }, { bob_dylan: "Bob Dylan", okuda_tamio: "奥田民生" }),
  withNestedFine("music:other:electronic", "エレクトロニカ・テクノ", { idm: "IDM", ambient_tech: "アンビエントテクノ" }, { aphex_twin: "Aphex Twin", boards_of_canada: "Boards of Canada" }),
  withNestedFine("music:other:ambient", "アンビエント", { sleep_music: "睡眠用", field_ambient: "環境音" }, { music_for_airports: "Music for Airports", stars_of_lid: "Stars of the Lid" }),
  withNestedFine("music:other:enka", "演歌・歌謡曲", { kobushi: "こぶし", hikawa_kiyoshi: "氷川きよし世代" }, { ue_o_muite: "上を向いて歩こう" }),
  withNestedFine("music:other:shamisen", "和楽器・伝統音楽", { hogaku: "邦楽の礼儀", contemporary_wa: "現代和楽器バンド" }, { yoshida_brothers: "吉田兄弟" }),
  withNestedFine("music:other:playlist", "プレイリスト探求・サブスク沼", { algorithm: "アルゴリズムと偏り", lossless: "ロスレス・音質" }, { spotify_wrapped: "Spotify Wrapped" }),
];
