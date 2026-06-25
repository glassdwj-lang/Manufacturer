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
