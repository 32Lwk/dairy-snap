/**
 * 「映像・エンタメ › アニメ」の詳細タグ定義。
 * 各詳細タグに micro（テーマ別のさらに細かい分類）と works（代表的な作品チップ）をぶら下げる。
 */

export type MediaAnimeFine = {
  id: string;
  label: string;
  micro?: { id: string; label: string }[];
  works?: { id: string; label: string }[];
};

export const MEDIA_ANIME_FINES: MediaAnimeFine[] = [
  {
    id: "media:anime:late_night",
    label: "深夜アニメ",
    micro: [
      { id: "media:anime:late_night:m_seasonal", label: "クール単位で新作を追う" },
      { id: "media:anime:late_night:m_streaming", label: "見逃し配信・サブスク中心" },
      { id: "media:anime:late_night:m_bs_local", label: "ローカル局・BS・再放送も視聴" },
      { id: "media:anime:late_night:m_original", label: "オリジナルアニメ枠が好き" },
      { id: "media:anime:late_night:m_adapt_ln", label: "ラノベ・漫画原作の映像化追い" },
      { id: "media:anime:late_night:m_sakuga", label: "作画・演出（作画MAD・撮影）重視" },
    ],
    works: [
      { id: "media:anime:late_night:t_jujutsu", label: "呪術廻戦" },
      { id: "media:anime:late_night:t_chainsaw", label: "チェンソーマン" },
      { id: "media:anime:late_night:t_frieren", label: "葬送のフリーレン" },
      { id: "media:anime:late_night:t_spyfamily", label: "SPY×FAMILY" },
      { id: "media:anime:late_night:t_oshinoko", label: "【推しの子】" },
      { id: "media:anime:late_night:t_bocchi", label: "ぼっち・ざ・ろっく！" },
      { id: "media:anime:late_night:t_dandadan", label: "ダンダダン" },
      { id: "media:anime:late_night:t_licorice", label: "リコリス・リコイル" },
    ],
  },
  {
    id: "media:anime:golden",
    label: "ゴールデン・家族向け",
    micro: [
      { id: "media:anime:golden:m_family", label: "家族で観られる名作・長寿枠" },
      { id: "media:anime:golden:m_kids", label: "子ども向け・キャラもの" },
      { id: "media:anime:golden:m_prime", label: "ゴールデン帯の新作・特番" },
    ],
    works: [
      { id: "media:anime:golden:t_onepiece", label: "ONE PIECE" },
      { id: "media:anime:golden:t_conan", label: "名探偵コナン" },
      { id: "media:anime:golden:t_pokemon", label: "ポケットモンスター" },
      { id: "media:anime:golden:t_doraemon", label: "ドラえもん" },
      { id: "media:anime:golden:t_chiikawa", label: "ちいかわ" },
      { id: "media:anime:golden:t_anpanman", label: "それいけ！アンパンマン" },
    ],
  },
  {
    id: "media:anime:theatrical",
    label: "劇場版・映画館",
    micro: [
      { id: "media:anime:theatrical:m_imax", label: "IMAX・大スクリーン・音響重視" },
      { id: "media:anime:theatrical:m_stage_greet", label: "舞台挨拶・応援上映・フィルム缶" },
      { id: "media:anime:theatrical:m_box", label: "興行・初動・ランキングも楽しむ" },
      { id: "media:anime:theatrical:m_import", label: "海外アニメ映画・映画祭作品" },
    ],
    works: [
      { id: "media:anime:theatrical:t_kiminona", label: "君の名は。" },
      { id: "media:anime:theatrical:t_suzume", label: "すずめの戸締まり" },
      { id: "media:anime:theatrical:t_tenki", label: "天気の子" },
      { id: "media:anime:theatrical:t_kimetsu_mugen", label: "鬼滅の刃 無限列車編" },
      { id: "media:anime:theatrical:t_miyazaki_kimitachi", label: "君たちはどう生きるか" },
      { id: "media:anime:theatrical:t_evangelion_final", label: "シン・エヴァンゲリオン劇場版" },
    ],
  },
  {
    id: "media:anime:sf_fantasy",
    label: "SF・ファンタジー",
    micro: [
      { id: "media:anime:sf_fantasy:m_space_opera", label: "宇宙・スペースオペラ" },
      { id: "media:anime:sf_fantasy:m_cyber", label: "サイバーパンク・近未来" },
      { id: "media:anime:sf_fantasy:m_postap", label: "終末・ディストピア" },
      { id: "media:anime:sf_fantasy:m_magic_system", label: "魔法体系・設定厨" },
      { id: "media:anime:sf_fantasy:m_steampunk", label: "スチームパンク・異世界SF" },
    ],
    works: [
      { id: "media:anime:sf_fantasy:t_steins", label: "STEINS;GATE" },
      { id: "media:anime:sf_fantasy:t_psychopass", label: "PSYCHO-PASS" },
      { id: "media:anime:sf_fantasy:t_gundam_witch", label: "機動戦士ガンダム 水星の魔女" },
      { id: "media:anime:sf_fantasy:t_code_geass", label: "コードギアス" },
      { id: "media:anime:sf_fantasy:t_ghost_shell", label: "攻殻機動隊" },
      { id: "media:anime:sf_fantasy:t_evangelion", label: "エヴァンゲリオン（TV）" },
    ],
  },
  {
    id: "media:anime:slice_of_life",
    label: "日常・青春",
    micro: [
      { id: "media:anime:slice_of_life:m_iyashi", label: "癒し・風景・空気感" },
      { id: "media:anime:slice_of_life:m_club", label: "部活・学校・文化祭ネタ" },
      { id: "media:anime:slice_of_life:m_rural", label: "田舎・旅・ローカル舞台" },
      { id: "media:anime:slice_of_life:m_gourmet", label: "グルメ・料理描写" },
      { id: "media:anime:slice_of_life:m_workplace", label: "仕事・職場コメディ" },
    ],
    works: [
      { id: "media:anime:slice_of_life:t_yurucamp", label: "ゆるキャン△" },
      { id: "media:anime:slice_of_life:t_nonnon", label: "のんのんびより" },
      { id: "media:anime:slice_of_life:t_kubo", label: "久保さんは僕を許さない" },
      { id: "media:anime:slice_of_life:t_takagi", label: "からかい上手の高木さん" },
      { id: "media:anime:slice_of_life:t_violet", label: "ヴァイオレット・エヴァーガーデン" },
    ],
  },
  {
    id: "media:anime:romance",
    label: "恋愛・ラブコメ",
    micro: [
      { id: "media:anime:romance:m_school_lc", label: "学園ラブコメ・三角関係" },
      { id: "media:anime:romance:m_adult", label: "大学生〜社会人の恋愛" },
      { id: "media:anime:romance:m_harem", label: "ハーレム・ヒロイン争奪" },
      { id: "media:anime:romance:m_otp", label: "CP固定・カップリング推し" },
      { id: "media:anime:romance:m_shojo", label: "少女マンガ系・純愛" },
    ],
    works: [
      { id: "media:anime:romance:t_kaguya", label: "かぐや様は告らせたい" },
      { id: "media:anime:romance:t_go_tobun", label: "五等分の花嫁" },
      { id: "media:anime:romance:t_kanokari", label: "彼女、お借りします" },
      { id: "media:anime:romance:t_horimiya", label: "ホリミヤ" },
      { id: "media:anime:romance:t_kimi_todo", label: "君に届け" },
    ],
  },
  {
    id: "media:anime:mecha",
    label: "ロボット・メカ",
    micro: [
      { id: "media:anime:mecha:m_real", label: "リアロボ・ミリタリー寄り" },
      { id: "media:anime:mecha:m_super", label: "スーパーロボ・大合体" },
      { id: "media:anime:mecha:m_design", label: "メカデザイン・設定資料" },
      { id: "media:anime:mecha:m_model", label: "プラモ・ガンプラ文化ともリンク" },
    ],
    works: [
      { id: "media:anime:mecha:t_macross", label: "マクロス" },
      { id: "media:anime:mecha:t_86", label: "86―エイティシックス―" },
      { id: "media:anime:mecha:t_gridman", label: "SSSS.GRIDMAN / DYNAZENON" },
      { id: "media:anime:mecha:t_break_blade", label: "ブレイクブレイド" },
    ],
  },
  {
    id: "media:anime:seiyuu",
    label: "声優・イベント推し",
    micro: [
      { id: "media:anime:seiyuu:m_event", label: "ライブ・イベ・物販列" },
      { id: "media:anime:seiyuu:m_radio", label: "ラジオ・ポッドキャスト" },
      { id: "media:anime:seiyuu:m_2_5", label: "2.5次元舞台・朗読劇" },
      { id: "media:anime:seiyuu:m_cast_talk", label: "キャストコメンタリー・特典映像" },
    ],
    works: [
      { id: "media:anime:seiyuu:t_hypmic", label: "ヒプノシスマイク" },
      { id: "media:anime:seiyuu:t_utapri", label: "うたの☆プリンスさまっ♪" },
      { id: "media:anime:seiyuu:t_side_m", label: "アイドルマスター SideM" },
      { id: "media:anime:seiyuu:t_paradox", label: "Paradox Live" },
    ],
  },
  {
    id: "media:anime:isekai",
    label: "異世界・転生",
    micro: [
      { id: "media:anime:isekai:m_narou", label: "なろう系・チート主人公" },
      { id: "media:anime:isekai:m_villainess", label: "悪役令嬢・乙女ゲー世界" },
      { id: "media:anime:isekai:m_slow", label: "スローライフ・開拓" },
      { id: "media:anime:isekai:m_game", label: "ゲーム世界・VR系" },
      { id: "media:anime:isekai:m_reverse", label: "現代逆転・文化ギャップ" },
    ],
    works: [
      { id: "media:anime:isekai:t_rezero", label: "Re:ゼロ" },
      { id: "media:anime:isekai:t_tensura", label: "転生したらスライムだった件" },
      { id: "media:anime:isekai:t_mushoku", label: "無職転生" },
      { id: "media:anime:isekai:t_konosuba", label: "この素晴らしい世界に祝福を！" },
      { id: "media:anime:isekai:t_shield", label: "盾の勇者の成り上がり" },
    ],
  },
  {
    id: "media:anime:horror",
    label: "ホラー・サスペンス",
    micro: [
      { id: "media:anime:horror:m_grotesque", label: "グロ・猟奇（苦手注意）" },
      { id: "media:anime:horror:m_psychological", label: "心理ホラー・狂気" },
      { id: "media:anime:horror:m_urban", label: "都市伝説・怪談" },
      { id: "media:anime:horror:m_mystery", label: "本格ミステリー寄り" },
    ],
    works: [
      { id: "media:anime:horror:t_another", label: "Another" },
      { id: "media:anime:horror:t_promised", label: "約束のネバーランド" },
      { id: "media:anime:horror:t_mieruko", label: "見える子ちゃん" },
      { id: "media:anime:horror:t_summertime", label: "サマータイムレンダ" },
    ],
  },
  {
    id: "media:anime:sports_anime",
    label: "スポーツアニメ",
    micro: [
      { id: "media:anime:sports_anime:m_real_sport", label: "実在競技（球技・格闘等）" },
      { id: "media:anime:sports_anime:m_fictional", label: "架空競技・バトルスポーツ" },
      { id: "media:anime:sports_anime:m_team", label: "チーム物・勝利へのドラマ" },
      { id: "media:anime:sports_anime:m_coach", label: "監督・マネージャー視点" },
    ],
    works: [
      { id: "media:anime:sports_anime:t_haikyu", label: "ハイキュー!!" },
      { id: "media:anime:sports_anime:t_blue_lock", label: "ブルーロック" },
      { id: "media:anime:sports_anime:t_diamond", label: "ダイヤのA" },
      { id: "media:anime:sports_anime:t_slamdunk", label: "SLAM DUNK" },
      { id: "media:anime:sports_anime:t_ahiru", label: "あひるの空" },
    ],
  },
  {
    id: "media:anime:music_idol",
    label: "音楽・学園アイドル系",
    micro: [
      { id: "media:anime:music_idol:m_live_2_5", label: "ライブ・2.5次元舞台" },
      { id: "media:anime:music_idol:m_school_idol", label: "学園アイドル・部活" },
      { id: "media:anime:music_idol:m_band", label: "バンド・演奏シーン重視" },
      { id: "media:anime:music_idol:m_dj", label: "DJ・クラブ・音楽プロデュース物" },
    ],
    works: [
      { id: "media:anime:music_idol:t_lovelive", label: "ラブライブ！" },
      { id: "media:anime:music_idol:t_imas", label: "アイドルマスター" },
      { id: "media:anime:music_idol:t_bandori", label: "バンドリ！" },
      { id: "media:anime:music_idol:t_revstar", label: "少女☆歌劇 レヴュースタァライト" },
      { id: "media:anime:music_idol:t_nana", label: "NANA" },
    ],
  },
  {
    id: "media:anime:bl_gl",
    label: "BL・百合・カップリング文化",
    micro: [
      { id: "media:anime:bl_gl:m_commercial_bl", label: "商業BL・アニメ化作品" },
      { id: "media:anime:bl_gl:m_yuri", label: "百合・女性同士の関係描写" },
      { id: "media:anime:bl_gl:m_fanwork", label: "二次創作・同人イベントとも" },
      { id: "media:anime:bl_gl:m_shipping", label: "カップリング・解釈合戦も楽しむ" },
    ],
    works: [
      { id: "media:anime:bl_gl:t_given", label: "ギヴン" },
      { id: "media:anime:bl_gl:t_doukyuusei", label: "同級生" },
      { id: "media:anime:bl_gl:t_yuruyuri", label: "ゆるゆり" },
      { id: "media:anime:bl_gl:t_maria", label: "マリア様がみてる" },
    ],
  },
  {
    id: "media:anime:original_anime",
    label: "オリジナル作品・脚本重視",
    micro: [
      { id: "media:anime:original_anime:m_series_comp", label: "全話通しての構成・伏線" },
      { id: "media:anime:original_anime:m_studio", label: "スタジオ・監督ブランド" },
      { id: "media:anime:original_anime:m_twist", label: "どんでん返し・実験的演出" },
    ],
    works: [
      { id: "media:anime:original_anime:t_edgerunners", label: "Cyberpunk: Edgerunners" },
      { id: "media:anime:original_anime:t_oddtaxi", label: "オッドタクシー" },
      { id: "media:anime:original_anime:t_platinum", label: "プラチナエンド" },
      { id: "media:anime:original_anime:t_wonder_egg", label: "ワンダーエッグ・プライオリティ" },
    ],
  },
  {
    id: "media:anime:battle",
    label: "バトル・アクション",
    micro: [
      { id: "media:anime:battle:m_shonen", label: "少年向け熱血バトル" },
      { id: "media:anime:battle:m_weapon", label: "武器・格闘術・バトルロワイヤル" },
      { id: "media:anime:battle:m_superpower", label: "超能力・特殊スキル" },
    ],
    works: [
      { id: "media:anime:battle:t_mha", label: "僕のヒーローアカデミア" },
      { id: "media:anime:battle:t_jjk", label: "呪術廻戦" },
      { id: "media:anime:battle:t_kimetsu", label: "鬼滅の刃" },
      { id: "media:anime:battle:t_fire_force", label: "炎炎ノ消防隊" },
    ],
  },
  {
    id: "media:anime:comedy",
    label: "ギャグ・コメディ",
    micro: [
      { id: "media:anime:comedy:m_parody", label: "パロディ・メタ・ネタ" },
      { id: "media:anime:comedy:m_surreal", label: "シュール・ボケ突っ込み" },
      { id: "media:anime:comedy:m_sketch", label: "短尺・スキット型" },
    ],
    works: [
      { id: "media:anime:comedy:t_gintama", label: "銀魂" },
      { id: "media:anime:comedy:t_nichijou", label: "日常" },
      { id: "media:anime:comedy:t_konosuba_c", label: "このすば（コメディ枠）" },
    ],
  },
  {
    id: "media:anime:mystery",
    label: "ミステリー・推理",
    micro: [
      { id: "media:anime:mystery:m_whodunit", label: "ホームズ系・犯人当て" },
      { id: "media:anime:mystery:m_howcatchem", label: "倒叙・心理戦" },
      { id: "media:anime:mystery:m_supernatural_m", label: "超常×推理" },
    ],
    works: [
      { id: "media:anime:mystery:t_moriarty", label: "憂国のモリアーティ" },
      { id: "media:anime:mystery:t_undead", label: "アンデッドガール・マーダーファルス" },
    ],
  },
  {
    id: "media:anime:healing",
    label: "癒し・空気感（スロー）",
    micro: [
      { id: "media:anime:healing:m_ambient", label: "BGM・環境音・ふわっと系" },
      { id: "media:anime:healing:m_animal", label: "動物・妖精・ふもふも" },
      { id: "media:anime:healing:m_craft", label: "手仕事・喫茶・細かい動き" },
    ],
    works: [
      { id: "media:anime:healing:t_aria", label: "ARIA" },
      { id: "media:anime:healing:t_laid_back", label: "ゆるキャン△（癒し枠）" },
    ],
  },
  {
    id: "media:anime:donghua",
    label: "中国・アジア圏アニメ",
    micro: [
      { id: "media:anime:donghua:m_3d", label: "3DCG・武侠・神話" },
      { id: "media:anime:donghua:m_web", label: "Web配信・短尺シリーズ" },
      { id: "media:anime:donghua:m_co_pro", label: "日中合作・吹替版" },
    ],
    works: [
      { id: "media:anime:donghua:t_link_click", label: "時光代理人（Link Click）" },
      { id: "media:anime:donghua:t_mo_dao", label: "魔道祖師" },
    ],
  },
  {
    id: "media:anime:short_form",
    label: "ショート・縦型・湯煎",
    micro: [
      { id: "media:anime:short_form:m_youtube", label: "YouTube・配信オリジナル短尺" },
      { id: "media:anime:short_form:m_tiktok", label: "縦動画・ショートドラマ連動" },
      { id: "media:anime:short_form:m_4koma", label: "4コマ原作のカツカツ尺" },
    ],
    works: [
      { id: "media:anime:short_form:t_igma", label: "イジらないで、長瀞さん（短尺含む）" },
      { id: "media:anime:short_form:t_chibi", label: "ミニアニメ・スピンオフ短編" },
    ],
  },
];
