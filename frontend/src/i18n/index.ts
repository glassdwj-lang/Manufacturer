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
  "home.link.activity_log": {
    en: "Activity Log",
    zh: "活动日志",
    fr: "Journal d’activité",
    it: "Registro attività",
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
  "email.subject_prefix.cad": { en: "CAD files", zh: "CAD 文件", fr: "Fichiers CAO", it: "File CAD" },
  "email.subject_prefix.igi": { en: "IGI certificates", zh: "IGI 证书", fr: "Certificats IGI", it: "Certificati IGI" },
  "email.subject_prefix.customs": { en: "Customs documents", zh: "海关文件", fr: "Documents douaniers", it: "Documenti doganali" },
  "email.subject_prefix.airway_bill": { en: "Airway bill", zh: "空运提单", fr: "Lettre de transport", it: "Lettera di vettura" },

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
  "create_user.label.studio_name": {
    en: "STUDIO / VENDOR NAME",
    zh: "工作室 / 供应商名称",
    fr: "STUDIO / NOM DU PRESTATAIRE",
    it: "STUDIO / NOME FORNITORE",
  },
  "create_user.placeholder.studio_name": {
    en: "e.g. Lumière Render Studio",
    zh: "如 Lumière Render Studio",
    fr: "ex. Lumière Render Studio",
    it: "es. Lumière Render Studio",
  },
  "create_user.contacts.studio_hint": {
    en: "Add up to 3 contacts at the studio. Tap the star to choose which one is the primary contact for orders & escalations.",
    zh: "为该工作室添加最多 3 位联系人。点击星标选择主要联系人。",
    fr: "Ajoutez jusqu’à 3 contacts du studio. Touchez l’étoile pour désigner le contact principal.",
    it: "Aggiungi fino a 3 contatti dello studio. Tocca la stella per scegliere il principale.",
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
