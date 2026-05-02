/**
 * pickId → 公式・準公式 URL（中央マップ）。
 * アニメ works は手動キュレーションを優先し、空きは所属小分類のポータル URL で埋める（実行時 AniList は resolve 側で先頭に付与可）。
 */

import { MEDIA_ANIME_FINES } from "@/lib/interest-taxonomy-media-anime";
import {
  collectAllCanonicalInterestPickIds,
  subIdForCanonicalInterestPick,
} from "@/lib/interest-taxonomy";
import { INTEREST_SUB_PORTAL_URL_BY_ID } from "@/lib/interest-sub-portal-urls";
import { MOVIE_WORK_OFFICIAL_URLS_BY_PICK_ID } from "@/lib/interest-official-urls-movie-works";

/** 手動キュレーション（公式ドメインは運用で検証）。taxonomy の id と一致させる */
const MANUAL_OFFICIAL_URLS_BY_PICK_ID: Record<string, string[]> = {
  "media:anime:late_night:t_jujutsu": ["https://jujutsukaisen.jp/"],
  "media:anime:late_night:t_chainsaw": ["https://chainsawman.dog/"],
  "media:anime:late_night:t_frieren": ["https://frieren-anime.jp/"],
  "media:anime:late_night:t_spyfamily": ["https://spy-family.net/"],
  "media:anime:late_night:t_oshinoko": ["https://ichigoproduction.com/"],
  "media:anime:late_night:t_bocchi": ["https://bocchi.rocks/"],
  "media:anime:late_night:t_dandadan": ["https://dandadan.net/"],
  "media:anime:late_night:t_licorice": ["https://lycoris-recoil.com/"],
  "media:anime:golden:t_onepiece": ["https://one-piece.com/"],
  "media:anime:golden:t_conan": ["https://www.conan.jp/"],
  "media:anime:golden:t_pokemon": ["https://www.pokemon.co.jp/anime/"],
  "media:anime:golden:t_doraemon": ["https://doraemon.com/"],
  "media:anime:golden:t_chiikawa": ["https://www.anime-chiikawa.jp/"],
  "media:anime:golden:t_anpanman": ["https://anpanman.jp/"],
  "media:anime:theatrical:t_kiminona": ["https://kiminona.com/"],
  "media:anime:theatrical:t_suzume": ["https://suzume-tojimari-movie.jp/"],
  "media:anime:theatrical:t_tenki": ["https://tenkinoko.com/"],
  "media:anime:theatrical:t_kimetsu_mugen": ["https://kimetsu.com/anime/"],
  "media:anime:theatrical:t_miyazaki_kimitachi": ["https://kimitachihoudou.jp/"],
  "media:anime:theatrical:t_evangelion_final": ["https://www.evangelion.co.jp/"],
  "media:anime:sf_fantasy:t_steins": ["https://steinsgate.net/"],
  "media:anime:sf_fantasy:t_psychopass": ["https://psycho-pass.com/"],
  "media:anime:sf_fantasy:t_gundam_witch": ["https://g-witch.net/"],
  "media:anime:sf_fantasy:t_code_geass": ["https://www.geass.jp/"],
  "media:anime:sf_fantasy:t_ghost_shell": ["https://kokaku-a.jp/"],
  "media:anime:sf_fantasy:t_evangelion": ["https://www.evangelion.co.jp/"],
  "media:anime:slice_of_life:t_yurucamp": ["https://yurucamp.jp/"],
  "media:anime:slice_of_life:t_nonnon": ["https://nonnontv.com/"],
  "media:anime:slice_of_life:t_kubo": ["https://kubosan-anime.jp/"],
  "media:anime:slice_of_life:t_takagi": ["https://takagi3.me/"],
  "media:anime:slice_of_life:t_violet": ["https://violet-evergarden.jp/"],
  "media:anime:romance:t_kaguya": ["https://kaguya.love/"],
  "media:anime:romance:t_go_tobun": ["https://www.tbs.co.jp/anime/5hanayome/"],
  "media:anime:romance:t_kanokari": ["https://kanokari-official.com/"],
  "media:anime:romance:t_horimiya": ["https://horimiya-anime.com/"],
  "media:anime:romance:t_kimi_todo": ["https://kiminitodo.com/"],
  "media:anime:mecha:t_macross": ["https://macross.jp/"],
  "media:anime:mecha:t_86": ["https://anime-86.com/"],
  "media:anime:mecha:t_gridman": ["https://gridman.net/"],
  "media:anime:mecha:t_break_blade": ["https://breakblade.jp/"],
  "media:anime:isekai:t_rezero": ["https://re-zero-anime.jp/"],
  "media:anime:isekai:t_tensura": ["https://ten-sura.com/"],
  "media:anime:isekai:t_mushoku": ["https://mushokutensei.jp/"],
  "media:anime:isekai:t_konosuba": ["https://konosuba.com/"],
  "media:anime:isekai:t_shield": ["https://shieldhero-anime.jp/"],
  "media:anime:horror:t_another": ["https://another-anime.jp/"],
  "media:anime:horror:t_promised": ["https://yakusokunoneverland.com/"],
  "media:anime:horror:t_mieruko": ["https://mierukochan-anime.com/"],
  "media:anime:horror:t_summertime": ["https://summertime-anime.com/"],
  "media:anime:sports_anime:t_haikyu": ["https://haikyu.jp/"],
  "media:anime:sports_anime:t_blue_lock": ["https://bluelock-pr.com/"],
  "media:anime:sports_anime:t_diamond": ["https://diaace.com/"],
  "media:anime:sports_anime:t_slamdunk": ["https://slamdunk-movie.jp/"],
  "media:anime:sports_anime:t_ahiru": ["https://ahirunosora.jp/"],
  "media:anime:music_idol:t_lovelive": ["https://www.lovelive-anime.jp/"],
  "media:anime:music_idol:t_imas": ["https://idolmaster-official.jp/"],
  "media:anime:music_idol:t_bandori": ["https://anime.bang-dream.com/"],
  "media:anime:music_idol:t_revstar": ["https://revuestarlight.com/"],
  "media:anime:music_idol:t_nana": ["https://www.vap.co.jp/nana/"],
  "media:anime:bl_gl:t_given": ["https://given-anime.com/"],
  "media:anime:bl_gl:t_doukyuusei": ["https://dou-kyu-sei.com/"],
  "media:anime:bl_gl:t_yuruyuri": ["https://yuruyuri.com/"],
  "media:anime:bl_gl:t_maria": ["https://www.gokigenyou.com/"],
  "media:anime:seiyuu:t_hypmic": ["https://hypnosismic.com/"],
  "media:anime:seiyuu:t_utapri": ["https://utapri.com/"],
  "media:anime:seiyuu:t_side_m": ["https://side-m.idolmaster-anime.jp/"],
  "media:anime:seiyuu:t_paradox": ["https://paradoxlive.jp/"],
  "media:anime:original_anime:t_edgerunners": ["https://www.cyberpunk-edgerunners.com/"],
  "media:anime:original_anime:t_oddtaxi": ["https://oddtaxi.jp/"],
  "media:anime:original_anime:t_platinum": ["https://anime-platinumend.com/"],
  "media:anime:original_anime:t_wonder_egg": ["https://wonder-egg.com/"],
  "media:anime:battle:t_mha": ["https://heroaca.com/"],
  "media:anime:battle:t_jjk": ["https://jujutsukaisen.jp/"],
  "media:anime:battle:t_kimetsu": ["https://kimetsu.com/anime/"],
  "media:anime:battle:t_fire_force": ["https://fireforce-anime.jp/"],
  "media:anime:comedy:t_gintama": ["https://gintama.com/"],
  "media:anime:comedy:t_nichijou": ["https://www.kyotoanimation.co.jp/works/nichijou/"],
  "media:anime:comedy:t_konosuba_c": ["https://konosuba.com/"],
  "media:anime:mystery:t_moriarty": ["https://moriarty-anime.com/"],
  "media:anime:mystery:t_undead": ["https://undeadgirl-anime.com/"],
  "media:anime:healing:t_aria": ["https://aria.company/"],
  "media:anime:healing:t_laid_back": ["https://yurucamp.jp/"],
  "media:anime:donghua:t_link_click": ["https://linkclick.jp/"],
  "media:anime:donghua:t_mo_dao": ["https://mdzs.jp/"],
  "media:anime:short_form:t_igma": ["https://nagatoro.jp/"],
  /** 特定作品ではなく短尺スピンオフ枠のチップ — 速報性の高いアニメ専門メディアを参照先にする */
  "media:anime:short_form:t_chibi": ["https://animeanime.jp/"],
};

function buildDefaultOfficialUrls(): Record<string, string[]> {
  const out: Record<string, string[]> = {};
  for (const fine of MEDIA_ANIME_FINES) {
    for (const w of fine.works ?? []) {
      const manual = MANUAL_OFFICIAL_URLS_BY_PICK_ID[w.id];
      out[w.id] = manual && manual.length > 0 ? [...manual] : [];
    }
  }
  for (const [k, v] of Object.entries(MANUAL_OFFICIAL_URLS_BY_PICK_ID)) {
    if (!(k in out) && v.length > 0) {
      out[k] = [...v];
    }
  }
  for (const [k, v] of Object.entries(MOVIE_WORK_OFFICIAL_URLS_BY_PICK_ID)) {
    if (!(k in out) && v.length > 0) {
      out[k] = [...v];
    }
  }
  for (const id of collectAllCanonicalInterestPickIds()) {
    const cur = out[id];
    if (cur && cur.length > 0) continue;
    const subId = subIdForCanonicalInterestPick(id);
    if (!subId) continue;
    const portal = INTEREST_SUB_PORTAL_URL_BY_ID[subId];
    if (!portal) continue;
    out[id] = [portal];
  }
  return out;
}

export const DEFAULT_OFFICIAL_URLS_BY_PICK_ID: Record<string, string[]> = buildDefaultOfficialUrls();
