/**
 * Somnio.Co Atelier — UI translation packs.
 *
 * Mirrors the four supported manual languages (en/zh/fr/it). Step + phase
 * titles still come from the backend (it has the canonical pack in
 * `_step_translations.py`); these dictionaries cover the *static* chrome
 * around them — labels, buttons, empty states, confirmation copy.
 */
import { useAuth } from "@/src/context/AuthContext";

/** Country → language tag map mirrors backend `_translation.COUNTRY_LANG`. */
const COUNTRY_TO_LANG: Record<string, string> = {
  AU: "en",
  GB: "en",
  US: "en",
  CA: "en",
  NZ: "en",
  IE: "en",
  SG: "en",
  ZA: "en",
  IN: "en",
  CN: "zh",
  HK: "zh",
  TW: "zh",
  FR: "fr",
  BE: "fr",
  CH: "fr",
  IT: "it",
};

export type LangCode = "en" | "zh" | "fr" | "it";

const STRINGS = {
  // -------- Common chrome --------
  "common.cancel": { en: "CANCEL", zh: "取消", fr: "ANNULER", it: "ANNULLA" },
  "common.save": { en: "SAVE", zh: "保存", fr: "ENREGISTRER", it: "SALVA" },
  "common.delete": { en: "DELETE", zh: "删除", fr: "SUPPRIMER", it: "ELIMINA" },
  "common.confirm": { en: "CONFIRM", zh: "确认", fr: "CONFIRMER", it: "CONFERMA" },
  "common.close": { en: "CLOSE", zh: "关闭", fr: "FERMER", it: "CHIUDI" },
  "common.update": { en: "UPDATE", zh: "更新", fr: "MODIFIER", it: "AGGIORNA" },
  "common.add": { en: "ADD", zh: "添加", fr: "AJOUTER", it: "AGGIUNGI" },
  "common.loading": { en: "LOADING", zh: "加载中", fr: "CHARGEMENT", it: "CARICAMENTO" },
  "common.in_progress": {
    en: "in progress",
    zh: "进行中",
    fr: "en cours",
    it: "in corso",
  },
  "common.completed": {
    en: "completed",
    zh: "已完成",
    fr: "terminé",
    it: "completato",
  },

  // -------- Header / dashboard --------
  "home.brand_mark": {
    en: "SOMNIO.CO · ATELIER",
    zh: "SOMNIO.CO · 工作室",
    fr: "SOMNIO.CO · ATELIER",
    it: "SOMNIO.CO · ATELIER",
  },
  "home.stat.active": {
    en: "ACTIVE",
    zh: "进行中",
    fr: "ACTIFS",
    it: "ATTIVI",
  },
  "home.stat.completed": {
    en: "COMPLETED",
    zh: "已完成",
    fr: "TERMINÉS",
    it: "COMPLETATI",
  },
  "home.stat.total": { en: "TOTAL", zh: "总计", fr: "TOTAL", it: "TOTALE" },
  "home.cta.new_commission": {
    en: "NEW COMMISSION",
    zh: "新建委托",
    fr: "NOUVELLE COMMANDE",
    it: "NUOVA COMMESSA",
  },
  "home.link.manage_users": {
    en: "MANUFACTURERS · USERS",
    zh: "工坊 · 用户",
    fr: "FABRICANTS · UTILISATEURS",
    it: "PRODUTTORI · UTENTI",
  },
  "home.link.recycle_bin": {
    en: "ATELIER · RECYCLE BIN",
    zh: "工作室 · 回收站",
    fr: "ATELIER · CORBEILLE",
    it: "ATELIER · CESTINO",
  },
  "home.link.test_translation": {
    en: "ATELIER · TEST TRANSLATION",
    zh: "工作室 · 翻译测试",
    fr: "ATELIER · TEST DE TRADUCTION",
    it: "ATELIER · TEST TRADUZIONE",
  },
  "home.link.dashboard": {
    en: "Dashboard",
    zh: "数据看板",
    fr: "Tableau de bord",
    it: "Dashboard",
  },
  "home.chart.eyebrow": {
    en: "ATELIER · PULSE",
    zh: "工作室 · 动态",
    fr: "ATELIER · PULSATIONS",
    it: "ATELIER · PULSO",
  },
  "home.chart.title": {
    en: "LAST {n} DAYS",
    zh: "最近 {n} 天",
    fr: "{n} DERNIERS JOURS",
    it: "ULTIMI {n} GIORNI",
  },
  "home.chart.legend.commissions": {
    en: "New commissions",
    zh: "新建委托",
    fr: "Nouvelles commandes",
    it: "Nuove commissioni",
  },
  "home.chart.legend.forwarded": {
    en: "Steps forwarded",
    zh: "已转交步骤",
    fr: "Étapes transmises",
    it: "Fasi inoltrate",
  },
  "home.chart.legend.dnas": {
    en: "Digital DNAs ready",
    zh: "数字 DNA 完成",
    fr: "ADN numériques prêts",
    it: "DNA digitali pronti",
  },
  "home.link.activity_log": {
    en: "Activity Log",
    zh: "活动日志",
    fr: "Journal d’activité",
    it: "Registro attività",
  },
  "home.link.atelier_tools": {
    en: "ATELIER TOOLS",
    zh: "工作室工具",
    fr: "OUTILS DE L’ATELIER",
    it: "STRUMENTI ATELIER",
  },
  "home.link.atelier_tools.sub": {
    en: "Recycle bin · Activity log · Translation · Debug",
    zh: "回收站 · 活动日志 · 翻译 · 调试",
    fr: "Corbeille · Journal · Traduction · Debug",
    it: "Cestino · Registro · Traduzione · Debug",
  },
  "tools.eyebrow": {
    en: "ATELIER · UTILITIES",
    zh: "工作室 · 工具",
    fr: "ATELIER · UTILITAIRES",
    it: "ATELIER · UTILITÀ",
  },
  "tools.intro": {
    en: "Secondary destinations for moderation, audit and developer workflows. None of these are needed during day-to-day production work.",
    zh: "用于审核、审计与开发流程的次要入口。在日常生产工作中无需使用这些工具。",
    fr: "Destinations secondaires pour la modération, l’audit et le développement. Aucune n’est requise au quotidien.",
    it: "Destinazioni secondarie per moderazione, audit e flussi di sviluppo. Non sono necessarie nel lavoro quotidiano.",
  },
  "tools.recycle_bin.sub": {
    en: "Soft-deleted commissions and media awaiting restore or purge.",
    zh: "已软删除的委托与媒体,待恢复或彻底清除。",
    fr: "Commandes et médias supprimés en attente de restauration ou de purge.",
    it: "Commissioni e media eliminati in attesa di ripristino o eliminazione definitiva.",
  },
  "tools.activity_log.sub": {
    en: "Chronological audit trail of every state change across orders.",
    zh: "所有订单状态变更的按时间顺序审计日志。",
    fr: "Journal d’audit chronologique de tous les changements d’état.",
    it: "Registro cronologico di tutti i cambi di stato delle commissioni.",
  },
  "tools.test_translate.sub": {
    en: "Claude i18n sandbox — try the workshop-notes pipeline on ad-hoc input.",
    zh: "Claude 翻译沙盒 — 在自定义文本上测试工坊备注流水线。",
    fr: "Bac à sable Claude — testez le pipeline des notes d’atelier.",
    it: "Sandbox Claude — prova la pipeline di traduzione delle note di laboratorio.",
  },
  "tools.debug.sub": {
    en: "Seed sample data, force-clear caches, and other developer escape hatches.",
    zh: "导入示例数据、强制清除缓存以及其他开发者快捷工具。",
    fr: "Données de test, vidage du cache et autres outils de développement.",
    it: "Dati di esempio, pulizia cache e altri strumenti di sviluppo.",
  },
  "home.filters.label": {
    en: "FILTERS",
    zh: "筛选",
    fr: "FILTRES",
    it: "FILTRI",
  },
  "home.link.media_approvals": {
    en: "MEDIA APPROVALS",
    zh: "媒体审核",
    fr: "VALIDATION DES MÉDIAS",
    it: "APPROVAZIONI MEDIA",
  },
  "home.link.cad_library": {
    en: "CAD LIBRARY",
    zh: "CAD 资料库",
    fr: "BIBLIOTHÈQUE CAO",
    it: "LIBRERIA CAD",
  },
  "home.link.renders_library": {
    en: "RENDERS LIBRARY",
    zh: "渲染资料库",
    fr: "BIBLIOTHÈQUE DE RENDUS",
    it: "LIBRERIA RENDER",
  },
  "renders_lib.title": {
    en: "RENDERS LIBRARY",
    zh: "渲染资料库",
    fr: "BIBLIOTHÈQUE DE RENDUS",
    it: "LIBRERIA RENDER",
  },
  "renders_lib.eyebrow": {
    en: "ATELIER · CROSS-ORDER",
    zh: "工作室 · 跨订单",
    fr: "ATELIER · MULTI-COMMANDES",
    it: "ATELIER · MULTI-ORDINI",
  },
  "renders_lib.all_studios": {
    en: "ALL STUDIOS",
    zh: "全部工作室",
    fr: "TOUS LES STUDIOS",
    it: "TUTTI GLI STUDI",
  },
  "renders_lib.search_placeholder": {
    en: "Search jewelry, order ref, render…",
    zh: "搜索珠宝、订单或渲染图…",
    fr: "Rechercher bijou, réf. ou rendu…",
    it: "Cerca gioiello, rif. ordine o render…",
  },
  "renders_lib.empty": {
    en: "No approved renders match the current filters.",
    zh: "没有符合当前筛选条件的已审核渲染图。",
    fr: "Aucun rendu approuvé ne correspond aux filtres.",
    it: "Nessun render approvato corrisponde ai filtri attuali.",
  },
  "renders_lib.empty_hint": {
    en: "Try clearing search, switching studios, or wait for new approvals.",
    zh: "请尝试清除搜索、切换工作室,或等待新的审核结果。",
    fr: "Effacez la recherche, changez de studio ou attendez de nouvelles validations.",
    it: "Prova a cancellare la ricerca, cambiare studio o attendere nuove approvazioni.",
  },
  "renders_lib.email_cta": {
    en: "EMAIL {n} RENDER",
    zh: "发送 {n} 个渲染图",
    fr: "ENVOYER {n} RENDU",
    it: "INVIA {n} RENDER",
  },
  "renders_lib.email_cta_plural": {
    en: "EMAIL {n} RENDERS",
    zh: "发送 {n} 个渲染图",
    fr: "ENVOYER {n} RENDUS",
    it: "INVIA {n} RENDER",
  },
  "renders_lib.upload": {
    en: "UPLOAD",
    zh: "上传",
    fr: "AJOUTER",
    it: "CARICA",
  },

  "cad_lib.title": {
    en: "CAD LIBRARY",
    zh: "CAD 资料库",
    fr: "BIBLIOTHÈQUE CAO",
    it: "LIBRERIA CAD",
  },
  "cad_lib.eyebrow": {
    en: "ATELIER · CROSS-ORDER",
    zh: "工作室 · 跨订单",
    fr: "ATELIER · MULTI-COMMANDES",
    it: "ATELIER · MULTI-ORDINI",
  },
  "cad_lib.all_workshops": {
    en: "ALL WORKSHOPS",
    zh: "全部工坊",
    fr: "TOUS LES ATELIERS",
    it: "TUTTI I LABORATORI",
  },
  "cad_lib.search_placeholder": {
    en: "Search jewelry, order ref, file…",
    zh: "搜索珠宝、订单或文件…",
    fr: "Rechercher bijou, réf. ou fichier…",
    it: "Cerca gioiello, rif. ordine o file…",
  },
  "cad_lib.empty": {
    en: "No CAD files match the current filters.",
    zh: "没有符合当前筛选条件的 CAD 文件。",
    fr: "Aucun fichier CAO ne correspond aux filtres.",
    it: "Nessun file CAD corrisponde ai filtri attuali.",
  },
  "cad_lib.empty_hint": {
    en: "Try clearing search, switching workshops, or wait for new uploads.",
    zh: "请尝试清除搜索、切换工坊,或等待新的上传。",
    fr: "Effacez la recherche, changez d’atelier ou attendez de nouveaux téléversements.",
    it: "Prova a cancellare la ricerca, cambiare laboratorio o attendere nuovi caricamenti.",
  },
  "cad_lib.selected": {
    en: "{n} selected",
    zh: "已选 {n} 个",
    fr: "{n} sélectionné(s)",
    it: "{n} selezionati",
  },
  "cad_lib.clear_selection": {
    en: "CLEAR",
    zh: "清除",
    fr: "EFFACER",
    it: "PULISCI",
  },
  "cad_lib.email_cta": {
    en: "EMAIL {n} FILE",
    zh: "发送 {n} 个文件",
    fr: "ENVOYER {n} FICHIER",
    it: "INVIA {n} FILE",
  },
  "cad_lib.email_cta_plural": {
    en: "EMAIL {n} FILES",
    zh: "发送 {n} 个文件",
    fr: "ENVOYER {n} FICHIERS",
    it: "INVIA {n} FILE",
  },
  "cad_lib.group_count": {
    en: "{n} files",
    zh: "{n} 个文件",
    fr: "{n} fichiers",
    it: "{n} file",
  },
  "cad_lib.preview": {
    en: "PREVIEW",
    zh: "预览",
    fr: "APERÇU",
    it: "ANTEPRIMA",
  },
  "cad_lib.open": {
    en: "OPEN",
    zh: "打开",
    fr: "OUVRIR",
    it: "APRI",
  },
  // ---- Shared library copy (dropdowns + date presets) -------------------
  "lib.all_workshops": {
    en: "All workshops",
    zh: "所有工坊",
    fr: "Tous les ateliers",
    it: "Tutti i laboratori",
  },
  "lib.all_studios": {
    en: "All studios",
    zh: "所有工作室",
    fr: "Tous les studios",
    it: "Tutti gli studi",
  },
  "lib.all_clients": {
    en: "All clients",
    zh: "所有客户",
    fr: "Tous les clients",
    it: "Tutti i clienti",
  },
  "lib.daily_report": {
    en: "DAILY REPORT",
    zh: "每日报告",
    fr: "RAPPORT QUOTIDIEN",
    it: "REPORT GIORNALIERO",
  },
  "lib.preset_day": {
    en: "DAY",
    zh: "日",
    fr: "JOUR",
    it: "GIORNO",
  },
  "lib.preset_week": {
    en: "WEEK",
    zh: "周",
    fr: "SEMAINE",
    it: "SETTIMANA",
  },
  "lib.preset_month": {
    en: "MONTH",
    zh: "月",
    fr: "MOIS",
    it: "MESE",
  },
  "lib.preset_quarter": {
    en: "QTR",
    zh: "季",
    fr: "TRIM.",
    it: "TRIM.",
  },
  "lib.preset_ytd": {
    en: "YTD",
    zh: "年初至今",
    fr: "ANNÉE",
    it: "ANNO",
  },
  "lib.preset_custom": {
    en: "CUSTOM",
    zh: "自定义",
    fr: "PERSO.",
    it: "PERSON.",
  },
  // ---- Admin · IGI / Airway / Customs cross-order libraries -------------
  "home.link.igi_library": {
    en: "IGI LIBRARY",
    zh: "IGI 证书库",
    fr: "BIBLIOTHÈQUE IGI",
    it: "LIBRERIA IGI",
  },
  "home.link.airway_library": {
    en: "AIRWAY BILL LIBRARY",
    zh: "空运单资料库",
    fr: "BIBLIOTHÈQUE LTA",
    it: "LIBRERIA LETTERE DI VETTURA",
  },
  "home.link.customs_library": {
    en: "CUSTOMS LIBRARY",
    zh: "海关文件库",
    fr: "BIBLIOTHÈQUE DOUANES",
    it: "LIBRERIA DOGANA",
  },
  "igi_lib.eyebrow": {
    en: "ATELIER · CROSS-ORDER",
    zh: "工作室 · 跨订单",
    fr: "ATELIER · MULTI-COMMANDES",
    it: "ATELIER · MULTI-ORDINI",
  },
  "igi_lib.title": {
    en: "IGI LIBRARY",
    zh: "IGI 证书库",
    fr: "BIBLIOTHÈQUE IGI",
    it: "LIBRERIA IGI",
  },
  "igi_lib.search_placeholder": {
    en: "Search jewelry, order ref, certificate…",
    zh: "搜索珠宝、订单或证书…",
    fr: "Rechercher bijou, réf. ou certificat…",
    it: "Cerca gioiello, rif. ordine o certificato…",
  },
  "igi_lib.empty": {
    en: "No IGI certificates match the current filters.",
    zh: "没有符合当前筛选条件的 IGI 证书。",
    fr: "Aucun certificat IGI ne correspond aux filtres.",
    it: "Nessun certificato IGI corrisponde ai filtri attuali.",
  },
  "igi_lib.empty_hint": {
    en: "Try clearing search, switching workshops, or wait for new approvals.",
    zh: "请尝试清除搜索、切换工坊,或等待新的审核结果。",
    fr: "Effacez la recherche, changez d’atelier ou attendez de nouvelles validations.",
    it: "Prova a cancellare la ricerca, cambiare laboratorio o attendere nuove approvazioni.",
  },
  "igi_lib.email_cta": {
    en: "EMAIL {n} CERTIFICATE",
    zh: "发送 {n} 个证书",
    fr: "ENVOYER {n} CERTIFICAT",
    it: "INVIA {n} CERTIFICATO",
  },
  "igi_lib.email_cta_plural": {
    en: "EMAIL {n} CERTIFICATES",
    zh: "发送 {n} 个证书",
    fr: "ENVOYER {n} CERTIFICATS",
    it: "INVIA {n} CERTIFICATI",
  },
  "airway_lib.eyebrow": {
    en: "ATELIER · CROSS-ORDER",
    zh: "工作室 · 跨订单",
    fr: "ATELIER · MULTI-COMMANDES",
    it: "ATELIER · MULTI-ORDINI",
  },
  "airway_lib.title": {
    en: "AIRWAY BILL LIBRARY",
    zh: "空运单资料库",
    fr: "BIBLIOTHÈQUE LTA",
    it: "LIBRERIA LETTERE DI VETTURA",
  },
  "airway_lib.search_placeholder": {
    en: "Search jewelry, order ref, document…",
    zh: "搜索珠宝、订单或文件…",
    fr: "Rechercher bijou, réf. ou document…",
    it: "Cerca gioiello, rif. ordine o documento…",
  },
  "airway_lib.empty": {
    en: "No airway-bill documents match the current filters.",
    zh: "没有符合当前筛选条件的空运单。",
    fr: "Aucun document LTA ne correspond aux filtres.",
    it: "Nessuna lettera di vettura corrisponde ai filtri attuali.",
  },
  "airway_lib.empty_hint": {
    en: "Try clearing search, switching workshops, or wait for new uploads.",
    zh: "请尝试清除搜索、切换工坊,或等待新的上传。",
    fr: "Effacez la recherche, changez d’atelier ou attendez de nouveaux téléversements.",
    it: "Prova a cancellare la ricerca, cambiare laboratorio o attendere nuovi caricamenti.",
  },
  "airway_lib.email_cta": {
    en: "EMAIL {n} DOCUMENT",
    zh: "发送 {n} 个文件",
    fr: "ENVOYER {n} DOCUMENT",
    it: "INVIA {n} DOCUMENTO",
  },
  "airway_lib.email_cta_plural": {
    en: "EMAIL {n} DOCUMENTS",
    zh: "发送 {n} 个文件",
    fr: "ENVOYER {n} DOCUMENTS",
    it: "INVIA {n} DOCUMENTI",
  },
  "customs_lib.eyebrow": {
    en: "ATELIER · CROSS-ORDER",
    zh: "工作室 · 跨订单",
    fr: "ATELIER · MULTI-COMMANDES",
    it: "ATELIER · MULTI-ORDINI",
  },
  "customs_lib.title": {
    en: "CUSTOMS LIBRARY",
    zh: "海关文件库",
    fr: "BIBLIOTHÈQUE DOUANES",
    it: "LIBRERIA DOGANA",
  },
  "customs_lib.search_placeholder": {
    en: "Search jewelry, order ref, document…",
    zh: "搜索珠宝、订单或文件…",
    fr: "Rechercher bijou, réf. ou document…",
    it: "Cerca gioiello, rif. ordine o documento…",
  },
  "customs_lib.empty": {
    en: "No customs documents match the current filters.",
    zh: "没有符合当前筛选条件的海关文件。",
    fr: "Aucun document de douane ne correspond aux filtres.",
    it: "Nessun documento doganale corrisponde ai filtri attuali.",
  },
  "customs_lib.empty_hint": {
    en: "Try clearing search, switching workshops, or wait for new uploads.",
    zh: "请尝试清除搜索、切换工坊,或等待新的上传。",
    fr: "Effacez la recherche, changez d’atelier ou attendez de nouveaux téléversements.",
    it: "Prova a cancellare la ricerca, cambiare laboratorio o attendere nuovi caricamenti.",
  },
  "customs_lib.email_cta": {
    en: "EMAIL {n} DOCUMENT",
    zh: "发送 {n} 个文件",
    fr: "ENVOYER {n} DOCUMENT",
    it: "INVIA {n} DOCUMENTO",
  },
  "customs_lib.email_cta_plural": {
    en: "EMAIL {n} DOCUMENTS",
    zh: "发送 {n} 个文件",
    fr: "ENVOYER {n} DOCUMENTS",
    it: "INVIA {n} DOCUMENTI",
  },
  // -----------------------------------------------------------------------
  // login.tsx
  // -----------------------------------------------------------------------
  "login.brand.title": {
    en: "Digital DNA\nfor every Maison piece.",
    zh: "为每一件 Maison 珍品\n打造数字 DNA。",
    fr: "ADN numérique\npour chaque pièce de la Maison.",
    it: "DNA digitale\nper ogni pezzo della Maison.",
  },
  "login.brand.sub": {
    en: "A 26-step traceable journey, from origin to ownership.",
    zh: "26 步可追溯之旅,从起源到归属。",
    fr: "Un parcours traçable en 26 étapes, de l’origine à la possession.",
    it: "Un percorso tracciabile in 26 fasi, dall’origine al possesso.",
  },
  "login.label.email": {
    en: "EMAIL",
    zh: "电子邮箱",
    fr: "E-MAIL",
    it: "E-MAIL",
  },
  "login.label.password": {
    en: "PASSWORD",
    zh: "密码",
    fr: "MOT DE PASSE",
    it: "PASSWORD",
  },
  "login.placeholder.email": {
    en: "you@maison.com",
    zh: "you@maison.com",
    fr: "vous@maison.com",
    it: "tu@maison.com",
  },
  "login.cta.enter": {
    en: "ENTER ATELIER",
    zh: "进入工作室",
    fr: "ENTRER DANS L’ATELIER",
    it: "ENTRA IN ATELIER",
  },
  "login.error.failed": {
    en: "Sign-in failed",
    zh: "登录失败",
    fr: "Échec de connexion",
    it: "Accesso non riuscito",
  },
  "login.demo.title": {
    en: "QUICK ACCESS · DEMO",
    zh: "快速访问 · 演示",
    fr: "ACCÈS RAPIDE · DÉMO",
    it: "ACCESSO RAPIDO · DEMO",
  },
  "login.demo.atelier": {
    en: "Atelier (Admin)",
    zh: "工作室(管理员)",
    fr: "Atelier (Admin)",
    it: "Atelier (Admin)",
  },
  "login.demo.workshop": {
    en: "Workshop (Manufacturer)",
    zh: "工坊(制造商)",
    fr: "Atelier (Fabricant)",
    it: "Laboratorio (Produttore)",
  },
  "login.demo.associate": {
    en: "Associate",
    zh: "助理",
    fr: "Associé(e)",
    it: "Associato",
  },
  "login.demo.client": {
    en: "Maison (Client)",
    zh: "Maison(客户)",
    fr: "Maison (Client)",
    it: "Maison (Cliente)",
  },
  // -----------------------------------------------------------------------
  // create-user.tsx (workshop + cad_renderer creation flow)
  // -----------------------------------------------------------------------
  "create_user.title.admin": {
    en: "NEW ATELIER ADMIN",
    zh: "新增工作室管理员",
    fr: "NOUVEL ADMIN ATELIER",
    it: "NUOVO ADMIN ATELIER",
  },
  "create_user.title.manufacturer": {
    en: "NEW WORKSHOP",
    zh: "新增工坊",
    fr: "NOUVEL ATELIER",
    it: "NUOVO LABORATORIO",
  },
  "create_user.title.cad_renderer": {
    en: "NEW CAD / RENDER STUDIO",
    zh: "新增 CAD / 渲染工作室",
    fr: "NOUVEAU STUDIO CAO / RENDU",
    it: "NUOVO STUDIO CAD / RENDER",
  },
  "create_user.title.associate": {
    en: "NEW ASSOCIATE",
    zh: "新增助理",
    fr: "NOUVEL ASSOCIÉ",
    it: "NUOVO ASSOCIATO",
  },
  "create_user.title.client": {
    en: "NEW CLIENT",
    zh: "新增客户",
    fr: "NOUVEAU CLIENT",
    it: "NUOVO CLIENTE",
  },
  "create_user.eyebrow": {
    en: "DIRECTORY",
    zh: "目录",
    fr: "ANNUAIRE",
    it: "DIRECTORY",
  },
  "create_user.label.studio_name": {
    en: "STUDIO / VENDOR NAME",
    zh: "工作室 / 供应商名称",
    fr: "NOM DU STUDIO / FOURNISSEUR",
    it: "NOME STUDIO / FORNITORE",
  },
  "create_user.label.workshop_name": {
    en: "WORKSHOP NAME",
    zh: "工坊名称",
    fr: "NOM DE L’ATELIER",
    it: "NOME LABORATORIO",
  },
  "create_user.label.full_name": {
    en: "FULL NAME",
    zh: "全名",
    fr: "NOM COMPLET",
    it: "NOME COMPLETO",
  },
  "create_user.label.email": {
    en: "EMAIL",
    zh: "电子邮箱",
    fr: "E-MAIL",
    it: "E-MAIL",
  },
  "create_user.label.password": {
    en: "PASSWORD",
    zh: "密码",
    fr: "MOT DE PASSE",
    it: "PASSWORD",
  },
  "create_user.label.country": {
    en: "COUNTRY",
    zh: "国家",
    fr: "PAYS",
    it: "PAESE",
  },
  "create_user.label.alias": {
    en: "ALIAS (client-facing)",
    zh: "别名(客户可见)",
    fr: "ALIAS (visible client)",
    it: "ALIAS (visibile al cliente)",
  },
  "create_user.placeholder.studio": {
    en: "e.g. Lumière CAD Studios",
    zh: "例如:Lumière CAD Studios",
    fr: "ex. Lumière CAD Studios",
    it: "es. Lumière CAD Studios",
  },
  "create_user.placeholder.workshop": {
    en: "e.g. Heritage Atelier",
    zh: "例如:Heritage Atelier",
    fr: "ex. Heritage Atelier",
    it: "es. Heritage Atelier",
  },
  "create_user.placeholder.name": {
    en: "First Last",
    zh: "姓 名",
    fr: "Prénom Nom",
    it: "Nome Cognome",
  },
  "create_user.contacts.studio_hint": {
    en: "Add up to 3 contacts for this studio. Tap the star to choose the primary recipient.",
    zh: "为此工作室添加最多 3 位联系人。点击星标选择主要收件人。",
    fr: "Ajoutez jusqu’à 3 contacts pour ce studio. Touchez l’étoile pour choisir le destinataire principal.",
    it: "Aggiungi fino a 3 contatti per questo studio. Tocca la stella per scegliere il destinatario principale.",
  },
  "create_user.contacts.workshop_hint": {
    en: "Add up to 3 contacts for this workshop. Tap the star to choose the primary recipient.",
    zh: "为此工坊添加最多 3 位联系人。点击星标选择主要收件人。",
    fr: "Ajoutez jusqu’à 3 contacts pour cet atelier. Touchez l’étoile pour choisir le destinataire principal.",
    it: "Aggiungi fino a 3 contatti per questo laboratorio. Tocca la stella per scegliere il destinatario principale.",
  },
  "create_user.cta.create": {
    en: "CREATE",
    zh: "创建",
    fr: "CRÉER",
    it: "CREA",
  },
  "create_user.toast.created.workshop": {
    en: "Workshop created",
    zh: "工坊已创建",
    fr: "Atelier créé",
    it: "Laboratorio creato",
  },
  "create_user.toast.created.cad_renderer": {
    en: "CAD / Render studio created",
    zh: "CAD / 渲染工作室已创建",
    fr: "Studio CAO / Rendu créé",
    it: "Studio CAD / Render creato",
  },
  "create_user.toast.created.admin": {
    en: "Admin created",
    zh: "管理员已创建",
    fr: "Admin créé",
    it: "Admin creato",
  },
  "create_user.toast.created.associate": {
    en: "Associate created",
    zh: "助理已创建",
    fr: "Associé créé",
    it: "Associato creato",
  },
  "create_user.toast.created.client": {
    en: "Client created",
    zh: "客户已创建",
    fr: "Client créé",
    it: "Cliente creato",
  },
  "create_user.error.required": {
    en: "All fields are required",
    zh: "请填写所有字段",
    fr: "Tous les champs sont requis",
    it: "Tutti i campi sono obbligatori",
  },
  // -----------------------------------------------------------------------
  // order/[id].tsx — remaining hardcoded labels
  // -----------------------------------------------------------------------
  "order.status.in_progress": {
    en: "IN PROGRESS",
    zh: "进行中",
    fr: "EN COURS",
    it: "IN CORSO",
  },
  "order.status.completed": {
    en: "COMPLETED",
    zh: "已完成",
    fr: "TERMINÉ",
    it: "COMPLETATO",
  },
  "order.status.draft": {
    en: "DRAFT",
    zh: "草稿",
    fr: "BROUILLON",
    it: "BOZZA",
  },
  "order.label.client": {
    en: "Client",
    zh: "客户",
    fr: "Client",
    it: "Cliente",
  },
  "order.label.workshop": {
    en: "Workshop",
    zh: "工坊",
    fr: "Atelier",
    it: "Laboratorio",
  },
  "order.label.sku": {
    en: "SKU",
    zh: "SKU",
    fr: "RÉF.",
    it: "SKU",
  },
  "order.journey.heading": {
    en: "26-STEP JOURNEY",
    zh: "26 步工艺之旅",
    fr: "PARCOURS EN 26 ÉTAPES",
    it: "VIAGGIO IN 26 FASI",
  },
  "order.digital_dna.locked.title": {
    en: "DIGITAL DNA · LOCKED",
    zh: "数字 DNA · 已锁定",
    fr: "ADN NUMÉRIQUE · VERROUILLÉ",
    it: "DNA DIGITALE · BLOCCATO",
  },
  "order.digital_dna.locked.sub": {
    en: "Unlocks once all 26 steps are finalised · {done}/26",
    zh: "完成全部 26 步后解锁 · {done}/26",
    fr: "Déverrouillage après les 26 étapes · {done}/26",
    it: "Si sblocca al completamento delle 26 fasi · {done}/26",
  },
  "order.digital_dna.unlocked.title": {
    en: "DIGITAL DNA · READY",
    zh: "数字 DNA · 已就绪",
    fr: "ADN NUMÉRIQUE · PRÊT",
    it: "DNA DIGITALE · PRONTO",
  },
  "order.digital_dna.unlocked.sub": {
    en: "Tap to view & download the provenance certificate.",
    zh: "点击查看并下载溯源证书。",
    fr: "Touchez pour voir et télécharger le certificat de provenance.",
    it: "Tocca per vedere e scaricare il certificato di provenienza.",
  },
  "order.phase.label": {
    en: "PHASE {code}",
    zh: "阶段 {code}",
    fr: "PHASE {code}",
    it: "FASE {code}",
  },
  "order.card.cad_title": {
    en: "CAD Files",
    zh: "CAD 文件",
    fr: "Fichiers CAO",
    it: "File CAD",
  },
  "order.card.cad_sub": {
    en: "Upload .stl / .step / .3dm and other workshop files",
    zh: "上传 .stl / .step / .3dm 等工坊文件",
    fr: "Téléversez .stl / .step / .3dm et autres fichiers d’atelier",
    it: "Carica file .stl / .step / .3dm e altri formati di laboratorio",
  },
  "order.card.igi_title": {
    en: "IGI Certificates",
    zh: "IGI 证书",
    fr: "Certificats IGI",
    it: "Certificati IGI",
  },
  "order.card.igi_sub": {
    en: "Attach digital IGI lab reports (PDF, image, any file type)",
    zh: "附加数字 IGI 实验室报告(PDF、图像或任意格式)",
    fr: "Joindre les rapports IGI numériques (PDF, image, tout format)",
    it: "Allega rapporti IGI digitali (PDF, immagine, qualsiasi formato)",
  },
  // -----------------------------------------------------------------------
  // cad-files/[id].tsx (per-order CAD viewer)
  // -----------------------------------------------------------------------
  "cad_page.title": {
    en: "CAD FILES",
    zh: "CAD 文件",
    fr: "FICHIERS CAO",
    it: "FILE CAD",
  },
  "cad_page.eyebrow": {
    en: "COMMISSION FOLDER",
    zh: "委托文件夹",
    fr: "DOSSIER DE COMMANDE",
    it: "CARTELLA COMMISSIONE",
  },
  "cad_page.upload": {
    en: "UPLOAD CAD",
    zh: "上传 CAD",
    fr: "TÉLÉVERSER CAO",
    it: "CARICA CAD",
  },
  "cad_page.email": {
    en: "EMAIL FILES",
    zh: "发送文件",
    fr: "ENVOYER PAR E-MAIL",
    it: "INVIA FILE",
  },
  "cad_page.empty": {
    en: "No CAD files uploaded yet.",
    zh: "尚未上传任何 CAD 文件。",
    fr: "Aucun fichier CAO téléversé.",
    it: "Nessun file CAD caricato.",
  },
  "cad_page.empty_hint": {
    en: "Drop your STL, OBJ, 3DM or other design payloads here so the workshop can pick them up.",
    zh: "请上传 STL、OBJ、3DM 等设计文件供工坊使用。",
    fr: "Déposez ici vos fichiers STL, OBJ, 3DM ou autres pour l’atelier.",
    it: "Carica qui i tuoi file STL, OBJ, 3DM o altri formati per il laboratorio.",
  },
  "cad_page.preview": {
    en: "PREVIEW",
    zh: "预览",
    fr: "APERÇU",
    it: "ANTEPRIMA",
  },
  "cad_page.open": {
    en: "OPEN",
    zh: "打开",
    fr: "OUVRIR",
    it: "APRI",
  },
  "cad_page.delete.title": {
    en: "Delete CAD file?",
    zh: "删除 CAD 文件?",
    fr: "Supprimer le fichier CAO ?",
    it: "Eliminare il file CAD?",
  },
  "cad_page.delete.message": {
    en: "\"{name}\" will be removed from this commission. This cannot be undone.",
    zh: "“{name}”将从此委托中移除,此操作无法撤销。",
    fr: "« {name} » sera supprimé de cette commande. Action irréversible.",
    it: "«{name}» verrà rimosso da questa commissione. Operazione irreversibile.",
  },
  "cad_page.pending_section": {
    en: "PENDING APPROVAL ({n})",
    zh: "待审批 ({n})",
    fr: "EN ATTENTE DE VALIDATION ({n})",
    it: "IN ATTESA DI APPROVAZIONE ({n})",
  },
  "cad_page.live_section": {
    en: "APPROVED FILES ({n})",
    zh: "已批准文件 ({n})",
    fr: "FICHIERS APPROUVÉS ({n})",
    it: "FILE APPROVATI ({n})",
  },
  "cad_page.pending_hint_admin": {
    en: "Approve to publish to the commission; reject to discard.",
    zh: "批准后发布至委托;拒绝则丢弃。",
    fr: "Approuver pour publier ; rejeter pour écarter.",
    it: "Approva per pubblicare; rifiuta per scartare.",
  },
  "cad_page.pending_hint_vendor": {
    en: "Your uploads are waiting for the atelier to review them. You can delete an entry below before approval if needed.",
    zh: "您的上传正等待工作室审核。批准前您仍可在下方删除。",
    fr: "Vos téléversements attendent la validation de l’atelier. Vous pouvez supprimer une entrée avant approbation.",
    it: "I tuoi caricamenti attendono la revisione dell’atelier. Puoi eliminare una voce prima dell’approvazione.",
  },
  "igi_page.pending_section": {
    en: "PENDING APPROVAL ({n})",
    zh: "待审批 ({n})",
    fr: "EN ATTENTE DE VALIDATION ({n})",
    it: "IN ATTESA DI APPROVAZIONE ({n})",
  },
  "igi_page.live_section": {
    en: "APPROVED CERTIFICATES ({n})",
    zh: "已批准证书 ({n})",
    fr: "CERTIFICATS APPROUVÉS ({n})",
    it: "CERTIFICATI APPROVATI ({n})",
  },
  "igi_page.pending_hint_admin": {
    en: "Approve to publish to the commission; reject to discard.",
    zh: "批准后发布至委托;拒绝则丢弃。",
    fr: "Approuver pour publier ; rejeter pour écarter.",
    it: "Approva per pubblicare; rifiuta per scartare.",
  },
  "igi_page.pending_hint_vendor": {
    en: "Your uploads are waiting for the atelier to review them.",
    zh: "您的上传正等待工作室审核。",
    fr: "Vos téléversements attendent la validation de l’atelier.",
    it: "I tuoi caricamenti attendono la revisione dell’atelier.",
  },
  // -----------------------------------------------------------------------
  // approvals.tsx (admin photo approvals)
  // -----------------------------------------------------------------------
  "approvals.title": {
    en: "MEDIA APPROVALS",
    zh: "媒体审核",
    fr: "VALIDATION DES MÉDIAS",
    it: "APPROVAZIONI MEDIA",
  },
  "approvals.eyebrow": {
    en: "ATELIER REVIEW",
    zh: "工作室审核",
    fr: "REVUE ATELIER",
    it: "REVISIONE ATELIER",
  },
  "approvals.empty": {
    en: "No photos pending review.",
    zh: "暂无待审核照片。",
    fr: "Aucune photo en attente de validation.",
    it: "Nessuna foto in attesa di revisione.",
  },
  "approvals.empty_hint": {
    en: "When a workshop uploads photos to a step, they’ll surface here for approval.",
    zh: "工坊上传步骤照片后,会显示在此供审核。",
    fr: "Lorsqu’un atelier téléverse des photos d’étape, elles apparaissent ici pour validation.",
    it: "Quando un laboratorio carica foto di una fase, appariranno qui per la revisione.",
  },
  "approvals.approve": {
    en: "APPROVE",
    zh: "批准",
    fr: "APPROUVER",
    it: "APPROVA",
  },
  "approvals.reject": {
    en: "REJECT",
    zh: "拒绝",
    fr: "REJETER",
    it: "RIFIUTA",
  },
  "approvals.hold": {
    en: "HOLD",
    zh: "暂存",
    fr: "EN ATTENTE",
    it: "IN ATTESA",
  },
  "approvals.row.step": {
    en: "Step {n}",
    zh: "第 {n} 步",
    fr: "Étape {n}",
    it: "Fase {n}",
  },
  "approvals.access_denied": {
    en: "Only admins and associates can manage the approval queue.",
    zh: "只有管理员和助理可以管理审核队列。",
    fr: "Seuls les admins et les associés peuvent gérer la file de validation.",
    it: "Solo gli admin e gli associati possono gestire la coda di approvazione.",
  },
  "approvals.back_home": {
    en: "BACK TO HOME",
    zh: "返回首页",
    fr: "RETOUR ACCUEIL",
    it: "TORNA ALLA HOME",
  },
  "approvals.tab.pending": {
    en: "Pending",
    zh: "待审核",
    fr: "En attente",
    it: "In attesa",
  },
  "approvals.tab.on_hold": {
    en: "On Hold",
    zh: "暂存",
    fr: "Suspendu",
    it: "Sospeso",
  },
  "approvals.tab.recycled": {
    en: "Recycle Bin",
    zh: "回收站",
    fr: "Corbeille",
    it: "Cestino",
  },
  "approvals.reinstate": {
    en: "REINSTATE",
    zh: "恢复",
    fr: "RÉTABLIR",
    it: "RIPRISTINA",
  },
  "approvals.empty.pending": {
    en: "Nothing awaiting review.",
    zh: "没有待审核内容。",
    fr: "Rien en attente de validation.",
    it: "Niente in attesa di revisione.",
  },
  "approvals.empty.on_hold": {
    en: "No items on hold.",
    zh: "没有暂存的项目。",
    fr: "Aucun élément en attente.",
    it: "Nessun elemento sospeso.",
  },
  "approvals.empty.recycled": {
    en: "Recycle bin is empty.",
    zh: "回收站为空。",
    fr: "Corbeille vide.",
    it: "Il cestino è vuoto.",
  },
  "home.link.debug": {
    en: "ATELIER DEBUG · SAMPLE DATA",
    zh: "工作室调试 · 样本数据",
    fr: "ATELIER DÉBOGAGE · DONNÉES",
    it: "ATELIER DEBUG · DATI",
  },
  "home.section.commissions": {
    en: "COMMISSIONS",
    zh: "委托",
    fr: "COMMANDES",
    it: "COMMESSE",
  },
  "home.bulk.hint": {
    en: "Bulk-manage commissions",
    zh: "批量管理委托",
    fr: "Gérer les commandes en masse",
    it: "Gestione collettiva commesse",
  },
  "home.bulk.selected": {
    en: "{n} selected · tap rows to toggle",
    zh: "已选 {n} 项 · 点击行切换",
    fr: "{n} sélectionnés · touchez pour basculer",
    it: "{n} selezionati · tocca per cambiare",
  },
  "home.bulk.select": {
    en: "SELECT",
    zh: "选择",
    fr: "SÉLECTIONNER",
    it: "SELEZIONA",
  },
  "home.bulk.cancel_select": {
    en: "CANCEL SELECT",
    zh: "取消选择",
    fr: "ANNULER",
    it: "ANNULLA",
  },
  "home.bulk.move_to_bin": {
    en: "MOVE {n} TO BIN",
    zh: "将 {n} 项移至回收站",
    fr: "DÉPLACER {n} · CORBEILLE",
    it: "SPOSTA {n} · CESTINO",
  },
  "home.empty.title": {
    en: "No commissions yet",
    zh: "尚无委托",
    fr: "Aucune commande pour le moment",
    it: "Nessuna commessa ancora",
  },
  "home.empty.admin": {
    en: "Tap NEW COMMISSION above to start one.",
    zh: "点击上方“新建委托”开始。",
    fr: "Touchez « NOUVELLE COMMANDE » pour démarrer.",
    it: "Tocca « NUOVA COMMESSA » per iniziare.",
  },
  "home.empty.viewer": {
    en: "Awaiting assignment from the atelier.",
    zh: "等待工作室分配。",
    fr: "En attente d’assignation par l’atelier.",
    it: "In attesa di assegnazione dall’atelier.",
  },
  "home.card.next_step": {
    en: "Next · Step {n} · {title}",
    zh: "下一步 · 第 {n} 步 · {title}",
    fr: "Suivant · Étape {n} · {title}",
    it: "Prossimo · Passo {n} · {title}",
  },
  "home.card.all_done": {
    en: "All 26 steps complete",
    zh: "所有 26 步均已完成",
    fr: "Les 26 étapes sont terminées",
    it: "Tutti i 26 passi completati",
  },
  "home.card.completed_badge": {
    en: "COMPLETED",
    zh: "已完成",
    fr: "TERMINÉ",
    it: "COMPLETATO",
  },

  // -------- Confirm dialogs --------
  "home.confirm.bulk_title": {
    en: "Move {n} commission{s} to Recycle Bin?",
    zh: "将 {n} 个委托移至回收站？",
    fr: "Déplacer {n} commande{s} vers la corbeille ?",
    it: "Spostare {n} commessa nel cestino?",
  },
  "home.confirm.bulk_message": {
    en: "They will disappear from the active list. Restore any of them from Atelier · Recycle Bin.",
    zh: "它们将从活跃列表中移除。可在“工作室 · 回收站”中恢复。",
    fr: "Elles disparaîtront de la liste active. Restaurez depuis Atelier · Corbeille.",
    it: "Verranno rimosse dalla lista attiva. Ripristinabili da Atelier · Cestino.",
  },
  "home.confirm.bulk_confirm": {
    en: "Move {n} to bin",
    zh: "将 {n} 项移至回收站",
    fr: "Déplacer {n} vers la corbeille",
    it: "Sposta {n} nel cestino",
  },

  // -------- Order detail --------
  "order.subtitle": {
    en: "Client · {client}   |   Workshop · {workshop}",
    zh: "客户 · {client}   |   工坊 · {workshop}",
    fr: "Client · {client}   |   Atelier · {workshop}",
    it: "Cliente · {client}   |   Atelier · {workshop}",
  },
  "order.reveal_workshop": {
    en: "REVEAL WORKSHOP",
    zh: "显示工坊",
    fr: "AFFICHER L’ATELIER",
    it: "MOSTRA ATELIER",
  },
  "order.hide_workshop": {
    en: "HIDE WORKSHOP",
    zh: "隐藏工坊",
    fr: "MASQUER L’ATELIER",
    it: "NASCONDI ATELIER",
  },
  "order.customs.title": {
    en: "CUSTOMS · AIRWAY BILL",
    zh: "海关 · 空运单",
    fr: "DOUANES · LETTRE DE TRANSPORT",
    it: "DOGANA · LETTERA DI VETTURA",
  },
  "order.customs.sub": {
    en: "Confidential — atelier only",
    zh: "机密 — 仅限工作室",
    fr: "Confidentiel — atelier uniquement",
    it: "Riservato — solo atelier",
  },
  "order.dna.unlocked": {
    en: "VIEW DIGITAL DNA",
    zh: "查看数字 DNA",
    fr: "VOIR L’ADN NUMÉRIQUE",
    it: "VEDI DNA DIGITALE",
  },
  "order.dna.locked": {
    en: "DIGITAL DNA · LOCKED",
    zh: "数字 DNA · 已锁定",
    fr: "ADN NUMÉRIQUE · VERROUILLÉ",
    it: "DNA DIGITALE · BLOCCATO",
  },
  "order.dna.unlocked_sub": {
    en: "Provenance certificate · PDF",
    zh: "工艺溯源证书 · PDF",
    fr: "Certificat de provenance · PDF",
    it: "Certificato di provenienza · PDF",
  },
  "order.dna.locked_sub": {
    en: "Unlocks once all 26 steps are finalised · {done}/{total}",
    zh: "全部 26 步完成后解锁 · {done}/{total}",
    fr: "Déverrouillé après les 26 étapes · {done}/{total}",
    it: "Sbloccato dopo i 26 passi · {done}/{total}",
  },
  "order.dna.locked_alert_title": {
    en: "Digital DNA locked",
    zh: "数字 DNA 已锁定",
    fr: "ADN numérique verrouillé",
    it: "DNA digitale bloccato",
  },
  "order.dna.locked_alert_body": {
    en: "Available once all 26 steps are finalised. {done} of {total} complete.",
    zh: "全部 26 步完成后可用。已完成 {done} / {total}。",
    fr: "Disponible après les 26 étapes. {done} sur {total} terminées.",
    it: "Disponibile dopo i 26 passi. {done} su {total} completati.",
  },
  "order.section.journey": {
    en: "26-STEP JOURNEY",
    zh: "26 步工艺之旅",
    fr: "PARCOURS EN 26 ÉTAPES",
    it: "PERCORSO IN 26 PASSI",
  },
  "order.delete.confirm_title": {
    en: "Move to Recycle Bin?",
    zh: "移至回收站？",
    fr: "Déplacer vers la corbeille ?",
    it: "Spostare nel cestino?",
  },
  "order.delete.confirm_body": {
    en: "{ref} will leave the active list. Restore from Atelier · Recycle Bin.",
    zh: "{ref} 将从活跃列表中移除。可在“工作室 · 回收站”中恢复。",
    fr: "{ref} quittera la liste active. Restaurez depuis Atelier · Corbeille.",
    it: "{ref} verrà rimosso dalla lista attiva. Ripristinabile da Atelier · Cestino.",
  },
  "order.delete.confirm_web": {
    en: "Move {ref} to the Recycle Bin? You can restore it from Atelier · Recycle Bin.",
    zh: "将 {ref} 移至回收站？可在“工作室 · 回收站”中恢复。",
    fr: "Déplacer {ref} vers la corbeille ? Restaurable depuis Atelier · Corbeille.",
    it: "Spostare {ref} nel cestino? Ripristinabile da Atelier · Cestino.",
  },
  "order.delete.btn": {
    en: "Move to bin",
    zh: "移至回收站",
    fr: "Déplacer · corbeille",
    it: "Sposta nel cestino",
  },
  "order.delete.failed": {
    en: "Delete failed",
    zh: "删除失败",
    fr: "Échec de la suppression",
    it: "Eliminazione fallita",
  },
  "order.delete.failed_body": {
    en: "Could not delete commission",
    zh: "无法删除委托",
    fr: "Impossible de supprimer la commande",
    it: "Impossibile eliminare la commessa",
  },

  // -------- Step detail --------
  "common.phase": {
    en: "PHASE",
    zh: "阶段",
    fr: "PHASE",
    it: "FASE",
  },
  "common.phase_with_value": {
    en: "PHASE {phase}",
    zh: "阶段 {phase}",
    fr: "PHASE {phase}",
    it: "FASE {phase}",
  },
  "step.eyebrow": {
    en: "STEP {n} · PHASE {phase}",
    zh: "第 {n} 步 · 阶段 {phase}",
    fr: "ÉTAPE {n} · PHASE {phase}",
    it: "PASSO {n} · FASE {phase}",
  },
  "step.timestamp_label": {
    en: "COMPLETED · CHINA TIME (CST)",
    zh: "完成 · 中国时间 (CST)",
    fr: "TERMINÉ · HEURE DE CHINE (CST)",
    it: "COMPLETATO · ORA CINESE (CST)",
  },
  "step.forwarded": {
    en: "Forwarded to client",
    zh: "已转发给客户",
    fr: "Transmis au client",
    it: "Inoltrato al cliente",
  },
  "step.awaiting_forward": {
    en: "Awaiting associate forward",
    zh: "等待经理转发",
    fr: "En attente de transfert",
    it: "In attesa di inoltro",
  },
  "step.label.notes": {
    en: "NOTES",
    zh: "备注",
    fr: "NOTES",
    it: "NOTE",
  },
  "step.label.photos": {
    en: "PHOTOS",
    zh: "照片",
    fr: "PHOTOS",
    it: "FOTO",
  },
  "step.label.review_note": {
    en: "ASSOCIATE REVIEW NOTE",
    zh: "经理审核备注",
    fr: "NOTE DE L’ASSOCIÉ",
    it: "NOTA DELL’ASSOCIATO",
  },
  "step.label.workshop_notes": {
    en: "WORKSHOP NOTES",
    zh: "工坊备注",
    fr: "NOTES DE L’ATELIER",
    it: "NOTE DELL’ATELIER",
  },
  "step.label.associate_note": {
    en: "ASSOCIATE NOTE",
    zh: "经理备注",
    fr: "NOTE DE L’ASSOCIÉ",
    it: "NOTA DELL’ASSOCIATO",
  },
  "step.notes_placeholder": {
    en: "Add notes about this step...",
    zh: "添加关于此步骤的备注…",
    fr: "Ajouter une note sur cette étape…",
    it: "Aggiungi una nota su questo passo…",
  },
  "step.review_placeholder": {
    en: "Add a note before forwarding to client...",
    zh: "在转发给客户前添加备注…",
    fr: "Ajoutez une note avant de transmettre au client…",
    it: "Aggiungi una nota prima dell’inoltro al cliente…",
  },
  "step.photo.empty": {
    en: "No photos added",
    zh: "尚未添加照片",
    fr: "Aucune photo ajoutée",
    it: "Nessuna foto aggiunta",
  },
  "step.btn.complete": {
    en: "MARK STEP COMPLETE",
    zh: "标记此步完成",
    fr: "MARQUER L’ÉTAPE TERMINÉE",
    it: "SEGNA PASSO COMPLETATO",
  },
  "step.btn.save_update": {
    en: "SAVE UPDATE",
    zh: "保存更新",
    fr: "ENREGISTRER LA MODIFICATION",
    it: "SALVA AGGIORNAMENTO",
  },
  "step.btn.forward": {
    en: "FORWARD TO CLIENT",
    zh: "转发给客户",
    fr: "TRANSMETTRE AU CLIENT",
    it: "INOLTRA AL CLIENTE",
  },
  "step.btn.view_original": {
    en: "VIEW ORIGINAL",
    zh: "查看原文",
    fr: "VOIR L’ORIGINAL",
    it: "VEDI ORIGINALE",
  },
  "step.btn.hide_original": {
    en: "HIDE ORIGINAL",
    zh: "隐藏原文",
    fr: "MASQUER L’ORIGINAL",
    it: "NASCONDI ORIGINALE",
  },
  "step.btn.update": {
    en: "UPDATE",
    zh: "更新",
    fr: "MODIFIER",
    it: "AGGIORNA",
  },
  "step.btn.remove_complete": {
    en: "REMOVE COMPLETE",
    zh: "撤销完成",
    fr: "ANNULER COMPLÉTUDE",
    it: "RIMUOVI COMPLETAMENTO",
  },
  "step.btn.translate_to": {
    en: "TRANSLATE TO {lang}",
    zh: "翻译为{lang}",
    fr: "TRADUIRE EN {lang}",
    it: "TRADUCI IN {lang}",
  },
  "step.btn.translating": {
    en: "TRANSLATING…",
    zh: "翻译中…",
    fr: "TRADUCTION…",
    it: "TRADUZIONE…",
  },
  "step.translate.pick_first": {
    en: "Pick a non-English display language from the header first.",
    zh: "请先在顶部选择一种非英语显示语言。",
    fr: "Choisissez d’abord une langue autre que l’anglais.",
    it: "Seleziona prima una lingua diversa dall’inglese.",
  },
  "step.translate.failed": {
    en: "Translation failed",
    zh: "翻译失败",
    fr: "Échec de la traduction",
    it: "Traduzione fallita",
  },
  "step.reopen.title": {
    en: "Remove completion?",
    zh: "撤销完成？",
    fr: "Annuler la complétude ?",
    it: "Rimuovere il completamento?",
  },
  "step.reopen.body": {
    en: "This step will be marked as not done and any forwarding will be reset. Your notes and photos are kept so you can resume.",
    zh: "此步骤将标记为未完成，任何转发也将重置。备注和照片将保留以便继续。",
    fr: "Cette étape sera marquée non terminée et tout transfert sera réinitialisé. Vos notes et photos sont conservées.",
    it: "Il passo sarà segnato come non completato e ogni inoltro verrà azzerato. Note e foto restano disponibili.",
  },
  "step.reopen.confirm": {
    en: "Remove complete",
    zh: "撤销完成",
    fr: "Retirer la complétude",
    it: "Rimuovi completamento",
  },
  "step.workshop_notes_lang": {
    en: "WORKSHOP NOTES · {lang}",
    zh: "工坊备注 · {lang}",
    fr: "NOTES DE L’ATELIER · {lang}",
    it: "NOTE DELL’ATELIER · {lang}",
  },

  // -------- Role labels --------
  "role.admin": { en: "Atelier", zh: "工作室", fr: "Atelier", it: "Atelier" },
  "role.manufacturer": { en: "Workshop", zh: "工坊", fr: "Atelier de production", it: "Officina" },
  "role.associate": { en: "Associate", zh: "经理", fr: "Associé", it: "Associato" },
  "role.client": { en: "Maison Client", zh: "私人客户", fr: "Client Maison", it: "Cliente Maison" },

  // -------- Language switcher --------
  "lang.title": {
    en: "Display language",
    zh: "显示语言",
    fr: "Langue d’affichage",
    it: "Lingua di visualizzazione",
  },
  "lang.eyebrow": {
    en: "LANGUAGE",
    zh: "语言",
    fr: "LANGUE",
    it: "LINGUA",
  },
  "lang.sub": {
    en: "Changes step titles, phase titles and any auto-translated notes across every screen. Setting follows you across devices.",
    zh: "影响所有界面的步骤、阶段和自动翻译备注。设置随账号同步。",
    fr: "Modifie les titres d’étapes, de phases et les notes traduites dans toute l’app. Le réglage suit votre compte.",
    it: "Cambia titoli di passo, fase e note tradotte ovunque. L’impostazione segue l’account.",
  },

  // -------- Email-files modal (CAD / IGI / Customs / Airway-bill) --------
  "email.title.cad": { en: "EMAIL CAD FILES", zh: "发送 CAD 文件", fr: "ENVOYER LES CAO", it: "EMAIL FILE CAD" },
  "email.title.igi": { en: "EMAIL IGI CERTIFICATES", zh: "发送 IGI 证书", fr: "ENVOYER LES CERTIFICATS IGI", it: "EMAIL CERTIFICATI IGI" },
  "email.title.customs": { en: "EMAIL CUSTOMS DOCS", zh: "发送海关文件", fr: "ENVOYER LES DOCUMENTS DOUANIERS", it: "EMAIL DOCUMENTI DOGANALI" },
  "email.title.airway_bill": { en: "EMAIL AIRWAY BILL", zh: "发送空运提单", fr: "ENVOYER LA LETTRE DE TRANSPORT", it: "EMAIL LETTERA DI VETTURA" },
  "email.title.step_photos": { en: "EMAIL STEP PHOTOS", zh: "发送工序照片", fr: "ENVOYER LES PHOTOS D'ÉTAPE", it: "EMAIL FOTO DELLA FASE" },
  "email.field.to": { en: "TO", zh: "收件人", fr: "À", it: "A" },
  "email.field.subject": { en: "SUBJECT", zh: "主题", fr: "OBJET", it: "OGGETTO" },
  "email.field.message": { en: "MESSAGE", zh: "留言", fr: "MESSAGE", it: "MESSAGGIO" },
  "email.field.files": {
    en: "FILES TO INCLUDE ({selected}/{total})",
    zh: "包含的文件（{selected}/{total}）",
    fr: "FICHIERS À INCLURE ({selected}/{total})",
    it: "FILE DA INCLUDERE ({selected}/{total})",
  },
  "email.recipient.placeholder_first": {
    en: "name@example.com (press Enter)",
    zh: "name@example.com（按回车）",
    fr: "nom@exemple.com (Entrée)",
    it: "nome@esempio.com (Invio)",
  },
  "email.recipient.placeholder_more": {
    en: "add another…",
    zh: "添加更多…",
    fr: "en ajouter un autre…",
    it: "aggiungi un altro…",
  },
  "email.recipient.helper": {
    en: "Tap a chip to remove. Press Enter, space or comma to add another.",
    zh: "点击标签可移除；按回车、空格或逗号添加另一个。",
    fr: "Appuyez sur une puce pour la retirer. Entrée, espace ou virgule pour en ajouter.",
    it: "Tocca un chip per rimuoverlo. Invio, spazio o virgola per aggiungerne un altro.",
  },
  "email.directory.button": {
    en: "PICK FROM DIRECTORY",
    zh: "从通讯录选择",
    fr: "CHOISIR DANS L’ANNUAIRE",
    it: "SCEGLI DALL’ELENCO",
  },
  "email.directory.title": { en: "DIRECTORY", zh: "通讯录", fr: "ANNUAIRE", it: "ELENCO" },
  "email.directory.search": {
    en: "Search by name, alias, or email…",
    zh: "按名称、别名或邮箱搜索…",
    fr: "Rechercher par nom, alias ou email…",
    it: "Cerca per nome, alias o email…",
  },
  "email.directory.empty": {
    en: "No workshops or CAD/Render vendors found yet. Create them from Admin → Users.",
    zh: "尚未添加任何工坊或 CAD/渲染商。请前往 管理 → 用户 创建。",
    fr: "Aucun atelier ou prestataire CAO/Rendu pour l’instant. Créez-les depuis Admin → Utilisateurs.",
    it: "Nessun laboratorio o fornitore CAD/Render trovato. Creali da Admin → Utenti.",
  },
  "email.toggle.select_all": { en: "SELECT ALL", zh: "全选", fr: "TOUT SÉLECTIONNER", it: "SELEZIONA TUTTO" },
  "email.toggle.deselect_all": { en: "DESELECT ALL", zh: "取消全选", fr: "TOUT DÉSÉLECTIONNER", it: "DESELEZIONA TUTTO" },
  "email.subject.placeholder_with_jewel": {
    en: "{prefix} — {name}",
    zh: "{prefix} — {name}",
    fr: "{prefix} — {name}",
    it: "{prefix} — {name}",
  },
  "email.subject.placeholder_generic": {
    en: "Optional subject (defaults to {prefix} for commission)",
    zh: "选填主题（默认：本委托的 {prefix}）",
    fr: "Objet facultatif (par défaut : {prefix} de la commande)",
    it: "Oggetto facoltativo (predefinito: {prefix} della commessa)",
  },
  "email.message.placeholder": {
    en: "Optional note shown above the file list…",
    zh: "选填留言，将显示在文件列表上方…",
    fr: "Note facultative affichée au-dessus de la liste…",
    it: "Nota facoltativa mostrata sopra l’elenco…",
  },
  "email.disclaimer": {
    en: "Recipients receive clickable download links pointing to the files on Cloudinary. Nothing is attached, so very large files forward without issue.",
    zh: "收件人将收到指向 Cloudinary 文件的下载链接，邮件中不附带文件，可转发大型素材。",
    fr: "Les destinataires reçoivent des liens de téléchargement vers les fichiers sur Cloudinary. Aucune pièce jointe, idéal pour les fichiers volumineux.",
    it: "I destinatari ricevono link di download verso i file su Cloudinary. Niente allegati: ideale per file di grandi dimensioni.",
  },
  "email.send": { en: "SEND EMAIL", zh: "发送邮件", fr: "ENVOYER", it: "INVIA EMAIL" },
  "email.error.invalid_email": { en: "Invalid email", zh: "邮箱无效", fr: "Email invalide", it: "Email non valida" },
  "email.error.invalid_email_msg": {
    en: "\"{value}\" doesn't look like a valid email address.",
    zh: "“{value}” 不是有效的邮箱地址。",
    fr: "« {value} » n’est pas une adresse valide.",
    it: "\"{value}\" non sembra un indirizzo valido.",
  },
  "email.error.no_recipient_title": { en: "Add a recipient", zh: "请填写收件人", fr: "Ajoutez un destinataire", it: "Aggiungi un destinatario" },
  "email.error.no_recipient_msg": {
    en: "Enter at least one email address.",
    zh: "请输入至少一个邮箱地址。",
    fr: "Saisissez au moins une adresse email.",
    it: "Inserisci almeno un indirizzo email.",
  },
  "email.error.no_files_title": { en: "Select files", zh: "请选择文件", fr: "Sélectionnez des fichiers", it: "Seleziona i file" },
  "email.error.no_files_msg": {
    en: "Pick at least one {noun} to forward.",
    zh: "请选择至少一个{noun}转发。",
    fr: "Choisissez au moins un {noun} à transférer.",
    it: "Scegli almeno un {noun} da inoltrare.",
  },
  "email.success.title": { en: "Email sent", zh: "邮件已发送", fr: "Email envoyé", it: "Email inviata" },
  "email.success.msg": {
    en: "Forwarded {fileCount} {noun}{ps} to {recipCount} recipient{rs}.",
    zh: "已将 {fileCount} 个{noun}发送给 {recipCount} 位收件人。",
    fr: "{fileCount} {noun}{ps} transférés à {recipCount} destinataire{rs}.",
    it: "{fileCount} {noun}{ps} inoltrati a {recipCount} destinatari{rs}.",
  },
  "email.error.send_title": { en: "Send failed", zh: "发送失败", fr: "Échec de l’envoi", it: "Invio non riuscito" },
  "email.error.send_msg": {
    en: "Could not forward files.",
    zh: "无法转发文件。",
    fr: "Impossible de transférer les fichiers.",
    it: "Impossibile inoltrare i file.",
  },
  "email.noun.cad": { en: "CAD file", zh: "CAD 文件", fr: "fichier CAO", it: "file CAD" },
  "email.noun.igi": { en: "certificate", zh: "证书", fr: "certificat", it: "certificato" },
  "email.noun.customs": { en: "customs file", zh: "海关文件", fr: "fichier douanier", it: "file doganale" },
  "email.noun.airway_bill": { en: "airway-bill file", zh: "空运提单", fr: "lettre de transport", it: "lettera di vettura" },
  "email.noun.step_photos": { en: "photo", zh: "照片", fr: "photo", it: "foto" },
  "email.subject_prefix.cad": { en: "CAD files", zh: "CAD 文件", fr: "Fichiers CAO", it: "File CAD" },
  "email.subject_prefix.igi": { en: "IGI certificates", zh: "IGI 证书", fr: "Certificats IGI", it: "Certificati IGI" },
  "email.subject_prefix.customs": { en: "Customs documents", zh: "海关文件", fr: "Documents douaniers", it: "Documenti doganali" },
  "email.subject_prefix.airway_bill": { en: "Airway bill", zh: "空运提单", fr: "Lettre de transport", it: "Lettera di vettura" },
  "email.subject_prefix.step_photos": { en: "Workshop step photos", zh: "工序照片", fr: "Photos d'étape", it: "Foto della fase" },

  // -------- Outer buttons that open the email modal --------
  "files.email.cad": { en: "EMAIL CAD FILES ({n})", zh: "发送 CAD 文件（{n}）", fr: "ENVOYER LES CAO ({n})", it: "INVIA FILE CAD ({n})" },
  "files.email.igi": { en: "EMAIL CERTIFICATES ({n})", zh: "发送证书（{n}）", fr: "ENVOYER LES CERTIFICATS ({n})", it: "INVIA CERTIFICATI ({n})" },
  "files.email.airway_bill": { en: "EMAIL AIRWAY BILL ({n})", zh: "发送空运提单（{n}）", fr: "ENVOYER LA LTA ({n})", it: "INVIA LETTERA VETTURA ({n})" },
  "files.email.customs": { en: "EMAIL CUSTOMS DOCS ({n})", zh: "发送海关文件（{n}）", fr: "ENVOYER LES DOC. DOUANIERS ({n})", it: "INVIA DOC. DOGANALI ({n})" },

  // -------- Renders folder (Phase 3) --------
  "renders.title": { en: "RENDERS", zh: "渲染图", fr: "RENDUS", it: "RENDER" },
  "renders.card.title": { en: "Renders", zh: "渲染图", fr: "Rendus", it: "Render" },
  "renders.card.title_count": { en: "Renders ({n})", zh: "渲染图（{n}）", fr: "Rendus ({n})", it: "Render ({n})" },
  "renders.card.pending_suffix": {
    en: "  •  {n} pending",
    zh: "  •  {n} 待审",
    fr: "  •  {n} en attente",
    it: "  •  {n} in attesa",
  },
  "renders.card.sub_vendor": {
    en: "Upload your finished renders here for admin review",
    zh: "在此上传完成的渲染图，等待管理员审核",
    fr: "Téléversez vos rendus finis ici pour validation",
    it: "Carica qui i rendering finiti per la revisione",
  },
  "renders.card.sub_default": {
    en: "Finished render images approved for the client",
    zh: "客户可见的已审核渲染图",
    fr: "Images de rendu approuvées pour le client",
    it: "Immagini di rendering approvate per il cliente",
  },
  "renders.assign.empty": {
    en: "ASSIGN CAD / RENDER VENDOR",
    zh: "指派 CAD / 渲染供应商",
    fr: "ASSIGNER UN PRESTATAIRE CAO / RENDU",
    it: "ASSEGNA FORNITORE CAD / RENDER",
  },
  "renders.assign.current": {
    en: "ASSIGNED TO {name}",
    zh: "已指派给 {name}",
    fr: "ASSIGNÉ À {name}",
    it: "ASSEGNATO A {name}",
  },
  "renders.assign.modal_title": { en: "ASSIGN VENDOR", zh: "指派供应商", fr: "ASSIGNER UN PRESTATAIRE", it: "ASSEGNA FORNITORE" },
  "renders.assign.unassign": {
    en: "Unassign current vendor",
    zh: "取消当前指派",
    fr: "Retirer le prestataire actuel",
    it: "Rimuovi fornitore corrente",
  },
  "renders.assign.empty_directory": {
    en: "No CAD/Render vendors exist yet. Create one from Admin → Users.",
    zh: "尚无 CAD/渲染供应商。请前往 管理 → 用户 创建。",
    fr: "Aucun prestataire CAO/Rendu. Créez-en depuis Admin → Utilisateurs.",
    it: "Nessun fornitore CAD/Render. Creane uno da Admin → Utenti.",
  },
  "renders.upload.admin": { en: "UPLOAD RENDERS", zh: "上传渲染图", fr: "TÉLÉVERSER LES RENDUS", it: "CARICA RENDER" },
  "renders.upload.vendor": {
    en: "SUBMIT RENDERS FOR REVIEW",
    zh: "提交渲染图待审",
    fr: "SOUMETTRE LES RENDUS",
    it: "INVIA RENDER PER REVISIONE",
  },
  "renders.section.pending": {
    en: "PENDING APPROVAL ({n})",
    zh: "待审核（{n}）",
    fr: "EN ATTENTE DE VALIDATION ({n})",
    it: "IN ATTESA DI APPROVAZIONE ({n})",
  },
  "renders.section.pending_hint_admin": {
    en: "Approve to publish to the commission; reject to discard.",
    zh: "点击审核通过即发布给客户；拒绝则丢弃。",
    fr: "Approuvez pour publier dans la commande ; rejetez pour annuler.",
    it: "Approva per pubblicare nella commessa; rifiuta per scartare.",
  },
  "renders.section.pending_hint_vendor": {
    en: "Your submissions are waiting for the studio to review them. You can delete an entry below before approval if needed.",
    zh: "您的提交等待工作室审核。审核前可以删除条目。",
    fr: "Vos envois sont en attente de validation. Vous pouvez supprimer une entrée avant approbation si besoin.",
    it: "Le tue proposte sono in attesa di revisione. Puoi eliminare una voce prima dell’approvazione se necessario.",
  },
  "renders.section.live": {
    en: "APPROVED RENDERS ({n})",
    zh: "已审核渲染图（{n}）",
    fr: "RENDUS APPROUVÉS ({n})",
    it: "RENDER APPROVATI ({n})",
  },
  "renders.empty.admin": {
    en: "No renders published yet. Upload above or wait for the assigned vendor to submit theirs for review.",
    zh: "尚未发布任何渲染图。可在上方上传，或等待指派供应商提交审核。",
    fr: "Aucun rendu publié pour l’instant. Téléversez ci-dessus ou attendez la soumission du prestataire.",
    it: "Nessun rendering pubblicato. Carica sopra o attendi che il fornitore proponga i suoi.",
  },
  "renders.empty.vendor": {
    en: "Your approved renders will appear here once an admin reviews them.",
    zh: "管理员审核通过后，您的渲染图将显示在此。",
    fr: "Vos rendus approuvés apparaîtront ici après validation.",
    it: "I tuoi rendering approvati appariranno qui dopo la revisione.",
  },
  "renders.empty.viewer": {
    en: "No renders have been published for this commission yet.",
    zh: "本委托暂未发布渲染图。",
    fr: "Aucun rendu n’a encore été publié pour cette commande.",
    it: "Nessun rendering è stato ancora pubblicato per questa commessa.",
  },
  "renders.toast.submitted_title": { en: "Submitted for review", zh: "已提交审核", fr: "Envoyé pour validation", it: "Inviato per revisione" },
  "renders.toast.submitted_msg": {
    en: "Your renders have been queued for admin approval.",
    zh: "您的渲染图已加入审核队列。",
    fr: "Vos rendus sont en file d’attente de validation.",
    it: "I tuoi rendering sono in coda per l’approvazione.",
  },
  "renders.confirm.reject_title": { en: "Reject render?", zh: "拒绝渲染图？", fr: "Rejeter le rendu ?", it: "Rifiutare il rendering?" },
  "renders.confirm.reject_msg": {
    en: "\"{name}\" will be removed from the pending queue. This cannot be undone.",
    zh: "“{name}” 将从待审队列移除，操作不可撤销。",
    fr: "« {name} » sera retiré de la file d’attente. Action irréversible.",
    it: "\"{name}\" verrà rimosso dalla coda di attesa. Operazione irreversibile.",
  },
  "renders.confirm.delete_title": { en: "Delete render?", zh: "删除渲染图？", fr: "Supprimer le rendu ?", it: "Eliminare il rendering?" },
  "renders.confirm.delete_msg_pending": {
    en: "\"{name}\" will be removed from your pending queue.",
    zh: "“{name}” 将从您的待审队列中移除。",
    fr: "« {name} » sera retiré de votre file d’attente.",
    it: "\"{name}\" verrà rimosso dalla tua coda di attesa.",
  },
  "renders.confirm.delete_msg_live": {
    en: "\"{name}\" will be removed from the commission.",
    zh: "“{name}” 将从委托中移除。",
    fr: "« {name} » sera retiré de la commande.",
    it: "\"{name}\" verrà rimosso dalla commessa.",
  },

  // -------- Users directory: CAD & Render vendors --------
  "users.tab.workshops": { en: "WORKSHOPS", zh: "工坊", fr: "ATELIERS", it: "OFFICINE" },
  "users.tab.cad_renders": { en: "CAD & RENDERS", zh: "CAD 与渲染", fr: "CAO & RENDUS", it: "CAD & RENDER" },
  "users.tab.associates": { en: "ASSOCIATES", zh: "助理", fr: "ASSOCIÉS", it: "ASSOCIATI" },
  "users.tab.clients": { en: "CLIENTS", zh: "客户", fr: "CLIENTS", it: "CLIENTI" },
  "users.tab.atelier": { en: "ATELIER", zh: "工作室", fr: "ATELIER", it: "ATELIER" },

  // -------- Create-user form additions --------
  "create_user.placeholder.studio_name": {
    en: "e.g. Lumière Render Studio",
    zh: "如 Lumière Render Studio",
    fr: "ex. Lumière Render Studio",
    it: "es. Lumière Render Studio",
  },
  "create_user.toast.cad_renderer_created": {
    en: "CAD & Render vendor created",
    zh: "CAD/渲染供应商已创建",
    fr: "Prestataire CAO/Rendu créé",
    it: "Fornitore CAD/Render creato",
  },
} as const;

type StringKey = keyof typeof STRINGS;

/** Returns one of the four supported codes. Defaults to English. */
function normalizeLang(raw: string | undefined | null): LangCode {
  const v = (raw || "").toLowerCase();
  if (v.startsWith("zh")) return "zh";
  if (v.startsWith("fr")) return "fr";
  if (v.startsWith("it")) return "it";
  return "en";
}

/**
 * Resolves the effective display language for the signed-in user.
 * Mirrors backend `helpers.language_for_user`.
 */
export function resolveLang(user: {
  preferred_language?: string | null;
  language?: string | null;
  country?: string | null;
} | null | undefined): LangCode {
  if (!user) return "en";
  if (user.preferred_language) return normalizeLang(user.preferred_language);
  if (user.language) return normalizeLang(user.language);
  const country = (user.country || "AU").toUpperCase();
  return normalizeLang(COUNTRY_TO_LANG[country] || "en");
}

/**
 * Hook returning a `t(key, vars?)` localiser bound to the signed-in user's
 * preferred language. Re-renders consumers when `languageVersion` bumps.
 */
export function useI18n() {
  const { user, languageVersion } = useAuth();
  const lang = resolveLang(user);
  const t = (key: StringKey, vars?: Record<string, string | number>): string => {
    const row = STRINGS[key];
    if (!row) return key;
    let out = row[lang] ?? row.en ?? key;
    if (vars) {
      for (const [k, v] of Object.entries(vars)) {
        out = out.replace(new RegExp(`\\{${k}\\}`, "g"), String(v));
      }
    }
    // Simple {s} pluralisation hint: drop the {s} when n is 1.
    const n = vars?.n;
    if (typeof n === "number") {
      out = out.replace(/\{s\}/g, n === 1 ? "" : "s");
    } else {
      out = out.replace(/\{s\}/g, "");
    }
    return out;
  };
  // languageVersion lets callers depend on this in useEffect arrays.
  return { t, lang, languageVersion };
}
