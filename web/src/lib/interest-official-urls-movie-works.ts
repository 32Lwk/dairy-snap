/**
 * 趣味タクソノミー「映像・エンタメ › 映画」の works（`media:movie:*:t_*`）向け参照 URL。
 * 可能な限り配給・スタジオの公式ドメイン。古典で単体公式が無い作品は映画.com の作品ページ（日本の上映情報で検証しやすい）。
 */

export const MOVIE_WORK_OFFICIAL_URLS_BY_PICK_ID: Record<string, string[]> = {
  "media:movie:hollywood:t_dune": ["https://www.warnerbros.co.jp/movie/dune/"],
  "media:movie:hollywood:t_oppenheimer": ["https://www.universalpictures.jp/micro/oppenheimer"],
  "media:movie:hollywood:t_batman": ["https://wwws.warnerbros.co.jp/movie/the-batman/"],

  "media:movie:japanese:t_shoplifters": ["https://gaga.ne.jp/manbiki-kazoku/"],
  "media:movie:japanese:t_drive_my_car": ["https://drivemycar.jp/"],
  "media:movie:japanese:t_godzilla": ["https://godzilla.com/"],

  "media:movie:animation:t_kimi_no_na": ["https://kiminona.com/"],
  "media:movie:animation:t_suzume": ["https://suzume-tojimari-movie.jp/"],
  "media:movie:animation:t_jujutsu_zero": ["https://jujutsukaisen-movie.jp/"],

  "media:movie:documentary:t_free_solo": ["https://www.20thcenturystudios.jp/movies/freesolo"],
  "media:movie:documentary:t_march_penguin": ["https://movies.disney.com/march-of-the-penguins"],

  "media:movie:horror:t_ring": ["https://eiga.com/movie/75639/"],
  "media:movie:horror:t_ju_on": ["https://www.toei-video.co.jp/juon4k/"],
  "media:movie:horror:t_hereditary": ["https://hereditary-movie.jp/"],

  "media:movie:sf:t_blade_runner": ["https://www.warnerbros.co.jp/movie/blade-runner-2049/"],
  "media:movie:sf:t_matrix": ["https://wwws.warnerbros.co.jp/matrix/"],
  "media:movie:sf:t_interstellar": ["https://www.warnerbros.co.jp/movie/interstellar/"],

  "media:movie:indie:t_moonlight": ["https://moonlight-movie.jp/"],
  /** 単体公式が消えやすい — 配給ポータル（作品ニュース・上映履歴の参照用） */
  "media:movie:indie:t_parasite": ["https://gaga.ne.jp/pt/"],

  "media:movie:thriller:t_seven": ["https://wwws.warnerbros.co.jp/se7en/"],
  "media:movie:thriller:t_silence_lambs": ["https://wwws.warnerbros.co.jp/silence-of-the-lambs/"],

  "media:movie:romance:t_before_sunrise": ["https://www.warnerbros.co.jp/movie/before-sunrise/"],
  "media:movie:romance:t_notebook": ["https://www.warnerbros.co.jp/movie/the-notebook/"],

  "media:movie:disney:t_toy_story": ["https://movies.disney.co.jp/toystory"],
  "media:movie:disney:t_frozen": ["https://movies.disney.co.jp/frozen"],
  "media:movie:disney:t_inside_out": ["https://movies.disney.co.jp/io"],

  "media:movie:4dx_imax:t_dune_imax": ["https://www.warnerbros.co.jp/movie/dune/"],
  "media:movie:4dx_imax:t_interstellar_imax": ["https://www.warnerbros.co.jp/movie/interstellar/"],
};
